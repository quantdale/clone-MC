import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { Block } from "../../src/blocks/Blocks";
import { JUMP_SPEED, SEA_LEVEL } from "../../src/Constants";
import { PlayerController } from "../../src/player/PlayerController";
import { ChunkManager } from "../../src/world/ChunkManager";
import { makeManager, pumpUntilLoaded } from "./testHelpers";

const DT = 0.05;
const PLATFORM_Y = 61; // flat test surface, above any terrain (max height 60)
const WALL_X = 10;

let manager: ChunkManager;

function freshPlayer(x: number, y: number, z: number): PlayerController {
  const player = new PlayerController(new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 200));
  player.pos.set(x, y, z);
  player.vel.set(0, 0, 0);
  player.keys.clear();
  return player;
}

function step(player: PlayerController, n: number): void {
  for (let i = 0; i < n; i++) player.update(DT, manager);
}

function addPlatformBlocks(): void {
  for (let x = 1; x <= 14; x++) {
    for (let z = 1; z <= 14; z++) {
      const ok = manager.setBlockWorld(x, PLATFORM_Y, z, Block.Stone);
      if (!ok) throw new Error(`platform edit failed at (${x}, ${PLATFORM_Y}, ${z})`);
    }
  }
  // Solid wall up to the world ceiling, blocking the +x direction.
  for (let x = WALL_X; x <= WALL_X; x++) {
    for (let y = 1; y < 64; y++) {
      for (let z = 1; z <= 14; z++) {
        const ok = manager.setBlockWorld(x, y, z, Block.Brick);
        if (!ok) throw new Error(`wall edit failed at (${x}, ${y}, ${z})`);
      }
    }
  }
  // A small water pool (2 layers) for buoyancy checks, away from the dry lanes.
  for (let x = 4; x <= 7; x++) {
    for (let z = 6; z <= 9; z++) {
      for (let y = PLATFORM_Y + 1; y <= PLATFORM_Y + 2; y++) {
        const ok = manager.setBlockWorld(x, y, z, Block.Water);
        if (!ok) throw new Error(`water edit failed at (${x}, ${y}, ${z})`);
      }
    }
  }
}

beforeAll(() => {
  manager = makeManager(1337);
  // Load the 3x3 chunk block around the origin so the terrain test has a
  // wide range of columns to pick from (chunk (0,0) alone may be all-ocean).
  pumpUntilLoaded(manager, 5, 1, 2);
  pumpUntilLoaded(manager, -5, 1, -5);
  pumpUntilLoaded(manager, 20, 1, 20);
  addPlatformBlocks();
});

