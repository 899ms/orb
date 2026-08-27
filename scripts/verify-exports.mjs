import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, ws: false },
});

try {
  const [{ createSwiftExport, createWebExport }, presets, uniforms, shaderModule, orbStates] =
    await Promise.all([
      server.ssrLoadModule("/src/code-export.ts"),
      server.ssrLoadModule("/src/presets.ts"),
      server.ssrLoadModule("/src/orb-uniforms.ts"),
      server.ssrLoadModule("/src/shader-source.ts"),
      server.ssrLoadModule("/src/orb-states.ts"),
    ]);
  const [wgsl, metal] = await Promise.all([
    readFile(new URL("../effect.wgsl", import.meta.url), "utf8"),
    readFile(new URL("../effect.metal", import.meta.url), "utf8"),
  ]);
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  const sceneScaleMatch = styles.match(
    /\.orb-stage\[data-preview-mode="scene"\] \.orb-canvas,[\s\S]*?transform:\s*scale\(([\d.]+)\);/,
  );
  assert.ok(sceneScaleMatch, "场景画布缩放配置缺失");
  const sceneScale = Number(sceneScaleMatch[1]);
  assert.ok(
    presets.orbRadiusRange.max * sceneScale <= 1,
    "场景画布会裁掉最大半径球体的边缘参数",
  );

  function extractOpticalWeights(source, patterns, backend) {
    return Object.fromEntries(
      Object.entries(patterns).map(([name, pattern]) => {
        const match = source.match(pattern);
        assert.ok(match, `${backend}: ${name} 光学权重缺失`);
        return [name, match.slice(1).map(Number)];
      }),
    );
  }

  const wgslOpticalWeights = extractOpticalWeights(
    wgsl,
    {
      inner: /opticalRim \* u\.glassOpacity \* ([\d.]+)/,
      dispersion: /\* \(([\d.]+) \+ ([\d.]+) \* u\.shellEdgeAlpha\)/,
      key: /clamp\(u\.sheen, 0\.0, 2\.0\) \* ([\d.]+);/,
      fill: /clamp\(u\.sheen, 0\.0, 2\.0\) \* ([\d.]+);\n\s*col = glsOver\(col, u\.sheenColor/,
    },
    "WGSL",
  );
  const metalOpticalWeights = extractOpticalWeights(
    metal,
    {
      inner: /opticalRim \* u\.glassOpacity \* ([\d.]+)/,
      dispersion: /\* \(([\d.]+) \+ ([\d.]+) \* u\.shellEdgeAlpha\)/,
      key: /metal::clamp\(u\.sheen, 0\.0, 2\.0\) \* ([\d.]+);/,
      fill: /metal::clamp\(u\.sheen, 0\.0, 2\.0\) \* ([\d.]+);\n\s*col = glsOver\(col, u\.sheenColor/,
    },
    "Metal",
  );
  assert.deepEqual(metalOpticalWeights, wgslOpticalWeights, "WebGPU 与 Metal 光学权重不一致");
  assert.ok(wgslOpticalWeights.inner[0] >= 0.1, "玻璃底色权重过低，颜色控件不可见");
  assert.ok(wgslOpticalWeights.dispersion[0] >= 0.1, "色散底色权重过低，颜色控件不可见");
  assert.ok(wgslOpticalWeights.key[0] >= 1, "主高光权重过低，颜色控件不可见");
  assert.ok(wgslOpticalWeights.fill[0] >= 0.8, "辅高光权重过低，颜色控件不可见");
  assert.match(
    wgsl,
    /emissionOnly = u\.glassEnabled <= 0\.5 && \(s == 9 \|\| s == 14\)/,
    "WGSL 无玻璃发光层分发缺失",
  );
  assert.match(
    metal,
    /emissionOnly = u\.glassEnabled <= 0\.5 && \(s == 9 \|\| s == 14\)/,
    "Metal 无玻璃发光层分发缺失",
  );
  assert.match(wgsl, /fn glsFinishEmissionFluid\(/, "WGSL 发光层收尾函数缺失");
  assert.match(metal, /metal::float3 glsFinishEmissionFluid\(/, "Metal 发光层收尾函数缺失");
  assert.match(wgsl, /emissionCoverage = smoothstep\(0\.025, 0\.16, signal\)/);
  assert.match(metal, /emissionCoverage = metal::smoothstep\(0\.025, 0\.16, signal\)/);
  assert.match(wgsl, /emissionMask = mix\(smoothstep\(0\.08, 0\.25, energy \+ whiteCore \* 0\.12\)/);
  assert.match(metal, /emissionMask = metal::mix\(/);
  assert.match(
    shaderModule.orbShaderSource,
    /return vec4<f32>\(c\.rgb \* fit, c\.a \* fit\)/,
    "WebGPU 外层包装器必须保留球体着色器输出的 Alpha",
  );
  assert.doesNotMatch(
    shaderModule.orbShaderSource,
    /let alpha = select\(ballA/,
    "WebGPU 外层包装器不能重建不透明球体 Alpha",
  );
  assert.match(
    metal,
    /metal::float4\(_e2\.xyz \* fit, _e2\.w \* fit\)/,
    "Metal 外层包装器必须保留球体着色器输出的 Alpha",
  );
  assert.match(wgsl, /fn glsRefractiveBlobFluid\(/, "WGSL 折射软体流场缺失");
  assert.match(metal, /metal::float3 glsRefractiveBlobFluid\(/, "Metal 折射软体流场缺失");
  assert.match(
    wgsl,
    /fn glsRefractionNormal\([\s\S]*?if \(style != 23\)/,
    "WGSL 折射软体动态法线缺失",
  );
  assert.match(
    metal,
    /metal::float2 glsRefractionNormal\([\s\S]*?if \(style != 23\)/,
    "Metal 折射软体动态法线缺失",
  );

  assert.ok(presets.styleNames.length > 0, "至少需要一个预设");
  assert.equal(
    new Set(presets.styleNames).size,
    presets.styleNames.length,
    "预设名称不能重复",
  );

  function parseSwiftSeed(code, state) {
    const name = state === "idle" ? "Idle" : "Thinking";
    const match = code.match(
      new RegExp(`private let orb${name}UniformSeed: \\[Float\\] = \\[([\\s\\S]*?)\\]`),
    );
    assert.ok(match, `Swift ${state} uniform seed 缺失`);
    return match[1]
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(Number);
  }

  for (const style of presets.styleNames) {
    const configuration = orbStates.createPresetOrbStateConfiguration(style);
    const thinkingParams = orbStates.resolveOrbStateParams(configuration, "thinking");
    const idleParams = orbStates.resolveOrbStateParams(configuration, "idle");
    const expectedSeeds = {
      idle: uniforms.createOrbUniformSnapshot(idleParams),
      thinking: uniforms.createOrbUniformSnapshot(thinkingParams),
    };
    const webCode = createWebExport(configuration, "thinking");
    const swiftCode = createSwiftExport(configuration, "thinking");

    const webSeedsMatch = webCode.match(/const stateSeeds = (\{"idle":\[[^;]+\});/);
    assert.ok(webSeedsMatch, `${style}: Web 两态 uniform seed 缺失`);
    const webSeeds = JSON.parse(webSeedsMatch[1]);
    const swiftSeeds = {
      idle: parseSwiftSeed(swiftCode, "idle"),
      thinking: parseSwiftSeed(swiftCode, "thinking"),
    };

    assert.deepEqual(
      thinkingParams,
      { style, ...presets.stylePresets[style] },
      `${style}: 思考态改变了原预设`,
    );
    const differingStateKeys = orbStates.orbStateProfileKeys.filter(
      (key) => idleParams[key] !== thinkingParams[key],
    );
    assert.ok(differingStateKeys.length > 0, `${style}: 空闲态与思考态没有视觉差异`);
    assert.equal(idleParams.edgeGlow, 0, `${style}: 空闲态默认外发光必须为 0`);
    assert.equal(thinkingParams.edgeGlow, 0, `${style}: 思考态默认外发光必须为 0`);

    for (const state of orbStates.orbStateNames) {
      assert.deepEqual(
        webSeeds[state],
        expectedSeeds[state],
        `${style}/${state}: Web 参数与编辑器不一致`,
      );
      assert.deepEqual(
        swiftSeeds[state],
        expectedSeeds[state],
        `${style}/${state}: Swift 参数与编辑器不一致`,
      );
      assert.equal(
        webSeeds[state].length,
        uniforms.orbUniformFloatCount,
        `${style}/${state}: uniform 长度错误`,
      );
      assert.equal(
        webSeeds[state][15],
        presets.styleFlowIndexes[style],
        `${style}/${state}: Web 分发索引错误`,
      );
      assert.equal(
        swiftSeeds[state][15],
        presets.styleFlowIndexes[style],
        `${style}/${state}: Swift 分发索引错误`,
      );
      assert.equal(webSeeds[state][19], 1, `${style}/${state}: Web 默认玻璃罩未开启`);
      assert.equal(swiftSeeds[state][19], 1, `${style}/${state}: Swift 默认玻璃罩未开启`);
    }

    const transition = orbStates.createOrbTransitionController({
      state: "thinking",
      params: thinkingParams,
      transitionDuration: configuration.transitionDuration,
    });
    const transitionStart = transition.sample({
      state: "idle",
      params: idleParams,
      transitionDuration: configuration.transitionDuration,
    }, 100);
    assert.deepEqual(transitionStart, thinkingParams, `${style}: 状态切换起点不连续`);
    const halfwayAt = 100 + configuration.transitionDuration * 500;
    const halfway = transition.sample({
      state: "idle",
      params: idleParams,
      transitionDuration: configuration.transitionDuration,
    }, halfwayAt);
    assert.notEqual(halfway.speed, thinkingParams.speed, `${style}: 过渡中点没有开始变化`);
    assert.notEqual(halfway.speed, idleParams.speed, `${style}: 过渡中点提前到达终值`);
    const interrupted = transition.sample({
      state: "thinking",
      params: thinkingParams,
      transitionDuration: configuration.transitionDuration,
    }, halfwayAt);
    assert.ok(
      Math.abs(interrupted.speed - halfway.speed) < 0.000001,
      `${style}: 反向切换产生数值跳变`,
    );

    const webSeed = webSeeds.thinking;
    const swiftSeed = swiftSeeds.thinking;

    if (style === "refractiveBlob") {
      assert.ok(webSeed[20] >= 0.7, "折射软体默认折射强度不足");
      assert.ok(webSeed[12] >= 0.3, "折射软体默认折射带过窄");
      assert.ok(webSeed[11] >= 0.4, "折射软体默认色散不足");
    }

    if (style === "chromaticMetal") {
      const metalUniforms = [
        [22, "bandDensity", "重复次数"],
        [23, "chromaticShift", "RGB 分离"],
        [24, "metalScale", "图案缩放"],
        [25, "metalStretch", "纵横拉伸"],
        [26, "metalAngle", "流带角度"],
        [27, "metalOffset", "图案偏移"],
        [28, "metalPhase", "循环相位"],
        [29, "metalEvolution", "演化幅度"],
        [30, "metalRoughness", "表面粗糙度"],
        [31, "metalDepth", "金属深度"],
      ];
      for (const [index, key, label] of metalUniforms) {
        assert.ok(
          Math.abs(webSeed[index] - thinkingParams[key]) < 0.000001,
          `色差金属：${label}未写入 uniform`,
        );
        assert.match(wgsl, new RegExp(`\\b${key}:\\s+f32`), `WGSL 缺少 ${label} 参数`);
        assert.match(metal, new RegExp(`float ${key};`), `Metal 缺少 ${label} 参数`);
      }
      assert.match(wgsl, /let cycle = t \* 0\.46 \+ u\.metalPhase/, "WGSL 动画未使用循环相位");
      assert.match(metal, /float cycle = t \* 0\.46 \+ u\.metalPhase/, "Metal 动画未使用循环相位");
      assert.match(wgsl, /\+ cycle\n\s+\+ u\.metalOffset/, "WGSL 主流场缺少单向相位推进");
      assert.match(metal, /\+ cycle\n\s+\+ u\.metalOffset/, "Metal 主流场缺少单向相位推进");
      const loopDuration = (Math.PI * 2) / (0.46 * thinkingParams.speed);
      assert.ok(loopDuration >= 11.5 && loopDuration <= 13, "色差金属默认循环时长偏离参考视频");
    }

    const webShaderMatch = webCode.match(/^    const shaderSource = (.+);$/m);
    assert.ok(webShaderMatch, `${style}: Web shader 源码缺失`);
    assert.equal(JSON.parse(webShaderMatch[1]), shaderModule.orbShaderSource);
    const webScriptMatch = webCode.match(/<script type="module">([\s\S]*?)<\/script>/);
    assert.ok(webScriptMatch, `${style}: Web 运行脚本缺失`);
    assert.doesNotThrow(() => new Function(webScriptMatch[1]), `${style}: Web 运行脚本语法错误`);

    const swiftMetalMatch = swiftCode.match(
      /private let orbMetalSource = #"""\n([\s\S]*?)\n"""#/,
    );
    assert.ok(swiftMetalMatch, `${style}: Swift Metal 源码缺失`);
    assert.equal(swiftMetalMatch[1], metal, `${style}: Swift Metal 源码失真`);
    assert.match(swiftCode, /view\.isOpaque = false/, `${style}: Swift iOS 透明视图配置缺失`);
    assert.match(swiftCode, /view\.layer\?\.isOpaque = false/, `${style}: Swift macOS 透明图层配置缺失`);
    assert.match(swiftCode, /alpha: 0/, `${style}: Swift 透明清屏配置缺失`);
    assert.match(
      swiftCode,
      /sourceRGBBlendFactor = \.one/,
      `${style}: Swift 未使用预乘 Alpha 混合`,
    );

    const flowIndex = presets.styleFlowIndexes[style];
    assert.match(wgsl, new RegExp(`style == ${flowIndex}\\b`), `${style}: WGSL 分支缺失`);
    assert.match(metal, new RegExp(`style == ${flowIndex}\\b`), `${style}: Metal 分支缺失`);
    assert.match(webCode, /device\.lost\.then/, `${style}: Web 设备丢失处理缺失`);
    assert.match(webCode, /uncapturederror/, `${style}: Web GPU 错误处理缺失`);
    assert.match(webCode, /setState\(nextState\)/, `${style}: Web 状态 API 缺失`);
    assert.match(webCode, /hasOwnProperty\.call\(stateSeeds, nextState\)/, `${style}: Web 状态 API 边界校验缺失`);
    assert.match(swiftCode, /public enum LiquidOrbState/, `${style}: Swift 状态类型缺失`);
    assert.match(swiftCode, /public init\(state: LiquidOrbState = \.thinking\)/, `${style}: Swift 初始状态不一致`);
  }

  const adjustedMetal = {
    style: "chromaticMetal",
    ...presets.stylePresets.chromaticMetal,
    speed: 1.17,
    bandDensity: 4.3,
    chromaticShift: 0.68,
    metalScale: 1.31,
    metalStretch: 0.74,
    metalAngle: -38,
    metalOffset: -0.27,
    metalPhase: 0.63,
    metalEvolution: 1.46,
    metalRoughness: 0.57,
    metalDepth: 0.81,
    colorA: "#DDE8E4",
  };
  let adjustedConfiguration = orbStates.createOrbStateConfiguration(adjustedMetal, 1.15);
  adjustedConfiguration = orbStates.updateOrbStateParam(
    adjustedConfiguration,
    "idle",
    "speed",
    0.31,
  );
  adjustedConfiguration = orbStates.updateOrbStateParam(
    adjustedConfiguration,
    "idle",
    "colorA",
    "#8296A0",
  );
  adjustedConfiguration = orbStates.updateOrbStateParam(
    adjustedConfiguration,
    "idle",
    "radius",
    0.81,
  );
  const adjustedExpected = Object.fromEntries(
    orbStates.orbStateNames.map((state) => [
      state,
      uniforms.createOrbUniformSnapshot(
        orbStates.resolveOrbStateParams(adjustedConfiguration, state),
      ),
    ]),
  );
  const adjustedWeb = createWebExport(adjustedConfiguration, "idle");
  const adjustedSwift = createSwiftExport(adjustedConfiguration, "idle");
  const adjustedWebMatch = adjustedWeb.match(/const stateSeeds = (\{"idle":\[[^;]+\});/);
  assert.ok(adjustedWebMatch, "调参后的 Web 两态 uniform seed 缺失");
  const adjustedWebSeeds = JSON.parse(adjustedWebMatch[1]);
  for (const state of orbStates.orbStateNames) {
    assert.deepEqual(
      adjustedWebSeeds[state],
      adjustedExpected[state],
      `调参后的 Web ${state} 导出与编辑器不一致`,
    );
    assert.deepEqual(
      parseSwiftSeed(adjustedSwift, state),
      adjustedExpected[state],
      `调参后的 Swift ${state} 导出与编辑器不一致`,
    );
    assert.ok(
      Math.abs(adjustedExpected[state][4] - 0.81) < 0.000001,
      `共享半径没有同步到 ${state}`,
    );
  }
  assert.match(adjustedWeb, /let state = "idle";/, "Web 初始状态未匹配编辑器");
  assert.match(adjustedSwift, /public init\(state: LiquidOrbState = \.idle\)/, "Swift 初始状态未匹配编辑器");

  console.log(
    `Verified ${presets.styleNames.length} presets across idle/thinking: editor, WebGPU, and SwiftUI parameters are identical.`,
  );
} finally {
  await server.close();
}
