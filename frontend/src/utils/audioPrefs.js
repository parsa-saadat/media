/**
 * Shared studio-grade microphone & audio processing engine for inebuly.
 *
 * Persists user audio preferences in `voxsy-voice-settings` and broadcasts live changes via
 * `inebuly:audio-prefs` so App Settings, Meet, Voice Room, and Chat Voice Notes stay 100% synced
 * in real time without page reloads or re-joining calls.
 *
 * Features:
 * 1. Subtle DSP Noise Suppressor (`noiseSuppressor`):
 *    - Browser WebRTC `noiseSuppression` + `echoCancellation` + `autoGainControl`
 *    - Gentle WebAudio clean-voice chain:
 *      • 85 Hz Butterworth high-pass filter (removes AC hum, desk bumps, low fan rumble)
 *      • 180 Hz subtle mud-cut peaking filter (-1.5 dB)
 *      • 3.2 kHz subtle speech-clarity presence lift (+1.5 dB)
 *      • 7.8 kHz smooth low-pass roll-off (removes high-frequency mic hiss / coil whine)
 *      • Gentle soft-knee compressor so loud peaks don't clip while keeping natural voice warmth
 * 2. Voice Activation Threshold / Noise Gate (`vadEnabled` + `vadThreshold` 0–80%):
 *    - Real-time RMS envelope follower with hysteresis + ~280ms hold time + smooth exponential
 *      gain transitions (~14ms attack, ~110ms release) so outgoing audio is completely silent
 *      (`gateGain = 0`) below the user's threshold and opens seamlessly as soon as they speak!
 */

const STORAGE_KEY = "voxsy-voice-settings";
export const AUDIO_PREFS_EVENT = "inebuly:audio-prefs";

export const DEFAULT_AUDIO_PREFS = {
  inputId: "",
  outputId: "",
  master: 100,
  micGain: 100,
  noiseSuppressor: true, // Subtle WebAudio + WebRTC noise suppressor (default ON)
  echoCancellation: true,
  autoGainControl: true,
  vadEnabled: false, // Voice gate ("صدا از این حد بیشتر شد برای بقیه بره")
  vadThreshold: 18, // 0..80 (%)
  volumes: {},
};

export function readAudioPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      ...DEFAULT_AUDIO_PREFS,
      ...raw,
      master: Number.isFinite(Number(raw.master)) ? Math.min(100, Math.max(0, Number(raw.master))) : 100,
      micGain: Number.isFinite(Number(raw.micGain)) ? Math.min(200, Math.max(0, Number(raw.micGain))) : 100,
      noiseSuppressor: raw.noiseSuppressor !== undefined ? Boolean(raw.noiseSuppressor) : true,
      echoCancellation: raw.echoCancellation !== undefined ? Boolean(raw.echoCancellation) : true,
      autoGainControl: raw.autoGainControl !== undefined ? Boolean(raw.autoGainControl) : true,
      vadEnabled: Boolean(raw.vadEnabled),
      vadThreshold: Number.isFinite(Number(raw.vadThreshold))
        ? Math.min(80, Math.max(2, Math.round(Number(raw.vadThreshold))))
        : 18,
      volumes: raw.volumes && typeof raw.volumes === "object" ? raw.volumes : {},
    };
  } catch {
    return { ...DEFAULT_AUDIO_PREFS, volumes: {} };
  }
}

export function saveAudioPrefs(patchOrUpdater, sourceId = "") {
  const prev = readAudioPrefs();
  const patch = typeof patchOrUpdater === "function" ? patchOrUpdater(prev) : patchOrUpdater;
  const next = {
    ...prev,
    ...patch,
    volumes: patch?.volumes ? { ...patch.volumes } : prev.volumes,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUDIO_PREFS_EVENT, { detail: { prefs: next, sourceId } }));
  }
  return next;
}