describe("PlayerController collision & movement", () => {
  it("a player standing on solid ground settles and never sinks", () => {
    const player = freshPlayer(5.5, PLATFORM_Y + 1.2, 2.5);
    let minY = Infinity;
    for (let i = 0; i < 120; i++) {
      step(player, 1);
      minY = Math.min(minY, player.pos.y);
    }
    expect(player.onGround).toBe(true);
    expect(player.pos.y).toBeCloseTo(PLATFORM_Y + 1, 6);
    expect(minY).toBeGreaterThanOrEqual(PLATFORM_Y + 1 - 1e-4);
    // Stable: more frames do not move it.
    for (let i = 0; i < 60; i++) step(player, 1);
    expect(player.pos.y).toBeCloseTo(PLATFORM_Y + 1, 6);
  });

  it("gravity accelerates an airborne player downward and lands them", () => {
    const player = freshPlayer(5.5, PLATFORM_Y + 4, 2.5);
    expect(player.onGround).toBe(false);
    // After 0.4 s of free fall: v = -g*t = -28*0.4 = -11.2 (no terminal clamping yet).
    step(player, 8);
    expect(player.vel.y).toBeGreaterThan(-12.5);
    expect(player.vel.y).toBeLessThan(-10);
    expect(player.pos.y).toBeLessThan(PLATFORM_Y + 3.5);
    // Falls to rest on the platform.
    let minY = Infinity;
    for (let i = 0; i < 200; i++) {
      step(player, 1);
      minY = Math.min(minY, player.pos.y);
    }
    expect(player.onGround).toBe(true);
    expect(player.pos.y).toBeCloseTo(PLATFORM_Y + 1, 4);
    expect(minY).toBeGreaterThanOrEqual(PLATFORM_Y + 1 - 1e-4);
  });

  it("a jump gives upward velocity that peaks and falls back down", () => {
    const player = freshPlayer(5.5, PLATFORM_Y + 1.2, 2.5);
    step(player, 40); // settle on the platform first
    expect(player.onGround).toBe(true);
    player.keys.add("Space");
    step(player, 1);
    expect(player.vel.y).toBeCloseTo(JUMP_SPEED, 6);
    let peakY = player.pos.y;
    let minVelY = Infinity;
    for (let i = 0; i < 60; i++) {
      step(player, 1);
      peakY = Math.max(peakY, player.pos.y);
      minVelY = Math.min(minVelY, player.vel.y);
    }
    player.keys.delete("Space");
    expect(minVelY).toBeLessThan(0); // velocity went negative mid-flight
    // Apex for v0=9.2, g=28: h_max = v0^2/(2g) ≈ 1.51 m above the platform.
    expect(peakY).toBeGreaterThan(PLATFORM_Y + 1 + 1);
    expect(peakY).toBeLessThan(PLATFORM_Y + 1 + 2);
    // And it returns to the ground.
    step(player, 120);
    expect(player.onGround).toBe(true);
    expect(player.pos.y).toBeCloseTo(PLATFORM_Y + 1, 4);
  });

  it("cannot walk through a solid wall", () => {
    const player = freshPlayer(5.5, PLATFORM_Y + 1.2, 2.5);
    step(player, 40); // settle
    player.keys.add("KeyD"); // strafe +x toward the wall at x=10
    let maxX = -Infinity;
    for (let i = 0; i < 240; i++) {
      step(player, 1);
      maxX = Math.max(maxX, player.pos.x);
    }
    // half-width 0.3 stops the AABB at the wall face: x = 10 - 0.3.
    expect(maxX).toBeLessThanOrEqual(WALL_X - 0.3 + 1e-4);
    expect(player.pos.x).toBeCloseTo(WALL_X - 0.3, 4);
    expect(player.onGround).toBe(true);
    expect(player.pos.y).toBeCloseTo(PLATFORM_Y + 1, 4);
  });

  it("water buoyancy slows sinking and never pushes through a solid floor", () => {
    const player = freshPlayer(5.5, PLATFORM_Y + 2.2, 7.5); // inside the pool
    expect(player.inWater).toBe(false);
    step(player, 1);
    expect(player.inWater).toBe(true);
    let minVelY = Infinity;
    let minY = Infinity;
    for (let i = 0; i < 40; i++) {
      step(player, 1);
      minVelY = Math.min(minVelY, player.vel.y);
      minY = Math.min(minY, player.pos.y);
    }
    // Water targets a sink velocity of -2.5 instead of free-falling at -g.
    expect(minVelY).toBeGreaterThanOrEqual(-2.6);
    expect(minY).toBeGreaterThanOrEqual(PLATFORM_Y + 1 - 1e-4);
    expect(player.pos.y).toBeCloseTo(PLATFORM_Y + 1, 4);
    expect(player.inWater).toBe(true);
  });

  it("a player standing on generated terrain does not sink", () => {
    // Find a dry, tree-free column so nothing interferes with settling.
    let col: { x: number; z: number; h: number } | null = null;
    for (let x = -13; x <= 28 && !col; x++) {
      for (let z = -13; z <= 28; z++) {
        const h = manager.terrain.heightAt(x, z);
        if (h <= SEA_LEVEL + 1 || h >= PLATFORM_Y) continue;
        if (x === WALL_X && z >= 1 && z <= 14) continue;
        let clear = true;
        for (let dx = -2; dx <= 2 && clear; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            const nh = manager.terrain.heightAt(x + dx, z + dz);
            if (manager.terrain.shouldPlaceTree(x + dx, z + dz, nh)) clear = false;
          }
        }
        if (clear) col = { x, z, h };
      }
    }
    expect(col).not.toBeNull();
    if (!col) return;

    const player = freshPlayer(col.x + 0.5, col.h + 1.2, col.z + 0.5);
    let minY = Infinity;
    for (let i = 0; i < 120; i++) {
      step(player, 1);
      minY = Math.min(minY, player.pos.y);
    }
    expect(player.onGround).toBe(true);
    expect(player.pos.y).toBeCloseTo(col.h + 1, 4);
    expect(minY).toBeGreaterThanOrEqual(col.h + 1 - 1e-4);
  });
});