// Merpati Valley Run — the flight model. Fixed-step only: this file never
// touches the canvas, the clock or the network, so the same inputs always
// fly the same sortie. Phases: title, play, paused, landed, crashed.
import { COURSE, PLANE, SCORE, STEP } from './config.js';
import { groundHeight, groundKind, onGrassStrip, onRunway } from './terrain.js';

export const PHASE_TITLE = 'title';
export const PHASE_PLAY = 'play';
export const PHASE_PAUSED = 'paused';
export const PHASE_LANDED = 'landed';
export const PHASE_CRASHED = 'crashed';

const EVENT_RING = 1;
const EVENT_LANDED = 2;
const EVENT_CRASHED = 4;
const EVENT_MISSED = 8;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/** A fresh sortie, parked on the grass strip with the engine off. */
export function createState() {
  return {
    phase: PHASE_TITLE,
    x: COURSE.startX,
    y: COURSE.startY,
    z: COURSE.startZ,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: PLANE.fuel,
    damage: 0,
    score: 0,
    time: 0,
    verticalSpeed: 0,
    onGround: true,
    ringIndex: 0,
    rings: COURSE.rings.map(() => ({ passed: false, centre: false, missed: false })),
    ringsPassed: 0,
    message: '',
    messageT: 0,
    crashReason: '',
    crashT: 0,
    timeBonus: 0,
    fuelBonus: 0,
    best: 0,
  };
}

/** Where the pilot should aim next: the next ring, then the runway. */
export function nextTarget(state) {
  if (state.ringIndex < COURSE.rings.length) {
    const ring = COURSE.rings[state.ringIndex];
    return { x: ring.x, y: ring.y, z: ring.z, label: `RING ${state.ringIndex + 1}/8` };
  }
  return { x: 0, y: 6, z: COURSE.finishZ, label: 'LAND ON THE STRIP' };
}

export function showMessage(state, text, seconds = 3) {
  state.message = text;
  state.messageT = seconds;
}

/**
 * One fixed step. `control` is { roll, pitch, throttle, throttleDelta } with
 * roll/pitch in -1..1, throttle 0..1 (null keeps it) and throttleDelta -1..1.
 * Returns a bitmask of events for sound and announcements.
 */
