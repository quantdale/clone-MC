import * as THREE from "three";
import { Block, BLOCKS, HOTBAR } from "../blocks/Blocks";
import { TextureAtlas } from "../blocks/TextureAtlas";
import { CHUNK_HEIGHT, MAX_REACH, PLAYER_HEIGHT, PLAYER_HALF_WIDTH, SEA_LEVEL } from "../Constants";
import { raycastBlocks, type BlockHit } from "../player/BlockPicker";
import { PlayerController } from "../player/PlayerController";
import { WorldRenderer } from "../render/WorldRenderer";
import type { HUD } from "../ui/HUD";
import { wrapIndex } from "../utils/MathUtils";
import { ChunkManager } from "../world/ChunkManager";

/** Chunks that must exist before the loading overlay hides. */
const INITIAL_TARGET = 25;

export class Game {
  readonly renderer: WorldRenderer;
  readonly manager: ChunkManager;
  readonly player: PlayerController;
  readonly hud: HUD;

  selected = 0;

  private selectionBox: THREE.LineSegments;
  private last = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private ready = false;
  private readonly look = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, hud: HUD) {
    this.hud = hud;

    const params = new URLSearchParams(location.search);
    const seed = Number(params.get("seed")) || 1337;

    this.renderer = new WorldRenderer(canvas);
    const atlas = new TextureAtlas();
    const tex = atlas.build();
    this.renderer.setMaterials(tex);
    hud.attachAtlas(atlas);
    hud.setCycle(this.renderer.cycleOn);

    this.manager = new ChunkManager(this.renderer.scene, this.renderer.materials, seed);
    this.player = new PlayerController(this.renderer.camera);

    const boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    const boxMat = new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.9 });
    this.selectionBox = new THREE.LineSegments(boxGeo, boxMat);
    this.selectionBox.visible = false;
    this.renderer.scene.add(this.selectionBox);
    const halo = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })
    );
    this.selectionBox.add(halo);

    this.spawnPlayer();
    this.bindEvents(canvas);
  }

  start(): void {
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  private spawnPlayer(): void {
    const t = this.manager.terrain;
    let sx = 0;
    let sz = 0;
    let h = t.heightAt(0, 0);
    let found = false;
    outer: for (let r = 0; r <= 64; r += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        for (let dz = -r; dz <= r; dz += 2) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const hh = t.heightAt(dx, dz);
          if (hh <= SEA_LEVEL + 2 || hh >= 38) continue;
          if (t.shouldPlaceTree(dx, dz, hh)) continue;
          const slope = Math.max(
            Math.abs(hh - t.heightAt(dx + 1, dz)),
            Math.abs(hh - t.heightAt(dx - 1, dz)),
            Math.abs(hh - t.heightAt(dx, dz + 1)),
            Math.abs(hh - t.heightAt(dx, dz - 1))
          );
          if (slope > 1) continue;
          sx = dx;
          sz = dz;
          h = hh;
          found = true;
          break outer;
        }
      }
    }
    if (!found) {
      let guard = 0;
      while (t.shouldPlaceTree(sx, sz, t.heightAt(sx, sz)) && guard++ < 16) sz += 4;
      h = t.heightAt(sx, sz);
    }
    this.player.pos.set(sx + 0.5, h + 2.2, sz + 0.5);
    this.player.pitch = -0.18;
  }

  private bindEvents(canvas: HTMLCanvasElement): void {
    window.addEventListener("keydown", (e) => {
      this.player.keys.add(e.code);
      if (e.code.startsWith("Digit")) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= HOTBAR.length) this.select(n - 1);
      } else if (e.code === "KeyN" && !e.repeat) {
        this.renderer.toggleCycle();
        this.hud.setCycle(this.renderer.cycleOn);
      } else if (e.code === "F3" && !e.repeat) {
        e.preventDefault();
        this.hud.toggleDebug();
      }
    });
    window.addEventListener("keyup", (e) => this.player.keys.delete(e.code));
    window.addEventListener("mousemove", (e) => {
      if (this.isLocked()) this.player.addMouse(e.movementX, e.movementY);
    });
    window.addEventListener("mousedown", (e) => {
      if (!this.isLocked()) return;
      if (e.button === 0) this.breakBlock();
      else if (e.button === 2) this.placeBlock();
    });
    window.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const dir = e.deltaY > 0 ? 1 : -1;
        this.select(wrapIndex(this.selected, dir, HOTBAR.length));
      },
      { passive: false }
    );
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("pointerlockchange", () => {
      const locked = this.isLocked();
      this.hud.setLocked(locked);
      if (!locked) this.player.keys.clear();
    });
    canvas.addEventListener("click", () => {
      if (!this.isLocked()) canvas.requestPointerLock();
    });
    // The full-screen "click to play" overlay covers the canvas until the
    // pointer is locked; route its clicks to the same pointer-lock path so
    // the primary affordance actually works (and re-locks after Esc).
    const lockOverlay = document.getElementById("clickToPlay");
    if (lockOverlay) {
      lockOverlay.addEventListener("click", () => {
        if (!this.isLocked()) canvas.requestPointerLock();
      });
    }
    window.addEventListener("resize", () => this.renderer.resize(window.innerWidth, window.innerHeight));
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  private select(i: number): void {
    this.selected = i;
    this.hud.setSelected(i);
  }

  private currentHit(): BlockHit | null {
    const cam = this.renderer.camera;
    this.look.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    return raycastBlocks(
      cam.position.x,
      cam.position.y,
      cam.position.z,
      this.look.x,
      this.look.y,
      this.look.z,
      MAX_REACH,
      (x, y, z) => this.manager.getBlockWorld(x, y, z)
    );
  }

  private breakBlock(): void {
    const hit = this.currentHit();
    if (!hit) return;
    const def = BLOCKS[this.manager.getBlockWorld(hit.x, hit.y, hit.z)];
    if (!def.breakable) return;
    this.manager.setBlockWorld(hit.x, hit.y, hit.z, Block.Air);
  }

  private placeBlock(): void {
    const hit = this.currentHit();
    if (!hit) return;
    const id = HOTBAR[this.selected];
    const bx = hit.x + hit.nx;
    const by = hit.y + hit.ny;
    const bz = hit.z + hit.nz;
    if (by < 0 || by >= CHUNK_HEIGHT) return;
    const def = BLOCKS[id];
    if (def.solid) {
      const p = this.player.pos;
      const overlaps =
        bx + 1 > p.x - PLAYER_HALF_WIDTH &&
        bx < p.x + PLAYER_HALF_WIDTH &&
        by + 1 > p.y &&
        by < p.y + PLAYER_HEIGHT &&
        bz + 1 > p.z - PLAYER_HALF_WIDTH &&
        bz < p.z + PLAYER_HALF_WIDTH;
      if (overlaps) return;
    }
    this.manager.setBlockWorld(bx, by, bz, id);
  }

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.update(dt);
  };

  private update(dt: number): void {
    this.manager.update(this.player.pos.x, this.player.pos.z, dt);
    this.player.update(dt, this.manager);
    this.renderer.update(dt, this.player.pos);

    const hit = this.currentHit();
    this.selectionBox.visible = !!hit;
    if (hit) this.selectionBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

    this.renderer.render();

    this.fpsFrames++;
    this.fpsTime += dt;
    this.hud.setPos(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    const s = this.manager.stats();
    this.hud.setChunks(s.loaded);
    if (this.fpsTime >= 0.25) {
      this.hud.setFps(Math.round(this.fpsFrames / this.fpsTime));
      this.hud.setDebug({
        pendingGen: s.pendingGen,
        pendingMesh: s.pendingMesh,
        editedCells: s.editedCells,
        triangles: this.renderer.triangles(),
      });
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    if (!this.ready) {
      const loaded = this.manager.loadedCount();
      this.hud.setLoadingProgress(loaded / INITIAL_TARGET);
      if (loaded >= INITIAL_TARGET) this.ready = true;
    }
  }

  private isLocked(): boolean {
    return document.pointerLockElement != null;
  }
}
