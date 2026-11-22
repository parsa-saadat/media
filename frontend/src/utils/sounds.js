/**
 * Interface sounds generated with the Web Audio API — no audio files to ship, and every sound can be
 * switched off in Settings. Browsers require a user gesture before audio may play, so the context is
 * created lazily on the first interaction.
 */

const STORE_KEY = "voxsy-sounds";
let enabled = true;
try {
  enabled = localStorage.getItem(STORE_KEY) !== "off";
} catch {
  /* storage blocked → keep sounds on */
}

let ctx = null;
function audio() {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export const soundsEnabled = () => enabled;
export function setSoundsEnabled(on) {
  enabled = on;
  try {
    localStorage.setItem(STORE_KEY, on ? "on" : "off");
  } catch {
    /* not remembered */
  }
}

/** One short note. */
function tone(at, freq, duration, gain, type = "sine") {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** Rising/falling two-note patterns, the way calling apps signal state changes. */
const PATTERNS = {
  ring: [
    { at: 0, f: 660, d: 0.22, g: 0.16 },
    { at: 0.26, f: 880, d: 0.26, g: 0.16 },
    { at: 0.62, f: 660, d: 0.22, g: 0.13 },
    { at: 0.88, f: 880, d: 0.3, g: 0.13 },
  ],
  connect: [
    { at: 0, f: 523, d: 0.12, g: 0.14 },
    { at: 0.11, f: 784, d: 0.2, g: 0.14 },
  ],
  join: [{ at: 0, f: 587, d: 0.16, g: 0.12 }],
  leave: [
    { at: 0, f: 523, d: 0.14, g: 0.12 },
    { at: 0.12, f: 330, d: 0.24, g: 0.12 },
  ],
  message: [
    { at: 0, f: 880, d: 0.09, g: 0.07, t: "triangle" },
    { at: 0.07, f: 1174, d: 0.11, g: 0.06, t: "triangle" },
  ],
  send: [{ at: 0, f: 698, d: 0.09, g: 0.06, t: "triangle" }],
  error: [
    { at: 0, f: 300, d: 0.16, g: 0.12, t: "sawtooth" },
    { at: 0.14, f: 220, d: 0.2, g: 0.1, t: "sawtooth" },
  ],
  knock: [
    { at: 0, f: 200, d: 0.09, g: 0.18, t: "square" },
    { at: 0.14, f: 200, d: 0.09, g: 0.16, t: "square" },
  ],
};

export function playSound(name) {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + 0.01;
  for (const p of PATTERNS[name]) tone(t0 + p.at, p.f, p.d, p.g, p.t);
}

/** Rings repeatedly (incoming call) until `stop()` is called. */
export function startRinging(intervalMs = 1600) {
  if (!enabled) return () => {};
  playSound("ring");
  const t = window.setInterval(() => playSound("ring"), intervalMs);
  return () => window.clearInterval(t);
}
