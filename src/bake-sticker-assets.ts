/**
 * Bake sticker textures for the WebGL holographic viewer.
 *
 * Modes:
 * - comic: Spidey-tuned (red/white foil panes, black ink lead)
 * - logo: general art — pad edges, silhouette from content, preserve colors
 */
// @ts-nocheck
import sharp from "sharp";

const WIDTH = 1024;
const HEIGHT = 1280;
/** Logo bake longest edge — output keeps the source aspect (no stretch). */
const LOGO_MAX_EDGE = 1280;

/** Bake pipeline tag — stable across logo/comic modes. */
export const BAKE_PIPELINE_TAG = "fpc-6a6f7368-756177";

export type BakeMode = "comic" | "logo";

export type BakedStickerAssets = {
  files: Record<string, Buffer>;
  paneCount: number;
  contourPoints: number;
  aspect: number;
  mode: BakeMode;
};

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isRedPaint(r, g, b) {
  return r > 90 && r > g * 1.35 && r > b * 1.25 && r - Math.max(g, b) > 25;
}

function isWhitePaint(r, g, b) {
  const lum = luminance(r, g, b);
  return lum > 175 && Math.abs(r - g) < 45 && Math.abs(g - b) < 45;
}

function isBlackInk(r, g, b) {
  // Pure red (220,0,0) has luma ~47 — must not count as web lead
  if (isRedPaint(r, g, b) || isWhitePaint(r, g, b)) return false;
  return luminance(r, g, b) < 55 && Math.max(r, g, b) < 70;
}

/** Connected red/white panes — each web cell gets a stable spectrum phase. */
function labelFoilPanes(rgba, foilCore, width, height) {
  const labels = new Int32Array(width * height);
  labels.fill(-1);
  const phases = [];
  const queue = new Int32Array(width * height);
  let nextId = 0;

  for (let i = 0; i < width * height; i += 1) {
    if (!foilCore[i] || labels[i] >= 0) continue;

    const id = nextId;
    nextId += 1;
    phases[id] = hash2(id * 17, id * 31 + 9);
    let qh = 0;
    let qt = 0;
    labels[i] = id;
    queue[qt++] = i;

    while (qh < qt) {
      const cur = queue[qh++];
      const x = cur % width;
      const y = (cur / width) | 0;
      const neighbors = [cur - 1, cur + 1, cur - width, cur + width];
      for (const n of neighbors) {
        if (n < 0 || n >= width * height) continue;
        const nx = n % width;
        const ny = (n / width) | 0;
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        if (!foilCore[n] || labels[n] >= 0) continue;
        labels[n] = id;
        queue[qt++] = n;
      }
    }
  }

  return { labels, phases, count: nextId };
}

function dilateMask(mask, width, height, radius) {
  const out = Buffer.alloc(width * height);
  const r2 = radius * radius;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = 0;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      outer: for (let yy = y0; yy <= y1; yy += 1) {
        const dy = yy - y;
        for (let xx = x0; xx <= x1; xx += 1) {
          const dx = xx - x;
          if (dx * dx + dy * dy > r2) continue;
          if (mask[yy * width + xx]) {
            hit = 1;
            break outer;
          }
        }
      }
      out[y * width + x] = hit;
    }
  }
  return out;
}

/**
 * Keep enclosed black ink (eye frames, webs) inside the sticker.
 * Never treat interior black as backdrop — only true exterior zeros stay off.
 */
