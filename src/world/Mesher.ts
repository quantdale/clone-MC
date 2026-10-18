import * as THREE from "three";
import { Block, BLOCKS, Tex } from "../blocks/Blocks";
import { CHUNK_HEIGHT, CHUNK_SIZE } from "../Constants";
import type { Chunk } from "./Chunk";

/**
 * Greedy voxel mesher.
 *
 * Exposed faces are merged into quads. Texture tiling is NOT encoded in the
 * UV span — a per-vertex tile index is sampled in the fragment shader from
 * the face position — so a merged quad never walks into a neighboring atlas
 * tile. Vertex colors carry face brightness times ambient occlusion.
 */

interface DirSpec {
  axis: number;
  sign: number;
  u: number;
  v: number;
  brightness: number;
}

// u/v are the tangent axes, ordered so (u × v) equals the outward normal.
const DIRS: DirSpec[] = [
  { axis: 1, sign: 1, u: 2, v: 0, brightness: 1.0 },
  { axis: 1, sign: -1, u: 0, v: 2, brightness: 0.5 },
  { axis: 0, sign: 1, u: 1, v: 2, brightness: 0.72 },
  { axis: 0, sign: -1, u: 2, v: 1, brightness: 0.72 },
  { axis: 2, sign: 1, u: 0, v: 1, brightness: 0.84 },
  { axis: 2, sign: -1, u: 1, v: 0, brightness: 0.84 },
];

const AO_SHADE = [0.78, 0.88, 0.95, 1];
const WATER_SINK = 0.12;

type Pass = "solid" | "cutout" | "water";

function passForTexture(tex: number): Pass {
  if (tex === Tex.Water) return "water";
  if (tex === Tex.Leaves || tex === Tex.TallGrass || tex === Tex.Flower) return "cutout";
  return "solid";
}

function isSprite(id: number): boolean {
  return id === Block.TallGrass || id === Block.Flower;
}

/** Opaque blocks hide the face behind them. Same cutout type hides itself. */
function faceHidden(id: number, nid: number): boolean {
  if (nid === Block.Air || isSprite(nid)) return false;
  if (id === Block.Water) return nid !== Block.Air;
  const def = BLOCKS[nid];
  if (!def) return false;
  if (def.opaque) return true;
  return nid === id;
}

function occludesLight(id: number): boolean {
  return BLOCKS[id]?.opaque === true;
}

class FaceBuffers {
  pos: number[] = [];
  uv: number[] = [];
  normal: number[] = [];
  color: number[] = [];
  tile: number[] = [];
  index: number[] = [];

  addQuad(
    p: number[][],
    normal: [number, number, number],
    tile: number,
    brightness: number,
    aos: [number, number, number, number],
    uvs?: [number, number][]
  ): void {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      const uv = uvs ? uvs[i] : [0, 0];
      this.uv.push(uv[0], uv[1]);
      this.normal.push(normal[0], normal[1], normal[2]);
      const c = brightness * AO_SHADE[aos[i]];
      this.color.push(c, c, c);
      this.tile.push(tile);
    }
    // Flip the diagonal when the occlusion is anisotropic so AO doesn't diamond.
    if (aos[0] + aos[2] < aos[1] + aos[3]) {
      this.index.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
    } else {
      this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  get isEmpty(): boolean {
    return this.pos.length === 0;
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normal, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.color, 3));
    g.setAttribute("aTile", new THREE.Float32BufferAttribute(this.tile, 1));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
}

export interface ChunkGeometrySet {
  solid: THREE.BufferGeometry | null;
  cutout: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
}

const MASK_MAX = 64 * 64;
const maskBuf = new Int32Array(MASK_MAX);
const visitedBuf = new Uint8Array(MASK_MAX);

