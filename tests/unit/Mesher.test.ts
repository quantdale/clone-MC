import { describe, expect, it } from "vitest";
import { Block, Tex } from "../../src/blocks/Blocks";
import { CHUNK_SIZE } from "../../src/Constants";
import { Chunk } from "../../src/world/Chunk";
import { buildChunkGeometry } from "../../src/world/Mesher";

function worldFrom(chunk: Chunk): (x: number, y: number, z: number) => number {
  return (x, y, z) => {
    const lx = x - chunk.cx * CHUNK_SIZE;
    const lz = z - chunk.cz * CHUNK_SIZE;
    if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE || y < 0 || y >= 64) return Block.Air;
    return chunk.get(lx, y, lz);
  };
}

function countFacing(geo: { getAttribute(name: string): { count: number; getY(i: number): number; getX(i: number): number } | null }, axis: "x" | "y"): number {
  const normal = geo.getAttribute("normal");
  if (!normal) return 0;
  let n = 0;
  for (let i = 0; i < normal.count; i++) {
    const v = axis === "y" ? normal.getY(i) : normal.getX(i);
    if (v > 0.9) n++;
  }
  return n;
}

describe("greedy mesher", () => {
  it("merges a flat grass run into one top quad with a single tile id", () => {
    const chunk = new Chunk(0, 0);
    for (let x = 0; x < 4; x++) chunk.set(x, 2, 1, Block.Grass);
    const set = buildChunkGeometry(chunk, worldFrom(chunk));
    expect(set.solid).not.toBeNull();
    const geo = set.solid!;
    expect(countFacing(geo, "y")).toBe(4);
    const tile = geo.getAttribute("aTile");
    const normal = geo.getAttribute("normal");
    expect(tile).not.toBeNull();
    const tiles = new Set<number>();
    for (let i = 0; i < normal.count; i++) {
      if (normal.getY(i) > 0.9) tiles.add(tile.getX(i));
    }
    expect(tiles).toEqual(new Set([Tex.GrassTop]));
  });

  it("emits the stone face against leaves so leaf holes are not voids", () => {
    const chunk = new Chunk(0, 0);
    chunk.set(1, 2, 1, Block.Stone);
    chunk.set(2, 2, 1, Block.Leaves);
    const set = buildChunkGeometry(chunk, worldFrom(chunk));
    expect(set.solid).not.toBeNull();
    const normal = set.solid!.getAttribute("normal");
    const pos = set.solid!.getAttribute("position");
    let stoneFace = false;
    for (let i = 0; i < normal.count; i++) {
      if (normal.getX(i) > 0.9 && pos.getX(i) > 1.9 && pos.getX(i) < 2.1) stoneFace = true;
    }
    expect(stoneFace).toBe(true);
    expect(set.cutout).not.toBeNull();
  });

  it("does not emit interior faces of a solid box", () => {
    const chunk = new Chunk(0, 0);
    for (let x = 0; x < 3; x++) {
      for (let y = 1; y <= 3; y++) {
        for (let z = 0; z < 3; z++) chunk.set(x, y, z, Block.Stone);
      }
    }
    const set = buildChunkGeometry(chunk, worldFrom(chunk));
    const index = set.solid!.getIndex()!;
    // 3x3x3 cube has 6 * 9 exposed faces. Greedy merge collapses each side
    // to one quad (6 indices) when AO matches, so the shell is well under
    // one quad per face (9*6*6 = 324 indices).
    expect(index.count).toBeLessThan(324);
    expect(index.count).toBeGreaterThan(0);
  });

  it("meshes plants as cutout sprites, not solid cubes", () => {
    const chunk = new Chunk(0, 0);
    chunk.set(4, 3, 4, Block.TallGrass);
    const set = buildChunkGeometry(chunk, worldFrom(chunk));
    expect(set.solid).toBeNull();
    expect(set.cutout).not.toBeNull();
    expect(set.cutout!.getAttribute("aTile").getX(0)).toBe(Tex.TallGrass);
  });
});
