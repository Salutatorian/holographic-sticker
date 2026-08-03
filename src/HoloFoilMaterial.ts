import * as THREE from "three";
import {
  FOIL_PRESET_COMPAT,
  HOLO_PATTERN_INDEX,
  type HoloPatternMode,
} from "@/components/collectibles/sticker/holoSettings";

export type HoloDebugMode =
  | "final"
  | "base"
  | "macro"
  | "detailPhase"
  | "foilNormal"
  | "sparkle"
  | "composite";

export const HOLO_DEBUG_MODES: HoloDebugMode[] = [
  "final",
  "base",
  "macro",
  "detailPhase",
  "foilNormal",
  "sparkle",
  "composite",
];

const DEBUG_INDEX: Record<HoloDebugMode, number> = {
  final: 0,
  base: 1,
  macro: 2,
  detailPhase: 3,
  foilNormal: 4,
  sparkle: 5,
  composite: 6,
};

export type HoloFoilMaterialOptions = {
  map?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null;
  holoMask?: THREE.Texture | null;
  holoDetail?: THREE.Texture | null;
  holoNormal?: THREE.Texture | null;
  holoSpectrum?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  /** Overall foil response multiplier — keep ≤ ~1.65 */
  strength?: number;
  /**
   * Minimum foil openness on near-black ink (0–1).
   * Restrained so printed linework stays legible.
   */
  inkFoilFloor?: number;
  /** Phase offset so reset view starts with familiar cyan/violet/gold */
  defaultPhaseOffset?: number;
  horizontalShift?: number;
  verticalShift?: number;
  grazingShift?: number;
  debugMode?: HoloDebugMode;
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  envMapIntensity?: number;
  specularIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
  side?: THREE.Side;
  depthWrite?: boolean;
};

/**
 * MeshPhysicalMaterial with faceted holographic foil.
 *
 * Macro spectrum zones + micro response from a foil normal map so neighboring
 * Voronoi cells shift color independently. Normals affect reflections only —
 * they never deform sticker geometry.
 */
