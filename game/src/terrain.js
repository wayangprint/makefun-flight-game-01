// Lembah Merpati: the valley the course flies through. One height function
// decides everything — mountains, river, lake, town and both strips — so the
// renderer, the physics and the autopilot all agree about the ground.
import { COURSE } from './config.js';
import { noise1, noise2 } from './random.js';

const SEED = 20261126;

/** The river's centreline: it bends gently down the whole valley. */
export function riverX(z) {
  return 120 * Math.sin(z * 0.0011) + 40 * Math.sin(z * 0.0027 + 1.3);
}

/** True ground height (metres) at a world point. y = 0 is runway level. */
export function groundHeight(x, z) {
  const r = COURSE.runway;
  const g = COURSE.grassStrip;
  const t = COURSE.town;
  const lake = COURSE.lake;
  // Both strips and the town sit on flattened ground.
  if (x >= r.x0 - 30 && x <= r.x1 + 30 && z >= r.z0 - 60 && z <= r.z1 + 40) return 0;
  if (x >= g.x0 - 26 && x <= g.x1 + 26 && z >= g.z0 - 40 && z <= g.z1 + 40) return 0;
  if (x >= t.x0 - 30 && x <= t.x1 + 30 && z >= t.z0 - 40 && z <= t.z1 + 40) return 0;
  // The lake is a bowl sunk below the valley floor.
  const lx = (x - lake.cx) / lake.rx;
  const lz = (z - lake.cz) / lake.rz;
  const lakeD = lx * lx + lz * lz;
  if (lakeD < 1) return -3 + 6 * lakeD;
  // Valley walls rise with distance from the centreline; the floor rolls.
  const wall = Math.abs(x) / 260;
  const mountains = Math.pow(Math.max(0, wall - 0.7), 1.5) * 90;
  const rolling = noise2(x * 0.004, z * 0.004, SEED) * 18
    + noise2(x * 0.016 + 7, z * 0.016, SEED + 5) * 4;
  const ridge = Math.max(0, noise1(z * 0.0016, SEED + 11) - 0.45) * 40
    * Math.max(0, Math.abs(x) / 300);
  let h = 2 + rolling * (0.35 + wall) + mountains + ridge;
  // The river carves a shallow channel through the floor.
  const dRiver = Math.abs(x - riverX(z));
  if (dRiver < 55) h -= (1 - dRiver / 55) * 7;
  // Never a wall: the valley stays flyable and readable from the air.
  return Math.max(-5, Math.min(h, 130));
}

/** What the ground is at a point: water, sand, rock, town, runway or grass. */
export function groundKind(x, z) {
  const r = COURSE.runway;
  const g = COURSE.grassStrip;
  const t = COURSE.town;
  if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return 'runway';
  if (x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1) return 'strip';
  if (x >= t.x0 && x <= t.x1 && z >= t.z0 && z <= t.z1) return 'town';
  const lake = COURSE.lake;
  const lx = (x - lake.cx) / lake.rx;
  const lz = (z - lake.cz) / lake.rz;
  if (lx * lx + lz * lz < 1) return 'water';
  const dRiver = Math.abs(x - riverX(z));
  const h = groundHeight(x, z);
  if (dRiver < 12 && h < 3) return 'water';
  if (dRiver < 26 && h < 4) return 'sand';
  if (h > 80) return 'rock';
  if (h > 45) return 'rockLow';
  return 'grass';
}

/** Is a world point inside the paved runway rectangle? */
export function onRunway(x, z) {
  const r = COURSE.runway;
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/** Is a world point inside the grass strip (takeoff ground)? */
export function onGrassStrip(x, z) {
  const g = COURSE.grassStrip;
  return x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1;
}

/**
 * Build the scenery the renderer draws: clouds, trees, town houses and the
 * riverside barns. All of it is fixed at boot from the seed, so the valley
 * never changes between visits.
 */
export function buildScenery(random) {
  const clouds = [];
  for (let i = 0; i < 30; i += 1) {
    clouds.push({
      x: random.range(-900, 900),
      y: random.range(230, 380),
      z: random.range(-300, 5600),
      s: random.range(26, 70),
    });
  }
  const trees = [];
  for (let i = 0; i < 420; i += 1) {
    const x = random.range(-700, 700);
    const z = random.range(-200, 5400);
    const h = groundHeight(x, z);
    if (groundKind(x, z) !== 'grass' || h > 60) continue;
    trees.push({ x, z, y: h, s: random.range(3, 7) });
  }
  const houses = [];
  const t = COURSE.town;
  for (let i = 0; i < 64; i += 1) {
    const x = random.range(t.x0 + 14, t.x1 - 14);
    const z = random.range(t.z0 + 14, t.z1 - 14);
    if (Math.abs(x) < 24) continue; // keep the runway approach clear
    houses.push({ x, z, w: random.range(9, 16), d: random.range(8, 13), h: random.range(6, 14) });
  }
  const barns = [];
  for (let i = 0; i < 10; i += 1) {
    const z = 400 + i * 480 + random.range(-60, 60);
    const x = riverX(z) + (random.next() < 0.5 ? -1 : 1) * random.range(60, 120);
    barns.push({ x, z, y: groundHeight(x, z), w: 12, h: 7 });
  }
  return { clouds, trees, houses, barns };
}
