/**
 * Automatic Server-Relayed Live Audio Engine (WebRTC NAT/Firewall Fallback).
 *
 * When two participants are behind symmetric NATs, ISP UDP filters, or proxies where direct P2P
 * ICE fails to reach `connected`, this engine automatically captures short self-contained audio
 * slices from the local microphone stream and sends them through our HTTPS API, while decoding
 * and scheduling incoming slices gaplessly through WebAudio (`AudioContext` + per-peer `GainNode`).
 *
 * Crucially:
 * - For any remote peer whose `RTCPeerConnection.connectionState === "connected"`, relay playback
 *   for that peer is muted/skipped so audio is NEVER doubled!
 * - If ALL remote peers are WebRTC-connected, the sender pauses capturing to save bandwidth.
 */

function pickSupportedAudioMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return "";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = String(reader.result || "");
      const idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Creates a gapless WebAudio playback scheduler for relayed audio chunks.
 */
export function createRelayAudioPlayer() {
  let ctx = null;
  /** peerKey -> { nextTime: number, gain: GainNode } */
  const channels = new Map();

  function ensureContext() {
    if (typeof window === "undefined") return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx || ctx.state === "closed") {
      ctx = new Ctx();
    }
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    return ctx;
  }

  async function playChunk(peerKey, base64Data, mime, volume = 1) {
    if (!base64Data || volume <= 0) return;
    const audioCtx = ensureContext();
    if (!audioCtx) return;

    try {
      const ab = base64ToArrayBuffer(base64Data);
      const audioBuffer = await audioCtx.decodeAudioData(ab.slice(0));
      let ch = channels.get(peerKey);
      if (!ch) {
        const gain = audioCtx.createGain();
        gain.connect(audioCtx.destination);
        ch = { nextTime: 0, gain };
        channels.set(peerKey, ch);
      }
      ch.gain.gain.value = Math.max(0, Math.min(1.5, volume));

      const now = audioCtx.currentTime;
      // Small jitter buffer (60ms) when starting fresh or after silence
      if (ch.nextTime < now || ch.nextTime > now + 2.5) {
        ch.nextTime = now + 0.06;
      }
      const src = audioCtx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(ch.gain);
      src.start(ch.nextTime);
      ch.nextTime += audioBuffer.duration;
    } catch {
      // Fallback for browsers whose decodeAudioData doesn't support this container: HTMLAudioElement
      try {
        const ab = base64ToArrayBuffer(base64Data);
        const url = URL.createObjectURL(new Blob([ab], { type: mime || "audio/webm" }));
        const el = new Audio(url);
        el.volume = Math.max(0, Math.min(1, volume));
        void el.play().catch(() => {});
        el.onended = () => URL.revokeObjectURL(url);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch {
        /* ignore malformed slice */
      }
    }
  }

  function setPeerVolume(peerKey, volume) {
    const ch = channels.get(peerKey);
    if (ch) ch.gain.gain.value = Math.max(0, Math.min(1.5, volume));
  }

  function resume() {
    if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
  }

  function destroy() {
    channels.clear();
    if (ctx && ctx.state !== "closed") {
      void ctx.close().catch(() => {});
    }
    ctx = null;
  }

  return { playChunk, setPeerVolume, resume, destroy };
}

/**
 * Periodically records self-contained 420ms slices from `getTrack()` when `shouldSend()` is true,
 * and invokes `onChunk(base64, mime)`. Each slice has its own container header so any joiner can
 * decode every chunk independently!
 */
export function createRelayAudioSender({ getTrack, shouldSend, onChunk, sliceMs = 420 }) {
  let active = false;
  let timer = null;
  let currentRecorder = null;
  const mimeType = pickSupportedAudioMime();

  function stopCurrent() {
    if (currentRecorder && currentRecorder.state !== "inactive") {
      try {
        currentRecorder.stop();
      } catch {
        /* ignore */
      }
    }
    currentRecorder = null;
  }

  function step() {
    if (!active) return;
    const track = getTrack();
    if (!track || !track.enabled || track.readyState !== "live" || !shouldSend() || typeof MediaRecorder === "undefined") {
      timer = setTimeout(step, sliceMs);
      return;
    }

    try {
      const mediaStream = new MediaStream([track]);
      const opts = mimeType ? { mimeType, audioBitsPerSecond: 24_000 } : { audioBitsPerSecond: 24_000 };
      const rec = new MediaRecorder(mediaStream, opts);
      currentRecorder = rec;
      const parts = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) parts.push(ev.data);
      };
      rec.onstop = async () => {
        if (!active || !parts.length || !shouldSend()) return;
        const blob = new Blob(parts, { type: rec.mimeType || mimeType || "audio/webm" });
        if (blob.size < 40 || blob.size > 85_000) return;
        try {
          const b64 = await blobToBase64(blob);
          if (b64 && active) onChunk(b64, blob.type || "audio/webm");
        } catch {
          /* ignore */
        }
      };
      rec.start();
      timer = setTimeout(() => {
        if (rec.state !== "inactive") {
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
        }
        if (active) step();
      }, sliceMs);
    } catch {
      timer = setTimeout(step, 800);
    }
  }

  function start() {
    if (active) return;
    active = true;
    step();
  }

  function stop() {
    active = false;
    if (timer) clearTimeout(timer);
    timer = null;
    stopCurrent();
  }

  return { start, stop };
}
