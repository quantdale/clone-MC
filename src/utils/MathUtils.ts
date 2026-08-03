export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Wrap an index around a ring of {@link size} slots by {@link delta} (e.g.
 * hotbar selection from mouse-wheel steps of -1/1). Double-modulo keeps
 * negative deltas of any magnitude in range.
 */
export function wrapIndex(current: number, delta: number, size: number): number {
  return ((current + delta) % size + size) % size;
}