export function buildChunkGeometry(
  chunk: Chunk,
  getWorldBlock: (x: number, y: number, z: number) => number
): ChunkGeometrySet {
  const out = { solid: new FaceBuffers(), cutout: new FaceBuffers(), water: new FaceBuffers() };
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  for (let d = 0; d < DIRS.length; d++) {
    const spec = DIRS[d];
    const extent = spec.axis === 1 ? CHUNK_HEIGHT : CHUNK_SIZE;
    const U = spec.u === 1 ? CHUNK_HEIGHT : CHUNK_SIZE;
    const V = spec.v === 1 ? CHUNK_HEIGHT : CHUNK_SIZE;
    const cells = U * V;

    for (let s = 0; s < extent; s++) {
      maskBuf.fill(-1, 0, cells);
      for (let j = 0; j < V; j++) {
        for (let i = 0; i < U; i++) {
          const c = [0, 0, 0];
          c[spec.axis] = s;
          c[spec.u] = i;
          c[spec.v] = j;
          const id = chunk.get(c[0], c[1], c[2]);
          if (id === Block.Air || isSprite(id)) continue;
          const nx = ox + c[0] + (spec.axis === 0 ? spec.sign : 0);
          const ny = c[1] + (spec.axis === 1 ? spec.sign : 0);
          const nz = oz + c[2] + (spec.axis === 2 ? spec.sign : 0);
          if (faceHidden(id, getWorldBlock(nx, ny, nz))) continue;
          // Same-texture faces share one mask value so flat ground collapses
          // to a handful of quads. Per-cell AO was splitting those runs and
          // drawing a dark grid between every block.
          maskBuf[j * U + i] = BLOCKS[id].textures[d];
        }
      }

      visitedBuf.fill(0, 0, cells);
      for (let j = 0; j < V; j++) {
        for (let i = 0; i < U; i++) {
          const mi = j * U + i;
          const tex = maskBuf[mi];
          if (tex < 0 || visitedBuf[mi]) continue;
          let w = 1;
          while (i + w < U && maskBuf[j * U + i + w] === tex && !visitedBuf[j * U + i + w]) w++;
          let h = 1;
          outer: for (; j + h < V; h++) {
            const row = (j + h) * U + i;
            for (let k = 0; k < w; k++) {
              if (maskBuf[row + k] !== tex || visitedBuf[row + k]) break outer;
            }
          }
          for (let dj = 0; dj < h; dj++) {
            for (let di = 0; di < w; di++) visitedBuf[(j + dj) * U + i + di] = 1;
          }
          emitQuad(out, spec, s, i, j, w, h, tex, getWorldBlock, ox, oz);
        }
      }
    }
  }

  emitPlants(chunk, out.cutout);
  return {
    solid: out.solid.isEmpty ? null : out.solid.toGeometry(),
    cutout: out.cutout.isEmpty ? null : out.cutout.toGeometry(),
    water: out.water.isEmpty ? null : out.water.toGeometry(),
  };
}

/**
 * Ambient occlusion for one corner of a merged quad, from the three
 * out-layer cells sharing that vertex. Sampled per merged corner (not per
 * cell) so greedy runs stay intact and flat ground still collapses to a
 * handful of quads.
 */
function cornerAo(
  spec: DirSpec,
  ox: number,
  oz: number,
  s: number,
  i: number,
  j: number,
  du: number,
  dv: number,
  get: (x: number, y: number, z: number) => number
): number {
  // Cell emitting the face (local), then its out-layer neighbor (world).
  const cx = (spec.axis === 0 ? s : 0) + (spec.u === 0 ? i : 0) + (spec.v === 0 ? j : 0);
  const cy = (spec.axis === 1 ? s : 0) + (spec.u === 1 ? i : 0) + (spec.v === 1 ? j : 0);
  const cz = (spec.axis === 2 ? s : 0) + (spec.u === 2 ? i : 0) + (spec.v === 2 ? j : 0);
  const wx = ox + cx + (spec.axis === 0 ? spec.sign : 0);
  const wy = cy + (spec.axis === 1 ? spec.sign : 0);
  const wz = oz + cz + (spec.axis === 2 ? spec.sign : 0);
  const tu = du === 0 ? -1 : 1;
  const tv = dv === 0 ? -1 : 1;
  const off = (axis: number, k: number): [number, number, number] => [
    axis === 0 ? k : 0,
    axis === 1 ? k : 0,
    axis === 2 ? k : 0,
  ];
  const u1 = off(spec.u, tu);
  const v1 = off(spec.v, tv);
  const s1 = occludesLight(get(wx + u1[0], wy + u1[1], wz + u1[2]));
  const s2 = occludesLight(get(wx + v1[0], wy + v1[1], wz + v1[2]));
  const sc = occludesLight(get(wx + u1[0] + v1[0], wy + u1[1] + v1[1], wz + u1[2] + v1[2]));
  if (s1 && s2) return 0;
  return 3 - (Number(s1) + Number(s2) + Number(sc));
}

