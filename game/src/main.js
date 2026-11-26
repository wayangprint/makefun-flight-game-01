// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens:
// title, play, paused, landed and crashed.
//
// ?seed=N fixes the valley's scenery. ?shot=start|play|ring|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildScenery } from './terrain.js';
import {
  EVENT_CRASHED,
  EVENT_LANDED,
  EVENT_RING,
  PHASE_CRASHED,
  PHASE_LANDED,
  PHASE_PAUSED,
  PHASE_PLAY,
  PHASE_TITLE,
  createState,
  showMessage,
  stepFlight,
} from './flight.js';
import { ACTION_CAMERA, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const camParam = params.get('cam');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const scenery = buildScenery(createRandom(seed));
const state = createState();
const renderer = createRenderer(canvas, scenery);
const audio = createAudio();

let cameraMode = camParam === 'cockpit' ? 'cockpit' : 'chase';
let screen = PHASE_TITLE;
let best = readBest();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts one visit.
  }
}

function runShot(name) {
  const scene = stageShot(name, state);
  screen = scene.screen;
  state.best = best;
  let painted = 0;
  let time = 0;
  function paint() {
    renderer.draw(state, screen, best, cameraMode, time, STEP);
    time += STEP;
    painted += 1;
    // The chase camera eases toward the plane; give it a second to settle
    // behind the aircraft, or the frame is shot from a kilometre back.
    if (painted < 60) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();
  let elapsed = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    const fresh = createState();
    Object.assign(state, fresh);
    state.best = best;
    state.phase = PHASE_PLAY;
    accumulator = 0;
    screen = PHASE_PLAY;
    audio.unlock();
    showMessage(state, 'Throttle up — lift off past 38 kt!', 4);
    announce('Playing. Fly the rings, then land on the strip.');
  }

  function endGame() {
    if (state.score > best) {
      best = state.score;
      saveBest(best);
    }
    announce(state.phase === PHASE_LANDED
      ? `Landed. Score ${state.score}. Best ${best}.`
      : `Crashed. ${state.crashReason}. Score ${state.score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CAMERA) {
      cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
      announce(cameraMode === 'cockpit' ? 'Cockpit camera.' : 'Chase camera.');
    }
    if (actions & ACTION_CONFIRM && (screen === PHASE_TITLE || screen === PHASE_LANDED || screen === PHASE_CRASHED)) {
      startGame();
    } else if (actions & ACTION_RESTART && screen !== PHASE_TITLE) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === PHASE_PLAY) {
      screen = PHASE_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === PHASE_PAUSED) {
      screen = PHASE_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === PHASE_TITLE) return;
    const control = input.control();
    if (control.wheel) {
      state.throttle = Math.max(0, Math.min(1, state.throttle + control.wheel));
    }
    const events = stepFlight(state, control, STEP);
    if (events & EVENT_RING) {
      audio.ring();
      renderer.spawnRingBurst(state.x, state.y, state.z);
    }
    if (events & EVENT_LANDED) {
      audio.thud();
      endGame();
      screen = PHASE_LANDED;
    }
    if (events & EVENT_CRASHED) {
      audio.crash();
      renderer.spawnExplosion(state.x, state.y + 1, state.z);
      endGame();
      screen = PHASE_CRASHED;
    }
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    elapsed += dt;
    handleActions();
    if (screen === PHASE_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== PHASE_PLAY) {
          accumulator = 0;
          break;
        }
      }
    }
    if (state.phase === PHASE_CRASHED) state.crashT += dt;
    audio.setEngine(state.throttle, screen === PHASE_PLAY);
    state.best = best;
    renderer.draw(state, screen, best, cameraMode, elapsed, dt);
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('click', () => {
    if (screen === PHASE_TITLE || screen === PHASE_LANDED || screen === PHASE_CRASHED) startGame();
    else audio.unlock();
  });
  // A read-only handle for play-testing and screenshots (no network, no
  // writes): inspectors can watch the live state from the console.
  window.__merpati = { state, screen: () => screen, cameraMode: () => cameraMode };
  state.best = best;
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
