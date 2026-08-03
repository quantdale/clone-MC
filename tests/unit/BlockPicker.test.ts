import { describe, it, expect } from "vitest";
import { Block } from "../../src/blocks/Blocks";
import { raycastBlocks } from "../../src/player/BlockPicker";

/** Minimal in-memory voxel grid for pure raycast tests. */
class MockWorld {
  private cells = new Map<string, number>();

  get = (x: number, y: number, z: number): number =>
    this.cells.get(`${x},${y},${z}`) ?? Block.Air;

  set(x: number, y: number, z: number, id: number): void {
    this.cells.set(`${x},${y},${z}`, id);
  }
}

describe("raycastBlocks", () => {
  it("hits the first solid block straight below with an upward face normal", () => {
    const w = new MockWorld();
    w.set(0, 3, 0, Block.Stone);
    w.set(0, 5, 0, Block.Dirt); // intercepted first
    const hit = raycastBlocks(0.5, 10, 0.5, 0, -1, 0, 20, w.get);
    expect(hit).toMatchObject({ x: 0, y: 5, z: 0, nx: 0, ny: 1, nz: 0 });
  });

  it("hits nothing beyond MAX_REACH", () => {
    const w = new MockWorld();
    w.set(100, 1, 0, Block.Stone);
    const hit = raycastBlocks(0.5, 1, 0.5, 1, 0, 0, 6, w.get);
    expect(hit).toBeNull();
  });

  it("hits a block exactly at MAX_REACH but not just beyond", () => {
    const near = new MockWorld();
    near.set(6, 1, 0, Block.Stone); // t = 5.5 from origin x=0.5
    expect(raycastBlocks(0.5, 1, 0.5, 1, 0, 0, 6, near.get)).toMatchObject({ x: 6, y: 1, z: 0 });

    const far = new MockWorld();
    far.set(7, 1, 0, Block.Stone); // t = 6.5 > 6
    expect(raycastBlocks(0.5, 1, 0.5, 1, 0, 0, 6, far.get)).toBeNull();
  });

  it("a ray toward -x hits the +x face", () => {
    const w = new MockWorld();
    w.set(3, 4, 2, Block.Brick);
    const hit = raycastBlocks(10.5, 4.5, 2.5, -1, 0, 0, 20, w.get);
    expect(hit).toMatchObject({ x: 3, y: 4, z: 2, nx: 1, ny: 0, nz: 0 });
  });

  it("a ray toward +y hits the -y face", () => {
    const w = new MockWorld();
    w.set(1, 7, 1, Block.Sand);
    const hit = raycastBlocks(1.5, 0, 1.5, 0, 1, 0, 20, w.get);
    expect(hit).toMatchObject({ x: 1, y: 7, z: 1, nx: 0, ny: -1, nz: 0 });
  });

  it("hits a horizontal slab along a diagonal ray", () => {
    const w = new MockWorld();
    for (let x = 0; x <= 8; x++) {
      for (let z = 0; z <= 8; z++) w.set(x, 2, z, Block.Stone);
    }
    const hit = raycastBlocks(0.5, 0.5, 0.5, 1, 1, 0.5, 20, w.get);
    expect(hit).not.toBeNull();
    expect(hit).toMatchObject({ y: 2, ny: -1 });
    if (hit) {
      expect(hit.x).toBeGreaterThanOrEqual(0);
      expect(hit.x).toBeLessThanOrEqual(8);
      expect(hit.z).toBeGreaterThanOrEqual(0);
      expect(hit.z).toBeLessThanOrEqual(8);
    }
  });

  it("terminates on a degenerate zero-length direction", () => {
    const w = new MockWorld();
    const hit = raycastBlocks(5.5, 5.5, 5.5, 0, 0, 0, 10, w.get);
    expect(hit).toBeNull();
  });

  it("terminates when shooting into empty space", () => {
    const w = new MockWorld();
    const hit = raycastBlocks(0.5, 0.5, 0.5, 1, 0, 0, 100, w.get);
    expect(hit).toBeNull();
  });
});