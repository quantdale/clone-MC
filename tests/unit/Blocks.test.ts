import { describe, it, expect } from "vitest";
import { BLOCKS, Block } from "../../src/blocks/Blocks";

describe("block registry", () => {
  it("every defined block has a coherent definition", () => {
    for (const [id, def] of Object.entries(BLOCKS)) {
      expect(Number(id)).toBe(def.id);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.textures).toHaveLength(6);
      // Air is intentionally not registered (it is the implicit empty cell).
      expect(def.id).not.toBe(Block.Air);
    }
  });

  it("bedrock is unbreakable; all other registered blocks are breakable", () => {
    for (const [id, def] of Object.entries(BLOCKS)) {
      if (Number(id) === Block.Bedrock) {
        expect(def.breakable).toBe(false);
      } else {
        expect(def.breakable).toBe(true);
      }
    }
  });

  it("exposes the required block set", () => {
    const required = [
      Block.Grass,
      Block.Dirt,
      Block.Stone,
      Block.Sand,
      Block.Water,
      Block.Bedrock,
      Block.Log,
      Block.Leaves,
    ];
    for (const b of required) expect(BLOCKS[b]).toBeDefined();
  });
});