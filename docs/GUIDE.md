# Build guide

How this holographic sticker stack fits together. Same ideas as the walkthrough on the portfolio site.

## 1. Start with the object, not the rainbow

Treat the sticker as a physical die-cut before writing foil shaders. A thin extruded silhouette with a **separate reverse face** reads as vinyl, not a floating billboard.

Strip the extrusion’s back cap and draw **one** dedicated reverse mesh (same art, facing −Z) so the back is a clean mirror — never two competing backs.

```ts
geometry.translate(0, 0, -thickness * 0.5);
applyPlanarUVs(geometry);
stripExtrusionBackCap(geometry); // one reverse mesh only

export function createStickerBackGeometry(points: ContourPoint[]) {
  const geometry = new THREE.ShapeGeometry(createStickerShape(points), 1);
  applyPlanarUVs(geometry);
  // flip winding… then computeVertexNormals()
  return geometry;
}
```

→ `src/createStickerGeometry.ts`

## 2. Bake foil data textures from the artwork

CS-style holos work because neighboring regions catch light differently. Generate `holo-detail` (intensity / phase / orientation / sparkle) and a subtle `holo-normal` from Voronoi cells.

Two bake modes:

- **comic** — red/white panes + black ink (Spidey-tuned)
- **logo** — auto-pad, content silhouette, preserve brand colors, milder foil

```ts
if (mode === "logo") {
  if (black) foil = 0.1;
  else if (luminance(r, g, b) < 70) foil = 0.28;
  else foil = 0.58;
} else {
  foil = black ? 0.14 : white ? 0.92 : red ? 0.88 : 0.55;
}
```

→ `src/bake-sticker-assets.ts`, `scripts/prepare-sticker-assets.mjs`

## 3. Patch MeshPhysicalMaterial instead of a full custom shader

Keep Three.js lighting, clearcoat, and env maps. Inject holographic logic with `onBeforeCompile` so foil rides on top of a real PBR stack.

Macro spectrum + micro facet response + sun-driven glare feed bloom for bright hotspots.

→ `src/HoloFoilMaterial.ts`

## 4. Invisible sunlight on a random orbit seed

No visible sun mesh. Each lightbox open (or “Reroll light”) places a key light around the sticker. Reset view only moves the camera — the light stays world-fixed.

→ `src/StickerViewer3D.tsx`

## 5. Bloom for the blind flash

Postprocessing bloom makes a specular catch feel physical. Keep the lobe narrow in the shader so the whole sticker doesn’t wash white.

```tsx
<EffectComposer multisampling={0} enableNormalPass={false}>
  <Bloom
    luminanceThreshold={0.72}
    luminanceSmoothing={0.22}
    intensity={settings.bloom}
    mipmapBlur
    radius={0.55}
  />
  <Vignette offset={0.28} darkness={0.55} />
</EffectComposer>
```

## 6. Live Play settings

Pattern mode + scale / density / seed, foil intensity, color pop, spectrum spin, tilt chase, sparkle, glare, bloom, clearcoat, roughness, metalness, backdrop, auto sway, reroll light.

`applyHoloLiveSettings` writes uniforms every frame without rebuilding the material.

→ `src/holoSettings.ts`, `src/StickerHoloSettingsPanel.tsx`

## 7. Procedural foil motifs

Facets leave baked Voronoi maps alone. Everything else is a procedural mask from `holoSamplePattern`:

stripes · stars · splatters · pearl · glitter · emoji · brushes · pixels

→ `src/HoloFoilMaterial.ts`

## 8. Orbit viewer + pointer follow

Default interaction is `OrbitControls` (full 360 spin + zoom). Play → **Interaction → Follow pointer** leans the die-cut toward the cursor and walks the key light with it so glare and foil chase the hand — original R3F path, not a CSS card clone. Reverse defaults to black vinyl; enable **Mirror back** for a mirrored front.

Lazy-load `StickerViewer3D` (`next/dynamic`, `ssr: false`) from the lightbox so Three.js is not on the initial page bundle.

→ `src/StickerViewer3D.tsx`, `src/CollectibleLightbox.tsx`

## 9. Client-only Try it here

Users drop a logo; `client-bake-logo.ts` mirrors server logo mode in the browser and **never uploads** their file. PNG export 1×/2×/3× uses a fixed hero sun so exports don’t wash out.

Availability is gated by `TryItCountdown.tsx`.

→ `src/CollectibleTryIt.tsx`, `src/client-bake-logo.ts`, `src/TryItCountdown.tsx`
