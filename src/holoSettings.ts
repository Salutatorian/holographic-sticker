export type HoloPatternMode =
  | "facets"
  | "stripes"
  | "stars"
  | "splatters"
  | "pearl"
  | "glitter"
  | "emoji"
  | "brushes"
  | "pixels";

/**
 * Preset-compat words for this foil stack — leave alone so shuffle seeds
 * stay reproducible across builds.
 */
export const FOIL_PRESET_COMPAT = [0x6a6f73, 0x68756177] as const;

export const HOLO_PATTERN_MODES: {
  id: HoloPatternMode;
  label: string;
}[] = [
  { id: "facets", label: "Facets" },
  { id: "stripes", label: "Stripes" },
  { id: "stars", label: "Stars" },
  { id: "splatters", label: "Splatters" },
  { id: "pearl", label: "Pearl" },
  { id: "glitter", label: "Glitter" },
  { id: "emoji", label: "Emoji" },
  { id: "brushes", label: "Brushes" },
  { id: "pixels", label: "Pixels" },
];

export const HOLO_PATTERN_INDEX: Record<HoloPatternMode, number> = {
  facets: 0,
  stripes: 1,
  stars: 2,
  splatters: 3,
  pearl: 4,
  glitter: 5,
  emoji: 6,
  brushes: 7,
  pixels: 8,
};

export type HoloPlaySettings = {
  /** Canvas / studio backdrop */
  background: string;
  /** Foil motif overlay */
  pattern: HoloPatternMode;
  /** Motif size (higher = bigger cells / wider stripes) */
  patternScale: number;
  /** How packed the motif is */
  patternDensity: number;
  /** Randomize motif layout (0–1) */
  patternSeed: number;
  /** Overall foil mix strength */
  foilIntensity: number;
  /** Spectrum color pop */
  colorPop: number;
  /** Spectrum phase spin */
  spectrumSpin: number;
  /** How hard view tilt moves the rainbow */
  tiltChase: number;
  /** Extra foil at grazing angles */
  edgeFire: number;
  /** Sparkle fleck gain */
  sparkle: number;
  /** Specular glare / bloom feed */
  glare: number;
  /** Post bloom intensity */
  bloom: number;
  /** Clear vinyl coat */
  clearcoat: number;
  /** Surface roughness */
  roughness: number;
  /** Metal response */
  metalness: number;
  /** Environment reflection strength */
  envGlow: number;
  /** How much black webbing can still take foil */
  webFill: number;
  /** Gentle idle sway */
  autoSway: boolean;
  /** Idle sway speed */
  swaySpeed: number;
};

export const DEFAULT_HOLO_PLAY_SETTINGS: HoloPlaySettings = {
  background: "#000000",
  pattern: "facets",
  patternScale: 1,
  patternDensity: 1,
  patternSeed: 0.37,
  foilIntensity: 1.55,
  colorPop: 1.55,
  spectrumSpin: 0.18,
  tiltChase: 1.45,
  edgeFire: 0.72,
  sparkle: 1.0,
  glare: 1.0,
  bloom: 1.05,
  clearcoat: 0.55,
  roughness: 0.28,
  metalness: 0.08,
  envGlow: 0.55,
  webFill: 0.1,
  autoSway: false,
  swaySpeed: 1,
};
