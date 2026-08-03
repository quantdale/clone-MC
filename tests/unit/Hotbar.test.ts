import { describe, it, expect } from "vitest";
import { BLOCKS, Block, HOTBAR } from "../../src/blocks/Blocks";
import { wrapIndex } from "../../src/utils/MathUtils";

describe("HOTBAR", () => {
  it("has exactly 9 distinct entries", () => {
    expect(HOTBAR.length).toBe(9);
    expect(new Set(HOTBAR).size).toBe(9);
  });

  it("every entry is a registered, placeable block definition", () => {
    for (const id of HOTBAR) {
      expect(id).not.toBe(Block.Air);
      const def = BLOCKS[id];
      expect(def).toBeDefined();
      expect(def.id).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.textures).toHaveLength(6);
    }
  });
});

describe("wrapIndex (hotbar wheel selection)", () => {
  it("wraps forward and backward by one", () => {
    expect(wrapIndex(8, 1, 9)).toBe(0);
    expect(wrapIndex(0, -1, 9)).toBe(8);
    expect(wrapIndex(4, 1, 9)).toBe(5);
    expect(wrapIndex(4, -1, 9)).toBe(3);
  });

  it("wraps whole rings and large negative deltas", () => {
    expect(wrapIndex(0, 9, 9)).toBe(0);
    expect(wrapIndex(5, 4, 9)).toBe(0);
    expect(wrapIndex(0, -10, 9)).toBe(8);
    expect(wrapIndex(2, -4, 9)).toBe(7);
  });

  it("matches the Game wheel semantics for delta in {-1, 1}", () => {
    // Game previously used: (selected + dir + HOTBAR.length) % HOTBAR.length
    for (let sel = 0; sel < HOTBAR.length; sel++) {
      for (const dir of [-1, 1]) {
        expect(wrapIndex(sel, dir, HOTBAR.length)).toBe(
          (sel + dir + HOTBAR.length) % HOTBAR.length
        );
      }
    }
  });
});