import { Block, BLOCKS, HOTBAR, Tex } from "../blocks/Blocks";
import type { TextureAtlas } from "../blocks/TextureAtlas";

function representativeTex(b: Block): Tex {
  switch (b) {
    case Block.Grass:
      return Tex.GrassTop;
    case Block.Log:
      return Tex.LogSide;
    default:
      return BLOCKS[b].textures[0];
  }
}

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

/**
 * DOM HUD: FPS / position / chunk counters, loading overlay with progress
 * bar, click-to-play overlay, and the 9-slot hotbar with block icons,
 * wheel/number-key selection and highlight.
 */
export class HUD {
  selected = 0;

  private fpsEl = el("fps");
  private posEl = el("pos");
  private chunkEl = el("chunks");
  private cycleEl = el("cycle");
  private lockEl = el("clickToPlay");
  private loadEl = el("loading");
  private loadBar = el("loadbarfill");
  private loadText = el("loadtext");
  private hotbarEl = el("hotbar");
  private slotEls: HTMLElement[] = [];
  private debugEl = el("debug");
  private debugOn = true;
  private heldEl = el("held");
  private px = Number.NaN;
  private py = Number.NaN;
  private pz = Number.NaN;
  private chunkN = Number.NaN;
  private debugText = "";

  constructor() {
    HOTBAR.forEach((b, i) => {
      const slot = document.createElement("div");
      slot.className = "slot";
      const c = document.createElement("canvas");
      c.width = 40;
      c.height = 40;
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = String(i + 1);
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = BLOCKS[b].name;
      slot.append(c, num, name);
      this.hotbarEl.appendChild(slot);
      this.slotEls.push(slot);
    });
    this.setSelected(0);
  }

  attachAtlas(atlas: TextureAtlas): void {
    HOTBAR.forEach((b, i) => {
      const c = this.slotEls[i].querySelector("canvas")!;
      const ctx = c.getContext("2d")!;
      atlas.drawTile(ctx, representativeTex(b), 0, 0, 40);
    });
  }

  setSelected(i: number): void {
    this.selected = i;
    this.slotEls.forEach((s, k) => s.classList.toggle("selected", k === i));
    const id = HOTBAR[i];
    this.heldEl.textContent = id !== undefined ? BLOCKS[id].name : "";
  }

  setFps(fps: number): void {
    this.fpsEl.textContent = `FPS ${fps}`;
  }

  setPos(x: number, y: number, z: number): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    if (ix === this.px && iy === this.py && iz === this.pz) return;
    this.px = ix;
    this.py = iy;
    this.pz = iz;
    this.posEl.textContent = `XYZ ${ix} ${iy} ${iz}`;
  }

  setChunks(n: number): void {
    if (n === this.chunkN) return;
    this.chunkN = n;
    this.chunkEl.textContent = `Chunks ${n}`;
  }

  setCycle(on: boolean): void {
    this.cycleEl.textContent = on ? "Day/night: ON" : "Day/night: OFF";
  }

  /** Debug overlay (F3): pending work and triangle counts. */
  setDebug(s: { pendingGen: number; pendingMesh: number; editedCells: number; triangles: number }): void {
    const text =
      `pending gen ${s.pendingGen} · pending mesh ${s.pendingMesh} · ` +
      `edited ${s.editedCells} · tris ${s.triangles}`;
    if (text === this.debugText) return;
    this.debugText = text;
    this.debugEl.textContent = text;
  }

  toggleDebug(): boolean {
    this.debugOn = !this.debugOn;
    this.debugEl.classList.toggle("hidden", !this.debugOn);
    return this.debugOn;
  }

  setLocked(locked: boolean): void {
    this.lockEl.classList.toggle("hidden", locked);
  }

  setLoadingProgress(p: number): void {
    this.loadBar.style.width = `${Math.round(clampPct(p) * 100)}%`;
    this.loadText.textContent = `Generating world… ${Math.round(clampPct(p) * 100)}%`;
    if (p >= 1) this.finishLoading();
  }

  finishLoading(): void {
    this.loadEl.classList.add("hidden");
    this.loadText.textContent = "World ready";
  }
}

function clampPct(p: number): number {
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
