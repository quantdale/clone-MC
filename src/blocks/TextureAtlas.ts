import * as THREE from "three";
import { Tex } from "./Blocks";
import { mulberry32 } from "../utils/Random";

/**
 * Procedural 16x16 texture atlas rendered to a canvas.
 *
 * Layout: a single row of tiles. Each tile occupies an 18px cell
 * (16px of texture + 1px gap). Greedy quads do not stretch these UVs —
 * the voxel shader samples one tile per block — so the tall canvas is
 * only padding, not a repeat strip. Nearest filtering + 1px insets
 * guarantee no bleeding between tiles.
 */
export const ATLAS_TILE = 16;
export const ATLAS_CELL = 18;
export const ATLAS_PAD = 1;
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 60;
export const ATLAS_W = ATLAS_COLS * ATLAS_CELL; // 288
export const ATLAS_H = ATLAS_ROWS * ATLAS_CELL; // 1080
export const PX_U = 1 / ATLAS_W;
export const PX_V = 1 / ATLAS_H;

const TILE_COUNT = Tex.Snow + 1;

export class TextureAtlas {
  readonly canvas = document.createElement("canvas");
  texture: THREE.CanvasTexture | null = null;

  constructor() {
    this.canvas.width = ATLAS_W;
    this.canvas.height = ATLAS_H;
  }

  build(): THREE.CanvasTexture {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable — cannot build texture atlas.");
    for (let t = 0; t < TILE_COUNT; t++) {
      const img = paintTile(t);
      ctx.putImageData(img, t * ATLAS_CELL + ATLAS_PAD, ATLAS_PAD);
    }
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.texture = tex;
    return tex;
  }

  cell(tile: number): { col: number; row: number } {
    return { col: tile % ATLAS_COLS, row: Math.floor(tile / ATLAS_COLS) };
  }

  drawTile(ctx: CanvasRenderingContext2D, tile: number, x: number, y: number, size: number): void {
    const c = this.cell(tile);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.canvas,
      c.col * ATLAS_CELL + ATLAS_PAD,
      c.row * ATLAS_CELL + ATLAS_PAD,
      ATLAS_TILE,
      ATLAS_TILE,
      x,
      y,
      size,
      size
    );
  }
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function makeImageData(painter: (img: ImageData, rnd: () => number) => void, seed: number): ImageData {
  const img = new ImageData(ATLAS_TILE, ATLAS_TILE);
  painter(img, mulberry32(seed * 7919 + 1337));
  return img;
}

function setPx(img: ImageData, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || y < 0 || x >= ATLAS_TILE || y >= ATLAS_TILE) return;
  const i = (y * ATLAS_TILE + x) * 4;
  img.data[i] = clamp255(r);
  img.data[i + 1] = clamp255(g);
  img.data[i + 2] = clamp255(b);
  img.data[i + 3] = a;
}

function fill(img: ImageData, c: RGB, jitter: number, rnd: () => number, a = 255): void {
  for (let y = 0; y < ATLAS_TILE; y++) {
    for (let x = 0; x < ATLAS_TILE; x++) {
      const j = (rnd() * 2 - 1) * jitter;
      setPx(img, x, y, c.r + j, c.g + j, c.b + j, a);
    }
  }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function paintTile(tile: number): ImageData {
  switch (tile) {
    case Tex.GrassTop:
      return grassTop();
    case Tex.GrassSide:
      return grassSide();
    case Tex.Dirt:
      return dirt();
    case Tex.Stone:
      return stone();
    case Tex.Sand:
      return sand();
    case Tex.Water:
      return water();
    case Tex.Bedrock:
      return bedrock();
    case Tex.LogSide:
      return logSide();
    case Tex.LogTop:
      return logTop();
    case Tex.Leaves:
      return leaves();
    case Tex.Brick:
      return brick();
    case Tex.TallGrass:
      return tallGrass();
    case Tex.Flower:
      return flower();
    case Tex.Snow:
      return snow();
    default:
      return dirt();
  }
}

function grassTop(): ImageData {
  // Tight noise: wide jitter plus big speckles read as blotches once a block
  // fills a large part of the screen.
  const img = makeImageData((im, rnd) => fill(im, { r: 96, g: 158, b: 62 }, 5, rnd), 1);
  const rnd = mulberry32(11);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rnd() * 16);
    const y = Math.floor(rnd() * 16);
    setPx(img, x, y, rnd() < 0.5 ? 116 : 82, rnd() < 0.5 ? 178 : 140, rnd() < 0.5 ? 74 : 52);
  }
  return img;
}

function grassSide(): ImageData {
  const img = makeImageData((im, rnd) => fill(im, { r: 134, g: 96, b: 62 }, 8, rnd), 12);
  const rnd = mulberry32(122);
  const edge = [3, 4, 3, 5, 2, 4, 3, 4, 5, 3, 4, 2, 4, 3, 5, 3];
  for (let x = 0; x < ATLAS_TILE; x++) {
    const depth = edge[x];
    for (let y = 0; y < depth; y++) {
      const shade = y === depth - 1 ? 0.82 : 1;
      const g = (y === 0 ? 168 : 148) * shade;
      setPx(img, x, y, 70 * shade, g, 42 * shade);
    }
    if (rnd() < 0.35) setPx(img, x, depth, 96, 70, 44);
  }
  return img;
}

function dirt(): ImageData {
  const img = makeImageData((im, rnd) => fill(im, { r: 134, g: 96, b: 62 }, 9, rnd), 2);
  const rnd = mulberry32(21);
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(rnd() * 16);
    const y = Math.floor(rnd() * 16);
    setPx(img, x, y, rnd() < 0.5 ? 104 : 156, rnd() < 0.5 ? 72 : 114, rnd() < 0.5 ? 46 : 74);
  }
  return img;
}

