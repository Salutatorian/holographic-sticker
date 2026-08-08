# Holographic Sticker

Die-cut **holographic stickers** in the browser — foil shine, live patterns, and a simple Play panel.

Not an npm package. Copy what you need into a Next.js + React Three Fiber project.

**Live demo:** [thegreaterengine.xyz/collectibles](https://thegreaterengine.xyz/collectibles)

<p align="center">
  <img src="docs/screenshots/amazing-spiderman.png" alt="Amazing Spider-Man holographic sticker" width="280" />
  <img src="docs/screenshots/colossus.png" alt="Colossus holographic sticker" width="280" />
  <img src="docs/screenshots/moai-head.png" alt="Moai Head holographic sticker" width="280" />
</p>

## What it does

- Renders a vinyl-style die-cut sticker in WebGL
- Bakes artwork into foil maps (server or in-browser)
- Live **Play** controls: pattern, foil, sparkle, glare, backdrop
- Optional **Try it here** logo bake — no upload

## Stack

React Three Fiber · Three.js foil shader · Sharp (server bake) · Next.js UI shell

## Walkthrough

Step-by-step guide: **[docs/GUIDE.md](docs/GUIDE.md)**

## License

[Apache License 2.0](LICENSE). Keep [`NOTICE`](NOTICE) attribution in derivatives.

Screenshots may show third-party characters for demo only — don’t treat those images as free brand assets.

## For developers

Drop the `src/` files into a Next.js app that already has `three`, `@react-three/fiber`, `@react-three/drei`, and postprocessing. Paths use `@/` like the portfolio.

Deep notes and file map live in the guide above.
