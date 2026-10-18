import { Block } from "../blocks/Blocks";
import { CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL, TREE_SEED } from "../Constants";
import { hash2 } from "../utils/Random";
import { SimplexNoise } from "../utils/Noise";
import type { Chunk } from "./Chunk";

/**
 * Deterministic terrain: broad continents, rolling hills, occasional
 * mountains, sealed caves, beaches, and forests that clump instead of
 * carpeting every slope. Pure function of (seed, world coordinate).
 */
const PAD = 2;
const GRID = CHUNK_SIZE + PAD * 2;

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
    const cont = this.nCont.fbm2(x * 0.00085, z * 0.00085, 4);
    const hill = this.nHill.fbm2(x * 0.0028, z * 0.0028, 4);
    const detail = this.nDetail.fbm2(x * 0.011, z * 0.011, 2);
    const ridge = 1 - Math.abs(this.nHill.fbm2(x * 0.0048 + 50, z * 0.0048, 2));
    const mount = smooth01((this.nCont.fbm2(x * 0.0016 + 90, z * 0.0016, 2) - 0.28) / 0.45);
    let y = 24 + cont * 7.5 + hill * 4.2 + detail * 0.28 + mount * (2 + ridge * 14);
    if (y < 1) y = 1;
    if (y > CHUNK_HEIGHT - 4) y = CHUNK_HEIGHT - 4;
    return Math.floor(y);
  }

  shouldPlaceTree(x: number, z: number, h: number): boolean {
    return this.treeWanted(x, z, h, this.slope(x, z, h));
  }

  generate(chunk: Chunk): void {
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;
    const heights = new Int16Array(GRID * GRID);
    for (let lz = -PAD; lz < CHUNK_SIZE + PAD; lz++) {
      for (let lx = -PAD; lx < CHUNK_SIZE + PAD; lx++) {
        heights[(lz + PAD) * GRID + (lx + PAD)] = this.heightAt(x0 + lx, z0 + lz);
      }
    }
    const H = (lx: number, lz: number) => heights[(lz + PAD) * GRID + (lx + PAD)];

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const h = H(lx, lz);
        const beach = h <= SEA_LEVEL + 1;
        const stoneCap = h >= 40;
        const snowCap = h >= 50;
        const neighborMin = Math.min(H(lx + 1, lz), H(lx - 1, lz), H(lx, lz + 1), H(lx, lz - 1));
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let id: Block;
          if (y === 0) id = Block.Bedrock;
          else if (y < h - 3) id = Block.Stone;
          else if (y < h) id = beach ? Block.Sand : stoneCap ? Block.Stone : Block.Dirt;
          else if (y === h) id = beach ? Block.Sand : snowCap ? Block.Snow : stoneCap ? Block.Stone : Block.Grass;
          else if (y <= SEA_LEVEL) id = Block.Water;
          else id = Block.Air;
          if (id === Block.Stone && this.isCave(x0 + lx, y, z0 + lz, h, neighborMin)) id = Block.Air;
          chunk.set(lx, y, lz, id);
        }
      }
    }

    for (let lx = -PAD; lx < CHUNK_SIZE + PAD; lx++) {
      for (let lz = -PAD; lz < CHUNK_SIZE + PAD; lz++) {
        const h = H(lx, lz);
        const slope = Math.max(
          Math.abs(h - H(lx + 1, lz)),
          Math.abs(h - H(lx - 1, lz)),
          Math.abs(h - H(lx, lz + 1)),
          Math.abs(h - H(lx, lz - 1))
        );
        const wx = x0 + lx;
        const wz = z0 + lz;
        if (this.treeWanted(wx, wz, h, slope)) this.placeTree(chunk, wx, wz, h);
        else if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
          this.placeDecor(chunk, wx, wz, h, slope);
        }
      }
    }
  }

  private slope(x: number, z: number, h: number): number {
    return Math.max(
      Math.abs(h - this.heightAt(x + 1, z)),
      Math.abs(h - this.heightAt(x - 1, z)),
      Math.abs(h - this.heightAt(x, z + 1)),
      Math.abs(h - this.heightAt(x, z - 1))
    );
  }

  private treeWanted(x: number, z: number, h: number, slope: number): boolean {
    if (h <= SEA_LEVEL + 2 || h >= 40 || slope > 1) return false;
    const forest = this.nDetail.fbm2(x * 0.011, z * 0.011, 3);
    // Sparse enough that canopies read as individual trees, not a solid roof.
    const chance = forest > 0.25 ? 0.012 : forest > 0 ? 0.0035 : 0.0008;
    return hash2(x, z, TREE_SEED ^ this.seed) < chance;
  }

  private isCave(x: number, y: number, z: number, h: number, neighborMin: number): boolean {
    if (y <= 4 || y >= h - 5) return false;
    // Keep cliff faces solid so caves don't punch holes in hillsides.
    if (y >= neighborMin - 1) return false;
    return this.nCave.fbm3(x * 0.065, y * 0.085, z * 0.065, 2) > 0.6;
  }

  private placeDecor(chunk: Chunk, wx: number, wz: number, h: number, slope: number): void {
    if (h <= SEA_LEVEL + 1 || h >= 40 || slope > 1) return;
    const r = hash2(wx, wz, this.seed ^ 0xdec0de);
    if (r < 0.07) this.setIfAir(chunk, wx, h + 1, wz, Block.TallGrass);
    else if (r < 0.082) this.setIfAir(chunk, wx, h + 1, wz, Block.Flower);
  }

  private placeTree(chunk: Chunk, wx: number, wz: number, groundY: number): void {
    const roll = hash2(wx * 1.7, wz * 3.1, TREE_SEED ^ this.seed ^ 0x51);
    if (roll < 0.3) this.placeSpruce(chunk, wx, wz, groundY);
    else this.placeOak(chunk, wx, wz, groundY);
  }

  private placeOak(chunk: Chunk, wx: number, wz: number, groundY: number): void {
    const trunkH = 4 + Math.floor(hash2(wx, wz, TREE_SEED ^ this.seed) * 2);
    const topY = groundY + trunkH;
    for (let y = groundY + 1; y <= topY; y++) this.setIfAir(chunk, wx, y, wz, Block.Log);
    for (let dy = -2; dy <= 2; dy++) {
      const r = Math.abs(dy) === 2 ? 1 : 2;
      const y = topY + dy - 1;
      if (y <= groundY) continue;
      for (let ox = -r; ox <= r; ox++) {
        for (let oz = -r; oz <= r; oz++) {
          if (ox * ox + oz * oz > r * r) continue;
          if (ox === 0 && oz === 0 && dy <= 1) continue;
          if (Math.abs(ox) + Math.abs(oz) >= r && hash2(wx + ox * 5, wz + oz * 7 + dy, TREE_SEED) < 0.25) continue;
          this.setIfAir(chunk, wx + ox, y, wz + oz, Block.Leaves);
        }
      }
    }
  }

  private placeSpruce(chunk: Chunk, wx: number, wz: number, groundY: number): void {
    const trunkH = 6 + Math.floor(hash2(wx * 2.2, wz * 1.1, TREE_SEED ^ this.seed) * 2);
    const topY = groundY + trunkH;
    for (let y = groundY + 1; y <= topY; y++) this.setIfAir(chunk, wx, y, wz, Block.Log);
    for (let dy = 0; dy <= 4; dy++) {
      const r = dy === 0 ? 0 : dy === 1 ? 1 : 2;
      const y = topY - dy + 1;
      if (y <= groundY) continue;
      for (let ox = -r; ox <= r; ox++) {
        for (let oz = -r; oz <= r; oz++) {
          if (ox * ox + oz * oz > r * r + 0.1) continue;
          if (ox === 0 && oz === 0 && dy > 0) continue;
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

function smooth01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}
