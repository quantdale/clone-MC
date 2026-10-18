import * as THREE from "three";
import { CHUNK_SIZE, CHUNK_HEIGHT } from "../Constants";
import { buildChunkGeometry } from "./Mesher";

export interface ChunkMeshContext {
  scene: THREE.Scene;
  solidMat: THREE.Material;
  cutoutMat: THREE.Material;
  waterMat: THREE.Material;
  getWorldBlock: (x: number, y: number, z: number) => number;
}

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
  hasData = false;

  private solid: THREE.Mesh | null = null;
  private cutout: THREE.Mesh | null = null;
  private water: THREE.Mesh | null = null;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
  }

  get(lx: number, ly: number, lz: number): number {
    return this.data[(ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
  }

  set(lx: number, ly: number, lz: number, id: number): void {
    this.data[(ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = id;
  }

  /** Cell index matching the `data` array layout, for edit overlays. */
  index(lx: number, ly: number, lz: number): number {
    return (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }

  /**
   * Overlay a set of in-session edits (cell index -> block id) on top of the
   * freshly generated terrain. Cells outside this chunk are ignored.
   */
  applyEdits(edits: Map<number, number>): void {
    for (const [i, id] of edits) {
      if (i >= 0 && i < this.data.length) this.data[i] = id;
    }
  }

  buildMesh(ctx: ChunkMeshContext): void {
    const set = buildChunkGeometry(this, ctx.getWorldBlock);
    const x = this.cx * CHUNK_SIZE;
    const z = this.cz * CHUNK_SIZE;
    this.solid = replaceMesh(ctx, this.solid, set.solid, ctx.solidMat, x, z, 0);
    this.cutout = replaceMesh(ctx, this.cutout, set.cutout, ctx.cutoutMat, x, z, 0);
    this.water = replaceMesh(ctx, this.water, set.water, ctx.waterMat, x, z, 1);
  }

  dispose(scene: THREE.Scene): void {
    for (const mesh of [this.solid, this.cutout, this.water]) {
      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    this.solid = this.cutout = this.water = null;
  }
}

function replaceMesh(
  ctx: ChunkMeshContext,
  old: THREE.Mesh | null,
  geo: THREE.BufferGeometry | null,
  mat: THREE.Material,
  x: number,
  z: number,
  renderOrder: number
): THREE.Mesh | null {
  if (old) {
    ctx.scene.remove(old);
    old.geometry.dispose();
  }
  if (!geo) return null;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0, z);
  mesh.renderOrder = renderOrder;
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = true;
  ctx.scene.add(mesh);
  return mesh;
}
