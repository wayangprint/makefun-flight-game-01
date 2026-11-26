// A small deterministic generator: the same seed always grows the same
// valley, clouds and town, so a screenshot can be staged again exactly.
export function createRandom(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return {
    next() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    },
    range(min, max) {
      return min + this.next() * (max - min);
    },
    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    },
  };
}

/** Smooth value noise in 1D: deterministic, no tables to ship. */
export function noise1(x, seed) {
  const xi = Math.floor(x);
  const xf = x - xi;
  const a = hash1(xi, seed);
  const b = hash1(xi + 1, seed);
  const u = xf * xf * (3 - 2 * xf);
  return a + (b - a) * u;
}

export function hash1(n, seed) {
  let h = (n * 374761393 + seed * 668265263) >>> 0;
  h = (h ^ (h >> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 2D, built from the 1D hash. */
export function noise2(x, z, seed) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash1(xi * 73856093 + zi * 19349663, seed);
  const b = hash1((xi + 1) * 73856093 + zi * 19349663, seed);
  const c = hash1(xi * 73856093 + (zi + 1) * 19349663, seed);
  const d = hash1((xi + 1) * 73856093 + (zi + 1) * 19349663, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
