// Tiny WebAudio sound: an engine hum whose pitch follows the throttle, a
// chime for a ring, a thud for a touchdown and a low boom for a crash. No
// audio files, no network — every sound is an oscillator, made on the fly.
export function createAudio() {
  let context = null;
  let engine = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (context) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
      engine = context.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 55;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engine.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(context.destination);
      engine.start();
    } catch {
      context = null;
    }
    return context;
  }

  /** Call from a user gesture (start key / click) so the browser allows it. */
  function unlock() {
    const ctx = ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /** Engine drone follows throttle (0..1) and whether the sortie is live. */
  function setEngine(throttle, flying) {
    if (!context || muted) {
      if (engineGain) engineGain.gain.value = 0;
      return;
    }
    const target = flying ? 0.02 + throttle * 0.05 : 0;
    engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
    engine.frequency.setTargetAtTime(48 + throttle * 70, context.currentTime, 0.1);
  }

  function blip(frequency, seconds, type, volume) {
    const ctx = ensure();
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  function ring() {
    blip(880, 0.35, 'sine', 0.16);
    setTimeout(() => blip(1318, 0.4, 'sine', 0.12), 90);
  }
  function thud() {
    blip(90, 0.25, 'triangle', 0.25);
  }
  function crash() {
    blip(55, 0.8, 'sawtooth', 0.3);
    setTimeout(() => blip(38, 1.1, 'sawtooth', 0.22), 120);
  }
  function toggleMute() {
    muted = !muted;
    if (engineGain) engineGain.gain.value = 0;
    return muted;
  }

  return { unlock, setEngine, ring, thud, crash, toggleMute };
}