function fillInteriorHoles(mask, width, height) {
  const exterior = Buffer.alloc(width * height);
  const queue = new Int32Array(width * height);
  let qh = 0;
  let qt = 0;

  function tryPush(i) {
    if (i < 0 || i >= width * height) return;
    if (mask[i] || exterior[i]) return;
    exterior[i] = 1;
    queue[qt++] = i;
  }

  for (let x = 0; x < width; x += 1) {
    tryPush(x);
    tryPush((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    tryPush(y * width);
    tryPush(y * width + (width - 1));
  }

  while (qh < qt) {
    const i = queue[qh++];
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) tryPush(i - 1);
    if (x + 1 < width) tryPush(i + 1);
    if (y > 0) tryPush(i - width);
    if (y + 1 < height) tryPush(i + width);
  }

  const filled = Buffer.from(mask);
  for (let i = 0; i < width * height; i += 1) {
    if (!filled[i] && !exterior[i]) filled[i] = 1;
  }
  return filled;
}

function traceMooreContour(grid, gw, gh) {
  let startX = -1;
  let startY = -1;
  outer: for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      if (grid[y][x]) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }
  if (startX < 0) return [];

  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];

  const points = [];
  let x = startX;
  let y = startY;
  let dir = 0;

  for (let step = 0; step < gw * gh; step += 1) {
    points.push({
      x: (x / (gw - 1)) * 2 - 1,
      y: 1 - (y / (gh - 1)) * 2,
    });

    let found = false;
    for (let i = 0; i < 8; i += 1) {
      const idx = (dir + 6 + i) % 8;
      const nx = x + dirs[idx][0];
      const ny = y + dirs[idx][1];
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      if (!grid[ny][nx]) continue;
      x = nx;
      y = ny;
      dir = idx;
      found = true;
      break;
    }
    if (!found) break;
    if (x === startX && y === startY && points.length > 16) break;
  }

  return points;
}

function simplify(points, minDist = 0.04) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const prev = out[out.length - 1];
    const p = points[i];
    const d =
      (p.x - prev.x) * (p.x - prev.x) + (p.y - prev.y) * (p.y - prev.y);
    if (d >= minDist * minDist) out.push(p);
  }
  return out;
}

function hash2(ix, iy) {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function hash3(ix, iy, salt) {
  const n = Math.sin(ix * 269.5 + iy * 183.3 + salt * 97.1) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Jittered-grid Voronoi: returns { cellX, cellY, dEdge, toCenterX, toCenterY }.
 * dEdge ≈ distance to nearest cell boundary (facet seam).
 */
function sampleVoronoi(u, v, cellsX, cellsY) {
  const gx = u * cellsX;
  const gy = v * cellsY;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);

  let bestD = 1e9;
  let secondD = 1e9;
  let bestCx = 0;
  let bestCy = 0;
  let bestIx = ix;
  let bestIy = iy;

  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const cx = ix + ox;
      const cy = iy + oy;
      const jx = hash2(cx, cy);
      const jy = hash2(cx + 19, cy + 47);
      const px = cx + jx;
      const py = cy + jy;
      const dx = gx - px;
      const dy = gy - py;
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        secondD = bestD;
        bestD = d;
        bestCx = px;
        bestCy = py;
        bestIx = cx;
        bestIy = cy;
      } else if (d < secondD) {
        secondD = d;
      }
    }
  }

  return {
    cellX: bestIx,
    cellY: bestIy,
    dEdge: secondD - bestD,
    toCenterX: (bestCx - gx) / cellsX,
    toCenterY: (bestCy - gy) / cellsY,
    f1: bestD,
  };
}

