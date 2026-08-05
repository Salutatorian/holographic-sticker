"use client";

import { useEffect, useMemo, useRef } from "react";
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

type StickerModelProps = {
  modelPath?: string;
  /** In-memory / blob texture set (Try-it playground). */
  textureUrls?: ClientStickerUrls;
  contour: ContourData;
  reduceMotion?: boolean;
  debugMode?: HoloDebugMode;
  sunPosition: [number, number, number];
  settings: HoloPlaySettings;
};

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
  settings,
}: StickerModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sunWorld = useMemo(
    () => new THREE.Vector3(...sunPosition),
    [sunPosition],
  );

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

  const backMaterial = useMemo(
    () => createHoloFoilMaterial(holoOptions),
    [holoOptions],
  );

  useEffect(() => {
    return () => {
      bodyGeometry.dispose();
      backFaceGeometry.dispose();
      bodyMaterial.dispose();
      backMaterial.dispose();
    };
  }, [bodyGeometry, backFaceGeometry, bodyMaterial, backMaterial]);

  useFrame(({ clock }) => {
    const live = settingsRef.current;
    applyHoloLiveSettings(bodyMaterial, live);
    applyHoloLiveSettings(backMaterial, live);
    setHoloSunDirection(bodyMaterial, sunWorld);
    setHoloSunDirection(backMaterial, sunWorld);

    const group = groupRef.current;
    if (!group) return;

    const swayOn = !reduceMotion && live.autoSway;
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
        geometry={backFaceGeometry}
        material={backMaterial}
        position={[0, 0, -0.0026]}
        castShadow
        receiveShadow
      />
    </group>
  );
}
