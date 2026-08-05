"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  Lightformer,
  OrbitControls,
} from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { useReducedMotion } from "framer-motion";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import {
  StickerModel,
  type PointerFollowState,
} from "@/components/collectibles/sticker/StickerModel";
import { StickerHoloSettingsPanel } from "@/components/collectibles/sticker/StickerHoloSettingsPanel";
import {
  DEFAULT_HOLO_PLAY_SETTINGS,
  type HoloPlaySettings,
} from "@/components/collectibles/sticker/holoSettings";
import type { ContourData } from "@/components/collectibles/sticker/createStickerGeometry";
import {
  HOLO_DEBUG_MODES,
  type HoloDebugMode,
} from "@/components/collectibles/sticker/HoloFoilMaterial";
import type { Collectible } from "@/lib/collectibles";
import type {
  ClientBakeResult,
  ClientStickerUrls,
} from "@/lib/collectibles/client-bake-logo";
import { EXPORT_HERO_SUN } from "@/lib/collectibles/client-bake-logo";
import { cn } from "@/lib/utils";

/** Default framing — pulled back so the full die-cut (incl. chin) clears UI chrome */
const DEFAULT_POS = new THREE.Vector3(0, 0.06, 3.95);
const IS_DEV = process.env.NODE_ENV === "development";
/** Follow-mode key light orbit radius around the sticker. */
const FOLLOW_SUN_RADIUS = 3.2;

export type StickerExportQuality = "1x" | "2x" | "3x";

export type StickerViewerExportApi = {
  exportPng: (quality?: StickerExportQuality) => Promise<void>;
};

/** Random invisible key light on an orbit around the sticker. */
function randomSunPosition(radius = 3.35): [number, number, number] {
  const theta = Math.random() * Math.PI * 2;
  const elev = -0.35 + Math.random() * 1.25;
  const y = Math.sin(elev) * radius;
  const xz = Math.cos(elev) * radius;
  return [Math.cos(theta) * xz, y, Math.sin(theta) * xz];
}

type StickerViewer3DProps = {
  collectible: Collectible;
  className?: string;
  /** Bump on each lightbox open so the key light re-rolls */
  lightSession?: number;
  /** Sync studio backdrop out to lightbox chrome */
  onBackgroundChange?: (hex: string) => void;
  /** Client-only assets (Try-it). Skips network contour/texture fetch. */
  clientAssets?: ClientBakeResult | null;
  /** Optional imperative PNG export (Try-it). */
  exportApiRef?: MutableRefObject<StickerViewerExportApi | null>;
  /** Hide gear UI for compact playground chrome */
  hideSettings?: boolean;
};

function LoadingBadge() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">
        Loading 3D…
      </p>
    </div>
  );
}

