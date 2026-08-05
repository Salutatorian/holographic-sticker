"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import {
  createStickerBackGeometry,
  createStickerGeometry,
  type ContourData,
} from "@/components/collectibles/sticker/createStickerGeometry";
import {
  applyHoloLiveSettings,
  createHoloFoilMaterial,
  setHoloSunDirection,
  type HoloDebugMode,
} from "@/components/collectibles/sticker/HoloFoilMaterial";
import type { HoloPlaySettings } from "@/components/collectibles/sticker/holoSettings";
import type { ClientStickerUrls } from "@/lib/collectibles/client-bake-logo";

/** Normalized pointer over the canvas: x/y in [-1, 1], active while hovering. */
export type PointerFollowState = {
  x: number;
  y: number;
  active: boolean;
};

type StickerModelProps = {
  modelPath?: string;
  /** In-memory / blob texture set (Try-it playground). */
  textureUrls?: ClientStickerUrls;
  contour: ContourData;
  reduceMotion?: boolean;
  debugMode?: HoloDebugMode;
  sunPosition: [number, number, number];
  /** Live sun for follow-mode glare (mutated each frame; optional). */
  followSunRef?: MutableRefObject<THREE.Vector3>;
  pointerRef?: MutableRefObject<PointerFollowState>;
  settings: HoloPlaySettings;
};

/** Peak lean in follow mode (~22°). */
const FOLLOW_TILT_MAX = 0.38;

function prepareTexture(
  tex: THREE.Texture,
  colorSpace: typeof THREE.SRGBColorSpace | typeof THREE.NoColorSpace,
  wrap = false,
) {
  tex.colorSpace = colorSpace;
  tex.anisotropy = 8;
  if (wrap) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.needsUpdate = true;
}

function withTangents(geometry: THREE.BufferGeometry) {
  try {
    geometry.computeTangents();
  } catch {
    // optional
  }
  return geometry;
}

