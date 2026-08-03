import { describe, it, expect } from "vitest";
import { hash2, mulberry32 } from "../../src/utils/Random";

describe("mulberry32", () => {
  it("is deterministic for the same seed", () => {
    const a = mulberry32(1337);
    const b = mulberry32(1337);
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 1000; i++) {
      seqA.push(a());
      seqB.push(b());
    }
    expect(seqA).toEqual(seqB);
  });

  it("always returns values in [0, 1)", () => {
    const rand = mulberry32(0);
    for (let i = 0; i < 10000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("produces different sequences for different seeds", () => {
    const seqA: number[] = [];
    const seqB: number[] = [];
    const a = mulberry32(1);
    const b = mulberry32(2);
    for (let i = 0; i < 8; i++) {
      seqA.push(a());
      seqB.push(b());
    }
    expect(seqA).not.toEqual(seqB);
  });

  it("handles seed 0 and 32-bit boundary seeds", () => {
    for (const seed of [0, 1, 0x7fffffff, 0x80000000, 0xffffffff]) {
      const v = mulberry32(seed)();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("hash2", () => {
  it("is deterministic for the same (x, z, seed)", () => {
    expect(hash2(-17, 3, 99)).toBe(hash2(-17, 3, 99));
    expect(hash2(12345, -678, 0xdead)).toBe(hash2(12345, -678, 0xdead));
  });

  it("varies with the seed", () => {
    expect(hash2(4, 5, 1)).not.toBe(hash2(4, 5, 2));
  });

  it("varies across coordinates", () => {
    const values: number[] = [];
    for (let i = 0; i < 16; i++) values.push(hash2(i * 7 - 100, i * 13 + 3, 42));
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it("returns finitely bounded values", () => {
    // The mix of Math.imul / signed shifts means the output can be negative;
    // both [0,1) outputs and small signed values occur in practice.
    for (let x = -20; x <= 20; x += 7) {
      for (let z = -20; z <= 20; z += 7) {
        for (const s of [0, 1, 12345]) {
          const h = hash2(x, z, s);
          expect(Math.abs(h)).toBeLessThanOrEqual(1);
          expect(Number.isFinite(h)).toBe(true);
        }
      }
    }
  });
});