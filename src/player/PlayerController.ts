import * as THREE from "three";
import { Block } from "../blocks/Blocks";
import {
  EYE_HEIGHT,
  GRAVITY,
  JUMP_SPEED,
  PLAYER_HEIGHT,
  PLAYER_HALF_WIDTH,
  SPRINT_SPEED,
  WALK_SPEED,
} from "../Constants";
import type { ChunkManager } from "../world/ChunkManager";

/**
 * First-person player: pointer-lock mouse look, WASD movement with
 * smoothing, sprint, jump, gravity, water buoyancy/swimming, and
 * AABB collision against the voxel grid.
 */
export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  inWater = false;
  keys = new Set<string>();

  private bobPhase = 0;
  private readonly half = PLAYER_HALF_WIDTH;
  private readonly sensitivity = 0.0022;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  addMouse(dx: number, dy: number): void {
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;
    if (this.pitch > 1.55) this.pitch = 1.55;
    if (this.pitch < -1.55) this.pitch = -1.55;
  }

  update(dt: number, manager: ChunkManager): void {
    const keys = this.keys;
    const fwd = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
    const strafe = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const jump = keys.has("Space");

    this.inWater = this.isInWater(manager);

    // Wish direction rotated by yaw.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let mx = -sin * fwd + cos * strafe;
    let mz = -cos * fwd - sin * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
    }

    const speed = (sprint && fwd > 0 ? SPRINT_SPEED : WALK_SPEED) * (this.inWater ? 0.55 : 1);
    const k = this.onGround ? 1 - Math.exp(-dt * 12) : 1 - Math.exp(-dt * 2.2);
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;

    if (this.inWater) {
      const targetY = jump ? 4.2 : -2.5;
      this.vel.y += (targetY - this.vel.y) * Math.min(1, dt * 6);
    } else {
      this.vel.y -= GRAVITY * dt;
      if (this.vel.y < -55) this.vel.y = -55;
      if (jump && this.onGround) {
        this.vel.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    // Integrate with collision, axis by axis (Y first so ground steps feel clean).
    this.onGround = false;
    this.collideAxis(1, this.vel.y * dt, manager);
    this.collideAxis(0, this.vel.x * dt, manager);
    this.collideAxis(2, this.vel.z * dt, manager);

    // Safety net if the player ever falls out of the world.
    if (this.pos.y < -16) {
      this.pos.set(0, CHUNK_TOP, 0);
      this.vel.set(0, 0, 0);
    }

    // Camera: position + head bob, orientation from yaw/pitch.
    const moving = this.onGround && (Math.abs(this.vel.x) > 0.1 || Math.abs(this.vel.z) > 0.1);
    if (moving) this.bobPhase += dt * (sprint ? 13 : 10);
    const bobY = moving ? Math.sin(this.bobPhase) * 0.055 : 0;
    this.camera.position.set(this.pos.x, this.pos.y + EYE_HEIGHT + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");

    // Sprint FOV kick.
    const targetFov =
      sprint && fwd > 0 && Math.abs(this.vel.x) + Math.abs(this.vel.z) > 1 ? 82 : 75;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
    }
  }

  private isInWater(manager: ChunkManager): boolean {
    const x = Math.floor(this.pos.x);
    const z = Math.floor(this.pos.z);
    return (
      manager.getBlockWorld(x, Math.floor(this.pos.y + 0.6), z) === Block.Water ||
      manager.getBlockWorld(x, Math.floor(this.pos.y + 1.4), z) === Block.Water
    );
  }

  private collideAxis(axis: number, delta: number, manager: ChunkManager): void {
    if (delta === 0) return;
    if (axis === 0) this.pos.x += delta;
    else if (axis === 1) this.pos.y += delta;
    else this.pos.z += delta;

    const minX = this.pos.x - this.half;
    const maxX = this.pos.x + this.half;
    const minY = this.pos.y;
    const maxY = this.pos.y + PLAYER_HEIGHT;
    const minZ = this.pos.z - this.half;
    const maxZ = this.pos.z + this.half;
    const eps = 1e-4;

    for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx++) {
      for (let by = Math.floor(minY); by <= Math.floor(maxY); by++) {
        for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz++) {
          const id = manager.getBlockWorld(bx, by, bz);
          if (id === Block.Air || id === Block.Water) continue;
          // Only collide if the block truly overlaps on the other two axes.
          const overlap = (lo: number, hi: number, blo: number, bhi: number) =>
            bhi > lo + eps && blo < hi - eps;
          if (axis === 0) {
            if (!overlap(minY, maxY, by, by + 1) || !overlap(minZ, maxZ, bz, bz + 1)) continue;
            this.pos.x = delta > 0 ? Math.min(this.pos.x, bx - this.half) : Math.max(this.pos.x, bx + 1 + this.half);
          } else if (axis === 1) {
            if (!overlap(minX, maxX, bx, bx + 1) || !overlap(minZ, maxZ, bz, bz + 1)) continue;
            if (delta > 0) this.pos.y = Math.min(this.pos.y, by - PLAYER_HEIGHT);
            else {
              this.pos.y = Math.max(this.pos.y, by + 1);
              this.onGround = true;
            }
          } else {
            if (!overlap(minX, maxX, bx, bx + 1) || !overlap(minY, maxY, by, by + 1)) continue;
            this.pos.z = delta > 0 ? Math.min(this.pos.z, bz - this.half) : Math.max(this.pos.z, bz + 1 + this.half);
          }
          if (axis === 0) this.vel.x = 0;
          else if (axis === 1) this.vel.y = 0;
          else this.vel.z = 0;
        }
      }
    }
  }
}

const CHUNK_TOP = 60;