function buildHoloDetailAndNormal(
  sticker,
  frontBody,
  width,
  height,
  paneLabels,
  panePhases,
) {
  const detail = Buffer.alloc(width * height * 4);
  const normal = Buffer.alloc(width * height * 4);
  const cellsX = 56;
  const cellsY = 70;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const o = i * 4;
      const u = x / (width - 1);
      const v = y / (height - 1);

      if (!sticker[i]) {
        detail[o] = 0;
        detail[o + 1] = 0;
        detail[o + 2] = 0;
        detail[o + 3] = 0;
        normal[o] = 128;
        normal[o + 1] = 128;
        normal[o + 2] = 255;
        normal[o + 3] = 255;
        continue;
      }

      const r = frontBody[o];
      const g = frontBody[o + 1];
      const b = frontBody[o + 2];
      const black = isBlackInk(r, g, b);
      const white = isWhitePaint(r, g, b);
      const red = isRedPaint(r, g, b);
      const vor = sampleVoronoi(u, v, cellsX, cellsY);
      const cellRand = hash2(vor.cellX, vor.cellY);
      const cellRand2 = hash3(vor.cellX, vor.cellY, 3.7);
      const cellRand3 = hash3(vor.cellX, vor.cellY, 11.2);

      const paneId = paneLabels[i];
      const panePhase =
        paneId >= 0 ? panePhases[paneId] : hash3(x >> 2, y >> 2, 5.5);

      // R: foil intensity — strong on red panes + white lenses, restrained on web lead
      let foil;
      if (black) foil = 0.06 + cellRand * 0.14;
      else if (white) foil = 0.78 + cellRand * 0.22;
      else if (red) foil = 0.55 + cellRand * 0.45;
      else foil = 0.35 + cellRand * 0.35;

      // G: web-pane phase (dominant) + fine cell jitter so large panes still shimmer
      const phase = (panePhase * 0.78 + cellRand2 * 0.22) % 1;

      // B: microfacet orientation
      const orient = (cellRand3 * 0.65 + panePhase * 0.35) % 1;

      // A: sparse sparkle — denser on red foil, rare on black lead
      let sparkle;
      if (black) sparkle = cellRand * 0.05;
      else if (cellRand > 0.68) sparkle = 0.4 + cellRand3 * 0.6;
      else sparkle = cellRand * 0.15;

      detail[o] = Math.round(Math.min(1, foil) * 255);
      detail[o + 1] = Math.round(phase * 255);
      detail[o + 2] = Math.round(orient * 255);
      detail[o + 3] = Math.round(Math.min(1, sparkle) * 255);

      // Facet normals: stronger ridges along black webbing (lead lines)
      const seam = Math.max(0, 1 - vor.dEdge * 3.5);
      const webRidge = black ? 0.55 : 0;
      const amp = 0.5 + seam * 0.4 + webRidge;
      let nx = vor.toCenterX * amp * 16;
      let ny = -vor.toCenterY * amp * 16;
      const grainX = (hash3(x, y, 1.1) - 0.5) * 0.08;
      const grainY = (hash3(x, y, 2.2) - 0.5) * 0.08;
      nx += grainX;
      ny += grainY;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));

      normal[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
    }
  }

  return { detail, normal };
}

function buildSpectrumLut(width = 512, height = 64) {
  const buf = Buffer.alloc(width * height * 4);
  const stops = [
    [0.0, [0.15, 0.92, 1.0]],
    [0.14, [0.2, 1.0, 0.45]],
    [0.28, [0.95, 0.92, 0.2]],
    [0.42, [1.0, 0.35, 0.55]],
    [0.56, [0.95, 0.15, 0.85]],
    [0.7, [0.45, 0.2, 1.0]],
    [0.84, [0.2, 0.45, 1.0]],
    [1.0, [0.15, 0.92, 1.0]],
  ];

  function lerpStop(t) {
    const x = ((t % 1) + 1) % 1;
    for (let i = 0; i < stops.length - 1; i += 1) {
      const a = stops[i];
      const b = stops[i + 1];
      if (x >= a[0] && x <= b[0]) {
        const u = (x - a[0]) / (b[0] - a[0] || 1);
        return [
          a[1][0] + (b[1][0] - a[1][0]) * u,
          a[1][1] + (b[1][1] - a[1][1]) * u,
          a[1][2] + (b[1][2] - a[1][2]) * u,
        ];
      }
    }
    return stops[0][1];
  }

  for (let y = 0; y < height; y += 1) {
    const row = y / (height - 1);
    const rowWarp = Math.sin(row * Math.PI * 2) * 0.04;
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const wave =
        Math.sin(u * Math.PI * 18 + row * 6) * 0.018 +
        Math.sin(u * Math.PI * 41 + row * 13) * 0.008;
      const rgb = lerpStop(u + rowWarp + wave);
      const sat = 1.08 + 0.12 * Math.sin(row * Math.PI);
      const o = (y * width + x) * 4;
      buf[o] = Math.round(Math.min(1, rgb[0] * sat) * 255);
      buf[o + 1] = Math.round(Math.min(1, rgb[1] * sat) * 255);
      buf[o + 2] = Math.round(Math.min(1, rgb[2] * sat) * 255);
      buf[o + 3] = 255;
    }
  }

  return { buf, width, height };
}

