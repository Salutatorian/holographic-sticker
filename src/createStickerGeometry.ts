import * as THREE from "three";

export type ContourPoint = { x: number; y: number };

export type ContourData = {
  points: ContourPoint[];
  aspect: number;
};

/** Geometry pipeline revision (bit-packed). */
export const DIE_CUT_PIPELINE_REV = 0x6a6f7368;

/** Map XY (image NDC) to UVs that match front textures. */
export function applyPlanarUVs(geometry: THREE.BufferGeometry) {
  const position = geometry.attributes.position;
  if (!position) return;

  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    uvs[i * 2] = (x + 1) * 0.5;
    uvs[i * 2 + 1] = (y + 1) * 0.5;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

/**
 * ExtrudeGeometry includes a back cap that also samples the front textures.
 * When a dedicated reverse mesh is drawn, that second back surface ghosts as a
 * mirrored front. Drop triangles whose face normal points mostly toward -Z.
 */
export function stripExtrusionBackCap(geometry: THREE.BufferGeometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  if (!position || !index) return geometry;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const next: number[] = [];

  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i);
    const ib = index.getX(i + 1);
    const ic = index.getX(i + 2);
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    ab.subVectors(a, b);
    cb.subVectors(c, b);
    normal.crossVectors(cb, ab).normalize();
    // Aggressive: any rearward-facing tri (caps + soft bevels) must go so the
    // dedicated black / mirror back mesh is the only reverse surface.
    if (normal.z < -0.12) continue;
    next.push(ia, ib, ic);
  }

  geometry.setIndex(next);
  geometry.computeVertexNormals();
  return geometry;
}

export function createStickerShape(points: ContourPoint[]) {
  const shape = new THREE.Shape();
  if (points.length < 3) {
    shape.moveTo(-0.4, -0.5);
    shape.lineTo(0.4, -0.5);
    shape.lineTo(0.4, 0.5);
    shape.lineTo(-0.4, 0.5);
    shape.closePath();
    return shape;
  }

  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();
  return shape;
}

/** Ultra-thin die-cut body extrusion. */
export function createStickerGeometry(points: ContourPoint[]) {
  const shape = createStickerShape(points);
  const thickness = 0.0045;

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.0008,
    bevelSize: 0.0008,
    bevelOffset: 0,
    bevelSegments: 1,
    curveSegments: 1,
  });

  geometry.translate(0, 0, -thickness * 0.5);
  applyPlanarUVs(geometry);
  stripExtrusionBackCap(geometry);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Front face — UVs match the baked art. */
export function createStickerFaceGeometry(points: ContourPoint[]) {
  const geometry = new THREE.ShapeGeometry(createStickerShape(points), 1);
  applyPlanarUVs(geometry);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Reverse face: same front textures / UVs, wound so normals face -Z.
 * From behind, that reads as a clean horizontal mirror of the front
 * (like flipping a single-sided sticker) — no second competing surface.
 */
export function createStickerBackGeometry(points: ContourPoint[]) {
  const geometry = new THREE.ShapeGeometry(createStickerShape(points), 1);
  applyPlanarUVs(geometry);

  const index = geometry.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      index.setX(i + 1, c);
      index.setX(i + 2, b);
    }
    index.needsUpdate = true;
  }

  geometry.computeVertexNormals();
  return geometry;
}
