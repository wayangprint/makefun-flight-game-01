// Keyboard and mouse, both steering the same control shape the flight
// model eats: roll and pitch in -1..1, throttle as a set value or a nudge.
// Arrow keys / WASD fly; Shift / Ctrl work the throttle; the mouse steers
// toward the pointer; wheel trims the throttle. Enter starts, R restarts,
// P pauses, C swaps the camera, M mutes.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_CAMERA = 8;
export const ACTION_MUTE = 16;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseActive = false;
  let mouseT = -10;
  let wheelDelta = 0;

  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyR') actions |= ACTION_RESTART;
    if (event.code === 'KeyC') actions |= ACTION_CAMERA;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / rect.width - 0.5;
    mouseY = (event.clientY - rect.top) / rect.height - 0.5;
    mouseActive = true;
    mouseT = performance.now();
  }
  function onWheel(event) {
    event.preventDefault();
    wheelDelta += event.deltaY < 0 ? 0.08 : -0.08;
  }
  function onBlur() {
    keys.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mouseleave', () => { mouseActive = false; });

  /** Actions pressed since the last read; reading clears them. */
  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  /** The pilot's control for this frame: keyboard first, mouse when moved. */
  function control() {
    let roll = 0;
    let pitch = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) pitch -= 1;
    let throttleDelta = 0;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) throttleDelta += 1;
    if (keys.has('ControlLeft') || keys.has('ControlRight')) throttleDelta -= 1;
    // Mouse steering only while the pointer is fresh (under 1.5 s old) and no
    // arrow key is held, so the two never fight each other.
    const mouseFresh = mouseActive && performance.now() - mouseT < 1500;
    if (mouseFresh && roll === 0 && pitch === 0) {
      roll = Math.max(-1, Math.min(1, mouseX * 2.4));
      pitch = Math.max(-1, Math.min(1, -mouseY * 2.2));
    }
    const wheel = wheelDelta;
    wheelDelta = 0;
    return { roll, pitch, throttle: null, throttleDelta, wheel };
  }

  return { takeActions, control };
}
