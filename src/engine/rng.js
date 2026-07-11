// Deterministic PRNG (mulberry32). All engine randomness flows through the
// state's seed so that identical (state, action) sequences replay identically.

export function nextRandom(seed) {
  let t = (seed + 0x6D2B79F5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

/** Draw an integer in [0, n) and return the advanced seed. */
export function nextInt(seed, n) {
  const { value, seed: s } = nextRandom(seed);
  return { value: Math.floor(value * n), seed: s };
}

/** Fisher–Yates shuffle returning a new array and the advanced seed. */
export function shuffle(seed, arr) {
  const a = arr.slice();
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    const r = nextInt(s, i + 1);
    s = r.seed;
    [a[i], a[r.value]] = [a[r.value], a[i]];
  }
  return { value: a, seed: s };
}
