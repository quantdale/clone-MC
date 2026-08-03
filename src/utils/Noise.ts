import { mulberry32 } from "./Random";

/**
 * Seeded simplex noise (2D + 3D), ported from Stefan Gustavson's
 * public-domain reference implementation. Deterministic for a given seed.
 */
export class SimplexNoise {
  private perm = new Uint8Array(512);
  private permMod12 = new Uint8Array(512);

  constructor(seed: number) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2(xin: number, yin: number): number {
    const perm = this.perm;
    const m = this.permMod12;
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;

    let n0 = 0;
    let n1 = 0;
    let n2 = 0;

    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * this.grad2(perm[ii + m[jj]], x0, y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * this.grad2(perm[ii + i1 + m[jj + j1]], x1, y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * this.grad2(perm[ii + 1 + m[jj + 1]], x2, y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  noise3(xin: number, yin: number, zin: number): number {
    const perm = this.perm;
    const m = this.permMod12;
    const F3 = 1 / 3;
    const G3 = 1 / 6;

    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let n3 = 0;

    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);

    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let tt0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (tt0 > 0) {
      tt0 *= tt0;
      n0 = tt0 * tt0 * this.grad3(perm[ii + m[jj + m[kk]]], x0, y0, z0);
    }
    let tt1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (tt1 > 0) {
      tt1 *= tt1;
      n1 = tt1 * tt1 * this.grad3(perm[ii + i1 + m[jj + j1 + m[kk + k1]]], x1, y1, z1);
    }
    let tt2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (tt2 > 0) {
      tt2 *= tt2;
      n2 = tt2 * tt2 * this.grad3(perm[ii + i2 + m[jj + j2 + m[kk + k2]]], x2, y2, z2);
    }
    let tt3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (tt3 > 0) {
      tt3 *= tt3;
      n3 = tt3 * tt3 * this.grad3(perm[ii + 1 + m[jj + 1 + m[kk + 1]]], x3, y3, z3);
    }
    return 32 * (n0 + n1 + n2 + n3);
  }

  /** Fractal Brownian motion over noise2. Returns approximately [-1, 1]. */
  fbm2(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      sum += this.noise2(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  /** Fractal Brownian motion over noise3. Returns approximately [-1, 1]. */
  fbm3(x: number, y: number, z: number, octaves: number): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      sum += this.noise3(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  private grad2(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
  }

  private grad3(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }
}
