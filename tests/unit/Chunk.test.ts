import { describe, it, expect } from "vitest";
import { Block } from "../../src/blocks/Blocks";
import { CHUNK_HEIGHT, CHUNK_SIZE } from "../../src/Constants";
import { Chunk } from "../../src/world/Chunk";

describe("Chunk data access", () => {
  it("index() maps (lx, ly, lz) onto the data layout", () => {
    const c = new Chunk(2, 5);
    expect(c.index(3, 4, 7)).toBe((4 * CHUNK_SIZE + 7) * CHUNK_SIZE + 3);
    expect(c.index(0, 0, 0)).toBe(0);
    expect(c.index(CHUNK_SIZE - 1, CHUNK_HEIGHT - 1, CHUNK_SIZE - 1)).toBe(c.data.length - 1);
  });

  it("get/set round-trip through the same cell", () => {
    const c = new Chunk(-1, 0);
    c.set(15, 62, 15, Block.Brick);
    expect(c.get(15, 62, 15)).toBe(Block.Brick);
    expect(c.get(14, 62, 15)).toBe(Block.Air);
  });
});

describe("Chunk.applyEdits", () => {
  it("overlays in-range cells, ignores out-of-range indices, no-ops elsewhere", () => {
    const c = new Chunk(0, 0);
    c.set(1, 2, 3, Block.Stone);
    const edits = new Map<number, number>([
      [c.index(1, 2, 3), Block.Brick],
      [c.index(0, 0, 0), Block.Sand],
      [-1, Block.Water],
      [c.data.length, Block.Water],
      [c.data.length + 42, Block.Water],
    ]);
    c.applyEdits(edits);
    expect(c.get(1, 2, 3)).toBe(Block.Brick);
    expect(c.get(0, 0, 0)).toBe(Block.Sand);
    // Untouched cell keeps its seeded/default value.
    expect(c.get(CHUNK_SIZE - 1, 5, CHUNK_SIZE - 1)).toBe(Block.Air);
    // Applying the same overlay again is idempotent.
    const before = Array.from(c.data);
    c.applyEdits(edits);
    expect(Array.from(c.data)).toEqual(before);
  });

  it("no-ops for an empty edit map", () => {
    const c = new Chunk(-3, 9);
    c.set(4, 5, 6, Block.Log);
    const before = Array.from(c.data);
    c.applyEdits(new Map());
    expect(Array.from(c.data)).toEqual(before);
  });
});