function stone(): ImageData {
  const img = makeImageData((im, rnd) => fill(im, { r: 128, g: 128, b: 128 }, 7, rnd), 3);
  const rnd = mulberry32(33);
  for (let i = 0; i < 10; i++) {
    const x = 1 + Math.floor(rnd() * 13);
    const y = 1 + Math.floor(rnd() * 13);
    const len = 2 + Math.floor(rnd() * 4);
    const horiz = rnd() < 0.5;
    for (let k = 0; k < len; k++) {
      setPx(img, x + (horiz ? k : 0), y + (horiz ? 0 : k), 92, 92, 94);
    }
  }
  for (let i = 0; i < 8; i++) setPx(img, Math.floor(rnd() * 16), Math.floor(rnd() * 16), 168, 168, 170);
  return img;
}

function sand(): ImageData {
  const img = makeImageData((im, rnd) => fill(im, { r: 214, g: 202, b: 148 }, 8, rnd), 4);
  const rnd = mulberry32(44);
  for (let i = 0; i < 20; i++) {
    setPx(img, Math.floor(rnd() * 16), Math.floor(rnd() * 16), 196, 180, 122);
  }
  return img;
}

function water(): ImageData {
  const img = makeImageData((im, rnd) => fill(im, { r: 52, g: 112, b: 212 }, 4, rnd, 230), 5);
  for (let y = 3; y < 16; y += 6) {
    for (let x = 0; x < 16; x++) {
      if ((x + y) % 6 < 3) setPx(img, x, y, 96, 152, 228, 214);
    }
  }
  return img;
}

function bedrock(): ImageData {
  const img = makeImageData((im, rnd) => fill(im, { r: 42, g: 42, b: 44 }, 16, rnd), 6);
  const rnd = mulberry32(66);
  for (let i = 0; i < 14; i++) setPx(img, Math.floor(rnd() * 16), Math.floor(rnd() * 16), 18, 18, 20);
  return img;
}

function logSide(): ImageData {
  const img = makeImageData((im, rnd) => fill(im, { r: 102, g: 78, b: 48 }, 6, rnd), 7);
  for (let x = 0; x < 16; x++) {
    const bark = x % 4 === 0 || x % 4 === 1;
    for (let y = 0; y < 16; y++) {
      if (bark) setPx(img, x, y, 72, 52, 32);
      else if ((x + y) % 7 === 0) setPx(img, x, y, 124, 96, 58);
    }
  }
  return img;
}

function logTop(): ImageData {
  const img = makeImageData((im, rnd) => fill(im, { r: 156, g: 122, b: 74 }, 5, rnd), 8);
  const cx = 7.5;
  const cy = 7.5;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > 7.2) setPx(img, x, y, 86, 62, 36);
      else if (Math.abs(d - 3.2) < 0.7 || Math.abs(d - 5.4) < 0.55) setPx(img, x, y, 112, 82, 46);
    }
  }
  return img;
}

function leaves(): ImageData {
  const img = makeImageData((im, rnd) => fill(im, { r: 52, g: 132, b: 42 }, 14, rnd), 9);
  const rnd = mulberry32(99);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const r = rnd();
      if (r < 0.12) setPx(img, x, y, 0, 0, 0, 0);
      else if (r < 0.28) setPx(img, x, y, 34, 96, 28);
      else if (r < 0.4) setPx(img, x, y, 78, 168, 58);
    }
  }
  return img;
}

function brick(): ImageData {
  const img = new ImageData(ATLAS_TILE, ATLAS_TILE);
  const rnd = mulberry32(101);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / 4);
      const offset = row % 2 === 0 ? 0 : 4;
      const mortar = y % 4 === 3 || (x + offset) % 8 === 7;
      if (mortar) setPx(img, x, y, 188, 178, 168);
      else {
        const j = (rnd() * 2 - 1) * 10;
        setPx(img, x, y, 168 + j, 78 + j * 0.4, 62 + j * 0.3);
      }
    }
  }
  return img;
}

function tallGrass(): ImageData {
  const img = new ImageData(ATLAS_TILE, ATLAS_TILE);
  const blades = [2, 6, 10, 13];
  for (const x of blades) {
    const h = 8 + (x % 5);
    for (let y = 16 - h; y < 16; y++) {
      const tip = y < 18 - h;
      setPx(img, x, y, tip ? 110 : 64, tip ? 196 : 150, tip ? 58 : 42);
      setPx(img, x + 1, y, tip ? 78 : 46, tip ? 160 : 118, tip ? 44 : 32);
    }
  }
  return img;
}

function flower(): ImageData {
  const img = new ImageData(ATLAS_TILE, ATLAS_TILE);
  for (let y = 9; y < 16; y++) {
    setPx(img, 7, y, 48, 124, 42);
    setPx(img, 8, y, 40, 108, 36);
  }
  for (let y = 3; y <= 8; y++) {
    for (let x = 4; x <= 11; x++) {
      const dx = x - 7.5;
      const dy = y - 5.5;
      if (dx * dx + dy * dy > 12) continue;
      const petal = Math.abs(dx) < 1.2 && Math.abs(dy) < 1.2;
      setPx(img, x, y, petal ? 242 : 214, petal ? 206 : 58, petal ? 72 : 64);
    }
  }
  return img;
}

function snow(): ImageData {
  const img = makeImageData((im, rnd) => fill(im, { r: 236, g: 242, b: 246 }, 6, rnd), 14);
  const rnd = mulberry32(141);
  for (let i = 0; i < 12; i++) setPx(img, Math.floor(rnd() * 16), Math.floor(rnd() * 16), 206, 218, 228);
  return img;
}
