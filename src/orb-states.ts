import { type OrbParams, stylePresets, type StyleName } from "./presets";

export const orbStateNames = ["idle", "thinking"] as const;
export type OrbStateName = (typeof orbStateNames)[number];

export const orbStateNumericKeys = [
  "speed",
  "contourDeform",
  "bandDensity",
  "chromaticShift",
  "metalStretch",
  "metalEvolution",
  "metalRoughness",
  "metalDepth",
  "zoom",
  "warp",
  "ridgeAmt",
  "sharp",
  "shade",
  "exposure",
  "edgeGlow",
] as const;

export const orbStateColorKeys = [
  "colorA",
  "colorB",
  "colorC",
  "colorD",
  "highlightColor",
  "glowColor",
] as const;

export const orbStateProfileKeys = [
  ...orbStateNumericKeys,
  ...orbStateColorKeys,
] as const;

export type OrbStateNumericKey = (typeof orbStateNumericKeys)[number];
export type OrbStateColorKey = (typeof orbStateColorKeys)[number];
export type OrbStateProfileKey = (typeof orbStateProfileKeys)[number];
export type OrbStateProfile = Pick<OrbParams, OrbStateProfileKey>;
export type OrbSharedParams = Omit<OrbParams, OrbStateProfileKey>;

export type OrbStateConfiguration = {
  shared: OrbSharedParams;
  profiles: Record<OrbStateName, OrbStateProfile>;
  transitionDuration: number;
};

export type OrbRenderTarget = {
  state: OrbStateName;
  params: OrbParams;
  transitionDuration: number;
};

export const defaultOrbState: OrbStateName = "thinking";
export const defaultOrbTransitionDuration = 0.65;

type NumericTransform = {
  scale: number;
  offset?: number;
};

type IdleTransforms = Partial<Record<OrbStateNumericKey, NumericTransform>>;

const idleTransformsByStyle: Record<StyleName, IdleTransforms> = {
  siri: {
    speed: { scale: 0.52 },
    contourDeform: { scale: 0.35 },
    zoom: { scale: 0.9 },
    warp: { scale: 0.72 },
    ridgeAmt: { scale: 0.68 },
    exposure: { scale: 0.84 },
  },
  voiceWave: {
    speed: { scale: 0.48 },
    contourDeform: { scale: 0.4 },
    zoom: { scale: 0.88 },
    warp: { scale: 0.68 },
    ridgeAmt: { scale: 0.62 },
    exposure: { scale: 0.8 },
  },
  blueDrop: {
    speed: { scale: 0.5 },
    contourDeform: { scale: 0.45 },
    zoom: { scale: 0.88 },
    warp: { scale: 0.7 },
    ridgeAmt: { scale: 0.66 },
    sharp: { scale: 0.88 },
    exposure: { scale: 0.82 },
  },
  violetEmber: {
    speed: { scale: 0.48 },
    contourDeform: { scale: 0.4 },
    zoom: { scale: 0.86 },
    warp: { scale: 0.66 },
    ridgeAmt: { scale: 0.62 },
    sharp: { scale: 0.86 },
    exposure: { scale: 0.8 },
  },
  refractiveBlob: {
    speed: { scale: 0.5 },
    contourDeform: { scale: 0.42 },
    zoom: { scale: 0.9 },
    warp: { scale: 0.67 },
    ridgeAmt: { scale: 0.64 },
    sharp: { scale: 0.88 },
    exposure: { scale: 0.84 },
  },
  chromaticMetal: {
    speed: { scale: 0.5 },
    bandDensity: { scale: 0.72 },
    chromaticShift: { scale: 0.62 },
    metalStretch: { scale: 0.72 },
    metalEvolution: { scale: 0.58 },
    metalRoughness: { scale: 1.18 },
    metalDepth: { scale: 0.76 },
    exposure: { scale: 0.88 },
  },
  aurora: {
    speed: { scale: 0.36 },
    contourDeform: { scale: 0.35 },
    zoom: { scale: 0.88 },
    warp: { scale: 0.66 },
    ridgeAmt: { scale: 0.6 },
    exposure: { scale: 0.82 },
  },
  frost: {
    speed: { scale: 0.42 },
    contourDeform: { scale: 0.35 },
    zoom: { scale: 0.9 },
    warp: { scale: 0.68 },
    ridgeAmt: { scale: 0.62 },
    sharp: { scale: 0.86 },
    exposure: { scale: 0.86 },
  },
  chrome: {
    speed: { scale: 0.42 },
    contourDeform: { scale: 0.4 },
    zoom: { scale: 0.88 },
    warp: { scale: 0.66 },
    sharp: { scale: 0.84 },
    exposure: { scale: 0.86 },
  },
  opal: {
    speed: { scale: 0.46 },
    contourDeform: { scale: 0.4 },
    zoom: { scale: 0.9 },
    warp: { scale: 0.7 },
    ridgeAmt: { scale: 0.65 },
    exposure: { scale: 0.84 },
  },
  spectrum: {
    speed: { scale: 0.44 },
    contourDeform: { scale: 0.38 },
    zoom: { scale: 0.88 },
    warp: { scale: 0.65 },
    ridgeAmt: { scale: 0.58 },
    exposure: { scale: 0.8 },
  },
  plasma: {
    speed: { scale: 0.44 },
    contourDeform: { scale: 0.36 },
    zoom: { scale: 0.86 },
    warp: { scale: 0.64 },
    ridgeAmt: { scale: 0.56 },
    sharp: { scale: 0.82 },
    exposure: { scale: 0.8 },
  },
};

