import * as THREE from "three";
import { Block, BLOCKS, Tex } from "../blocks/Blocks";
import { ATLAS_COLS, ATLAS_CELL, ATLAS_PAD, ATLAS_TILE, ATLAS_ROWS, PX_U, PX_V } from "../blocks/TextureAtlas";
import { CHUNK_HEIGHT, CHUNK_SIZE } from "../Constants";
import type { Chunk } from "./Chunk";

/**
 * Greedy voxel mesher.
 *
 * For each of the six axis-aligned face directions we build a 2D mask of
 * exposed faces (grouped by texture) over every slice of the chunk, then
 * greedily merge runs of identical texture into single quads.
 *
 * Quads are emitted in chunk-local coordinates; the Chunk's mesh carries
 * the world offset. Faces of different blocks go into three passes:
 * solid (opaque), cutout (leaves), and water (translucent, rendered last).
 */

interface DirSpec {
  axis: number;
  sign: number;
  u: number;
  v: number;
  brightness: number;
}

// u/v are the two tangent axes, ordered so that (u x v) equals the outward
// normal. All chunk-local coordinates are positive; the mask index i/j maps
// 1:1 to positions along u/v.
const DIRS: DirSpec[] = [
  { axis: 1, sign: 1, u: 2, v: 0, brightness: 1.0 },
  { axis: 1, sign: -1, u: 0, v: 2, brightness: 0.5 },
  { axis: 0, sign: 1, u: 1, v: 2, brightness: 0.72 },
  { axis: 0, sign: -1, u: 2, v: 1, brightness: 0.72 },
  { axis: 2, sign: 1, u: 0, v: 1, brightness: 0.84 },
  { axis: 2, sign: -1, u: 1, v: 0, brightness: 0.84 },
];

type Pass = "solid" | "cutout" | "water";

function passForTexture(tex: number): Pass {
  if (tex === Tex.Water) return "water";
  if (tex === Tex.Leaves) return "cutout";
  return "solid";
}

class FaceBuffers {
  pos: number[] = [];
  uv: number[] = [];
  normal: number[] = [];
  color: number[] = [];
  index: number[] = [];

  addQuad(
    p: number[][],
    normal: [number, number, number],
    uv: [number, number][],
    brightness: number
  ): void {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.normal.push(normal[0], normal[1], normal[2]);
    }
    for (let i = 0; i < 4; i++) {
      this.color.push(brightness, brightness, brightness);
    }
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
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

    for (let s = 0; s < extent; s++) {
      const mask = new Int16Array(U * V).fill(-1);
      for (let j = 0; j < V; j++) {
        for (let i = 0; i < U; i++) {
          const c = [0, 0, 0];
          c[spec.axis] = s;
          c[spec.u] = i;
          c[spec.v] = j;
          const id = chunk.get(c[0], c[1], c[2]);
          if (id === Block.Air) continue;
          const nx = ox + c[0] + (spec.axis === 0 ? spec.sign : 0);
          const ny = c[1] + (spec.axis === 1 ? spec.sign : 0);
          const nz = oz + c[2] + (spec.axis === 2 ? spec.sign : 0);
          const nid = getWorldBlock(nx, ny, nz);
          const exposed =
            id === Block.Water ? nid === Block.Air : nid === Block.Air || nid === Block.Water;
          if (!exposed) continue;
          mask[j * U + i] = BLOCKS[id].textures[d];
        }
      }

      // Greedy merge
      const visited = new Uint8Array(U * V);
      for (let j = 0; j < V; j++) {
        for (let i = 0; i < U; i++) {
          const mi = j * U + i;
          const tex = mask[mi];
          if (tex < 0 || visited[mi]) continue;
          // The atlas is ATLAS_COLS x ATLAS_ROWS tiles; a merged quad's UVs
          // must stay inside the atlas, so cap runs at the remaining tile
          // columns/rows of the texture's atlas cell.
          const maxW = ATLAS_COLS - (tex % ATLAS_COLS);
          const maxH = ATLAS_ROWS - Math.floor(tex / ATLAS_COLS);
          let w = 1;
          while (i + w < U && w < maxW && mask[j * U + i + w] === tex && !visited[j * U + i + w]) w++;
          let h = 1;
          outer: for (; j + h < V && h < maxH; h++) {
            const row = (j + h) * U + i;
            for (let k = 0; k < w; k++) {
              if (mask[row + k] !== tex || visited[row + k]) break outer;
            }
          }
          for (let dj = 0; dj < h; dj++) {
            for (let di = 0; di < w; di++) visited[(j + dj) * U + i + di] = 1;
          }
          emitQuad(out, spec, s, i, j, w, h, tex);
        }
      }
    }
  }

  return {
    solid: out.solid.isEmpty ? null : out.solid.toGeometry(),
    cutout: out.cutout.isEmpty ? null : out.cutout.toGeometry(),
    water: out.water.isEmpty ? null : out.water.toGeometry(),
  };
}

function emitQuad(
  out: Record<Pass, FaceBuffers>,
  spec: DirSpec,
  s: number,
  i0: number,
  j0: number,
  w: number,
  h: number,
  tex: number
): void {
  const a = spec.u;
  const b = spec.v;
  const faceOffset = spec.sign > 0 ? 1 : 0;

  // Face plane offset along the normal axis.
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
  const p1: [number, number, number] = [
    p0[0] + (a === 0 ? w : 0),
    p0[1] + (a === 1 ? w : 0),
    p0[2] + (a === 2 ? w : 0),
  ];
  const p2: [number, number, number] = [
    p1[0] + (b === 0 ? h : 0),
    p1[1] + (b === 1 ? h : 0),
    p1[2] + (b === 2 ? h : 0),
  ];
  const p3: [number, number, number] = [
    p0[0] + (b === 0 ? h : 0),
    p0[1] + (b === 1 ? h : 0),
    p0[2] + (b === 2 ? h : 0),
  ];

  const normal: [number, number, number] = [
    spec.axis === 0 ? spec.sign : 0,
    spec.axis === 1 ? spec.sign : 0,
    spec.axis === 2 ? spec.sign : 0,
  ];

  const cell = { col: tex % ATLAS_COLS, row: Math.floor(tex / ATLAS_COLS) };
  const cellPxX = cell.col * ATLAS_CELL + ATLAS_PAD;
  const cellPxY = cell.row * ATLAS_CELL + ATLAS_PAD;

  // UVs: one texture tile per voxel, inset 1px so nearest sampling never
  // bleeds into the gutter or a neighboring tile. Spans of up to 64 tiles
  // stay inside the tall atlas canvas.
  const u0 = (cellPxX + 1) * PX_U;
  const u1 = (cellPxX + w * ATLAS_TILE - 1) * PX_U;
  const v0 = 1 - (cellPxY + 1) * PX_V;
  const v1 = 1 - (cellPxY + h * ATLAS_TILE - 1) * PX_V;

  const uv0: [number, number] = [u0, v0];
  const uv1: [number, number] = [u1, v0];
  const uv2: [number, number] = [u1, v1];
  const uv3: [number, number] = [u0, v1];

  out[passForTexture(tex)].addQuad([p0, p1, p2, p3], normal, [uv0, uv1, uv2, uv3], spec.brightness);
}