function emitQuad(
  out: Record<Pass, FaceBuffers>,
  spec: DirSpec,
  s: number,
  i0: number,
  j0: number,
  w: number,
  h: number,
  tex: number,
  get: (x: number, y: number, z: number) => number,
  ox: number,
  oz: number
): void {
  const a = spec.u;
  const b = spec.v;
  const faceOffset = spec.sign > 0 ? 1 : 0;
  const base: [number, number, number] = [
    spec.axis === 0 ? s + faceOffset : 0,
    spec.axis === 1 ? s + faceOffset : 0,
    spec.axis === 2 ? s + faceOffset : 0,
  ];
  const p0: [number, number, number] = [
    base[0] + (a === 0 ? i0 : 0) + (b === 0 ? j0 : 0),
    base[1] + (a === 1 ? i0 : 0) + (b === 1 ? j0 : 0),
    base[2] + (a === 2 ? i0 : 0) + (b === 2 ? j0 : 0),
  ];
  const p1: [number, number, number] = [p0[0] + (a === 0 ? w : 0), p0[1] + (a === 1 ? w : 0), p0[2] + (a === 2 ? w : 0)];
  const p2: [number, number, number] = [p1[0] + (b === 0 ? h : 0), p1[1] + (b === 1 ? h : 0), p1[2] + (b === 2 ? h : 0)];
  const p3: [number, number, number] = [p0[0] + (b === 0 ? h : 0), p0[1] + (b === 1 ? h : 0), p0[2] + (b === 2 ? h : 0)];

  if (tex === Tex.Water) sinkWater([p0, p1, p2, p3], spec);

  const normal: [number, number, number] = [
    spec.axis === 0 ? spec.sign : 0,
    spec.axis === 1 ? spec.sign : 0,
    spec.axis === 2 ? spec.sign : 0,
  ];
  // Occlusion is sampled at the merged quad's four corners, so big greedy
  // runs stay intact and flat ground doesn't split into a dark grid.
  const aos: [number, number, number, number] = [
    cornerAo(spec, ox, oz, s, i0, j0, 0, 0, get),
    cornerAo(spec, ox, oz, s, i0 + w - 1, j0, 1, 0, get),
    cornerAo(spec, ox, oz, s, i0 + w - 1, j0 + h - 1, 1, 1, get),
    cornerAo(spec, ox, oz, s, i0, j0 + h - 1, 0, 1, get),
  ];
  out[passForTexture(tex)].addQuad([p0, p1, p2, p3], normal, tex, spec.brightness, aos);
}

function sinkWater(pts: [number, number, number][], spec: DirSpec): void {
  if (spec.axis === 1 && spec.sign > 0) {
    for (const p of pts) p[1] -= WATER_SINK;
    return;
  }
  if (spec.axis === 1) return;
  let maxY = -Infinity;
  for (const p of pts) maxY = Math.max(maxY, p[1]);
  for (const p of pts) {
    if (Math.abs(p[1] - maxY) < 1e-4) p[1] -= WATER_SINK;
  }
}

const PLANT_UV: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

function emitPlants(chunk: Chunk, cutout: FaceBuffers): void {
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const id = chunk.get(lx, y, lz);
        if (!isSprite(id)) continue;
        const tex = BLOCKS[id].textures[0];
        const x = lx;
        const z = lz;
        const y1 = y + 0.92;
        const crosses: [number, number, number][][] = [
          [
            [x + 0.15, y, z + 0.15],
            [x + 0.85, y, z + 0.85],
            [x + 0.85, y1, z + 0.85],
            [x + 0.15, y1, z + 0.15],
          ],
          [
            [x + 0.85, y, z + 0.15],
            [x + 0.15, y, z + 0.85],
            [x + 0.15, y1, z + 0.85],
            [x + 0.85, y1, z + 0.15],
          ],
        ];
        for (const q of crosses) {
          cutout.addQuad(q, [0, 0, 1], tex, 1, [3, 3, 3, 3], PLANT_UV);
        }
      }
    }
  }
}
