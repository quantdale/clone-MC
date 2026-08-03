import type * as THREE from "three";
import { Block } from "../blocks/Blocks";
import { CHUNK_HEIGHT, CHUNK_SIZE, VIEW_RADIUS } from "../Constants";
import { Chunk, type ChunkMeshContext } from "./Chunk";
import { TerrainGenerator } from "./TerrainGenerator";

export interface ChunkMaterials {
  solid: THREE.Material;
  cutout: THREE.Material;
  water: THREE.Material;
}

/**
 * Owns the chunk grid. Streams chunks in a spiral around the player within
 * VIEW_RADIUS, meshes them inside a per-frame time budget, rebuilds meshes
 * only when their block data changes (or a neighboring chunk appears), and
 * unloads chunks that drift out of range.
 */
export class ChunkManager {
  readonly terrain: TerrainGenerator;
  private chunks = new Map<string, Chunk>();
  private queue: { cx: number; cz: number }[] = [];
  private queued = new Set<string>();
  private rebuild = new Set<Chunk>();
  private spiral: { cx: number; cz: number }[];
  private centerCx = Number.MAX_SAFE_INTEGER;
  private centerCz = Number.MAX_SAFE_INTEGER;
  private unloadTimer = 0;
  private ctx: ChunkMeshContext;
  /**
   * In-session block-edit overlay: chunk key -> (cell index -> block id).
   * Non-delta absolute states, applied on top of freshly generated terrain so
   * player edits survive a chunk unloading and reloading (see spec §18).
   */
  private edits = new Map<string, Map<number, number>>();

  constructor(scene: THREE.Scene, materials: ChunkMaterials, seed: number) {
    this.terrain = new TerrainGenerator(seed);
    this.ctx = {
      scene,
      solidMat: materials.solid,
      cutoutMat: materials.cutout,
      waterMat: materials.water,
      getWorldBlock: (x, y, z) => this.getBlockWorld(x, y, z),
    };
    this.spiral = [];
    for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
      for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
        this.spiral.push({ cx: dx, cz: dz });
      }
    }
    this.spiral.sort((a, b) => a.cx * a.cx + a.cz * a.cz - (b.cx * b.cx + b.cz * b.cz));
  }

  loadedCount(): number {
    return this.chunks.size;
  }

  /** Diagnostics for the debug overlay. */
  stats(): { loaded: number; pendingGen: number; pendingMesh: number; editedCells: number } {
    let editedCells = 0;
    for (const m of this.edits.values()) editedCells += m.size;
    return {
      loaded: this.chunks.size,
      pendingGen: this.queue.length,
      pendingMesh: this.rebuild.size,
      editedCells,
    };
  }

  getBlockWorld(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return Block.Air;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (!chunk) return Block.Air;
    return chunk.get(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE);
  }

  setBlockWorld(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = this.key(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return false;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    chunk.set(lx, y, lz, id);
    // Record the edit so it survives chunk unload/reload.
    let cellEdits = this.edits.get(key);
    if (!cellEdits) {
      cellEdits = new Map();
      this.edits.set(key, cellEdits);
    }
    cellEdits.set(chunk.index(lx, y, lz), id);
    this.markDirty(cx, cz);
    // Boundary blocks affect the neighboring chunk's faces.
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  update(playerWorldX: number, playerWorldZ: number, dt: number): void {
    const pcx = Math.floor(playerWorldX / CHUNK_SIZE);
    const pcz = Math.floor(playerWorldZ / CHUNK_SIZE);
    if (pcx !== this.centerCx || pcz !== this.centerCz) {
      this.centerCx = pcx;
      this.centerCz = pcz;
      this.refreshQueue();
    }

    const genStart = performance.now();
    while (this.queue.length && performance.now() - genStart < 6) {
      const { cx, cz } = this.queue.shift()!;
      this.queued.delete(this.key(cx, cz));
      if (!this.chunks.has(this.key(cx, cz))) this.generateChunk(cx, cz);
    }

    const meshStart = performance.now();
    for (const chunk of this.rebuild) {
      if (performance.now() - meshStart > 6) break;
      chunk.buildMesh(this.ctx);
      this.rebuild.delete(chunk);
    }

    this.unloadTimer += dt;
    if (this.unloadTimer > 1) {
      this.unloadTimer = 0;
      this.unloadFar();
    }
  }

  private refreshQueue(): void {
    this.queue = [];
    this.queued.clear();
    for (const o of this.spiral) {
      const cx = this.centerCx + o.cx;
      const cz = this.centerCz + o.cz;
      if (this.chunks.has(this.key(cx, cz))) continue;
      this.queue.push({ cx, cz });
      this.queued.add(this.key(cx, cz));
    }
  }

  private generateChunk(cx: number, cz: number): void {
    const key = this.key(cx, cz);
    const chunk = new Chunk(cx, cz);
    this.terrain.generate(chunk);
    const cellEdits = this.edits.get(key);
    if (cellEdits) chunk.applyEdits(cellEdits);
    this.chunks.set(key, chunk);
    chunk.buildMesh(this.ctx);
    // New data may change faces along every neighboring border.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        this.markDirty(cx + dx, cz + dz);
      }
    }
  }

  private markDirty(cx: number, cz: number): void {
    const chunk = this.chunks.get(this.key(cx, cz));
    if (chunk) this.rebuild.add(chunk);
  }

  private unloadFar(): void {
    for (const [key, chunk] of this.chunks) {
      const dx = Math.abs(chunk.cx - this.centerCx);
      const dz = Math.abs(chunk.cz - this.centerCz);
      if (dx > VIEW_RADIUS + 2 || dz > VIEW_RADIUS + 2) {
        chunk.dispose(this.ctx.scene);
        this.chunks.delete(key);
        this.rebuild.delete(chunk);
      }
    }
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }
}
