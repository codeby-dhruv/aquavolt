export function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 13.7) * 43758.5453;
  return s - Math.floor(s);
}

export function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(i);
  const b = hash1(i + 1);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

export function fbm(x: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise1(x * freq + i * 19.3) * amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum;
}

/** Deterministic pseudo-random in [0,1) for an integer slot + channel. */
export function rnd(slot: number, channel = 0): number {
  return hash1(slot * 3.77 + channel * 91.13);
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
