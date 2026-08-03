import { describe, it, expect } from "vitest";
import { Block } from "../../src/blocks/Blocks";
import { makeManager, loadAll } from "./testHelpers";

/** Far enough that chunk (0,0) sits well beyond VIEW_RADIUS + 2. */
const FAR = 100000;

// Loading the full 13x13 world takes several seconds under node, so grant a
// generous timeout to the whole describe.
describe("edit persistence across chunk unload/reload", () => {
  it("keeps an edited cell while restoring seed values for untouched cells", () => {
    const m = makeManager(42);
    loadAll(m); // full 13x13 block around (0,0) is generated and meshed

    // (3,1,3) sits in chunk (0,0): y=1 is always solid stone, y=2 is a
    // deterministic seed cell that we never edit.
    expect(m.getBlockWorld(3, 1, 3)).not.toBe(Block.Air);
    const controlOriginal = m.getBlockWorld(3, 2, 3);
    expect(controlOriginal).not.toBe(Block.Air);

    // Place the in-session edit.
    expect(m.setBlockWorld(3, 1, 3, Block.Brick)).toBe(true);
    expect(m.getBlockWorld(3, 1, 3)).toBe(Block.Brick);
    expect(m.stats().editedCells).toBe(1);

    // Teleport far away: one update with dt=2.0 trips the 1 s unload timer.
    m.update(FAR, FAR, 2.0);
    // Chunk (0,0) is now beyond VIEW_RADIUS+2 of the far center and gone.
    expect(m.getBlockWorld(3, 1, 3)).toBe(Block.Air);
    expect(m.getBlockWorld(3, 2, 3)).toBe(Block.Air);
    // The overlay survives the unload.
    expect(m.stats().editedCells).toBe(1);

    // Come back and let chunk (0,0) regenerate with its edit overlay reapplied.
    m.update(0, 0, 2.0);
    for (let i = 0; i < 500 && m.getBlockWorld(3, 1, 3) === Block.Air; i++) {
      m.update(0, 0, 0.01);
    }
    expect(m.getBlockWorld(3, 1, 3)).toBe(Block.Brick); // edit persisted (overlay)
    expect(m.getBlockWorld(3, 2, 3)).toBe(controlOriginal); // seed value restored elsewhere
    expect(m.stats().editedCells).toBe(1);

    // A second unload/reload cycle behaves identically.
    m.update(FAR * 2, FAR * 2, 2.0);
    expect(m.getBlockWorld(3, 1, 3)).toBe(Block.Air);
    m.update(0, 0, 2.0);
    for (let i = 0; i < 500 && m.getBlockWorld(3, 1, 3) === Block.Air; i++) {
      m.update(0, 0, 0.01);
    }
    expect(m.getBlockWorld(3, 1, 3)).toBe(Block.Brick);
    expect(m.getBlockWorld(3, 2, 3)).toBe(controlOriginal);
  }, 60000);

  it("an unedited chunk regenerates identically from scratch", () => {
    const a = makeManager(42);
    const b = makeManager(42);
    loadAll(a);
    loadAll(b);

    const sample = [
      [0, 1, 0],
      [7, 20, 7],
      [15, 5, 15],
      [-17, 2, 3],
    ] as const;
    for (const [x, y, z] of sample) {
      expect(a.getBlockWorld(x, y, z)).toBe(b.getBlockWorld(x, y, z));
    }
  }, 120000);
});