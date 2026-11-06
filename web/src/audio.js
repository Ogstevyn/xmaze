// Background music via the Web Audio API — a calm looping pentatonic phrase,
// synthesised live, no asset file. Must be started from a user gesture
// (browsers block autoplay), so call start() on the first click/tap.

const MELODY_HZ = [261.63, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66, 261.63];
const NOTE_SECS = 0.5;

let ctx = null;
let gain = null;
let timer = null;
let muted = false;

export function start() {
  if (ctx) return; // already running
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  ctx = new AudioCtx();
  gain = ctx.createGain();
  gain.gain.value = 0.18;
  gain.connect(ctx.destination);
  let i = 0;
  const playNext = () => {
    if (!muted) playNote(MELODY_HZ[i % MELODY_HZ.length]);
    i++;
  };
  playNext();
  timer = setInterval(playNext, NOTE_SECS * 1000);
}

function playNote(freq) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const pad = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  pad.type = "sine";
  osc.frequency.value = freq;
  pad.frequency.value = freq / 2;
  // soft attack/release so notes don't click
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(1, now + 0.05);
  env.gain.linearRampToValueAtTime(0, now + NOTE_SECS);
  osc.connect(env);
  pad.connect(env);
  env.connect(gain);
  osc.start(now);
  pad.start(now);
  osc.stop(now + NOTE_SECS);
  pad.stop(now + NOTE_SECS);
}

export function toggleMute() {
  muted = !muted;
  if (gain) gain.gain.value = muted ? 0 : 0.18;
  return muted;
}

// --- sound effects -------------------------------------------------------

// A short blip. `up` rises in pitch (satisfying "whoosh out"); otherwise a low
// thud for a blocked tap.
function blip(freq, dur, type, vol, slideTo) {
  if (!ctx || muted) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
  env.gain.setValueAtTime(vol, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur);
}

export function sfxLeave() {
  blip(420, 0.16, "triangle", 0.25, 900); // rising whoosh as the arrow flies off
}
export function sfxBlocked() {
  blip(150, 0.12, "sawtooth", 0.2, 90); // low thud
}
export function sfxWin() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, "triangle", 0.22), i * 90));
}
