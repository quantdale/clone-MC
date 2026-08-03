import { describe, it, expect } from "vitest";
import { Block } from "../../src/blocks/Blocks";
import { CHUNK_HEIGHT } from "../../src/Constants";
import { makeManager, loadAll } from "./testHelpers";

// Full 13x13 world load takes several seconds under the node test env, so
// grant the describes that depend on loadAll() a generous timeout.
describe("ChunkManager coordinate conversion", () => {
  it("round-trips block coordinates across chunk borders, including negatives", () => {
    const m = makeManager(7);
    // Loads the full VIEW_RADIUS block, so cx in [-6, 6] are present.
    loadAll(m);

    // Interior of chunk (0,0).
    expect(m.setBlockWorld(5, 1, 5, Block.Brick)).toBe(true);
    expect(m.getBlockWorld(5, 1, 5)).toBe(Block.Brick);

    // world x=16 is lx=0 of chunk (1,0).
    expect(m.setBlockWorld(16, 1, 5, Block.Stone)).toBe(true);
    expect(m.getBlockWorld(16, 1, 5)).toBe(Block.Stone);

    // world x=-17 -> cx=floor(-17/16)=-2, lx=-17-(-32)=15.
    expect(m.setBlockWorld(-17, 1, 5, Block.Sand)).toBe(true);
    expect(m.getBlockWorld(-17, 1, 5)).toBe(Block.Sand);

    // world x=-32 -> cx=-2, lx=0 (exact chunk boundary).
    expect(m.setBlockWorld(-32, 1, 5, Block.Log)).toBe(true);
    expect(m.getBlockWorld(-32, 1, 5)).toBe(Block.Log);

    // world x=-33 -> cx=-3, lx=15 (other negative boundary).
    expect(m.setBlockWorld(-33, 1, 5, Block.Leaves)).toBe(true);
    expect(m.getBlockWorld(-33, 1, 5)).toBe(Block.Leaves);

    // Z direction mirrors X: world z=16 → cz=1, lz=0.
    expect(m.setBlockWorld(5, 1, 16, Block.Brick)).toBe(true);
    expect(m.getBlockWorld(5, 1, 16)).toBe(Block.Brick);
  }, 60000);

  it("treats y outside [0, CHUNK_HEIGHT) as empty and unwritable", () => {
    const m = makeManager(7);
    loadAll(m);
    for (const y of [-5, -1, CHUNK_HEIGHT, CHUNK_HEIGHT + 100]) {
      expect(m.getBlockWorld(5, y, 5)).toBe(Block.Air);
      expect(m.setBlockWorld(5, y, 5, Block.Brick)).toBe(false);
    }
  }, 60000);

  it("setBlockWorld on an unloaded chunk returns false without throwing", () => {
    const m = makeManager(7); // nothing loaded
    expect(m.loadedCount()).toBe(0);
    expect(() => m.setBlockWorld(3, 30, 3, Block.Brick)).not.toThrow();
    expect(m.setBlockWorld(3, 30, 3, Block.Brick)).toBe(false);
    expect(() => m.setBlockWorld(1_000_000, 40, -1_000_000, Block.Brick)).not.toThrow();
    expect(m.setBlockWorld(1_000_000, 40, -1_000_000, Block.Brick)).toBe(false);
    expect(m.getBlockWorld(3, 30, 3)).toBe(Block.Air);
  });
});

describe("chunk-boundary edits", () => {
  it("dirties the affected neighbor chunks when editing a boundary cell", () => {
    const m = makeManager(11);
    loadAll(m); // all 13x13 chunks loaded and meshed
    expect(m.stats().pendingGen).toBe(0);
    expect(m.stats().pendingMesh).toBe(0);

    // (0,1,0) sits at lx=0 and lz=0 of chunk (0,0): its own chunk plus the
    // -x and -z neighbors must all be queued for a mesh rebuild.
    expect(m.setBlockWorld(0, 1, 0, Block.Brick)).toBe(true);
    expect(m.getBlockWorld(0, 1, 0)).toBe(Block.Brick);
    expect(m.stats().pendingMesh).toBe(3);

    // The very next update starts rebuilding the dirtied set.
    m.update(0, 0, 0.01);
    expect(m.stats().pendingMesh).toBeLessThan(3);
    for (let i = 0; i < 60 && m.stats().pendingMesh > 0; i++) m.update(0, 0, 0.01);
    expect(m.stats().pendingMesh).toBe(0);
    expect(m.getBlockWorld(0, 1, 0)).toBe(Block.Brick);

    // +x boundary (lx=15) dirties chunk (0,0) and (1,0).
    expect(m.setBlockWorld(15, 1, 7, Block.Brick)).toBe(true);
    expect(m.stats().pendingMesh).toBe(2);
    for (let i = 0; i < 60 && m.stats().pendingMesh > 0; i++) m.update(0, 0, 0.01);
    expect(m.stats().pendingMesh).toBe(0);

    // -z boundary (lz=0) dirties chunk (0,0) and (0,-1).
    expect(m.setBlockWorld(7, 1, 0, Block.Brick)).toBe(true);
    expect(m.stats().pendingMesh).toBe(2);
    for (let i = 0; i < 60 && m.stats().pendingMesh > 0; i++) m.update(0, 0, 0.01);
    expect(m.stats().pendingMesh).toBe(0);

    // Interior cells only dirty their own chunk.
    expect(m.setBlockWorld(7, 1, 8, Block.Brick)).toBe(true);
    expect(m.stats().pendingMesh).toBe(1);

    for (let i = 0; i < 60 && m.stats().pendingMesh > 0; i++) m.update(0, 0, 0.01);
    expect(m.stats().pendingMesh).toBe(0);
  }, 60000);

  it("a boundary edit is visible through getBlockWorld from either side", () => {
    const m = makeManager(11);
    loadAll(m);

    // World (16, 1, 9) is lx=0 in chunk (1,0). The mesher of chunk (0,0)
    // reads that cell as its +x neighbor via the same world-space lookup.
    expect(m.setBlockWorld(16, 1, 9, Block.Brick)).toBe(true);
    expect(m.getBlockWorld(16, 1, 9)).toBe(Block.Brick);
    expect(m.getBlockWorld(15, 1, 9)).not.toBe(Block.Brick);

    const s = m.stats();
    expect(s.editedCells).toBe(1);
  }, 60000);
});