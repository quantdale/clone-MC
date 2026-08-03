import * as THREE from "three";
import { Block } from "../../src/blocks/Blocks";
import { ChunkManager, type ChunkMaterials } from "../../src/world/ChunkManager";

/**
 * Build a headless ChunkManager. Mesh construction (Chunk.buildMesh) only
 * touches THREE.Scene, materials and BufferGeometry — no WebGL renderer is
 * ever created, so this works under the node test environment.
 */
export function makeManager(seed = 1337): ChunkManager {
  const scene = new THREE.Scene();
  const materials: ChunkMaterials = {
    solid: new THREE.MeshLambertMaterial(),
    cutout: new THREE.MeshLambertMaterial(),
    water: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.72 }),
  };
  return new ChunkManager(scene, materials, seed);
}

/**
 * Pump one-frame updates around (x, z) until the generation and mesh-rebuild
 * queues both drain (i.e. the full VIEW_RADIUS×VIEW_RADIUS block is loaded and
 * meshed). Throws if it never settles.
 */
export function loadAll(manager: ChunkManager, x = 0, z = 0, maxIter = 4000): void {
  for (let i = 0; i < maxIter; i++) {
    manager.update(x, z, 0.01);
    const s = manager.stats();
    if (s.pendingGen === 0 && s.pendingMesh === 0) return;
  }
  throw new Error("loadAll() did not reach quiescence");
}

/** Run n fixed-timestep updates around (x, z). */
export function pump(manager: ChunkManager, x: number, z: number, n: number): void {
  for (let i = 0; i < n; i++) manager.update(x, z, 0.01);
}

/** Pump until a specific cell reads non-Air (i.e. its chunk is loaded). */
export function pumpUntilLoaded(
  manager: ChunkManager,
  x: number,
  y: number,
  z: number,
  maxIter = 500
): void {
  for (let i = 0; i < maxIter; i++) {
    manager.update(Math.floor(x / 16), Math.floor(z / 16), 0.01);
    if (manager.getBlockWorld(x, y, z) !== Block.Air) return;
  }
  throw new Error(`cell (${x}, ${y}, ${z}) never loaded`);
}