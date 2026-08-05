/**
 * Browser-only logo bake. Mirrors server logo mode (pad, content silhouette,
 * preserve colors, milder foil). Never uploads — returns blob: URLs + contour.
 */

import type { ContourData, ContourPoint } from "@/components/collectibles/sticker/createStickerGeometry";

export const CLIENT_BAKE_WIDTH = 768;
export const CLIENT_BAKE_HEIGHT = 960;

/** Client bake tag — mirrors server bake pipeline identity. */
export const CLIENT_BAKE_TAG = "fpc-6a6f73-68756177";

/** Shared LUTs from the site (not the user's photo). */
export const SHARED_HOLO_LUTS = {
  spectrum: "/collectibles/amazing-spiderman/webgl/holo-spectrum.png",
  roughness: "/collectibles/amazing-spiderman/webgl/roughness.png",
} as const;

/** Soft upper-left key — never dead-on front (washes the art). */
export const EXPORT_HERO_SUN: [number, number, number] = [-2.05, 2.15, 2.55];

export type ClientStickerUrls = {
  "front-body.png": string;
  "mask.png": string;
  "holo-mask.png": string;
  "holo-detail.png": string;
  "holo-normal.png": string;
  "holo-spectrum.png": string;
  "roughness.png": string;
};

export type ClientBakeResult = {
  urls: ClientStickerUrls;
  contour: ContourData;
  revoke: () => void;
};

function luminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isBlackInk(r: number, g: number, b: number) {
  return luminance(r, g, b) < 55 && Math.max(r, g, b) < 70;
}