const orbStateProfileKeySet = new Set<keyof OrbParams>(orbStateProfileKeys);

export function isOrbStateProfileKey(key: keyof OrbParams): key is OrbStateProfileKey {
  return orbStateProfileKeySet.has(key);
}

export function splitOrbParams(params: OrbParams): {
  shared: OrbSharedParams;
  profile: OrbStateProfile;
} {
  const profile = Object.fromEntries(
    orbStateProfileKeys.map((key) => [key, params[key]]),
  ) as OrbStateProfile;
  const shared = { ...params } as Partial<OrbParams>;
  for (const key of orbStateProfileKeys) delete shared[key];

  return {
    shared: shared as OrbSharedParams,
    profile,
  };
}

function createIdleParams(thinkingParams: OrbParams): OrbParams {
  const idleParams = { ...thinkingParams };
  const transforms = idleTransformsByStyle[thinkingParams.style];

  for (const [key, transform] of Object.entries(transforms) as Array<
    [OrbStateNumericKey, NumericTransform]
  >) {
    idleParams[key] = thinkingParams[key] * transform.scale + (transform.offset ?? 0);
  }

  return idleParams;
}

export function createOrbStateConfiguration(
  thinkingParams: OrbParams,
  transitionDuration = defaultOrbTransitionDuration,
): OrbStateConfiguration {
  if (!Number.isFinite(transitionDuration) || transitionDuration < 0) {
    throw new RangeError(`Invalid orb transition duration: ${transitionDuration}`);
  }

  const thinking = splitOrbParams(thinkingParams);
  const idle = splitOrbParams(createIdleParams(thinkingParams));

  return {
    shared: thinking.shared,
    profiles: {
      idle: idle.profile,
      thinking: thinking.profile,
    },
    transitionDuration,
  };
}

export function createPresetOrbStateConfiguration(style: StyleName): OrbStateConfiguration {
  return createOrbStateConfiguration({ style, ...stylePresets[style] });
}

export function resolveOrbStateParams(
  configuration: OrbStateConfiguration,
  state: OrbStateName,
): OrbParams {
  return {
    ...configuration.shared,
    ...configuration.profiles[state],
  };
}

export function updateOrbStateParam<Key extends keyof OrbParams>(
  configuration: OrbStateConfiguration,
  state: OrbStateName,
  key: Key,
  value: OrbParams[Key],
): OrbStateConfiguration {
  if (isOrbStateProfileKey(key)) {
    return {
      ...configuration,
      profiles: {
        ...configuration.profiles,
        [state]: {
          ...configuration.profiles[state],
          [key]: value,
        },
      },
    };
  }

  return {
    ...configuration,
    shared: {
      ...configuration.shared,
      [key]: value,
    },
  };
}

function parseHexColor(hex: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`Invalid orb color: ${hex}`);
  }

  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function srgbToLinear(value: number): number {
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308
    ? value * 12.92
    : 1.055 * value ** (1 / 2.4) - 0.055;
}

function mixHexColor(from: string, to: string, progress: number): string {
  if (progress === 0) return from;
  if (progress === 1) return to;

  const fromRgb = parseHexColor(from);
  const toRgb = parseHexColor(to);
  const mixed = fromRgb.map((channel, index) => {
    const linear = srgbToLinear(channel)
      + (srgbToLinear(toRgb[index]) - srgbToLinear(channel)) * progress;
    return Math.min(255, Math.max(0, Math.round(linearToSrgb(linear) * 255)));
  });

  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function smoothOrbTransitionProgress(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return clamped * clamped * (3 - 2 * clamped);
}

export function interpolateOrbParams(
  from: OrbParams,
  to: OrbParams,
  progress: number,
): OrbParams {
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped === 0) return { ...from };
  if (clamped === 1) return { ...to };

  const result = { ...to };
  for (const key of orbStateNumericKeys) {
    result[key] = from[key] + (to[key] - from[key]) * clamped;
  }
  for (const key of orbStateColorKeys) {
    result[key] = mixHexColor(from[key], to[key], clamped);
  }
  return result;
}

export function createOrbTransitionController(initialTarget: OrbRenderTarget): {
  sample: (target: OrbRenderTarget, nowMs: number) => OrbParams;
} {
  let state = initialTarget.state;
  let fromParams = { ...initialTarget.params };
  let targetParams = { ...initialTarget.params };
  let startedAtMs = 0;
  let durationMs = 0;

  function currentParams(nowMs: number): OrbParams {
    if (durationMs === 0) return { ...targetParams };
    const elapsed = Math.max(0, nowMs - startedAtMs);
    const progress = smoothOrbTransitionProgress(elapsed / durationMs);
    return interpolateOrbParams(fromParams, targetParams, progress);
  }

  return {
    sample(nextTarget, nowMs) {
      if (nextTarget.state !== state) {
        fromParams = currentParams(nowMs);
        targetParams = { ...nextTarget.params };
        startedAtMs = nowMs;
        durationMs = Math.max(0, nextTarget.transitionDuration * 1000);
        state = nextTarget.state;
      } else {
        targetParams = { ...nextTarget.params };
      }

      return currentParams(nowMs);
    },
  };
}