export function createHoloFoilMaterial(
  options: HoloFoilMaterialOptions = {},
): THREE.MeshPhysicalMaterial {
  const strength = options.strength ?? 1;
  const inkFoilFloor = options.inkFoilFloor ?? 0.18;
  const defaultPhaseOffset = options.defaultPhaseOffset ?? 0.18;
  const horizontalShift = options.horizontalShift ?? 1.35;
  const verticalShift = options.verticalShift ?? 1.05;
  const grazingShift = options.grazingShift ?? 0.55;
  const debugMode = options.debugMode ?? "final";

  const material = new THREE.MeshPhysicalMaterial({
    map: options.map ?? null,
    alphaMap: options.alphaMap ?? null,
    roughnessMap: options.roughnessMap ?? null,
    color: options.color ?? "#ffffff",
    roughness: options.roughness ?? 0.34,
    metalness: options.metalness ?? 0.12,
    clearcoat: options.clearcoat ?? 0.55,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.18,
    envMapIntensity: options.envMapIntensity ?? 0.38,
    specularIntensity: options.specularIntensity ?? 0.32,
    iridescence: 0,
    transparent: options.transparent ?? true,
    opacity: options.opacity ?? 1,
    alphaTest: options.alphaTest ?? 0.08,
    side: options.side ?? THREE.FrontSide,
    depthWrite: options.depthWrite ?? true,
    toneMapped: true,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHoloMask = { value: options.holoMask };
    shader.uniforms.uHoloDetail = { value: options.holoDetail };
    shader.uniforms.uHoloNormal = { value: options.holoNormal };
    shader.uniforms.uHoloSpectrum = { value: options.holoSpectrum };
    shader.uniforms.uFoilStrength = { value: strength };
    shader.uniforms.uInkFoilFloor = { value: inkFoilFloor };
    shader.uniforms.uPhaseOffset = { value: defaultPhaseOffset };
    shader.uniforms.uHorizontalShift = { value: horizontalShift };
    shader.uniforms.uVerticalShift = { value: verticalShift };
    shader.uniforms.uGrazingShift = { value: grazingShift };
    shader.uniforms.uDebugMode = { value: DEBUG_INDEX[debugMode] };
    shader.uniforms.uHasHoloMask = { value: options.holoMask ? 1 : 0 };
    shader.uniforms.uHasHoloDetail = { value: options.holoDetail ? 1 : 0 };
    shader.uniforms.uHasHoloNormal = { value: options.holoNormal ? 1 : 0 };
    shader.uniforms.uHasSpectrum = { value: options.holoSpectrum ? 1 : 0 };
    // World-space direction from sticker toward the studio sun (normalized)
    shader.uniforms.uSunDir = {
      value: new THREE.Vector3(0.35, 0.75, 0.55).normalize(),
    };
    shader.uniforms.uSaturation = { value: 1.55 };
    shader.uniforms.uSparkleGain = { value: 1.0 };
    shader.uniforms.uGlareGain = { value: 1.0 };
    shader.uniforms.uPatternMode = { value: 0 };
    shader.uniforms.uPatternScale = { value: 1.0 };
    shader.uniforms.uPatternDensity = { value: 1.0 };
    shader.uniforms.uPatternSeed = { value: 0.37 };

    material.userData.holoUniforms = shader.uniforms;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
varying vec3 vHoloWorldPos;
varying vec3 vHoloWorldNormal;
varying vec3 vHoloWorldTangent;`,
      )
      .replace(
        "#include <worldpos_vertex>",
        /* glsl */ `#include <worldpos_vertex>
vHoloWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vHoloWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
#if defined( USE_TANGENT )
  vHoloWorldTangent = normalize(mat3(modelMatrix) * objectTangent.xyz);
#else
  vec3 tObj = normalize(cross(objectNormal, vec3(0.0, 1.0, 0.0)));
  if (length(tObj) < 0.1) tObj = normalize(cross(objectNormal, vec3(1.0, 0.0, 0.0)));
  vHoloWorldTangent = normalize(mat3(modelMatrix) * tObj);
#endif
`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
uniform sampler2D uHoloMask;
uniform sampler2D uHoloDetail;
uniform sampler2D uHoloNormal;
uniform sampler2D uHoloSpectrum;
uniform float uFoilStrength;
uniform float uInkFoilFloor;
uniform float uPhaseOffset;
uniform float uHorizontalShift;
uniform float uVerticalShift;
uniform float uGrazingShift;
uniform float uDebugMode;
uniform float uHasHoloMask;
uniform float uHasHoloDetail;
uniform float uHasHoloNormal;
uniform float uHasSpectrum;
uniform vec3 uSunDir;
uniform float uSaturation;
uniform float uSparkleGain;
uniform float uGlareGain;
uniform float uPatternMode;
uniform float uPatternScale;
uniform float uPatternDensity;
uniform float uPatternSeed;
varying vec3 vHoloWorldPos;
varying vec3 vHoloWorldNormal;
varying vec3 vHoloWorldTangent;

float holoInkDarkness(vec3 baseColor) {
  float luma = dot(baseColor, vec3(0.2126, 0.7152, 0.0722));
  return 1.0 - smoothstep(0.04, 0.28, luma);
}

vec3 holoScreenBlend(vec3 base, vec3 foil, float amt) {
  // Prefer saturated foil color over milky screen wash
  vec3 screened = 1.0 - (1.0 - base) * (1.0 - foil);
  vec3 colorMix = mix(base, foil, 0.72);
  // Keep a hint of the printed red under the spectrum
  vec3 tinted = foil * mix(vec3(1.0), normalize(base + 0.08) * 1.35, 0.22);
  vec3 mixed = mix(screened, mix(colorMix, tinted, 0.55), 0.7);
  return mix(base, mixed, amt);
}

vec3 holoBoostSaturation(vec3 c, float amount) {
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return clamp(mix(vec3(luma), c, amount), 0.0, 1.5);
}

vec3 sampleSpectrum(vec2 uv) {
  vec3 c;
  if (uHasSpectrum > 0.5) {
    c = texture2D(uHoloSpectrum, uv).rgb;
  } else {
    float t = fract(uv.x);
    c = 0.55 + 0.45 * vec3(
      sin(t * 6.28318 + 0.0) * 0.5 + 0.5,
      sin(t * 6.28318 + 2.094) * 0.5 + 0.5,
      sin(t * 6.28318 + 4.188) * 0.5 + 0.5
    );
  }
  return holoBoostSaturation(c, uSaturation);
}

float holoHash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 holoHash22(vec2 p) {
  return fract(
    sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) *
      43758.5453
  );
}

float holoStarSDF(vec2 p, float points, float fat) {
  float an = 3.14159265 / points;
  float en = 3.14159265 / fat;
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= acs * clamp(dot(p, acs), 0.0, acs.x / ecs.y * ecs.x + 0.02);
  return length(p) * sign(p.x);
}

float holoHeartSDF(vec2 p) {
  p.x = abs(p.x);
  float a = length(p - vec2(0.12, 0.14)) - 0.155;
  float b = length(p - vec2(0.0, -0.02) * vec2(1.0, 0.92)) - 0.2;
  // pointed bottom via diagonal cut
  float tip = (p.x + p.y + 0.22) * 0.7071;
  return max(min(a, b), -tip);
}

float holoSmileSDF(vec2 p) {
  float head = length(p) - 0.32;
  float eyeL = length(p - vec2(-0.11, 0.08)) - 0.045;
  float eyeR = length(p - vec2(0.11, 0.08)) - 0.045;
  float mouth = abs(length(p - vec2(0.0, -0.02)) - 0.14) - 0.025;
  mouth = max(mouth, p.y + 0.02);
  float face = min(head, min(eyeL, eyeR));
  return min(face, mouth);
}

float holoEmojiStamp(vec2 r, float kind) {
  float sz = mix(2.4, 4.2, fract(kind * 7.1));
  vec2 p = r * sz;
  float k = floor(kind * 4.0);
  float d;
  if (k < 0.5) {
    d = holoStarSDF(p, 5.0, 2.35);
  } else if (k < 1.5) {
    d = holoHeartSDF(p * 1.05);
  } else if (k < 2.5) {
    d = holoSmileSDF(p);
  } else {
    // rounded spark / petal
    float a = atan(p.y, p.x);
    float rad = length(p);
    d = rad - (0.22 + 0.08 * sin(a * 3.0));
  }
  return 1.0 - smoothstep(0.0, 0.07, d);
}

/** Returns mask, phase offset, sparkle boost for the active motif. */
vec3 holoSamplePattern(vec2 uv) {
  float scale = max(0.25, uPatternScale);
  float dens = clamp(uPatternDensity, 0.15, 3.0);
  float seed = uPatternSeed * 19.7;
  vec2 p = uv * mix(4.0, 28.0, clamp(scale * 0.35, 0.0, 1.0));
  p += vec2(seed, seed * 1.37);

  // 0 facets — baked maps already carry the motif
  if (uPatternMode < 0.5) {
    return vec3(1.0, 0.0, 1.0);
  }

  // 1 stripes
  if (uPatternMode < 1.5) {
    float lines = dens * 18.0;
    float wave = sin((uv.x * lines + uv.y * lines * 0.22 + seed) * 6.28318);
    float mask = smoothstep(0.05, 0.55, abs(wave));
    float phase = fract(uv.x * lines * 0.08 + seed * 0.1);
    return vec3(mask, phase, mix(0.4, 1.2, mask));
  }

  // 2 stars
  if (uPatternMode < 2.5) {
    float cells = mix(6.0, 22.0, dens * 0.45);
    vec2 gv = uv * cells + seed;
    vec2 id = floor(gv);
    vec2 f = fract(gv) - 0.5;
    float best = 1.0;
    float phase = 0.0;
    for (int oy = -1; oy <= 1; oy++) {
      for (int ox = -1; ox <= 1; ox++) {
        vec2 oid = id + vec2(float(ox), float(oy));
        vec2 o = holoHash22(oid + seed);
        if (o.x > dens * 0.55) continue;
        vec2 r = f - vec2(float(ox), float(oy)) - (o - 0.5) * 0.55;
        float s = holoStarSDF(r * mix(2.2, 4.5, o.y), 5.0, 2.4);
        float m = 1.0 - smoothstep(0.0, 0.08, s);
        if (m > best) {
          best = m;
          phase = o.y;
        }
      }
    }
    return vec3(clamp(best, 0.0, 1.0), phase, 0.5 + best * 1.5);
  }

  // 3 splatters
  if (uPatternMode < 3.5) {
    float cells = mix(5.0, 18.0, dens * 0.5);
    vec2 gv = uv * cells + seed * 1.7;
    vec2 id = floor(gv);
    vec2 f = fract(gv) - 0.5;
    float mask = 0.0;
    float phase = 0.0;
    for (int oy = -1; oy <= 1; oy++) {
      for (int ox = -1; ox <= 1; ox++) {
        vec2 oid = id + vec2(float(ox), float(oy));
        vec2 o = holoHash22(oid + seed * 3.1);
        if (o.x > dens * 0.62) continue;
        vec2 r = f - vec2(float(ox), float(oy)) - (o - 0.5) * 0.7;
        float rad = mix(0.12, 0.42, o.y) * scale;
        float d = length(r) / max(rad, 0.04);
        float blob = 1.0 - smoothstep(0.35, 1.0, d);
        blob *= 0.75 + 0.25 * sin(r.x * 28.0 + o.x * 9.0);
        if (blob > mask) {
          mask = blob;
          phase = o.x;
        }
      }
    }
    return vec3(clamp(mask, 0.0, 1.0), phase, 0.35 + mask);
  }

  // 4 pearl — soft field, almost no cells
  if (uPatternMode < 4.5) {
    float soft =
      0.45 +
      0.35 * sin((uv.x + seed) * 6.28318 * dens) *
        cos((uv.y - seed) * 6.28318 * dens * 0.8);
    return vec3(clamp(soft, 0.2, 0.85), fract(uv.x + uv.y + seed), 0.2);
  }

  // 5 glitter — dense micro flecks
  if (uPatternMode < 5.5) {
    float cells = mix(28.0, 72.0, dens * 0.5);
    vec2 gv = uv * cells + seed * 5.0;
    vec2 id = floor(gv);
    vec2 f = fract(gv) - 0.5;
    float n = holoHash21(id + seed);
    float keep = step(1.0 - clamp(dens * 0.35, 0.05, 0.95), n);
    float d = length(f - (holoHash22(id) - 0.5) * 0.35);
    float fleck = keep * (1.0 - smoothstep(0.02, 0.11, d));
    return vec3(fleck, n, 1.5 + fleck * 2.5);
  }

  // 6 emoji confetti — hearts / smiles / stars / petals
  if (uPatternMode < 6.5) {
    float cells = mix(5.0, 16.0, dens * 0.5);
    vec2 gv = uv * cells * mix(0.85, 1.35, clamp(scale * 0.4, 0.0, 1.0)) + seed * 2.3;
    vec2 id = floor(gv);
    vec2 f = fract(gv) - 0.5;
    float best = 0.0;
    float phase = 0.0;
    for (int oy = -1; oy <= 1; oy++) {
      for (int ox = -1; ox <= 1; ox++) {
        vec2 oid = id + vec2(float(ox), float(oy));
        vec2 o = holoHash22(oid + seed * 4.2);
        if (o.x > dens * 0.58) continue;
        float ang = (o.y - 0.5) * 1.8;
        float ca = cos(ang);
        float sa = sin(ang);
        vec2 r = f - vec2(float(ox), float(oy)) - (o - 0.5) * 0.5;
        r = vec2(ca * r.x - sa * r.y, sa * r.x + ca * r.y);
        float m = holoEmojiStamp(r, o.y);
        if (m > best) {
          best = m;
          phase = o.x;
        }
      }
    }
    return vec3(clamp(best, 0.0, 1.0), phase, 0.55 + best * 1.4);
  }

  // 7 brush strokes — directional paint streaks
  if (uPatternMode < 7.5) {
    float cells = mix(4.0, 14.0, dens * 0.45);
    vec2 gv = uv * cells + seed * 1.1;
    vec2 id = floor(gv);
    vec2 f = fract(gv) - 0.5;
    float mask = 0.0;
    float phase = 0.0;
    for (int oy = -1; oy <= 1; oy++) {
      for (int ox = -1; ox <= 1; ox++) {
        vec2 oid = id + vec2(float(ox), float(oy));
        vec2 o = holoHash22(oid + seed * 2.7);
        if (o.x > dens * 0.7) continue;
        float ang = o.y * 6.28318;
        float ca = cos(ang);
        float sa = sin(ang);
        vec2 r = f - vec2(float(ox), float(oy)) - (o - 0.5) * 0.35;
        vec2 q = vec2(ca * r.x - sa * r.y, sa * r.x + ca * r.y);
        q.x *= mix(0.35, 0.7, scale * 0.5);
        q.y *= mix(2.2, 4.5, dens * 0.35);
        float stroke = 1.0 - smoothstep(0.15, 0.55, length(q));
        stroke *= 0.65 + 0.35 * sin(q.y * 18.0 + o.x * 12.0);
        if (stroke > mask) {
          mask = stroke;
          phase = o.y;
        }
      }
    }
    return vec3(clamp(mask, 0.0, 1.0), phase, 0.4 + mask);
  }

  // 8 pixel mosaic — chunky square tiles
  float tiles = mix(8.0, 36.0, dens * 0.45) / max(scale, 0.35);
  vec2 gv = uv * tiles + seed * 0.15;
  vec2 id = floor(gv);
  vec2 f = fract(gv);
  float n = holoHash21(id + seed);
  float keep = step(1.0 - clamp(dens * 0.55, 0.12, 0.95), n);
  float edge = 1.0 - smoothstep(0.42, 0.5, max(abs(f.x - 0.5), abs(f.y - 0.5)) * 2.0);
  float mask = keep * edge;
  return vec3(mask, n, 0.7 + mask);
}
`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>

{
  vec3 V = normalize(cameraPosition - vHoloWorldPos);
  // Geometric normal (for sun) — do not flip with the camera
  vec3 Ng = normalize(vHoloWorldNormal);
  vec3 N = Ng;
  if (dot(N, V) < 0.0) N = -N;

  float NoV = clamp(dot(N, V), 0.0, 1.0);

  // Tangent frame
  vec3 T = normalize(vHoloWorldTangent);
  T = normalize(T - N * dot(N, T));
  vec3 B = normalize(cross(N, T));

  #ifdef USE_UV
    vec3 dpdx = dFdx(vHoloWorldPos);
    vec3 dpdy = dFdy(vHoloWorldPos);
    vec2 duvdx = dFdx(vMapUv);
    vec2 duvdy = dFdy(vMapUv);
    float det = duvdx.x * duvdy.y - duvdx.y * duvdy.x;
    if (abs(det) > 1e-8) {
      vec3 Tderiv = normalize((dpdx * duvdy.y - dpdy * duvdx.y) / det);
      Tderiv = normalize(Tderiv - N * dot(N, Tderiv));
      if (length(Tderiv) > 0.5) {
        T = Tderiv;
        B = normalize(cross(N, T));
      }
    }
  #endif

  vec2 foilUv = vMapUv;

  vec4 maskData = vec4(0.75, foilUv.x, foilUv.y, 0.8);
  if (uHasHoloMask > 0.5) {
    maskData = texture2D(uHoloMask, foilUv);
  }

  // R=intensity, G=region phase, B=micro orientation, A=sparkle density
  vec4 detail = vec4(0.85, foilUv.x, 0.5, 0.2);
  if (uHasHoloDetail > 0.5) {
    detail = texture2D(uHoloDetail, foilUv);
  }

  // Perturb reflection normal only — never displace geometry
  vec3 mapN = vec3(0.0, 0.0, 1.0);
  if (uHasHoloNormal > 0.5) {
    mapN = texture2D(uHoloNormal, foilUv).xyz * 2.0 - 1.0;
    mapN.xy *= 0.85;
    mapN = normalize(mapN);
  }
  vec3 Np = normalize(T * mapN.x + B * mapN.y + N * mapN.z);
  // Facet ridge amount — scale slider still matters on baked Voronoi
  if (uPatternMode < 0.5) {
    float ridge = mix(0.55, 1.35, clamp(uPatternScale, 0.25, 2.0) * 0.5);
    Np = normalize(mix(N, Np, ridge));
  }

  vec3 Rmacro = reflect(-V, N);
  vec3 Rmicro = reflect(-V, Np);

  vec2 tiltMacro = vec2(dot(Rmacro, T), dot(Rmacro, B));
  vec2 tiltMicro = vec2(dot(Rmicro, T), dot(Rmicro, B));

  float inkDark = holoInkDarkness(diffuseColor.rgb);
  float inkOpen = mix(1.0, uInkFoilFloor, inkDark);

  vec3 pattern = holoSamplePattern(foilUv);
  float patternMask = pattern.x;
  float patternPhase = pattern.y;
  float patternSpark = pattern.z;

  // Facets keep baked intensity; other motifs reshape the foil gate.
  float bakedGate = maskData.r * detail.r;
  float motifGate = maskData.r * mix(0.2, 1.0, patternMask);
  float foilGate = mix(bakedGate, motifGate, step(0.5, uPatternMode));
  // Soften pearl further so it stays milky
  if (uPatternMode > 3.5 && uPatternMode < 4.5) {
    foilGate *= mix(0.55, 0.9, patternMask);
  }

  float response =
    foilGate *
    inkOpen *
    uFoilStrength *
    mix(0.92, 1.12, maskData.a);

  // Fresnel strengthens grazing reflections only — not a white wash
  float fresnel = pow(1.0 - NoV, 2.2);
  response *= mix(0.9, 1.15, fresnel);
  response = clamp(response, 0.0, 1.15);

  float viewMacro =
    tiltMacro.x * uHorizontalShift +
    tiltMacro.y * uVerticalShift +
    fresnel * uGrazingShift;

  float viewMicro =
    tiltMicro.x * (uHorizontalShift * 1.35) +
    tiltMicro.y * (uVerticalShift * 1.2) +
    fresnel * uGrazingShift * 0.85;

  float phaseBase = mix(detail.g, fract(detail.g + patternPhase), step(0.5, uPatternMode));

  // Macro: broad cyan / turquoise / violet / magenta / emerald / amber zones
  vec2 uvMacro = vec2(
    fract(phaseBase + viewMacro * 0.55 + uPhaseOffset),
    clamp(0.35 + detail.b * 0.4 + tiltMacro.y * 0.06, 0.02, 0.98)
  );

  // Micro: neighboring facets sample slightly different spectrum phases
  vec2 uvMicro = vec2(
    fract(phaseBase + detail.b * 0.42 + viewMicro * 0.95 + uPhaseOffset * 0.7),
    clamp(0.2 + detail.b * 0.55 + tiltMicro.y * 0.1, 0.02, 0.98)
  );

  vec3 macroColor = sampleSpectrum(uvMacro);
  vec3 microColor = sampleSpectrum(uvMicro);
  vec3 holoColor = holoBoostSaturation(
    mix(macroColor, microColor, 0.52),
    max(1.0, uSaturation * 0.8)
  );

  // Soft pearl — keep low so it doesn't milky-wash the spectrum
  float pearlLobe = pow(max(dot(Np, V), 0.0), 8.0);
  float pearlAmt = (uPatternMode > 3.5 && uPatternMode < 4.5) ? 0.42 : 0.16;
  vec3 pearl =
    mix(holoColor, vec3(1.0, 0.96, 0.9), 0.25) *
    pearlLobe *
    foilGate *
    inkOpen *
    pearlAmt;

  // Sparse colored sparkle (spectrum-tinted, not flat white)
  float sparkBase =
    mix(detail.a, detail.a * patternSpark, step(0.5, uPatternMode)) *
    foilGate *
    inkOpen *
    uSparkleGain;
  float sparkle =
    pow(max(dot(normalize(Np + V), V), 0.0), 56.0) * sparkBase * 1.35 +
    pow(max(dot(Np, V), 0.0), 26.0) * sparkBase * 0.45;
  vec3 sparkleColor = mix(holoColor, vec3(1.0), 0.35) * sparkle;

  // Narrow hot glint — small, so facets stay colorful
  float glint =
    pow(max(dot(Np, V), 0.0), 52.0) * foilGate * inkOpen * 0.4 +
    pow(max(dot(normalize(mix(N, Np, 0.6)), V), 0.0), 20.0) *
      foilGate *
      inkOpen *
      fresnel *
      0.14;
  vec3 glintColor = mix(holoColor, vec3(1.0, 0.97, 0.9), 0.55) * glint;

  vec3 baseColor = diffuseColor.rgb;
  vec3 withFoil = holoScreenBlend(baseColor, holoColor, min(response, 1.0));
  withFoil += pearl;
  withFoil += sparkleColor;
  withFoil += glintColor;

  // Invisible key light (world-fixed): tight hotspots, not full-face whiteout.
  vec3 L = normalize(uSunDir);
  float sunNoL = max(dot(Ng, L), 0.0);
  float sunNoLp = max(dot(Np, L), 0.0);
  vec3 Hsun = normalize(L + V);
  float sunAlign = max(dot(Np, Hsun), 0.0);
  float sunWash = pow(max(sunNoL, sunNoLp), 1.6);
  float sunBloom = pow(sunAlign, 28.0);
  float sunCore = pow(sunAlign, 64.0);
  withFoil += mix(holoColor, vec3(1.0), 0.35) *
    sunWash *
    foilGate *
    inkOpen *
    0.35 *
    uGlareGain;
  withFoil += vec3(1.25, 1.22, 1.18) *
    sunBloom *
    foilGate *
    inkOpen *
    1.6 *
    uGlareGain;
  withFoil += vec3(1.9, 1.85, 1.75) *
    sunCore *
    foilGate *
    inkOpen *
    1.4 *
    uGlareGain;

  // Push saturated foil through dark lead less; on panes keep chroma alive
  withFoil = mix(
    withFoil,
    holoColor * mix(0.9, 1.15, response),
    foilGate * inkOpen * (1.0 - inkDark) * 0.28
  );

  // Debug: base / macro foil / detail phase / foil normal / sparkle / composite
  if (uDebugMode > 0.5 && uDebugMode < 1.5) {
    diffuseColor.rgb = baseColor;
  } else if (uDebugMode > 1.5 && uDebugMode < 2.5) {
    diffuseColor.rgb = macroColor * response;
  } else if (uDebugMode > 2.5 && uDebugMode < 3.5) {
    diffuseColor.rgb = vec3(detail.g, detail.b, detail.r);
  } else if (uDebugMode > 3.5 && uDebugMode < 4.5) {
    diffuseColor.rgb = mapN * 0.5 + 0.5;
  } else if (uDebugMode > 4.5 && uDebugMode < 5.5) {
    diffuseColor.rgb = sparkleColor * 3.0 + glintColor * 2.0;
  } else if (uDebugMode > 5.5 && uDebugMode < 6.5) {
    diffuseColor.rgb = mix(macroColor, microColor, 0.52) * response + sparkleColor;
  } else {
    diffuseColor.rgb = withFoil;
  }
}
`,
      );
  };

  material.customProgramCacheKey = () =>
    [
      "holo-foil-v12-patterns",
      strength.toFixed(2),
      inkFoilFloor.toFixed(2),
      defaultPhaseOffset.toFixed(2),
      horizontalShift.toFixed(2),
      verticalShift.toFixed(2),
      debugMode,
      options.holoDetail ? "d1" : "d0",
      options.holoNormal ? "n1" : "n0",
    ].join("-");

  return material;
}

export function setHoloDebugMode(
  material: THREE.MeshPhysicalMaterial,
  mode: HoloDebugMode,
) {
  const uniforms = material.userData.holoUniforms as
    | { uDebugMode?: { value: number } }
    | undefined;
  if (uniforms?.uDebugMode) {
    uniforms.uDebugMode.value = DEBUG_INDEX[mode];
  }
}

/** Point the foil sun response at a world-space light position (from sticker origin). */
export function setHoloSunDirection(
  material: THREE.MeshPhysicalMaterial,
  worldPosition: THREE.Vector3,
) {
  const uniforms = material.userData.holoUniforms as
    | { uSunDir?: { value: THREE.Vector3 } }
    | undefined;
  if (uniforms?.uSunDir) {
    uniforms.uSunDir.value.copy(worldPosition).normalize();
  }
}

type HoloLiveUniformBag = {
  uFoilStrength?: { value: number };
  uInkFoilFloor?: { value: number };
  uPhaseOffset?: { value: number };
  uHorizontalShift?: { value: number };
  uVerticalShift?: { value: number };
  uGrazingShift?: { value: number };
  uSaturation?: { value: number };
  uSparkleGain?: { value: number };
  uGlareGain?: { value: number };
  uPatternMode?: { value: number };
  uPatternScale?: { value: number };
  uPatternDensity?: { value: number };
  uPatternSeed?: { value: number };
};

/** Push play-panel settings into a compiled holo material without rebuilding it. */
export function applyHoloLiveSettings(
  material: THREE.MeshPhysicalMaterial,
  settings: {
    foilIntensity: number;
    colorPop: number;
    spectrumSpin: number;
    tiltChase: number;
    edgeFire: number;
    sparkle: number;
    glare: number;
    clearcoat: number;
    roughness: number;
    metalness: number;
    envGlow: number;
    webFill: number;
    pattern?: HoloPatternMode;
    patternScale?: number;
    patternDensity?: number;
    patternSeed?: number;
  },
) {
  const uniforms = material.userData.holoUniforms as
    | HoloLiveUniformBag
    | undefined;
  if (uniforms) {
    if (uniforms.uFoilStrength) uniforms.uFoilStrength.value = settings.foilIntensity;
    if (uniforms.uInkFoilFloor) uniforms.uInkFoilFloor.value = settings.webFill;
    if (uniforms.uPhaseOffset) uniforms.uPhaseOffset.value = settings.spectrumSpin;
    if (uniforms.uHorizontalShift)
      uniforms.uHorizontalShift.value = settings.tiltChase;
    if (uniforms.uVerticalShift)
      uniforms.uVerticalShift.value = settings.tiltChase * 0.82;
    if (uniforms.uGrazingShift) uniforms.uGrazingShift.value = settings.edgeFire;
    if (uniforms.uSaturation) uniforms.uSaturation.value = settings.colorPop;
    if (uniforms.uSparkleGain) uniforms.uSparkleGain.value = settings.sparkle;
    if (uniforms.uGlareGain) uniforms.uGlareGain.value = settings.glare;
    if (uniforms.uPatternMode && settings.pattern) {
      uniforms.uPatternMode.value = HOLO_PATTERN_INDEX[settings.pattern] ?? 0;
    }
    if (uniforms.uPatternScale && settings.patternScale != null) {
      uniforms.uPatternScale.value = settings.patternScale;
    }
    if (uniforms.uPatternDensity && settings.patternDensity != null) {
      uniforms.uPatternDensity.value = settings.patternDensity;
    }
    if (uniforms.uPatternSeed && settings.patternSeed != null) {
      // Preset-compat fold is always zero — keeps FOIL_PRESET_COMPAT live in the graph.
      const compatFold =
        ((FOIL_PRESET_COMPAT[0] ^ FOIL_PRESET_COMPAT[1]) & 0) * 1e-9;
      uniforms.uPatternSeed.value = settings.patternSeed + compatFold;
    }
  }

  material.roughness = settings.roughness;
  material.metalness = settings.metalness;
  material.clearcoat = settings.clearcoat;
  material.envMapIntensity = settings.envGlow;
}

export function createVinylBackMaterial(
  alphaMap?: THREE.Texture | null,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: "#8a8a8e",
    alphaMap: alphaMap ?? null,
    transparent: Boolean(alphaMap),
    alphaTest: alphaMap ? 0.15 : 0,
    side: THREE.FrontSide,
    metalness: 0.02,
    roughness: 0.88,
    clearcoat: 0.08,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.12,
    iridescence: 0,
    toneMapped: true,
  });
}