function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function hash2(ix: number, iy: number) {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function hash3(ix: number, iy: number, salt: number) {
  const n = Math.sin(ix * 269.5 + iy * 183.3 + salt * 97.1) * 43758.5453;
  return n - Math.floor(n);
}

function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
) {
  const out = new Uint8Array(width * height);
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

function fillInteriorHoles(mask: Uint8Array, width: number, height: number) {
  const exterior = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qh = 0;
  let qt = 0;

  function tryPush(i: number) {
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

  const filled = new Uint8Array(mask);
  for (let i = 0; i < width * height; i += 1) {
    if (!filled[i] && !exterior[i]) filled[i] = 1;
  }
  return filled;
}

function sampleVoronoi(u: number, v: number, cellsX: number, cellsY: number) {
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
  };
}

function labelFoilPanes(
  rgba: Uint8ClampedArray,
  foilCore: Uint8Array,
  width: number,
  height: number,
) {
  const labels = new Int32Array(width * height);
  labels.fill(-1);
  const phases: number[] = [];
  const queue = new Int32Array(width * height);
  let nextId = 0;

  for (let i = 0; i < width * height; i += 1) {
    if (!foilCore[i] || labels[i] >= 0) continue;
    const id = nextId++;
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

  return { labels, phases };
}

function traceMooreContour(grid: number[][], gw: number, gh: number) {
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
  if (startX < 0) return [] as ContourPoint[];

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

  const points: ContourPoint[] = [];
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

function simplify(points: ContourPoint[], minDist = 0.04) {
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

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

function rgbaToPngBlob(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas unavailable"));
  const imageData = new ImageData(
    new Uint8ClampedArray(data),
    width,
    height,
  );
  ctx.putImageData(imageData, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG encode failed"))),
      "image/png",
    );
  });
}

/**
 * Pad + scale into a bake canvas that keeps the source aspect (no stretch).
 */
function rasterizeLogoSource(img: HTMLImageElement, maxEdge = 1280) {
  const padX = Math.max(12, Math.round(img.naturalWidth * 0.08));
  const padY = Math.max(12, Math.round(img.naturalHeight * 0.08));
  const paddedW = img.naturalWidth + padX * 2;
  const paddedH = img.naturalHeight + padY * 2;
  const aspect = paddedW / Math.max(1, paddedH);

  let width: number;
  let height: number;
  if (aspect >= 1) {
    width = maxEdge;
    height = Math.max(64, Math.round(maxEdge / aspect));
  } else {
    height = maxEdge;
    width = Math.max(64, Math.round(maxEdge * aspect));
  }
  width -= width % 2;
  height -= height % 2;

  const stage = document.createElement("canvas");
  stage.width = paddedW;
  stage.height = paddedH;
  const stageCtx = stage.getContext("2d");
  if (!stageCtx) throw new Error("Canvas unavailable");
  stageCtx.clearRect(0, 0, paddedW, paddedH);
  stageCtx.drawImage(img, padX, padY);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.clearRect(0, 0, width, height);
  // Aspect already matches — fill exactly (no letterbox squash).
  ctx.drawImage(stage, 0, 0, width, height);

  return {
    imageData: ctx.getImageData(0, 0, width, height),
    width,
    height,
  };
}

export async function bakeLogoStickerClient(
  file: File,
  options?: {
    maxEdge?: number;
    onProgress?: (message: string) => void;
  },
): Promise<ClientBakeResult> {
  const maxEdge = options?.maxEdge ?? 1280;
  const report = options?.onProgress ?? (() => undefined);

  report("Reading image…");
  const img = await loadImageFromFile(file);

  report("Cutting silhouette…");
  const { imageData, width, height } = rasterizeLogoSource(img, maxEdge);
  const rgba = imageData.data;

  let opaqueCount = 0;
  const total = width * height;
  for (let i = 0; i < total; i += 1) {
    if (rgba[i * 4 + 3] > 250) opaqueCount += 1;
  }
  const mostlyOpaque = opaqueCount / Math.max(1, total) > 0.92;

  const content = new Uint8Array(width * height);
  const foilCore = new Uint8Array(width * height);

  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    const a = rgba[o + 3];
    // Keep pure #000 art — only transparent pixels are cut away.
    const on = mostlyOpaque ? true : a > 24;
    content[i] = on ? 1 : 0;
    foilCore[i] =
      on && !isBlackInk(r, g, b) && luminance(r, g, b) > 40 ? 1 : 0;
  }

  const expanded = dilateMask(content, width, height, 14);
  const sticker = fillInteriorHoles(expanded, width, height);
  const { labels: paneLabels, phases: panePhases } = labelFoilPanes(
    rgba,
    foilCore,
    width,
    height,
  );

  report("Baking holo maps…");
  const frontBody = new Uint8ClampedArray(width * height * 4);
  const holoMask = new Uint8ClampedArray(width * height * 4);
  const maskRgba = new Uint8ClampedArray(width * height * 4);
  const holoDetail = new Uint8ClampedArray(width * height * 4);
  const holoNormal = new Uint8ClampedArray(width * height * 4);

  const cellsX = 42;
  const cellsY = 52;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const o = i * 4;
      const r = rgba[o];
      const g = rgba[o + 1];
      const b = rgba[o + 2];
      const on = sticker[i] === 1;
      const u = x / (width - 1);
      const v = y / (height - 1);

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
        holoDetail[o] = 0;
        holoDetail[o + 1] = 0;
        holoDetail[o + 2] = 0;
        holoDetail[o + 3] = 0;
        holoNormal[o] = 128;
        holoNormal[o + 1] = 128;
        holoNormal[o + 2] = 255;
        holoNormal[o + 3] = 255;
        continue;
      }

      const black = isBlackInk(r, g, b);
      if (black) {
        frontBody[o] = Math.min(r, 18);
        frontBody[o + 1] = Math.min(g, 18);
        frontBody[o + 2] = Math.min(b, 20);
      } else {
        frontBody[o] = r;
        frontBody[o + 1] = g;
        frontBody[o + 2] = b;
      }
      frontBody[o + 3] = 255;

      const paneId = paneLabels[i];
      const panePhase =
        paneId >= 0 ? panePhases[paneId] : ((u * 3.7 + v * 1.9) % 1 + 1) % 1;
      const foil = black
        ? 0.1
        : luminance(r, g, b) < 70
          ? 0.28
          : 0.58;
      const pattern = ((v * 2.3 + u * 0.7 + panePhase * 0.4) % 1 + 1) % 1;
      holoMask[o] = Math.round(foil * 255);
      holoMask[o + 1] = Math.round(panePhase * 255);
      holoMask[o + 2] = Math.round(pattern * 255);
      holoMask[o + 3] = Math.round((black ? 0.35 : 0.95) * 255);

      const vor = sampleVoronoi(u, v, cellsX, cellsY);
      const cellRand = hash2(vor.cellX, vor.cellY);
      const cellRand2 = hash3(vor.cellX, vor.cellY, 3.7);
      const cellRand3 = hash3(vor.cellX, vor.cellY, 11.2);
      const detailFoil = black
        ? 0.06 + cellRand * 0.14
        : 0.45 + cellRand * 0.4;
      const phase = (panePhase * 0.78 + cellRand2 * 0.22) % 1;
      const orient = (cellRand3 * 0.65 + panePhase * 0.35) % 1;
      const sparkle =
        black
          ? cellRand * 0.05
          : cellRand > 0.72
            ? 0.35 + cellRand3 * 0.55
            : cellRand * 0.12;

      holoDetail[o] = Math.round(Math.min(1, detailFoil) * 255);
      holoDetail[o + 1] = Math.round(phase * 255);
      holoDetail[o + 2] = Math.round(orient * 255);
      holoDetail[o + 3] = Math.round(Math.min(1, sparkle) * 255);

      const seam = Math.max(0, 1 - vor.dEdge * 3.5);
      const webRidge = black ? 0.55 : 0;
      const amp = 0.5 + seam * 0.4 + webRidge;
      let nx = vor.toCenterX * amp * 16;
      let ny = -vor.toCenterY * amp * 16;
      nx += (hash3(x, y, 1.1) - 0.5) * 0.08;
      ny += (hash3(x, y, 2.2) - 0.5) * 0.08;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
      holoNormal[o] = Math.round((nx * 0.5 + 0.5) * 255);
      holoNormal[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      holoNormal[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      holoNormal[o + 3] = 255;
    }
  }

  report("Tracing die-cut…");
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
  const contourPoints = simplify(traceMooreContour(grid, gw, gh), 0.042);
  const contour: ContourData = {
    points:
      contourPoints.length >= 3
        ? contourPoints
        : [
            { x: -0.45, y: -0.55 },
            { x: 0.45, y: -0.55 },
            { x: 0.45, y: 0.55 },
            { x: -0.45, y: 0.55 },
          ],
    aspect: width / height,
  };

  report("Encoding textures…");
  const [frontBodyBlob, maskBlob, holoMaskBlob, detailBlob, normalBlob] =
    await Promise.all([
      rgbaToPngBlob(frontBody, width, height),
      rgbaToPngBlob(maskRgba, width, height),
      rgbaToPngBlob(holoMask, width, height),
      rgbaToPngBlob(holoDetail, width, height),
      rgbaToPngBlob(holoNormal, width, height),
    ]);

  const urls: ClientStickerUrls = {
    "front-body.png": URL.createObjectURL(frontBodyBlob),
    "mask.png": URL.createObjectURL(maskBlob),
    "holo-mask.png": URL.createObjectURL(holoMaskBlob),
    "holo-detail.png": URL.createObjectURL(detailBlob),
    "holo-normal.png": URL.createObjectURL(normalBlob),
    "holo-spectrum.png": SHARED_HOLO_LUTS.spectrum,
    "roughness.png": SHARED_HOLO_LUTS.roughness,
  };

  const revoke = () => {
    for (const [key, value] of Object.entries(urls)) {
      if (key === "holo-spectrum.png" || key === "roughness.png") continue;
      URL.revokeObjectURL(value);
    }
  };

  report("Ready");
  return { urls, contour, revoke };
}