export function subscribeAudioPrefs(listener) {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e) => {
    if (e?.detail?.prefs) listener(e.detail.prefs, e.detail.sourceId || "");
    else listener(readAudioPrefs(), "");
  };
  const onStorage = (e) => {
    if (e.key === STORAGE_KEY) listener(readAudioPrefs(), "storage");
  };
  window.addEventListener(AUDIO_PREFS_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AUDIO_PREFS_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

/** Builds MediaTrackConstraints for `getUserMedia({ audio })` from current audio preferences. */
export function buildMicConstraints(prefs, overrideDeviceId) {
  const p = prefs || readAudioPrefs();
  const id = overrideDeviceId !== undefined ? overrideDeviceId : p.inputId;
  return {
    ...(id ? { deviceId: { ideal: id } } : {}),
    echoCancellation: Boolean(p.echoCancellation),
    noiseSuppression: Boolean(p.noiseSuppressor),
    autoGainControl: Boolean(p.autoGainControl),
  };
}

/**
 * Creates a live WebAudio microphone processing pipeline on top of a raw `MediaStream`.
 *
 * Signal flow:
 *   rawStream -> source -> [analyser (pre-gate RMS level)]
 *                       -> highpass (85Hz) -> mudCut (180Hz) -> presence (3.2kHz) -> lowpass (7.8kHz) -> compressor
 *                       -> gateGain (VAD threshold gate) -> userGain (micGain %) -> destination
 *
 * Calling `pipeline.updatePrefs(nextPrefs)` updates filter frequencies, compressor, micGain, and
 * VAD threshold instantaneously in-place with zero audio glitches!
 */
export function createMicAudioPipeline(rawStream, initialPrefs, { onLevel } = {}) {
  const Ctx = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!Ctx) {
    return {
      context: null,
      outputStream: rawStream,
      outputTrack: rawStream.getAudioTracks()[0] || null,
      updatePrefs: () => {},
      isGateOpen: () => true,
      close: () => {},
    };
  }

  const ctx = new Ctx();
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});

  const source = ctx.createMediaStreamSource(rawStream);

  // Pre-gate analyser so user always sees their true live input level vs. threshold marker!
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.55;
  source.connect(analyser);

  // Subtle clean-voice noise filter nodes
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.Q.value = 0.707;

  const mudCut = ctx.createBiquadFilter();
  mudCut.type = "peaking";
  mudCut.frequency.value = 185;
  mudCut.Q.value = 1.1;

  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3200;
  presence.Q.value = 0.9;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.Q.value = 0.707;

  const compressor = ctx.createDynamicsCompressor();
  compressor.knee.value = 24;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.16;

  // VAD Noise Gate node + User Mic Gain node
  const gateGain = ctx.createGain();
  const userGain = ctx.createGain();
  const destination = ctx.createMediaStreamDestination();

  source
    .connect(highpass)
    .connect(mudCut)
    .connect(presence)
    .connect(lowpass)
    .connect(compressor)
    .connect(gateGain)
    .connect(userGain)
    .connect(destination);

  let currentPrefs = { ...DEFAULT_AUDIO_PREFS, ...initialPrefs };
  let gateOpen = !currentPrefs.vadEnabled;
  let holdUntil = 0;
  let rafId = 0;

  function applyFilterChain(p) {
    const now = ctx.currentTime;
    const ns = Boolean(p.noiseSuppressor);
    // When subtle noise suppressor is ON: clean <85Hz rumble & >7.8kHz hiss + gentle voice polish.
    // When OFF: wide-open transparent pass-through (20Hz - 20kHz, 0dB EQ, 1:1 ratio).
    highpass.frequency.setTargetAtTime(ns ? 85 : 20, now, 0.02);
    mudCut.gain.setTargetAtTime(ns ? -1.6 : 0, now, 0.02);
    presence.gain.setTargetAtTime(ns ? 1.4 : 0, now, 0.02);
    lowpass.frequency.setTargetAtTime(ns ? 7800 : 20000, now, 0.02);
    compressor.threshold.setTargetAtTime(ns ? -24 : 0, now, 0.02);
    compressor.ratio.setTargetAtTime(ns ? 2.4 : 1, now, 0.02);

    const targetGain = Math.max(0, Math.min(2, (Number(p.micGain) || 100) / 100));
    userGain.gain.setTargetAtTime(targetGain, now, 0.015);

    if (!p.vadEnabled) {
      gateOpen = true;
      gateGain.gain.setTargetAtTime(1, now, 0.015);
    }
  }

  applyFilterChain(currentPrefs);
  gateGain.gain.value = currentPrefs.vadEnabled ? 0 : 1;

  const timeData = new Uint8Array(analyser.frequencyBinCount);
  let lastEmit = 0;

  const tick = (ts) => {
    if (ts - lastEmit >= 45) {
      analyser.getByteTimeDomainData(timeData);
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) {
        const d = timeData[i] - 128;
        sum += d * d;
      }
      const rms = Math.sqrt(sum / timeData.length);
      // Scale RMS into 0..100 human-friendly percentage matching MicMeter
      const rawLevel = Math.min(100, Math.round(rms * 5));

      if (currentPrefs.vadEnabled) {
        const openAt = Math.max(2, Number(currentPrefs.vadThreshold) || 18);
        const closeAt = Math.max(1, Math.round(openAt * 0.68));
        const nowMs = Date.now();
        if (rawLevel >= openAt) {
          holdUntil = nowMs + 320;
          if (!gateOpen) {
            gateOpen = true;
            gateGain.gain.setTargetAtTime(1, ctx.currentTime, 0.012);
          }
        } else if (gateOpen && rawLevel < closeAt && nowMs >= holdUntil) {
          gateOpen = false;
          gateGain.gain.setTargetAtTime(0, ctx.currentTime, 0.065);
        }
      } else if (!gateOpen) {
        gateOpen = true;
        gateGain.gain.setTargetAtTime(1, ctx.currentTime, 0.012);
      }

      if (onLevel) onLevel(rawLevel, gateOpen);
      lastEmit = ts;
    }
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return {
    context: ctx,
    analyser,
    outputStream: destination.stream,
    outputTrack: destination.stream.getAudioTracks()[0] || rawStream.getAudioTracks()[0] || null,
    isGateOpen: () => gateOpen,
    updatePrefs(nextPrefs) {
      const prevConstraintSig = `${Boolean(currentPrefs.noiseSuppressor)}|${Boolean(currentPrefs.echoCancellation)}|${Boolean(currentPrefs.autoGainControl)}`;
      currentPrefs = { ...currentPrefs, ...nextPrefs };
      applyFilterChain(currentPrefs);
      const nextConstraintSig = `${Boolean(currentPrefs.noiseSuppressor)}|${Boolean(currentPrefs.echoCancellation)}|${Boolean(currentPrefs.autoGainControl)}`;
      if (prevConstraintSig !== nextConstraintSig) {
        const rawTrack = rawStream.getAudioTracks()[0];
        if (rawTrack?.applyConstraints) {
          void rawTrack
            .applyConstraints({
              echoCancellation: Boolean(currentPrefs.echoCancellation),
              noiseSuppression: Boolean(currentPrefs.noiseSuppressor),
              autoGainControl: Boolean(currentPrefs.autoGainControl),
            })
            .catch(() => {});
        }
      }
    },
    close() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      void ctx.close().catch(() => {});
    },
  };
}
