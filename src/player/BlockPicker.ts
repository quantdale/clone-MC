import { Block } from "../blocks/Blocks";

export interface BlockHit {
  /** Targeted block cell. */
  x: number;
  y: number;
  z: number;
  /** Face normal of the targeted face. */
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Amanatides & Woo voxel DDA raycast: steps through the voxel grid along
 * the ray and returns the first non-air block, plus the face it hit.
 */
export function raycastBlocks(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  getBlock: (x: number, y: number, z: number) => number
): BlockHit | null {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX = dx > 0 ? (x + 1 - ox) * tDeltaX : dx < 0 ? (ox - x) * tDeltaX : Infinity;
  let tMaxY = dy > 0 ? (y + 1 - oy) * tDeltaY : dy < 0 ? (oy - y) * tDeltaY : Infinity;
  let tMaxZ = dz > 0 ? (z + 1 - oz) * tDeltaZ : dz < 0 ? (oz - z) * tDeltaZ : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  for (let i = 0; i < 512; i++) {
    if (getBlock(x, y, z) !== Block.Air) {
      return { x, y, z, nx, ny, nz };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
    if (t > maxDist) return null;
  }
  return null;
}
