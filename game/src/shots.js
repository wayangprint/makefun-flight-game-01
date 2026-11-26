// Screenshot scenes: each one plays the real rules forward from a fresh
// sortie for a fixed number of steps, steered by an autopilot that flies
// the same controls a player has (bank, pitch, throttle), so the frame is
// what a short game really looks like and the same seed always gives the
// same frame. The end scene's pilot flares onto the strip and lands.
import { COURSE, STEP } from './config.js';
import {
  EVENT_CRASHED,
  EVENT_LANDED,
  PHASE_LANDED,
  stepFlight,
} from './flight.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 34;
const RING_SECONDS = 62;
const END_LIMIT_SECONDS = 240;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/**
 * The autopilot: line-following, not point-chasing. It steers along the
 * segment from the last ring to the next (then ring 8 to the touchdown
 * point), correcting the cross-track error with a lookahead — aiming
 * straight at a ring makes the wanted heading swing to ninety degrees
 * as the plane draws level with it, which is what used to throw the
 * sortie into a zigzag. Altitude follows the same segment.
 */
export function autopilotControl(state) {
  const rings = COURSE.rings;
  let prev;
  let next;
  if (state.ringIndex < rings.length) {
    prev = state.ringIndex === 0
      ? { x: COURSE.startX, y: 55, z: COURSE.startZ }
      : rings[state.ringIndex - 1];
    next = rings[state.ringIndex];
  } else {
    prev = rings[rings.length - 1];
    next = { x: 0, y: 0.6, z: COURSE.finishZ };
  }
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const segLen = Math.max(1, Math.hypot(dx, dz));
  const courseHeading = Math.atan2(dx, dz);
  const rx = state.x - prev.x;
  const rz = state.z - prev.z;
  const along = (rx * dx + rz * dz) / segLen;
  const cross = (rx * dz - rz * dx) / segLen;
  const desiredHeading = courseHeading - Math.atan2(cross, 130);
  const headingError = wrapAngle(desiredHeading - state.heading);
  // Damped pursuit: steer hard at the error, but bleed off the bank we
  // already hold, so the nose stops swinging past the target line.
  const roll = clamp(headingError * 2.4 - state.roll * 0.9, -0.95, 0.95);
  const progress = clamp(along / segLen, 0, 1);
  let targetY = prev.y + (next.y - prev.y) * progress;
  let throttle = state.ringIndex >= 6 ? 0.6 : 0.68;
  if (state.ringIndex >= rings.length) {
    // Cut the throttle once the wheels are down, so the rollout brakes.
    throttle = state.onGround ? 0.05 : state.z > 5000 ? 0.28 : 0.45;
    // Ride the glide a touch high so the touchdown is gentle.
    targetY = Math.max(targetY, 0.6 + Math.max(0, COURSE.finishZ - state.z) * 0.04);
  }
  const altError = targetY - state.y;
  // On final, never dive steeply: a descent faster than -7 m/s on touchdown
  // breaks the gear, so the glide stays gentle whatever the error is.
  const pitchMin = state.ringIndex >= rings.length ? -0.18 : -0.35;
  const pitchGain = state.ringIndex >= rings.length ? 0.05 : 0.03;
  let pitch = clamp(altError * pitchGain, pitchMin, 0.4);
  if (state.ringIndex >= rings.length && state.z > 4900 && !state.onGround) {
    // Staged descent over the strip itself: a proportional controller alone
    // levels off a metre above the ground and runs out of runway, so the
    // last stretch commands the descent directly, then flares at 1.2 m.
    pitch = state.y > 3 ? -0.22 : state.y > 0.8 ? -0.1 : -0.05;
  }
  // Speed guard: below 40 m/s in the air, trade altitude for speed, never
  // the reverse. It stays off on the ground, or it would throttle the
  // plane back up during its landing rollout.
  if (state.speed < 40 && !state.onGround) {
    throttle = Math.max(throttle, 0.8);
    pitch = Math.min(pitch, -0.05);
  }
  return { roll, pitch, throttle, throttleDelta: 0 };
}

function flyFor(state, seconds, controlFn) {
  let events = 0;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    events |= stepFlight(state, controlFn(state), STEP);
    if (events & (EVENT_CRASHED | EVENT_LANDED)) break;
    if (state.phase !== 'play') break;
  }
  return events;
}

/**
 * Set `state` to the named scene (start, play, ring or end) and return the
 * screen to draw over it.
 */
export function stageShot(name, state) {
  state.phase = 'play';
  state.message = '';
  state.messageT = 0;
  if (name === 'start') {
    // Parked on the grass strip, engine idling, runway of the valley ahead.
    state.phase = 'title';
    state.throttle = 0.25;
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      state.time += STEP;
    }
    return { screen: 'title' };
  }
  if (name === 'play') {
    state.throttle = 0.7;
    flyFor(state, PLAY_SECONDS, autopilotControl);
    return { screen: state.phase === PHASE_LANDED ? 'landed' : state.phase };
  }
  if (name === 'ring') {
    state.throttle = 0.7;
    flyFor(state, RING_SECONDS, autopilotControl);
    return { screen: state.phase === PHASE_LANDED ? 'landed' : state.phase };
  }
  // end: fly the whole course and land.
  state.throttle = 0.7;
  const events = flyFor(state, END_LIMIT_SECONDS, autopilotControl);
  if (events & EVENT_LANDED || state.phase === PHASE_LANDED) return { screen: 'landed' };
  return { screen: state.phase };
}
