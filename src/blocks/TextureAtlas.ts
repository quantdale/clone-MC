import * as THREE from "three";
import { mulberry32 } from "../utils/Random";

/**
 * Procedural 16x16 texture atlas rendered to a canvas.
 *
 * Layout: a single row of tiles. Each tile occupies an 18px cell
 * (16px of texture + 1px gap) and sits at the top of a tall canvas so
 * that greedy-meshed quads may span up to 64 tiles vertically without
 * their UVs ever leaving the canvas. Nearest filtering + 1px UV insets
 * guarantee no texture bleeding between tiles.
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
    const count = 11;
    for (let t = 0; t < count; t++) {
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
    this.texture = tex;
    return tex;
  }

  cell(tile: number): { col: number; row: number } {
    return { col: tile % ATLAS_COLS, row: Math.floor(tile / ATLAS_COLS) };
  }

  drawTile(ctx: CanvasRenderingContext2D, tile: number, x: number, y: number, size: number): void {
    const c = this.cell(tile);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, c.col * ATLAS_CELL + ATLAS_PAD, c.row * ATLAS_CELL + ATLAS_PAD, ATLAS_TILE, ATLAS_TILE, x, y, size, size);
  }
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function makeImageData(
  painter: (img: ImageData, rnd: () => number) => void,
  seed: number
): ImageData {
  const img = new ImageData(ATLAS_TILE, ATLAS_TILE);
  painter(img, mulberry32(seed * 7919 + 1337));
  return img;
}

function base(c: RGB, jitter: number): (img: ImageData, rnd: () => number) => void {
  return (img, rnd) => {
    for (let y = 0; y < ATLAS_TILE; y++) {
      for (let x = 0; x < ATLAS_TILE; x++) {
        const j = (rnd() * 2 - 1) * jitter;
        setPx(img, x, y, c.r + j, c.g + j, c.b + j, 255);
      }
    }
  };
}

function setPx(img: ImageData, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const i = (y * ATLAS_TILE + x) * 4;
  img.data[i] = clamp255(r);
  img.data[i + 1] = clamp255(g);
  img.data[i + 2] = clamp255(b);
  img.data[i + 3] = a;
}

function getPx(img: ImageData, x: number, y: number): { r: number; g: number; b: number; a: number } {
  const i = (y * ATLAS_TILE + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.data[i + 3] };
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function paintTile(tile: number): ImageData {
  switch (tile) {
    case 0: return grassTop();
    case 1: return grassSide();
    case 2: return makeImageData(base({ r: 130, g: 95, b: 65 }, 10), 2);
    case 3: {
      const img = makeImageData(base({ r: 125, g: 125, b: 125 }, 6), 3);
      const rnd = mulberry32(33);
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(rnd() * 16);
        const y = Math.floor(rnd() * 16);
        setPx(img, x, y, 90, 90, 92, 255);
      }
      return img;
    }
    case 4: return makeImageData(base({ r: 219, g: 211, b: 164 }, 10), 4);
    case 5: {
      const img = makeImageData(base({ r: 54, g: 105, b: 220 }, 0), 5);
      const rnd = mulberry32(55);
      for (let y = 0; y < ATLAS_TILE; y++) {
        for (let x = 0; x < ATLAS_TILE; x++) {
          if (rnd() < 0.22) setPx(img, x, y, 96, 148, 242, 230);
        }
      }
      for (let i = 0; i < ATLAS_TILE; i++) setPx(img, i, 0, 130, 175, 250, 235);
      return img;
    }
    case 6: return makeImageData(base({ r: 58, g: 58, b: 60 }, 26), 6);
    case 7: {
      const img = makeImageData(base({ r: 112, g: 86, b: 53 }, 9), 7);
      const rnd = mulberry32(77);
      for (let x = 0; x < ATLAS_TILE; x++) {
        const stripe = x % 4 === 3;
        for (let y = 0; y < ATLAS_TILE; y++) {
          if (stripe) setPx(img, x, y, 68, 52, 33, 255);
          else if (rnd() < 0.06) setPx(img, x, y, 84, 62, 38, 255);
        }
      }
      return img;
    }
    case 8: {
      const img = makeImageData(base({ r: 0, g: 0, b: 0 }, 0), 8);
      const rnd = mulberry32(88);
      for (let y = 0; y < ATLAS_TILE; y++) {
        for (let x = 0; x < ATLAS_TILE; x++) {
          const dx = x - 7.5;
          const dy = y - 7.5;
          const d = Math.sqrt(dx * dx + dy * dy);
          const band = Math.floor(d * 1.35) % 2 === 0;
          const j = (rnd() * 2 - 1) * 7;
          const c = band ? { r: 156 + j, g: 118 + j, b: 66 + j } : { r: 104 + j, g: 76 + j, b: 44 + j };
          setPx(img, x, y, c.r, c.g, c.b, 255);
        }
      }
      return img;
    }
    case 9: {
      const img = makeImageData(base({ r: 61, g: 128, b: 42 }, 12), 9);
      const rnd = mulberry32(99);
      for (let y = 0; y < ATLAS_TILE; y++) {
        for (let x = 0; x < ATLAS_TILE; x++) {
          const r = rnd();
          if (r < 0.13) setPx(img, x, y, 0, 0, 0, 0);
          else if (r < 0.25) setPx(img, x, y, 38, 92, 28, 255);
        }
      }
      return img;
    }
    default: {
      const img = makeImageData(base({ r: 150, g: 98, b: 74 }, 8), 10);
      for (let y = 0; y < ATLAS_TILE; y++) {
        for (let x = 0; x < ATLAS_TILE; x++) {
          const row = y % 4;
          const offset = Math.floor(y / 4) % 2 === 0 ? 0 : 4;
          const mortar = row === 3 || (x + offset) % 8 === 7;
          if (mortar) {
            const p = getPx(img, x, y);
            setPx(img, x, y, p.r * 0.72, p.g * 0.72, p.b * 0.72, 255);
          }
        }
      }
      return img;
    }
  }
}

function grassTop(): ImageData {
  const img = makeImageData(base({ r: 106, g: 170, b: 64 }, 12), 1);
  const rnd = mulberry32(11);
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(rnd() * 16);
    const y = Math.floor(rnd() * 16);
    setPx(img, x, y, 136, 196, 84, 255);
  }
  return img;
}

function grassSide(): ImageData {
  const img = makeImageData(base({ r: 130, g: 95, b: 65 }, 10), 12);
  for (let x = 0; x < ATLAS_TILE; x++) {
    setPx(img, x, 0, 96, 158, 60, 255);
    setPx(img, x, 1, 101, 165, 62, 255);
  }
  const rnd = mulberry32(122);
  for (let x = 0; x < ATLAS_TILE; x++) {
    if (rnd() < 0.55) setPx(img, x, 2, 92, 150, 58, 255);
    if (rnd() < 0.22) setPx(img, x, 3, 88, 140, 56, 255);
  }
  return img;
}