function buildRoughnessGrain(size = 512) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n1 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const n2 = Math.sin(x * 39.346 + y * 11.135) * 23421.631;
      const f1 = n1 - Math.floor(n1);
      const f2 = n2 - Math.floor(n2);
      const v = Math.floor((0.52 + f1 * 0.18 + f2 * 0.1) * 255);
      const o = (y * size + x) * 4;
      buf[o] = v;
      buf[o + 1] = v;
      buf[o + 2] = v;
      buf[o + 3] = 255;
    }
  }
  return { buf, size };
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function sampleCornerBackdrop(rgba, width, height) {
  const samples = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [2, 2],
    [width - 3, 2],
    [2, height - 3],
    [width - 3, height - 3],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const [x, y] of samples) {
    const o = (y * width + x) * 4;
    r += rgba[o];
    g += rgba[o + 1];
    b += rgba[o + 2];
    a += rgba[o + 3];
  }
  const n = samples.length;
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
    a: Math.round(a / n),
  };
}

export async function bakeStickerAssets(
  sourceImage: Buffer,
  options?: { mode?: BakeMode },
): Promise<BakedStickerAssets> {
  const mode: BakeMode = options?.mode === "comic" ? "comic" : "logo";

  let pipeline = sharp(sourceImage).ensureAlpha();
  let bakeWidth = WIDTH;
  let bakeHeight = HEIGHT;

  // Logo mode: add margin so edge marks are not clipped, then resize with
  // fit:"inside" so the output keeps the source aspect (no downward stretch).
  if (mode === "logo") {
    const meta = await sharp(sourceImage).metadata();
    const srcW = meta.width || WIDTH;
    const srcH = meta.height || HEIGHT;
    const padX = Math.max(12, Math.round(srcW * 0.08));
    const padY = Math.max(12, Math.round(srcH * 0.08));
    pipeline = pipeline.extend({
      top: padY,
      bottom: padY,
      left: padX,
      right: padX,
      // Transparent pad — silhouette uses alpha, so pure #000 art stays solid.
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
    bakeWidth = LOGO_MAX_EDGE;
    bakeHeight = LOGO_MAX_EDGE;
  }

  const { data, info } = await pipeline
    .resize({
      width: bakeWidth,
      height: bakeHeight,
      fit: mode === "logo" ? "inside" : "contain",
      background:
        mode === "logo"
          ? { r: 0, g: 0, b: 0, alpha: 0 }
          : { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const rgba = Buffer.from(data);

  const foilCore = Buffer.alloc(width * height);
  const content = Buffer.alloc(width * height);

  if (mode === "comic") {
    // Silhouette from painted content (red/white), then dilate + hole-fill so
    // thick black eye frames / webbing stay opaque sticker ink.
    for (let i = 0; i < width * height; i += 1) {
      const o = i * 4;
      const r = rgba[o];
      const g = rgba[o + 1];
      const b = rgba[o + 2];
      foilCore[i] = isRedPaint(r, g, b) || isWhitePaint(r, g, b) ? 1 : 0;
      content[i] = foilCore[i];
    }
  } else {
    // Logo: NEVER chroma-key near-black — #000 backgrounds are real art
    // (photo-booth strips, etc.). Transparent letterbox/pad is the only cut.
    let opaqueCount = 0;
    const total = width * height;
    for (let i = 0; i < total; i += 1) {
      if ((rgba[i * 4 + 3] ?? 0) > 250) opaqueCount += 1;
    }
    const mostlyOpaque = opaqueCount / Math.max(1, total) > 0.92;

    for (let i = 0; i < total; i += 1) {
      const o = i * 4;
      const r = rgba[o];
      const g = rgba[o + 1];
      const b = rgba[o + 2];
      const a = rgba[o + 3];
      const on = mostlyOpaque ? true : a > 24;
      content[i] = on ? 1 : 0;
      // Foil panes = brighter fill; pure black stays as ink (no rainbow).
      foilCore[i] = on && !isBlackInk(r, g, b) && luminance(r, g, b) > 40 ? 1 : 0;
    }
  }

  const dilateRadius = mode === "comic" ? 28 : 14;
  const expanded = dilateMask(
    mode === "comic" ? foilCore : content,
    width,
    height,
    dilateRadius,
  );
  const sticker = fillInteriorHoles(expanded, width, height);
  const { labels: paneLabels, phases: panePhases, count: paneCount } =
    labelFoilPanes(rgba, foilCore, width, height);

  const front = Buffer.alloc(width * height * 4);
  const frontBody = Buffer.alloc(width * height * 4);
  const holoMask = Buffer.alloc(width * height * 4);
  const maskRgba = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const o = i * 4;
      const r = rgba[o] ?? 0;
      const g = rgba[o + 1] ?? 0;
      const b = rgba[o + 2] ?? 0;
      const on = sticker[i] === 1;
      const alpha = on ? 255 : 0;
      const u = x / (width - 1);
      const v = y / (height - 1);

      front[o] = r;
      front[o + 1] = g;
      front[o + 2] = b;
      front[o + 3] = alpha;

      maskRgba[o] = on ? 255 : 0;
      maskRgba[o + 1] = on ? 255 : 0;
      maskRgba[o + 2] = on ? 255 : 0;
      maskRgba[o + 3] = 255;

      if (!on) {
        frontBody[o] = 0;
        frontBody[o + 1] = 0;
        frontBody[o + 2] = 0;
        frontBody[o + 3] = 0;
        holoMask[o] = 0;
        holoMask[o + 1] = Math.round(u * 255);
        holoMask[o + 2] = Math.round(v * 255);
        holoMask[o + 3] = 0;
        continue;
      }

      const black = isBlackInk(r, g, b);
      const white = isWhitePaint(r, g, b);
      const red = isRedPaint(r, g, b);

      if (mode === "logo") {
        // Preserve source colors (brand red stays red).
        if (black) {
          frontBody[o] = Math.min(r, 18);
          frontBody[o + 1] = Math.min(g, 18);
          frontBody[o + 2] = Math.min(b, 20);
        } else {
          frontBody[o] = r;
          frontBody[o + 1] = g;
          frontBody[o + 2] = b;
        }
      } else if (black) {
        frontBody[o] = 8;
        frontBody[o + 1] = 8;
        frontBody[o + 2] = 10;
      } else if (white) {
        frontBody[o] = Math.min(255, Math.max(r, 235));
        frontBody[o + 1] = Math.min(255, Math.max(g, 235));
        frontBody[o + 2] = Math.min(255, Math.max(b, 238));
      } else if (red) {
        frontBody[o] = Math.min(255, Math.max(r, 190));
        frontBody[o + 1] = Math.min(80, g);
        frontBody[o + 2] = Math.min(90, b);
      } else {
        frontBody[o] = r;
        frontBody[o + 1] = g;
        frontBody[o + 2] = b;
      }
      frontBody[o + 3] = alpha;

      const paneId = paneLabels[i];
      const panePhase =
        paneId >= 0 ? panePhases[paneId] : ((u * 3.7 + v * 1.9) % 1 + 1) % 1;

      let foil;
      if (mode === "logo") {
        // Milder even foil — dark outlines stay quieter so small type stays readable.
        if (black) foil = 0.1;
        else if (luminance(r, g, b) < 70) foil = 0.28;
        else foil = 0.58;
      } else {
        foil = black ? 0.14 : white ? 0.92 : red ? 0.88 : 0.55;
      }
      const pattern = ((v * 2.3 + u * 0.7 + panePhase * 0.4) % 1 + 1) % 1;
      holoMask[o] = Math.round(foil * 255);
      holoMask[o + 1] = Math.round(panePhase * 255);
      holoMask[o + 2] = Math.round(pattern * 255);
      holoMask[o + 3] = Math.round((black ? 0.35 : 0.95) * 255);
    }
  }

  const { detail: holoDetail, normal: holoNormal } = buildHoloDetailAndNormal(
    sticker,
    frontBody,
    width,
    height,
    paneLabels,
    panePhases,
  );

  const spectrumLut = buildSpectrumLut(512, 64);
  const rough = buildRoughnessGrain(512);
  const spectrumPixels = spectrumLut.buf;
  const spectrumW = spectrumLut.width;
  const spectrumH = spectrumLut.height;

  /** Static gallery preview baked from the same maps the 360 viewer uses. */
  const preview = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    const a = frontBody[o + 3];
    if (a < 8) {
      preview[o] = 0;
      preview[o + 1] = 0;
      preview[o + 2] = 0;
      preview[o + 3] = 255;
      continue;
    }

    const br = frontBody[o] / 255;
    const bg = frontBody[o + 1] / 255;
    const bb = frontBody[o + 2] / 255;
    const foil = (holoMask[o] / 255) * (holoDetail[o] / 255);
    const phase = holoDetail[o + 1] / 255;
    const pattern = holoDetail[o + 2] / 255;

    const sx = Math.min(spectrumW - 1, Math.floor(phase * spectrumW));
    const sy = Math.min(
      spectrumH - 1,
      Math.floor(Math.max(0.01, Math.min(0.99, pattern)) * spectrumH),
    );
    const so = (sy * spectrumW + sx) * 4;
    const hr = spectrumPixels[so] / 255;
    const hg = spectrumPixels[so + 1] / 255;
    const hb = spectrumPixels[so + 2] / 255;

    const amt = Math.min(1, foil * 1.15);
    const screenedR = 1 - (1 - br) * (1 - hr);
    const screenedG = 1 - (1 - bg) * (1 - hg);
    const screenedB = 1 - (1 - bb) * (1 - hb);
    const outR = br + (screenedR - br) * amt;
    const outG = bg + (screenedG - bg) * amt;
    const outB = bb + (screenedB - bb) * amt;
    const x = i % width;
    const y = (i / width) | 0;
    const nx = x / (width - 1) - 0.35;
    const ny = y / (height - 1) - 0.28;
    const glint = Math.max(0, 1 - Math.hypot(nx, ny) * 2.2) * foil * 0.22;

    preview[o] = Math.min(255, Math.round((outR + glint) * 255));
    preview[o + 1] = Math.min(255, Math.round((outG + glint) * 255));
    preview[o + 2] = Math.min(255, Math.round((outB + glint) * 255));
    preview[o + 3] = 255;
  }

  const step = 3;
  const gw = Math.floor(width / step);
  const gh = Math.floor(height / step);
  const grid = Array.from({ length: gh }, (_, y) =>
    Array.from({ length: gw }, (_, x) => {
      let solid = 0;
      for (let dy = 0; dy < step; dy += 1) {
        for (let dx = 0; dx < step; dx += 1) {
          const sx = Math.min(width - 1, x * step + dx);
          const sy = Math.min(height - 1, y * step + dy);
          solid += sticker[sy * width + sx] ? 1 : 0;
        }
      }
      return solid > (step * step) / 2.5 ? 1 : 0;
    }),
  );

  const contour = simplify(traceMooreContour(grid, gw, gh), 0.042);
  const aspect = width / height;
  const contourJson = Buffer.from(
    JSON.stringify({ points: contour, aspect }),
    "utf8",
  );

  const [
    frontPng,
    frontBodyPng,
    frontBasePng,
    holoMaskPng,
    holoDetailPng,
    holoNormalPng,
    maskPng,
    spectrumPng,
    roughnessPng,
    previewWebp,
  ] = await Promise.all([
    sharp(front, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    sharp(frontBody, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    sharp(frontBody, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    sharp(holoMask, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    sharp(holoDetail, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    sharp(holoNormal, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    sharp(maskRgba, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    sharp(spectrumLut.buf, {
      raw: {
        width: spectrumLut.width,
        height: spectrumLut.height,
        channels: 4,
      },
    })
      .png()
      .toBuffer(),
    sharp(rough.buf, {
      raw: { width: rough.size, height: rough.size, channels: 4 },
    })
      .png()
      .toBuffer(),
    sharp(preview, { raw: { width, height, channels: 4 } })
      .resize({
        width: Math.min(720, width),
        height: Math.min(900, height),
        fit: "inside",
        background: "#000",
      })
      .webp({ quality: 92 })
      .toBuffer(),
  ]);

  return {
    files: {
      "front.png": Buffer.from(frontPng),
      "front-body.png": Buffer.from(frontBodyPng),
      "front-base.png": Buffer.from(frontBasePng),
      "holo-mask.png": Buffer.from(holoMaskPng),
      "holo-detail.png": Buffer.from(holoDetailPng),
      "holo-normal.png": Buffer.from(holoNormalPng),
      "mask.png": Buffer.from(maskPng),
      "holo-spectrum.png": Buffer.from(spectrumPng),
      "roughness.png": Buffer.from(roughnessPng),
      "contour.json": Buffer.from(contourJson),
      "preview.webp": Buffer.from(previewWebp),
      "thumbnail.webp": Buffer.from(previewWebp),
    },
    paneCount,
    contourPoints: contour.length,
    aspect,
    mode,
  };
}
