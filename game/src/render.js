// Merpati Valley Run — the renderer. Canvas 2D only, no WebGL, no images:
// the sky, the valley, the town, the rings and the plane are all drawn
// from the same numbers the flight model flies through, so a screenshot
// can only ever show the real game.
import { CAMERA, COURSE, FIELD, PALETTE } from './config.js';
import { groundHeight, groundKind, riverX } from './terrain.js';

const ROWS = 40;
const ROW_RATIO = 1.13;
const ROW_FIRST = 12;
const SEGMENTS = 24;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createRenderer(canvas, scenery) {
  const ctx = canvas.getContext('2d');
  const particles = [];
  let camX = 0;
  let camY = 8;
  let camZ = -80;
  let camHeading = 0;
  let camPitch = 0.08;
  let smokeT = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  function project(cam, x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const sh = Math.sin(cam.heading);
    const ch = Math.cos(cam.heading);
    const cz = dx * sh + dz * ch;
    const cx = dx * ch - dz * sh;
    const ca = Math.cos(cam.pitch);
    const sa = Math.sin(cam.pitch);
    const cy2 = dy * ca - cz * sa;
    const cz2 = dy * sa + cz * ca;
    if (cz2 < 2) return null;
    const s = CAMERA.focal / cz2;
    return {
      x: FIELD.width / 2 + cx * s,
      y: FIELD.height / 2 - cy2 * s,
      s,
      dist: cz2,
    };
  }

  function updateCamera(state, dt) {
    const sh = Math.sin(state.heading);
    const ch = Math.cos(state.heading);
    const tx = state.x - sh * CAMERA.behind + state.roll * 2;
    const ty = state.y + CAMERA.above;
    const tz = state.z - ch * CAMERA.behind;
    const k = 1 - Math.exp(-dt * 5);
    camX = lerp(camX, tx, k);
    camY = lerp(camY, ty, k);
    camZ = lerp(camZ, tz, k);
    let dh = state.heading - camHeading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    camHeading += dh * (1 - Math.exp(-dt * 6));
    const targetPitch = clamp(0.08 - state.pitch * 0.35, -0.12, 0.3);
    camPitch = lerp(camPitch, targetPitch, 1 - Math.exp(-dt * 4));
  }

  function camera() {
    return { x: camX, y: camY, z: camZ, heading: camHeading, pitch: camPitch };
  }

  function horizonY(cam) {
    return FIELD.height / 2 + CAMERA.focal * Math.tan(cam.pitch);
  }

  function drawSky(cam, time) {
    const hy = horizonY(cam);
    const grad = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(Math.max(0, hy / FIELD.height - 0.12), PALETTE.skyMid);
    grad.addColorStop(Math.min(1, hy / FIELD.height + 0.02), PALETTE.skyHorizon);
    grad.addColorStop(1, '#3d6b4a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Low sun, late afternoon, fixed in the west so the light never moves.
    const sunX = FIELD.width * 0.78;
    const sunY = hy - 150;
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 190);
    glow.addColorStop(0, PALETTE.sunCore);
    glow.addColorStop(0.25, PALETTE.sun);
    glow.addColorStop(1, 'rgba(255, 243, 196, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 200, sunY - 200, 400, 400);
    ctx.fillStyle = PALETTE.sunCore;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFarRidge(cam) {
    // A hazy mountain wall far down the valley, drawn before the ground.
    const depth = 1750;
    const sh = Math.sin(cam.heading);
    const ch = Math.cos(cam.heading);
    const cx = cam.x + sh * depth;
    const cz = cam.z + ch * depth;
    ctx.beginPath();
    let started = false;
    for (let i = -24; i <= 24; i += 1) {
      const lat = i * 130;
      const wx = cx + ch * lat;
      const wz = cz - sh * lat;
      const p = project(cam, wx, groundHeight(wx, wz) + 4, wz);
      if (!p) continue;
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    }
    if (!started) return;
    ctx.lineTo(FIELD.width, FIELD.height);
    ctx.lineTo(0, FIELD.height);
    ctx.closePath();
    ctx.fillStyle = PALETTE.ridgeFar;
    ctx.fill();
  }

  function shadeFor(kind, x, z, h) {
    switch (kind) {
      case 'water': return h < -1 ? PALETTE.waterDeep : PALETTE.water;
      case 'sand': return PALETTE.sand;
      case 'rock': {
        const n = Math.sin(x * 0.05 + z * 0.03) * Math.cos(x * 0.021 - z * 0.017);
        return n > 0 ? '#7d7a72' : PALETTE.rock;
      }
      case 'rockLow': {
        const n = Math.sin(x * 0.05 + z * 0.03) * Math.cos(x * 0.021 - z * 0.017);
        return n > 0 ? '#7a8a62' : '#6d7a58';
      }
      case 'town': return '#b9ac93';
      case 'runway': return PALETTE.runway;
      case 'strip': return PALETTE.grassStrip;
      default: {
        const n = Math.sin(x * 0.05 + z * 0.03) * Math.cos(x * 0.021 - z * 0.017);
        if (h > 30) return n > 0 ? PALETTE.grassHigh : PALETTE.grassLow;
        return n > 0.3 ? PALETTE.meadow : n > -0.3 ? PALETTE.grassLow : PALETTE.grassHigh;
      }
    }
  }

  function drawTerrain(cam) {
    // The ground is a stack of depth rows; each row is split into lateral
    // quads coloured by what the ground is there (grass, river, town,
    // runway), so the valley reads as a place, not a flat colour.
    const sh = Math.sin(cam.heading);
    const ch = Math.cos(cam.heading);
    let depths = [];
    let d = ROW_FIRST;
    for (let i = 0; i < ROWS; i += 1) {
      depths.push(d);
      d *= ROW_RATIO;
    }
    for (let ri = depths.length - 1; ri >= 0; ri -= 1) {
      const d0 = depths[ri];
      const d1 = ri + 1 < depths.length ? depths[ri + 1] : d0 * ROW_RATIO;
      const lMax0 = d0 * 1.06 + 40;
      const lMax1 = d1 * 1.06 + 40;
      for (let si = 0; si < SEGMENTS; si += 1) {
        const f0 = -1 + (2 * si) / SEGMENTS;
        const f1 = -1 + (2 * (si + 1)) / SEGMENTS;
        const l0a = f0 * lMax0;
        const l1a = f1 * lMax0;
        const l0b = f0 * lMax1;
        const l1b = f1 * lMax1;
        const cz0 = cam.z + ch * d0;
        const cx0 = cam.x + sh * d0;
        const cz1 = cam.z + ch * d1;
        const cx1 = cam.x + sh * d1;
        const midL = ((f0 + f1) / 2) * ((lMax0 + lMax1) / 2);
        const midX = cam.x + sh * ((d0 + d1) / 2) + ch * midL;
        const midZ = cam.z + ch * ((d0 + d1) / 2) - sh * midL;
        const kind = groundKind(midX, midZ);
        const p00 = project(cam, cx0 + ch * l0a, groundHeight(cx0 + ch * l0a, cz0 - sh * l0a), cz0 - sh * l0a);
        const p10 = project(cam, cx0 + ch * l1a, groundHeight(cx0 + ch * l1a, cz0 - sh * l1a), cz0 - sh * l1a);
        const p11 = project(cam, cx1 + ch * l1b, groundHeight(cx1 + ch * l1b, cz1 - sh * l1b), cz1 - sh * l1b);
        const p01 = project(cam, cx1 + ch * l0b, groundHeight(cx1 + ch * l0b, cz1 - sh * l0b), cz1 - sh * l0b);
        if (!p00 || !p10 || !p11 || !p01) continue;
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fillStyle = shadeFor(kind, midX, midZ, groundHeight(midX, midZ));
        ctx.fill();
      }
    }
  }

  function drawRunwayMarkings(cam) {
    const r = COURSE.runway;
    const corners = [
      project(cam, r.x0, 0.15, r.z0),
      project(cam, r.x1, 0.15, r.z0),
      project(cam, r.x1, 0.15, r.z1),
      project(cam, r.x0, 0.15, r.z1),
    ];
    if (corners.some((p) => !p)) return;
    // Centreline dashes.
    ctx.strokeStyle = PALETTE.runwayMark;
    ctx.lineCap = 'butt';
    for (let z = r.z0 + 60; z < r.z1 - 40; z += 90) {
      const a = project(cam, 0, 0.2, z);
      const b = project(cam, 0, 0.2, z + 42);
      if (!a || !b) continue;
      ctx.lineWidth = Math.max(1, 3.2 * a.s);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Threshold bars at both ends.
    ctx.fillStyle = PALETTE.runwayMark;
    for (const z of [r.z0 + 18, r.z1 - 18]) {
      for (const x of [-11, -4, 4, 11]) {
        const a = project(cam, x - 2.4, 0.2, z);
        const b = project(cam, x + 2.4, 0.2, z + 26);
        if (!a || !b) continue;
        ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) || 2, Math.abs(b.y - a.y) || 2);
      }
    }
    // Edge lights: tiny amber dots down both sides.
    for (let z = r.z0 + 40; z < r.z1; z += 120) {
      for (const x of [r.x0 + 1, r.x1 - 1]) {
        const p = project(cam, x, 0.4, z);
        if (!p) continue;
        ctx.fillStyle = '#ffc93c';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, 1.6 * p.s), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawScenery(cam) {
    // Barns: red roofs by the river, drawn as small boxes.
    for (const barn of scenery.barns) {
      const dx = barn.x - cam.x;
      const dz = barn.z - cam.z;
      if (dx * dx + dz * dz > 900 * 900) continue;
      const base = project(cam, barn.x, barn.y, barn.z);
      const top = project(cam, barn.x, barn.y + barn.h, barn.z);
      if (!base || !top) continue;
      const w = Math.max(2, barn.w * base.s);
      const h = (base.y - top.y) || w * 0.6;
      ctx.fillStyle = '#a8433a';
      ctx.fillRect(base.x - w / 2, base.y - h, w, h);
      ctx.fillStyle = '#7e322b';
      ctx.beginPath();
      ctx.moveTo(base.x - w / 2 - 1, base.y - h);
      ctx.lineTo(base.x, base.y - h - w * 0.42);
      ctx.lineTo(base.x + w / 2 + 1, base.y - h);
      ctx.closePath();
      ctx.fill();
    }
    // Town houses: cream walls, terracotta roofs, only near the strip.
    for (const house of scenery.houses) {
      const dx = house.x - cam.x;
      const dz = house.z - cam.z;
      if (dx * dx + dz * dz > 1000 * 1000) continue;
      const base = project(cam, house.x, 0, house.z);
      const top = project(cam, house.x, house.h, house.z);
      if (!base || !top) continue;
      const w = Math.max(2, house.w * base.s);
      const h = Math.max(2, base.y - top.y);
      ctx.fillStyle = PALETTE.townWall;
      ctx.fillRect(base.x - w / 2, base.y - h, w, h);
      ctx.fillStyle = PALETTE.townRoof;
      ctx.beginPath();
      ctx.moveTo(base.x - w / 2 - 1, base.y - h);
      ctx.lineTo(base.x, base.y - h - w * 0.4);
      ctx.lineTo(base.x + w / 2 + 1, base.y - h);
      ctx.closePath();
      ctx.fill();
    }
    // Trees: a dark trunk line and a green triangle, cheap at distance.
    ctx.fillStyle = '#3f7031';
    for (const tree of scenery.trees) {
      const dx = tree.x - cam.x;
      const dz = tree.z - cam.z;
      if (dx * dx + dz * dz > 650 * 650) continue;
      const p = project(cam, tree.x, tree.y, tree.z);
      if (!p) continue;
      const s = tree.s * p.s;
      if (s < 1.2) continue;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s * 2.2);
      ctx.lineTo(p.x - s, p.y);
      ctx.lineTo(p.x + s, p.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawClouds(cam) {
    // Puffs sorted far to near so nearer ones overlap correctly.
    const sorted = scenery.clouds
      .map((c) => ({ c, p: project(cam, c.x, c.y, c.z) }))
      .filter((item) => item.p && item.p.dist > 10)
      .sort((a, b) => b.p.dist - a.p.dist);
    for (const { c, p } of sorted) {
      const s = c.s * p.s;
      if (s < 2) continue;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      for (const [ox, oy, r] of [[-0.9, 0.1, 0.55], [0, -0.25, 0.75], [0.9, 0.1, 0.55], [0.4, 0.25, 0.5], [-0.4, 0.25, 0.5]]) {
        ctx.beginPath();
        ctx.ellipse(p.x + ox * s, p.y + oy * s, r * s, r * s * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRings(cam, state, time) {
    COURSE.rings.forEach((ring, index) => {
      const slot = state.rings[index];
      const dist = Math.hypot(ring.x - cam.x, ring.z - cam.z);
      if (dist > 1700 || ring.z < cam.z - 80) return;
      // A ring the camera is inside projects as a giant arc across the
      // whole frame. A passed ring may go once the plane is through it;
      // the next ring stays until the plane is almost on it, so the
      // target never blinks out mid-approach.
      if (slot.passed ? dist < 60 : dist < 18) return;
      const isNext = index === state.ringIndex;
      const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 1;
      ctx.strokeStyle = slot.passed
        ? PALETTE.ringDone
        : isNext ? PALETTE.ringNext : PALETTE.ringGold;
      ctx.globalAlpha = slot.passed ? 0.35 : 0.95 * pulse;
      ctx.lineWidth = clamp(560 / Math.max(dist, 40), 3, 16);
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = isNext ? 22 : 8;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 28; i += 1) {
        const a = (i / 28) * Math.PI * 2;
        const p = project(cam, ring.x + Math.cos(a) * COURSE.ringRadius, ring.y + Math.sin(a) * COURSE.ringRadius, ring.z);
        if (!p) { started = false; continue; }
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      // The next ring's number floats above it while it is close.
      if (isNext && dist < 500) {
        const top = project(cam, ring.x, ring.y + COURSE.ringRadius + 6, ring.z);
        if (top) {
          ctx.fillStyle = '#fff8dc';
          ctx.font = `bold ${Math.max(13, Math.min(34, 20 * top.s))}px ${'system-ui, sans-serif'}`;
          ctx.textAlign = 'center';
          ctx.fillText(`RING ${index + 1}`, top.x, top.y);
        }
      }
    });
  }

  function drawPlane(cam, state, time) {
    // Chase view: the little red-and-cream prop plane, seen from behind and
    // above, banking with the roll. Its screen spot sits just below the
    // horizon so the runway and the next ring stay in view ahead of it.
    const hy = horizonY(cam);
    const px = FIELD.width / 2 - state.roll * 34;
    const py = hy + 168;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.roll * 0.9);
    const blink = Math.sin(time * 6) > 0;
    // Tailplane.
    ctx.fillStyle = PALETTE.planeCream;
    ctx.beginPath();
    ctx.moveTo(-72, -6);
    ctx.lineTo(72, -6);
    ctx.lineTo(58, 8);
    ctx.lineTo(-58, 8);
    ctx.closePath();
    ctx.fill();
    // Main wings, red on top with cream tips.
    ctx.fillStyle = PALETTE.planeRed;
    ctx.beginPath();
    ctx.moveTo(-148, 2);
    ctx.quadraticCurveTo(-150, -12, -128, -14);
    ctx.lineTo(128, -14);
    ctx.quadraticCurveTo(150, -12, 148, 2);
    ctx.lineTo(120, 10);
    ctx.lineTo(-120, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeCream;
    ctx.fillRect(-148, -4, 22, 12);
    ctx.fillRect(126, -4, 22, 12);
    // Fuselage, seen from the tail: cream body, red spine stripe.
    ctx.fillStyle = PALETTE.planeCream;
    ctx.beginPath();
    ctx.ellipse(0, 4, 30, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.planeRed;
    ctx.beginPath();
    ctx.ellipse(0, -8, 22, 34, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Fin.
    ctx.fillStyle = PALETTE.planeRed;
    ctx.beginPath();
    ctx.moveTo(-10, -26);
    ctx.lineTo(0, -72);
    ctx.lineTo(12, -26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeCream;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('7', 0, -34);
    // Nav lights: red left, green right, white strobe at the tail.
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath(); ctx.arc(-146, 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3ddc74';
    ctx.beginPath(); ctx.arc(146, 2, 4, 0, Math.PI * 2); ctx.fill();
    if (blink) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 48, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawGauge(cx, cy, r, label, value, min, max, unit) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = PALETTE.gaugeFace;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#5a6b7d';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i += 1) {
      const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
      ctx.lineTo(Math.cos(a) * (r - 10), Math.sin(a) * (r - 10));
      ctx.stroke();
    }
    const frac = clamp((value - min) / (max - min), 0, 1);
    const na = Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = PALETTE.gaugeNeedle;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(na) * (r - 12), Math.sin(na) * (r - 12));
    ctx.stroke();
    ctx.fillStyle = PALETTE.gaugeGlow;
    ctx.font = `bold ${Math.round(r * 0.34)}px ${'system-ui, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(value)), 0, r * 0.42);
    ctx.fillStyle = '#8fa3b5';
    ctx.font = `${Math.round(r * 0.22)}px system-ui, sans-serif`;
    ctx.fillText(`${label} ${unit}`, 0, r * 0.68);
    ctx.restore();
  }

  function drawCockpit(state, time) {
    // The lit panel: six glowing gauges under a glareshield, canopy pillars
    // at the edges and the nose with its spinning prop arc below.
    const panelTop = FIELD.height - 218;
    const grad = ctx.createLinearGradient(0, panelTop - 26, 0, FIELD.height);
    grad.addColorStop(0, '#2a2f36');
    grad.addColorStop(0.12, PALETTE.panel);
    grad.addColorStop(1, '#12151a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, FIELD.height);
    ctx.lineTo(0, panelTop + 40);
    ctx.quadraticCurveTo(FIELD.width / 2, panelTop - 30, FIELD.width, panelTop + 40);
    ctx.lineTo(FIELD.width, FIELD.height);
    ctx.closePath();
    ctx.fill();
    // Canopy pillars.
    ctx.fillStyle = '#14171c';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(92, 0); ctx.lineTo(30, panelTop + 30); ctx.lineTo(0, panelTop + 30);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(FIELD.width, 0); ctx.lineTo(FIELD.width - 92, 0); ctx.lineTo(FIELD.width - 30, panelTop + 30); ctx.lineTo(FIELD.width, panelTop + 30);
    ctx.closePath(); ctx.fill();
    // Nose and prop blur.
    const noseY = panelTop + 6;
    ctx.fillStyle = PALETTE.planeRed;
    ctx.beginPath();
    ctx.moveTo(FIELD.width / 2 - 70, noseY + 46);
    ctx.quadraticCurveTo(FIELD.width / 2, noseY - 26, FIELD.width / 2 + 70, noseY + 46);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(FIELD.width / 2, noseY + 4, 96, 20 + 6 * Math.sin(time * 31), 0, 0, Math.PI * 2);
    ctx.stroke();
    // Six gauges: speed, altitude, heading, horizon, fuel, vertical speed.
    const gy = FIELD.height - 108;
    const r = 46;
    const gap = 178;
    const x0 = FIELD.width / 2 - gap * 2.5;
    const knots = state.speed * 1.94;
    const feet = state.y * 3.28;
    const hdg = ((state.heading * 180 / Math.PI) % 360 + 360) % 360;
    drawGauge(x0, gy, r, 'SPEED', knots, 0, 210, 'KT');
    drawGauge(x0 + gap, gy, r, 'ALT', feet, 0, 1200, 'FT');
    drawGauge(x0 + gap * 2, gy, r, 'HDG', hdg, 0, 360, '°');
    // Artificial horizon ball.
    ctx.save();
    ctx.translate(x0 + gap * 3, gy);
    ctx.fillStyle = PALETTE.gaugeFace;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, Math.PI * 2); ctx.clip();
    ctx.rotate(-state.roll);
    ctx.translate(0, state.pitch * r * 1.4);
    ctx.fillStyle = '#5fa8dd';
    ctx.fillRect(-r, -r, r * 2, r);
    ctx.fillStyle = '#8a6b45';
    ctx.fillRect(-r, 0, r * 2, r);
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r + 8, 0); ctx.lineTo(-10, 0); ctx.moveTo(10, 0); ctx.lineTo(r - 8, 0); ctx.stroke();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#8fa3b5';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HORIZON', 0, r * 0.68);
    ctx.restore();
    drawGauge(x0 + gap * 4, gy, r, 'FUEL', state.fuel, 0, 100, '%');
    drawGauge(x0 + gap * 5, gy, r, 'V/S', state.verticalSpeed * 196, -1000, 1000, 'FPM');
  }

  function drawHud(state, screen, time, cameraMode) {
    const knots = Math.round(state.speed * 1.94);
    const feet = Math.round(state.y * 3.28);
    const hdg = Math.round(((state.heading * 180 / Math.PI) % 360 + 360) % 360);
    const target = nextTargetText(state);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Top-left instrument block: altitude, speed, heading.
    ctx.fillStyle = 'rgba(10, 16, 22, 0.55)';
    roundRect(16, 14, 268, 92, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('ALT', 30, 38);
    ctx.fillText('SPD', 30, 66);
    ctx.fillText('HDG', 30, 94);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 24px "SF Mono", Consolas, monospace';
    ctx.fillText(`${feet} FT`, 92, 40);
    ctx.fillText(`${knots} KT`, 92, 68);
    ctx.fillText(`${String(hdg).padStart(3, '0')}°`, 92, 96);
    // Compass strip across the top centre.
    const cx = FIELD.width / 2;
    ctx.fillStyle = 'rgba(10, 16, 22, 0.55)';
    roundRect(cx - 170, 14, 340, 34, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let off = -3; off <= 3; off += 1) {
      const deg = hdg + off * 15;
      const norm = ((deg % 360) + 360) % 360;
      const label = norm % 45 === 0 ? dirs[Math.round(norm / 45) % 8] : String(norm);
      ctx.globalAlpha = off === 0 ? 1 : 0.55;
      ctx.fillText(label, cx + off * 52, 37);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.ringNext;
    ctx.beginPath();
    ctx.moveTo(cx - 7, 14); ctx.lineTo(cx + 7, 14); ctx.lineTo(cx, 24);
    ctx.closePath(); ctx.fill();
    // Top-right: score, rings, best.
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(10, 16, 22, 0.55)';
    roundRect(FIELD.width - 284, 14, 268, 92, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('SCORE', FIELD.width - 190, 38);
    ctx.fillText('RINGS', FIELD.width - 190, 66);
    ctx.fillText('BEST', FIELD.width - 190, 94);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 24px "SF Mono", Consolas, monospace';
    ctx.fillText(String(state.score), FIELD.width - 30, 40);
    ctx.fillText(`${state.ringsPassed}/8`, FIELD.width - 30, 68);
    ctx.fillText(String(Math.max(state.best, state.score)), FIELD.width - 30, 96);
    // Bottom bars: in chase view they sit at the bottom corners; in the
    // cockpit the panel owns the bottom, so they move under the top blocks
    // instead of covering the gauges.
    const barY = cameraMode === 'cockpit' ? 122 : FIELD.height - 96;
    const barY2 = cameraMode === 'cockpit' ? 148 : FIELD.height - 70;
    drawBar(16, barY, 210, 16, state.fuel / 100, state.fuel < 25 ? PALETTE.hudBad : '#58d68d', `FUEL ${Math.round(state.fuel)}%`);
    drawBar(16, barY2, 210, 16, 1 - state.damage / 100, state.damage > 60 ? PALETTE.hudBad : '#7fb2dd', `HULL ${Math.max(0, 100 - Math.round(state.damage))}%`);
    // Bottom-right: throttle bar and next target (no target once the
    // sortie is over — the plane is already home or wrecked).
    drawBar(FIELD.width - 226, barY, 210, 16, state.throttle, '#ffc93c', `THR ${Math.round(state.throttle * 100)}%`);
    if (state.phase === 'play') {
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(target, FIELD.width - 16, FIELD.height - 56);
    }
    // Warnings: stall flashes, low fuel warns.
    if (state.phase === 'play' && state.speed < 34 && !state.onGround) {
      if (Math.sin(time * 10) > 0) {
        ctx.fillStyle = PALETTE.hudBad;
        ctx.font = 'bold 30px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('STALL — NOSE DOWN, THROTTLE UP', FIELD.width / 2, 150);
      }
    } else if (state.phase === 'play' && state.fuel < 20 && state.fuel > 0) {
      ctx.fillStyle = PALETTE.hudWarn;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LOW FUEL — rings refuel +4', FIELD.width / 2, 150);
    }
    // Centre message.
    if (state.messageT > 0 && state.message) {
      ctx.fillStyle = '#fff8dc';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillText(state.message, FIELD.width / 2, 196);
      ctx.shadowBlur = 0;
    }
  }

  function nextTargetText(state) {
    if (state.ringIndex < COURSE.rings.length) {
      const ring = COURSE.rings[state.ringIndex];
      const d = Math.round(Math.hypot(ring.x - state.x, ring.z - state.z));
      return `NEXT: RING ${state.ringIndex + 1} — ${d} M`;
    }
    const d = Math.round(Math.hypot(COURSE.finishZ - state.z));
    return `NEXT: LAND — ${d} M TO THE STRIP`;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBar(x, y, w, h, frac, color, label) {
    ctx.fillStyle = 'rgba(10, 16, 22, 0.55)';
    roundRect(x - 6, y - 4, w + 12, h + 8, 6);
    ctx.fill();
    ctx.fillStyle = '#2c333c';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(0, w * clamp(frac, 0, 1)), h);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText(label, x + 4, y + h - 4);
    ctx.shadowBlur = 0;
  }

  function drawScreenOverlay(state, screen, best) {
    ctx.textAlign = 'center';
    if (screen === 'title') {
      ctx.fillStyle = 'rgba(8, 14, 22, 0.45)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.fillStyle = '#fff8dc';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText('MERPATI VALLEY RUN', FIELD.width / 2, 150);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '28px system-ui, sans-serif';
      ctx.fillText('Fly the valley. Thread 8 rings. Land on the strip.', FIELD.width / 2, 196);
      ctx.font = '19px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.hudDim;
      const lines = [
        'ARROWS / WASD — bank and pitch      SHIFT / CTRL — throttle      MOUSE — steer',
        'C — chase / cockpit camera      P — pause      R — restart      M — mute',
        'Rings score +150 (dead centre +50) and refuel +4. Land gently on the strip for +500.',
      ];
      lines.forEach((line, i) => ctx.fillText(line, FIELD.width / 2, 258 + i * 30));
      if (best > 0) {
        ctx.fillStyle = PALETTE.ringNext;
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.fillText(`BEST SCORE: ${best}`, FIELD.width / 2, 372);
      }
      if (Math.sin(performance.now() / 350) > -0.2) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px system-ui, sans-serif';
        ctx.fillText('PRESS ENTER OR CLICK TO FLY', FIELD.width / 2, 430);
      }
    } else if (screen === 'paused') {
      ctx.fillStyle = 'rgba(8, 14, 22, 0.6)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = 'bold 52px system-ui, sans-serif';
      ctx.fillText('PAUSED', FIELD.width / 2, 330);
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText('P to resume — R to restart the sortie', FIELD.width / 2, 380);
    } else if (screen === 'landed') {
      ctx.fillStyle = 'rgba(8, 30, 16, 0.55)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.fillStyle = '#b8f5c8';
      ctx.font = 'bold 56px system-ui, sans-serif';
      ctx.fillText('LANDED — WELCOME HOME', FIELD.width / 2, 210);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '24px system-ui, sans-serif';
      const rows = [
        `Rings flown: ${state.ringsPassed}/8`,
        `Landing: +${500}   Time bonus: +${state.timeBonus}   Fuel bonus: +${state.fuelBonus}`,
        `Flight time: ${Math.round(state.time)} s`,
        `TOTAL SCORE: ${state.score}   —   BEST: ${Math.max(best, state.score)}`,
      ];
      rows.forEach((row, i) => ctx.fillText(row, FIELD.width / 2, 280 + i * 40));
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText('PRESS R TO FLY AGAIN', FIELD.width / 2, 470);
    } else if (screen === 'crashed') {
      ctx.fillStyle = 'rgba(30, 8, 8, 0.5)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.fillStyle = '#ffb3ad';
      ctx.font = 'bold 56px system-ui, sans-serif';
      ctx.fillText('CRASHED', FIELD.width / 2, 230);
      ctx.fillStyle = PALETTE.hudText;
      ctx.font = '26px system-ui, sans-serif';
      ctx.fillText(state.crashReason, FIELD.width / 2, 286);
      ctx.font = '24px system-ui, sans-serif';
      ctx.fillText(`Score: ${state.score}   —   Rings: ${state.ringsPassed}/8`, FIELD.width / 2, 340);
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText('PRESS R TO TRY AGAIN', FIELD.width / 2, 410);
    }
  }

  function spawnExplosion(x, y, z) {
    for (let i = 0; i < 46; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      particles.push({
        x, y, z,
        vx: Math.cos(a) * Math.cos(b) * (6 + Math.random() * 22),
        vy: Math.sin(b) * (6 + Math.random() * 20) + 6,
        vz: Math.sin(a) * Math.cos(b) * (6 + Math.random() * 22),
        life: 0, maxLife: 0.9 + Math.random() * 0.9,
        size: 2 + Math.random() * 5,
        color: Math.random() < 0.5 ? '#ff7a2e' : '#5a5a5a',
      });
    }
  }

  function spawnRingBurst(x, y, z) {
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * Math.PI * 2;
      particles.push({
        x, y, z,
        vx: Math.cos(a) * 14, vy: Math.sin(a) * 14, vz: 0,
        life: 0, maxLife: 0.7,
        size: 2.5,
        color: '#ffd94d',
      });
    }
  }

  function updateParticles(cam, dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 4 * dt;
      const q = project(cam, p.x, p.y, p.z);
      if (!q) continue;
      ctx.globalAlpha = 1 - p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, Math.max(1, p.size * q.s), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Paint one frame. `screen` is title / play / paused / landed / crashed. */
  function draw(state, screen, best, cameraMode, time, dt) {
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);
    updateCamera(state, dt);
    const cam = camera();
    drawSky(cam, time);
    drawFarRidge(cam);
    drawTerrain(cam);
    drawRunwayMarkings(cam);
    drawScenery(cam);
    drawRings(cam, state, time);
    drawClouds(cam);
    if (state.phase === 'crashed') {
      updateParticles(cam, dt);
    } else {
      updateParticles(cam, dt);
      if (state.damage > 0 && state.phase === 'play' && state.speed > 5) {
        smokeT -= dt;
        if (smokeT <= 0) {
          smokeT = 0.12;
          particles.push({
            x: state.x, y: state.y + 0.5, z: state.z,
            vx: (Math.random() - 0.5) * 2, vy: 2, vz: -4,
            life: 0, maxLife: 1.1, size: 4, color: '#3a3a3a',
          });
        }
      }
    }
    if (cameraMode === 'cockpit') drawCockpit(state, time);
    else drawPlane(cam, state, time);
    if (screen !== 'title') drawHud(state, screen, time, cameraMode);
    drawScreenOverlay(state, screen, best);
  }

  return { draw, spawnExplosion, spawnRingBurst, project };
}