export function stepFlight(state, control, dt = STEP) {
  if (state.phase !== PHASE_PLAY) return 0;
  let events = 0;
  state.time += dt;
  if (state.messageT > 0) state.messageT -= dt;

  // Throttle: a set value is approached smoothly; otherwise nudge it.
  if (control.throttle !== null && control.throttle !== undefined) {
    const diff = control.throttle - state.throttle;
    const rate = PLANE.throttleRate * dt;
    state.throttle += clamp(diff, -rate, rate);
  } else if (control.throttleDelta) {
    state.throttle = clamp(state.throttle + control.throttleDelta * PLANE.throttleRate * dt, 0, 1);
  }
  if (state.fuel <= 0) state.throttle = 0;
  state.fuel = Math.max(0, state.fuel - (PLANE.fuelBurnBase + state.throttle * PLANE.fuelBurnThrottle) * dt);

  // Handling goes mushy below stall speed — the plane answers late and sinks.
  const effectiveness = clamp((state.speed - 8) / PLANE.stallSpeed, 0.15, 1);
  const rollTarget = control.roll * PLANE.maxRoll;
  const rollDiff = rollTarget - state.roll;
  state.roll += clamp(rollDiff, -PLANE.rollRate * dt, PLANE.rollRate * dt);
  // Only level out when the stick is truly centred: a small commanded bank
  // is a real command, and the old 0.05 dead zone used to eat it.
  if (Math.abs(control.roll) < 0.005) {
    state.roll -= clamp(state.roll, -1.4 * dt, 1.4 * dt);
  }
  const pitchTarget = control.pitch * PLANE.maxPitch;
  const pitchDiff = pitchTarget - state.pitch;
  state.pitch += clamp(pitchDiff, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
  if (Math.abs(control.pitch) < 0.005) {
    state.pitch -= clamp(state.pitch, -0.8 * dt, 0.8 * dt);
  }

  // Banked turn: the steeper the bank, the faster the heading swings.
  state.heading += (PLANE.turnGain * Math.tan(state.roll) / Math.max(state.speed, 20)) * dt * effectiveness;
  state.heading = wrapAngle(state.heading);

  // Speed chases the throttle; climbing bleeds it, diving gains it.
  const targetSpeed = PLANE.baseSpeed + state.throttle * PLANE.speedPerThrottle;
  state.speed += ((targetSpeed - state.speed) * 0.3 - Math.sin(state.pitch) * 16) * dt;
  if (state.onGround) {
    // Rolling resistance, and real braking once the throttle is right back:
    // without it a landing rollout eats the whole strip and runs off the end.
    state.speed -= state.speed * (state.throttle < 0.35 ? 1.4 : 0.12) * dt;
  }
  state.speed = clamp(state.speed, 0, PLANE.maxSpeed);

  // Climb and sink.
  let vy = state.speed * Math.sin(state.pitch);
  if (state.speed < PLANE.stallSpeed) vy -= (PLANE.stallSpeed - state.speed) * 0.55;
  if (state.onGround) vy = 0;
  state.verticalSpeed = vy;

  const prevZ = state.z;
  const forward = Math.cos(state.pitch);
  state.x += Math.sin(state.heading) * state.speed * forward * dt;
  state.z += Math.cos(state.heading) * state.speed * forward * dt;
  state.y += vy * dt;

  // Lift-off: enough speed and a touch of back stick leaves the strip.
  if (state.onGround && state.speed > 38 && state.pitch > 0.04) {
    state.onGround = false;
    state.y = groundHeight(state.x, state.z) + 1.2;
  }

  // Valley edge: the mountains turn the pilot back, gently.
  if (Math.abs(state.x) > 950) {
    state.x = clamp(state.x, -950, 950);
    state.heading += (state.x > 0 ? -1 : 1) * 0.4 * dt;
    showMessage(state, 'Valley edge — turn back!', 1.5);
  }

  // Rings: crossing the ring's plane inside its circle scores.
  if (state.ringIndex < COURSE.rings.length) {
    const ring = COURSE.rings[state.ringIndex];
    if (prevZ < ring.z && state.z >= ring.z) {
      const dx = state.x - ring.x;
      const dy = state.y - ring.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const slot = state.rings[state.ringIndex];
      if (dist < COURSE.ringRadius) {
        slot.passed = true;
        slot.centre = dist < COURSE.ringCentreBonus;
        state.ringsPassed += 1;
        state.score += PLANE.ringPoints + (slot.centre ? PLANE.centreBonus : 0);
        state.fuel = Math.min(PLANE.fuel, state.fuel + PLANE.ringFuel);
        showMessage(state, slot.centre
          ? `RING ${state.ringIndex + 1} — DEAD CENTRE! +${PLANE.ringPoints + PLANE.centreBonus}`
          : `RING ${state.ringIndex + 1} — +${PLANE.ringPoints}  (fuel +${PLANE.ringFuel})`, 2.5);
        events |= EVENT_RING;
      } else {
        slot.missed = true;
        showMessage(state, `Ring ${state.ringIndex + 1} missed — keep flying`, 2.5);
        events |= EVENT_MISSED;
      }
      state.ringIndex += 1;
      if (state.ringIndex === COURSE.rings.length) {
        showMessage(state, 'All rings done — land on the strip ahead!', 4);
      }
    }
  }

  // Ground contact.
  const ground = groundHeight(state.x, state.z);
  if (state.y <= ground + 0.6) {
    const kind = groundKind(state.x, state.z);
    const strip = onRunway(state.x, state.z) || onGrassStrip(state.x, state.z);
    if (!strip) {
      return crash(state, kind === 'water' ? 'Ditched in the water' : 'Flew into the terrain');
    }
    if (state.verticalSpeed < -7) {
      state.damage += 45;
      return crash(state, 'Hard landing — the gear gave way');
    }
    state.y = ground + 0.6;
    state.onGround = true;
    state.pitch *= 0.6;
    state.roll *= 0.6;
    if (onRunway(state.x, state.z) && state.speed < 12 && state.ringIndex >= COURSE.rings.length) {
      state.phase = PHASE_LANDED;
      state.timeBonus = Math.max(0, Math.round((SCORE.timePar - state.time) * SCORE.timeBonusPerSecond));
      state.fuelBonus = Math.round(state.fuel * SCORE.fuelBonusPerUnit);
      state.score += PLANE.landingPoints + state.timeBonus + state.fuelBonus;
      events |= EVENT_LANDED;
      return events;
    }
    if (onRunway(state.x, state.z) && state.ringIndex < COURSE.rings.length) {
      showMessage(state, 'On the runway — take off and finish the rings!', 3);
    }
  }

  // Fuel out over the valley: a glide, then whatever the ground decides.
  if (state.fuel <= 0 && state.speed < 12 && !state.onGround && state.y < ground + 20) {
    showMessage(state, 'Out of fuel — gliding!', 2);
  }
  return events;
}

function crash(state, reason) {
  state.phase = PHASE_CRASHED;
  state.crashReason = reason;
  state.crashT = 0;
  state.speed = 0;
  return EVENT_CRASHED;
}

export { EVENT_RING, EVENT_LANDED, EVENT_CRASHED, EVENT_MISSED };