export function StickerModel({
  modelPath,
  textureUrls,
  contour,
  reduceMotion = false,
  debugMode = "final",
  sunPosition,
  followSunRef,
  pointerRef,
  settings,
}: StickerModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const backMeshRef = useRef<THREE.Mesh>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sunWorld = useMemo(
    () => new THREE.Vector3(...sunPosition),
    [sunPosition],
  );
  const sunScratch = useMemo(() => new THREE.Vector3(), []);
  const camWorld = useMemo(() => new THREE.Vector3(), []);
  const stickerWorld = useMemo(() => new THREE.Vector3(), []);
  const stickerForward = useMemo(() => new THREE.Vector3(), []);
  const viewToCam = useMemo(() => new THREE.Vector3(), []);

  const textureList = useMemo(() => {
    if (textureUrls) {
      return [
        textureUrls["front-body.png"],
        textureUrls["mask.png"],
        textureUrls["holo-mask.png"],
        textureUrls["holo-detail.png"],
        textureUrls["holo-normal.png"],
        textureUrls["holo-spectrum.png"],
        textureUrls["roughness.png"],
      ];
    }
    if (!modelPath) {
      throw new Error("StickerModel requires modelPath or textureUrls");
    }
    return [
      `${modelPath}/front-body.png`,
      `${modelPath}/mask.png`,
      `${modelPath}/holo-mask.png`,
      `${modelPath}/holo-detail.png`,
      `${modelPath}/holo-normal.png`,
      `${modelPath}/holo-spectrum.png`,
      `${modelPath}/roughness.png`,
    ];
  }, [modelPath, textureUrls]);

  const [
    bodyMap,
    maskMap,
    holoMaskMap,
    holoDetailMap,
    holoNormalMap,
    spectrumMap,
    roughnessMap,
  ] = useTexture(textureList);

  useEffect(() => {
    prepareTexture(bodyMap, THREE.SRGBColorSpace);
    prepareTexture(maskMap, THREE.NoColorSpace);
    prepareTexture(holoMaskMap, THREE.NoColorSpace);
    prepareTexture(holoDetailMap, THREE.NoColorSpace);
    prepareTexture(holoNormalMap, THREE.NoColorSpace);
    prepareTexture(spectrumMap, THREE.SRGBColorSpace, true);
    prepareTexture(roughnessMap, THREE.NoColorSpace, true);
    roughnessMap.repeat.set(4, 4);
  }, [
    bodyMap,
    maskMap,
    holoMaskMap,
    holoDetailMap,
    holoNormalMap,
    spectrumMap,
    roughnessMap,
  ]);

  const bodyGeometry = useMemo(
    () => withTangents(createStickerGeometry(contour.points)),
    [contour.points],
  );

  const backFaceGeometry = useMemo(
    () => withTangents(createStickerBackGeometry(contour.points)),
    [contour.points],
  );

  const holoOptions = useMemo(
    () => ({
      map: bodyMap,
      alphaMap: maskMap,
      holoMask: holoMaskMap,
      holoDetail: holoDetailMap,
      holoNormal: holoNormalMap,
      holoSpectrum: spectrumMap,
      roughnessMap,
      strength: settings.foilIntensity,
      inkFoilFloor: settings.webFill,
      defaultPhaseOffset: settings.spectrumSpin,
      horizontalShift: settings.tiltChase,
      verticalShift: settings.tiltChase * 0.82,
      grazingShift: settings.edgeFire,
      debugMode,
      roughness: settings.roughness,
      metalness: settings.metalness,
      clearcoat: settings.clearcoat,
      clearcoatRoughness: 0.14,
      envMapIntensity: settings.envGlow,
      specularIntensity: 0.35,
      alphaTest: 0.08,
      side: THREE.FrontSide as THREE.Side,
    }),
    // Material is rebuilt only when textures/debug change; live knobs use uniforms.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    [
      bodyMap,
      maskMap,
      holoMaskMap,
      holoDetailMap,
      holoNormalMap,
      spectrumMap,
      roughnessMap,
      debugMode,
    ],
  );

  const bodyMaterial = useMemo(
    () => createHoloFoilMaterial(holoOptions),
    [holoOptions],
  );

  const backMirrorMaterial = useMemo(
    () => createHoloFoilMaterial(holoOptions),
    [holoOptions],
  );

  const backInkMaterial = useMemo(() => {
    // Opaque alpha-test cutout (not transparent) so the vinyl reverse can't
    // depth-sort over the front and turn the whole sticker grey mid-orbit.
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#101014"),
      alphaMap: maskMap,
      transparent: false,
      alphaTest: 0.45,
      side: THREE.FrontSide,
      roughness: 0.9,
      metalness: 0.03,
      clearcoat: 0.4,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.32,
      depthWrite: true,
    });
    return mat;
  }, [maskMap]);

  useEffect(() => {
    return () => {
      bodyGeometry.dispose();
      backFaceGeometry.dispose();
      bodyMaterial.dispose();
      backMirrorMaterial.dispose();
      backInkMaterial.dispose();
    };
  }, [
    bodyGeometry,
    backFaceGeometry,
    bodyMaterial,
    backMirrorMaterial,
    backInkMaterial,
  ]);

  useFrame(({ clock, camera }) => {
    const live = settingsRef.current;
    applyHoloLiveSettings(bodyMaterial, live);
    if (live.mirrorBack) {
      applyHoloLiveSettings(backMirrorMaterial, live);
    }

    const following = live.interaction === "follow";
    const sunDir =
      following && followSunRef
        ? sunScratch.copy(followSunRef.current)
        : sunWorld;
    setHoloSunDirection(bodyMaterial, sunDir);
    if (live.mirrorBack) {
      setHoloSunDirection(backMirrorMaterial, sunDir);
    }

    const group = groupRef.current;
    const backMesh = backMeshRef.current;
    if (group && backMesh) {
      // Only draw the reverse when the camera is actually behind the sticker.
      // Otherwise the thin transparent back plane paints over the foil and
      // the die-cut looks like a flat grey slab while orbiting.
      camera.getWorldPosition(camWorld);
      group.getWorldPosition(stickerWorld);
      group.getWorldDirection(stickerForward);
      viewToCam.subVectors(camWorld, stickerWorld).normalize();
      backMesh.visible = viewToCam.dot(stickerForward) < -0.02;
    }

    if (!group) return;

    if (following && pointerRef && !reduceMotion) {
      const ptr = pointerRef.current;
      const lean = ptr.active ? 1 : 0.35;
      const max = FOLLOW_TILT_MAX * lean;
      // Pointer top-left → that corner leans toward the viewer.
      const targetX = ptr.y * max;
      const targetY = -ptr.x * max;
      const ease = ptr.active ? 0.14 : 0.08;
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, targetX, ease);
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetY, ease);
      group.rotation.z = THREE.MathUtils.lerp(
        group.rotation.z,
        ptr.active ? ptr.x * ptr.y * -0.06 : 0,
        ease,
      );
      return;
    }

    const swayOn = !reduceMotion && live.autoSway && !following;
    if (swayOn) {
      // Visible idle rock — old 0.03 rad (~1.7°) only looked like a twitch
      const speed = Math.max(0.05, live.swaySpeed);
      const t = clock.elapsedTime * speed;
      group.rotation.y = Math.sin(t * 0.55) * 0.28;
      group.rotation.x = Math.sin(t * 0.38 + 0.6) * 0.14;
      group.rotation.z = Math.sin(t * 0.27 + 1.1) * 0.04;
    } else if (
      Math.abs(group.rotation.x) > 0.0005 ||
      Math.abs(group.rotation.y) > 0.0005 ||
      Math.abs(group.rotation.z) > 0.0005
    ) {
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, 0, 0.12);
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, 0, 0.12);
      group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, 0, 0.12);
    }
  });

  const backMaterial = settings.mirrorBack
    ? backMirrorMaterial
    : backInkMaterial;

  return (
    <group
      ref={groupRef}
      // Contour NDC is normalized per-axis on the texture; scale X by
      // aspect (W/H) so the mesh matches the photo’s real proportions.
      scale={[Math.max(0.2, contour.aspect || 0.8), 1, 1]}
    >
      <mesh
        geometry={bodyGeometry}
        material={bodyMaterial}
        castShadow
        receiveShadow
      />
      <mesh
        ref={backMeshRef}
        geometry={backFaceGeometry}
        material={backMaterial}
        position={[0, 0, -0.0034]}
        castShadow
        receiveShadow
      />
    </group>
  );
}
