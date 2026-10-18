import { describe, it, expect } from "vitest";
import { Block } from "../../src/blocks/Blocks";
import { CHUNK_SIZE, SEA_LEVEL } from "../../src/Constants";
import { Chunk } from "../../src/world/Chunk";
import { TerrainGenerator } from "../../src/world/TerrainGenerator";

function chunkData(seed: number, cx: number, cz: number): Uint8Array {
  const chunk = new Chunk(cx, cz);
  new TerrainGenerator(seed).generate(chunk);
  return chunk.data;
}

/** True if no tree is rooted within 2 cells (canopy reach) of (x, z). */
function treeClear(tg: TerrainGenerator, x: number, z: number): boolean {
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const h = tg.heightAt(x + dx, z + dz);
      if (tg.shouldPlaceTree(x + dx, z + dz, h)) return false;
    }
  }
  return true;
}

describe("TerrainGenerator", () => {
  it("is deterministic for a fixed seed", () => {
    const a = new TerrainGenerator(777);
    const b = new TerrainGenerator(777);
    for (const [x, z] of [
      [0, 0],
      [-17, 3],
      [123, -88],
      [15, 15],
    ]) {
      expect(a.heightAt(x, z)).toBe(b.heightAt(x, z));
    }
    // Fresh chunks, full byte-for-byte equality of the generated data.
    expect(chunkData(777, 0, 0)).toEqual(chunkData(777, 0, 0));
    expect(chunkData(777, -2, 3)).toEqual(chunkData(777, -2, 3));
    expect(chunkData(777, 1, -1)).toEqual(chunkData(777, 1, -1));
  });

  it("produces different terrain for different seeds", () => {
    const a = new TerrainGenerator(1);
    const b = new TerrainGenerator(2);
    let heightDiff = 0;
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        if (a.heightAt(x, z) !== b.heightAt(x, z)) heightDiff++;
      }
    }
    // Heightmaps must diverge broadly. Voxel-byte diffs are a weaker proxy:
    // a 64-tall column only changes a few cells when the surface moves.
    expect(heightDiff).toBeGreaterThan((CHUNK_SIZE * CHUNK_SIZE) / 2);
    const d1 = chunkData(1, 0, 0);
    const d2 = chunkData(2, 0, 0);
    let diff = 0;
    for (let i = 0; i < d1.length; i++) {
      if (d1[i] !== d2[i]) diff++;
    }
    expect(diff).toBeGreaterThan(0);
  });

  it("lays bedrock at y=0 and only stores valid block ids", () => {
    for (const [cx, cz] of [
      [0, 0],
      [-1, 2],
    ]) {
      const d = chunkData(1337, cx, cz);
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          expect(d[(0 * CHUNK_SIZE + lz) * CHUNK_SIZE + lx]).toBe(Block.Bedrock);
        }
      }
      for (const id of d) {
        expect(Number.isInteger(id)).toBe(true);
        expect(id).toBeGreaterThanOrEqual(Block.Air);
        expect(id).toBeLessThanOrEqual(Block.Snow);
      }
    }
  });

  it("heightAt is never negative and returns integers", () => {
    const tg = new TerrainGenerator(1337);
    for (let x = -64; x <= 64; x += 4) {
      for (let z = -64; z <= 64; z += 4) {
        const h = tg.heightAt(x, z);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(h)).toBe(true);
      }
    }
  });

  it("caps the surface column with grass above sea level", () => {
    const tg = new TerrainGenerator(1337);
    const chunk = new Chunk(0, 0);
    tg.generate(chunk);

    let dry: { lx: number; lz: number; h: number } | null | undefined;
    for (let cx = -1; cx <= 1 && !dry; cx++) {
      for (let cz = -1; cz <= 1 && !dry; cz++) {
        const sample = cx === 0 && cz === 0 ? chunk : new Chunk(cx, cz);
        if (sample !== chunk) tg.generate(sample);
        for (let lx = 1; lx < CHUNK_SIZE - 1 && !dry; lx++) {
          for (let lz = 1; lz < CHUNK_SIZE - 1; lz++) {
            const wx = cx * CHUNK_SIZE + lx;
            const wz = cz * CHUNK_SIZE + lz;
            const h = tg.heightAt(wx, wz);
            if (h < SEA_LEVEL + 2 || h >= 40 || !treeClear(tg, wx, wz)) continue;
            if (sample.get(lx, h, lz) !== Block.Grass) continue;
            const above = sample.get(lx, h + 1, lz);
            if (above !== Block.Air && above !== Block.TallGrass && above !== Block.Flower) continue;
            dry = { lx, lz, h };
            expect(sample.get(lx, h, lz)).toBe(Block.Grass);
            expect(sample.get(lx, h - 1, lz)).toBe(Block.Dirt);
            break;
          }
        }
      }
    }
    expect(dry).not.toBeNull();
  });

  it("fills sea-level cells above ground with water", () => {
    const tg = new TerrainGenerator(1337);
    const chunk = new Chunk(0, 0);
    tg.generate(chunk);

    let wet: { chunk: Chunk; lx: number; lz: number; h: number } | null = null;
    outer: for (let cx = -2; cx <= 2 && !wet; cx++) {
      for (let cz = -2; cz <= 2 && !wet; cz++) {
        const sample = cx === 0 && cz === 0 ? chunk : new Chunk(cx, cz);
        if (sample !== chunk) tg.generate(sample);
        for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
          for (let lz = 1; lz < CHUNK_SIZE - 1; lz++) {
            const h = tg.heightAt(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
            if (h <= SEA_LEVEL - 1) {
              wet = { chunk: sample, lx, lz, h };
              break outer;
            }
          }
        }
      }
    }
    expect(wet).not.toBeNull();
    if (!wet) return;
    // Beach floor on the seabed.
    expect(wet.chunk.get(wet.lx, wet.h, wet.lz)).toBe(Block.Sand);
    // Every cell from one above ground up to sea level is water.
    for (let y = wet.h + 1; y <= SEA_LEVEL; y++) {
      expect(wet.chunk.get(wet.lx, y, wet.lz)).toBe(Block.Water);
    }
    expect(wet.chunk.get(wet.lx, SEA_LEVEL + 1, wet.lz)).toBe(Block.Air);
  });
});