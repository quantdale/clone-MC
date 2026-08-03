import { Block } from "../blocks/Blocks";
import { CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL, TREE_SEED } from "../Constants";
import { hash2 } from "../utils/Random";
import { SimplexNoise } from "../utils/Noise";
import type { Chunk } from "./Chunk";

/**
 * Deterministic procedural terrain: seeded 2D/3D noise heightmap with
 * oceans, beaches, hills and mountains, 3D-noise caves, and hashed tree
 * placement. All functions are pure functions of world coordinates so any
 * chunk can regenerate terrain (including trees on neighboring columns
 * that overhang its border) identically.
 */
export class TerrainGenerator {
  private nCont = new SimplexNoise(0x1001);
  private nHill = new SimplexNoise(0x2002);
  private nDetail = new SimplexNoise(0x3003);
  private nCave = new SimplexNoise(0x4004);

  constructor(private seed: number) {
    this.nCont = new SimplexNoise(seed ^ 0x1001);
    this.nHill = new SimplexNoise(seed ^ 0x2002);
    this.nDetail = new SimplexNoise(seed ^ 0x3003);
    this.nCave = new SimplexNoise(seed ^ 0x4004);
  }

  heightAt(x: number, z: number): number {
    const c = this.nCont.fbm2(x * 0.0012, z * 0.0012, 4);
    const h = this.nHill.fbm2(x * 0.005, z * 0.005, 3);
    const m = this.nHill.fbm2(x * 0.018, z * 0.018, 2);
    const d = this.nDetail.fbm2(x * 0.06, z * 0.06, 2);
    let y = 20 + c * 9 + h * 6 + Math.max(m - 0.15, 0) * 30 + d * 1.5;
    if (y < 1) y = 1;
    if (y > CHUNK_HEIGHT - 4) y = CHUNK_HEIGHT - 4;
    return Math.floor(y);
  }

  shouldPlaceTree(x: number, z: number, h: number): boolean {
    return h > SEA_LEVEL + 2 && h < 34 && hash2(x, z, TREE_SEED ^ this.seed) < 0.02;
  }

  generate(chunk: Chunk): void {
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const h = this.heightAt(wx, wz);
        const beach = h <= SEA_LEVEL + 1;
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let id: Block;
          if (y === 0) id = Block.Bedrock;
          else if (y < h - 3) id = Block.Stone;
          else if (y < h) id = beach ? Block.Sand : Block.Dirt;
          else if (y === h) id = beach ? Block.Sand : Block.Grass;
          else if (y <= SEA_LEVEL) id = Block.Water;
          else id = Block.Air;
          if (id === Block.Stone && this.isCave(wx, y, wz, h)) id = Block.Air;
          chunk.set(lx, y, lz, id);
        }
      }
    }

    // Trees on this chunk's own columns (trunk + canopy).
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const h = this.heightAt(wx, wz);
        if (this.shouldPlaceTree(wx, wz, h)) this.placeTree(chunk, wx, wz, h);
      }
    }

    // Canopies of trees rooted just outside this chunk that overhang it.
    for (let tx = x0 - 2; tx < x0 + CHUNK_SIZE + 2; tx++) {
      for (let tz = z0 - 2; tz < z0 + CHUNK_SIZE + 2; tz++) {
        if (tx >= x0 && tx < x0 + CHUNK_SIZE && tz >= z0 && tz < z0 + CHUNK_SIZE) continue;
        const h = this.heightAt(tx, tz);
        if (this.shouldPlaceTree(tx, tz, h)) this.placeTree(chunk, tx, tz, h);
      }
    }
  }

  private isCave(x: number, y: number, z: number, h: number): boolean {
    if (y <= 3 || y >= h - 2) return false;
    return this.nCave.fbm3(x * 0.09, y * 0.09, z * 0.09, 3) > 0.52;
  }

  private placeTree(chunk: Chunk, wx: number, wz: number, groundY: number): void {
    const trunkH = 4 + Math.floor(hash2(wx * 1.31, wz * 2.97, TREE_SEED ^ this.seed) * 3);
    const topY = groundY + trunkH;

    for (let y = groundY + 1; y <= topY; y++) {
      this.setIfAir(chunk, wx, y, wz, Block.Log);
    }

    for (let dy = -3; dy <= 2; dy++) {
      let r = 2;
      let corners = false;
      if (dy === -3) r = 1;
      else if (dy === 2) r = 1;
      else if (dy <= -1) corners = true;
      const y = topY + dy;
      if (y <= groundY) continue;
      for (let ox = -r; ox <= r; ox++) {
        for (let oz = -r; oz <= r; oz++) {
          if (corners && Math.abs(ox) === r && Math.abs(oz) === r) continue;
          if (ox === 0 && oz === 0 && dy <= 0) continue;
          this.setIfAir(chunk, wx + ox, y, wz + oz, Block.Leaves);
        }
      }
    }
  }

  private setIfAir(chunk: Chunk, wx: number, y: number, wz: number, id: Block): void {
    const lx = wx - chunk.cx * CHUNK_SIZE;
    const lz = wz - chunk.cz * CHUNK_SIZE;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    if (chunk.get(lx, y, lz) === Block.Air) chunk.set(lx, y, lz, id);
  }
}