function StudioBackdrop({ color }: { color: string }) {
  const { scene, gl } = useThree();

  useEffect(() => {
    const next = new THREE.Color(color);
    scene.background = next;
    gl.setClearColor(next, 1);
  }, [color, scene, gl]);

  // Solid plane behind the sticker — reliable with bloom/postprocessing
  return (
    <mesh position={[0, 0, -6]} renderOrder={-1000} frustumCulled={false}>
      <planeGeometry args={[48, 48]} />
      <meshBasicMaterial
        color={color}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Scene({
  modelPath,
  textureUrls,
  contour,
  reduceMotion,
  controlsRef,
  onUserInteract,
  debugMode,
  sunPosition,
  settings,
  glRef,
  pointerRef,
  followSunRef,
}: {
  modelPath?: string;
  textureUrls?: ClientStickerUrls;
  contour: ContourData;
  reduceMotion: boolean;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  onUserInteract: () => void;
  debugMode: HoloDebugMode;
  sunPosition: [number, number, number];
  settings: HoloPlaySettings;
  glRef: MutableRefObject<THREE.WebGLRenderer | null>;
  pointerRef: MutableRefObject<PointerFollowState>;
  followSunRef: MutableRefObject<THREE.Vector3>;
}) {
  const { gl } = useThree();
  glRef.current = gl;
  const keyLightRef = useRef<THREE.Group>(null);
  const fillLightARef = useRef<THREE.DirectionalLight>(null);
  const fillLightBRef = useRef<THREE.PointLight>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const baseSunRef = useRef(new THREE.Vector3(...sunPosition));
  baseSunRef.current.set(...sunPosition);
  const fillScratch = useMemo(() => new THREE.Vector3(), []);

  const followMode = settings.interaction === "follow";

  useEffect(() => {
    const el = gl.domElement;
    const pointer = pointerRef.current;

    const readPointer = (clientX: number, clientY: number, active: boolean) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
      pointer.x = THREE.MathUtils.clamp(nx, -1, 1);
      pointer.y = THREE.MathUtils.clamp(ny, -1, 1);
      pointer.active = active;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (settingsRef.current.interaction !== "follow") return;
      readPointer(event.clientX, event.clientY, true);
    };
    const onPointerLeave = () => {
      pointer.active = false;
      pointer.x = 0;
      pointer.y = 0;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (settingsRef.current.interaction !== "follow") return;
      readPointer(event.clientX, event.clientY, true);
    };

    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("pointerdown", onPointerDown);
    return () => {
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("pointerdown", onPointerDown);
    };
  }, [gl, pointerRef]);

  useEffect(() => {
    if (followMode) return;
    pointerRef.current.x = 0;
    pointerRef.current.y = 0;
    pointerRef.current.active = false;
    followSunRef.current.copy(baseSunRef.current);
    if (keyLightRef.current) {
      keyLightRef.current.position.copy(baseSunRef.current);
    }
  }, [followMode, followSunRef, pointerRef, sunPosition]);

  useFrame(() => {
    const live = settingsRef.current;
    if (live.interaction !== "follow") return;

    const ptr = pointerRef.current;
    // Soft rest glare when not hovering — slight top-right bias.
    const px = ptr.active ? ptr.x : 0.35;
    const py = ptr.active ? ptr.y : 0.2;
    const elev = py * 0.55 + 0.22;
    const target = followSunRef.current;
    target.set(
      Math.cos(elev) * Math.sin(px * 1.15) * FOLLOW_SUN_RADIUS,
      Math.sin(elev) * FOLLOW_SUN_RADIUS + 0.35,
      Math.cos(elev) * Math.cos(px * 1.15) * FOLLOW_SUN_RADIUS,
    );

    if (keyLightRef.current) {
      keyLightRef.current.position.lerp(target, 0.16);
      target.copy(keyLightRef.current.position);
    }

    fillScratch.set(-target.x * 0.95, -target.y * 0.4 + 0.6, -target.z * 0.95);
    fillLightARef.current?.position.copy(fillScratch);
    fillLightBRef.current?.position.copy(fillScratch);
  });

  const fillPosition = useMemo((): [number, number, number] => {
    const [x, y, z] = sunPosition;
    return [-x * 0.95, -y * 0.4 + 0.6, -z * 0.95];
  }, [sunPosition]);

  const bloomIntensity = reduceMotion
    ? Math.min(0.4, settings.bloom * 0.35)
    : settings.bloom;

  return (
    <>
      <StudioBackdrop color={settings.background} />
      <ambientLight intensity={0.38} />
      <hemisphereLight
        args={["#fff0e0", "#2a3040", 0.55]}
        position={[0, 2.5, 0]}
      />

      <group ref={keyLightRef} position={sunPosition}>
        <directionalLight color="#fff6e8" intensity={3.4} />
        <pointLight color="#fff4e0" intensity={4.5} distance={14} decay={2} />
      </group>

      <directionalLight
        ref={fillLightARef}
        castShadow={false}
        color="#e8eeff"
        intensity={1.5}
        position={fillPosition}
      />
      <pointLight
        ref={fillLightBRef}
        color="#dce6ff"
        intensity={1.2}
        distance={10}
        decay={2}
        position={fillPosition}
      />

      <Environment resolution={256} environmentIntensity={0.5}>
        <Lightformer
          form="rect"
          intensity={2.2}
          color="#fff4ea"
          position={[2.4, 3.0, 2.6]}
          scale={[5, 3.5, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.2}
          color="#a8b8ff"
          position={[-2.8, 1.2, -1.2]}
          scale={[3, 4.5, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={0.7}
          color="#ffffff"
          position={[0.2, 0.3, -3.5]}
          scale={[6, 4, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="ring"
          intensity={1.3}
          color="#ffffff"
          position={[0.5, 1.6, 2.6]}
          scale={2.2}
          target={[0, 0, 0]}
        />
      </Environment>

      <StickerModel
        modelPath={modelPath}
        textureUrls={textureUrls}
        contour={contour}
        reduceMotion={reduceMotion}
        debugMode={debugMode}
        sunPosition={sunPosition}
        followSunRef={followSunRef}
        pointerRef={pointerRef}
        settings={settings}
      />

      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          luminanceThreshold={reduceMotion ? 0.9 : 0.72}
          luminanceSmoothing={0.22}
          intensity={bloomIntensity}
          mipmapBlur
          radius={0.55}
        />
        <Vignette offset={0.28} darkness={0.55} />
      </EffectComposer>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        enableRotate={!followMode}
        enableZoom
        enableDamping
        dampingFactor={reduceMotion ? 0.2 : 0.075}
        rotateSpeed={0.95}
        zoomSpeed={0.65}
        minDistance={2.6}
        maxDistance={5.4}
        minPolarAngle={Math.PI * 0.08}
        maxPolarAngle={Math.PI * 0.92}
        target={[0, 0.02, 0]}
        onStart={onUserInteract}
      />
    </>
  );
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") || canvas.getContext("webgl"),
    );
  } catch {
    return false;
  }
}

export function StickerViewer3D({
  collectible,
  className,
  lightSession = 0,
  onBackgroundChange,
  clientAssets = null,
  exportApiRef,
  hideSettings = false,
}: StickerViewer3DProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const pointerRef = useRef<PointerFollowState>({
    x: 0,
    y: 0,
    active: false,
  });
  const followSunRef = useRef(new THREE.Vector3(...DEFAULT_POS));
  const [contourState, setContourState] = useState<{
    path: string;
    data: ContourData;
  } | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [debugMode, setDebugMode] = useState<HoloDebugMode>("final");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<HoloPlaySettings>(
    DEFAULT_HOLO_PLAY_SETTINGS,
  );
  const [lightSeed, setLightSeed] = useState(0);
  const [exportSun, setExportSun] = useState<[number, number, number] | null>(
    null,
  );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    onBackgroundChange?.(settings.background);
  }, [settings.background, onBackgroundChange]);

  const liveSun = useMemo(
    () => randomSunPosition(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional session keys
    [collectible.id, lightSession, lightSeed],
  );
  const sunPosition = exportSun ?? liveSun;

  const modelPath = clientAssets ? undefined : collectible.modelPath;
  const textureUrls = clientAssets?.urls;
  const fallbackSrc = useMemo(() => {
    if (clientAssets) return clientAssets.urls["front-body.png"];
    return `${collectible.modelPath}/preview.webp`;
  }, [clientAssets, collectible.modelPath]);

  const contour = clientAssets
    ? clientAssets.contour
    : contourState?.path === collectible.modelPath
      ? contourState.data
      : null;
  const ready = contour !== null;

  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (!cancelled && !supportsWebGL()) setWebglFailed(true);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, []);

  useEffect(() => {
    if (clientAssets) return;

    let cancelled = false;
    fetch(`${collectible.modelPath}/contour.json`)
      .then((res) => {
        if (!res.ok) throw new Error("contour missing");
        return res.json() as Promise<ContourData>;
      })
      .then((data) => {
        if (!cancelled) {
          setContourState({ path: collectible.modelPath, data });
        }
      })
      .catch(() => {
        if (!cancelled) setWebglFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [clientAssets, collectible.modelPath]);

  const resetView = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.object.position.copy(DEFAULT_POS);
    controls.target.set(0, 0.02, 0);
    controls.update();
    pointerRef.current.x = 0;
    pointerRef.current.y = 0;
    pointerRef.current.active = false;
  }, []);

  useEffect(() => {
    if (settings.interaction !== "follow") return;
    resetView();
  }, [settings.interaction, resetView]);

  const onUserInteract = useCallback(() => {
    // reserved for future orbit UX hooks
  }, []);

  const exportPng = useCallback(
    async (quality: StickerExportQuality = "2x") => {
      const gl = glRef.current;
      const controls = controlsRef.current;
      if (!gl || !controls) {
        throw new Error("Viewer is not ready to export yet.");
      }

      const scale = quality === "3x" ? 3 : quality === "2x" ? 2 : 1;
      const prevSway = settingsRef.current.autoSway;
      const cssW = gl.domElement.clientWidth || 800;
      const cssH = gl.domElement.clientHeight || 1000;
      const dpr = Math.min(
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        1.75,
      );

      flushSync(() => {
        setSettings((current) => ({ ...current, autoSway: false }));
        setExportSun(EXPORT_HERO_SUN);
      });
      controls.object.position.copy(DEFAULT_POS);
      controls.target.set(0, 0.02, 0);
      controls.update();

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const outW = Math.round(cssW * scale);
      const outH = Math.round(cssH * scale);
      gl.setPixelRatio(1);
      gl.setSize(outW, outH, false);

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const blob = await new Promise<Blob>((resolve, reject) => {
        gl.domElement.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("PNG export failed")),
          "image/png",
        );
      });

      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeName =
        collectible.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "holo-sticker";
      anchor.href = href;
      anchor.download = `${safeName}-holo.png`;
      anchor.click();
      URL.revokeObjectURL(href);

      gl.setPixelRatio(dpr);
      gl.setSize(cssW, cssH, false);
      flushSync(() => {
        setSettings((current) => ({ ...current, autoSway: prevSway }));
        setExportSun(null);
      });
      resetView();
    },
    [collectible.title, resetView],
  );

  useEffect(() => {
    if (!exportApiRef) return;
    exportApiRef.current = { exportPng };
    return () => {
      exportApiRef.current = null;
    };
  }, [exportApiRef, exportPng]);

  if (webglFailed) {
    return (
      <div
        className={cn(
          "relative flex h-full w-full items-center justify-center",
          className,
        )}
        style={{ backgroundColor: settings.background }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- WebGL fallback path */}
        <img
          src={fallbackSrc}
          alt={collectible.title}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      className={cn("relative h-full w-full touch-none", className)}
      style={{ backgroundColor: settings.background }}
    >
      {!ready ? <LoadingBadge /> : null}

      {contour ? (
        <Canvas
          className="absolute inset-0 h-full w-full touch-none"
          dpr={[1, 1.75]}
          gl={{
            antialias: true,
            alpha: false,
            preserveDrawingBuffer: Boolean(exportApiRef),
            powerPreference: "high-performance",
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(new THREE.Color(settings.background), 1);
            gl.domElement.style.touchAction = "none";
            glRef.current = gl;
          }}
          camera={{
            position: [DEFAULT_POS.x, DEFAULT_POS.y, DEFAULT_POS.z],
            fov: 34,
            near: 0.1,
            far: 40,
          }}
          style={{ background: settings.background, touchAction: "none" }}
          onPointerMissed={() => undefined}
        >
          <Suspense fallback={null}>
            <Scene
              modelPath={modelPath}
              textureUrls={textureUrls}
              contour={contour}
              reduceMotion={reduceMotion}
              controlsRef={controlsRef}
              onUserInteract={onUserInteract}
              debugMode={debugMode}
              sunPosition={sunPosition}
              settings={settings}
              glRef={glRef}
              pointerRef={pointerRef}
              followSunRef={followSunRef}
            />
          </Suspense>
        </Canvas>
      ) : null}

      {hideSettings ? null : (
        <StickerHoloSettingsPanel
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={settings}
          onChange={setSettings}
          onRerollLight={() => setLightSeed((n) => n + 1)}
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-wrap items-center justify-center gap-2 px-3">
        <button
          type="button"
          onClick={resetView}
          className="pointer-events-auto rounded-full border border-white/15 bg-black/50 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-white/70 backdrop-blur-sm transition hover:border-white/30 hover:text-white"
        >
          Reset view
        </button>
        {IS_DEV ? (
          <label className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/50 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-white/60 backdrop-blur-sm">
            Debug
            <select
              value={debugMode}
              onChange={(event) =>
                setDebugMode(event.target.value as HoloDebugMode)
              }
              className="max-w-[7.5rem] bg-transparent text-white/80 outline-none"
            >
              {HOLO_DEBUG_MODES.map((mode) => (
                <option key={mode} value={mode} className="bg-black text-white">
                  {mode}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
