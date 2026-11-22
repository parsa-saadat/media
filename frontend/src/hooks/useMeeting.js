import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getBrowserId, toast } from "../utils/client";
import { playSound } from "../utils/sounds";
import { createSpeakingDetector, emitMicLevel } from "../utils/micMeter";
import { createRelayAudioPlayer, createRelayAudioSender } from "../utils/liveAudioRelay";
import { RTC_CONFIG, watchIce } from "../config/rtc";

const DEFAULT_PREFS = { inputId: "", outputId: "", master: 100, micGain: 100, volumes: {} };

/** Resolutions the stream/camera pickers offer; fps is applied on top of each. */
const QUALITY_CONSTRAINTS = {
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

function readPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem("voxsy-voice-settings") || "{}");
    return { ...DEFAULT_PREFS, ...raw, volumes: raw.volumes || {} };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Stand-alone WebRTC meeting hook.
 * Every peer connection pre-allocates 3 fixed transceivers (0=audio, 1=camera, 2=screen) in a
 * deterministic order, and either side can initiate renegotiation using the perfect negotiation
 * pattern (including rollback on glare). That guarantees starting/stopping camera or screen share
 * mid-call always reaches all remote participants reliably, regardless of join order.
 */
export function useMeeting(token, me) {
  const [phase, setPhase] = useState("idle");
  const [participants, setParticipants] = useState([]);
  const [myState, setMyState] = useState({ inLobby: false, micMuted: false, shareBlocked: false });
  const [amHost, setAmHost] = useState(false);
  const [joinToken, setJoinToken] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [micError, setMicError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareQuality, setShareQuality] = useState("720p");
  const [shareFps, setShareFps] = useState(30);
  const [shareError, setShareError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraQuality, setCameraQuality] = useState("720p");
  const [cameraFps, setCameraFps] = useState(30);
  const [streams, setStreams] = useState({});
  const [localScreen, setLocalScreen] = useState(null);
  const [localCamera, setLocalCamera] = useState(null);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [devices, setDevices] = useState([]);
  const [serverTimeDelta, setServerTimeDelta] = useState(0);
  const [game, setGame] = useState(null);

  const prefsRef = useRef(prefs);
  const prefsReady = useRef(false);
  const myToken = useRef("");
  const micOnRef = useRef(false);
  const myStateRef = useRef(myState);
  const participantsRef = useRef([]);
  const peers = useRef(new Map());
  const cursor = useRef(0);
  const audioCursor = useRef(0);
  const relayPlayerRef = useRef(null);
  const relaySenderRef = useRef(null);
  const micStream = useRef(null);
  const micTrack = useRef(null);
  const screenStream = useRef(null);
  const screenTrack = useRef(null);
  const cameraStream = useRef(null);
  const cameraTrack = useRef(null);
  const audioCtx = useRef(null);
  const gainNode = useRef(null);
  const levelFrame = useRef(0);
  const busy = useRef(false);
  const alive = useRef(true);
  const elements = useRef(new Map());
  const pendingIce = useRef(new Map());
  const speakingDetector = useRef(createSpeakingDetector());
  /** streamId -> "screen" | "camera" as secondary fallback */
  const streamKinds = useRef(new Map());
  myStateRef.current = myState;

  useEffect(() => {
    prefsRef.current = prefs;
    if (!prefsReady.current) return;
    try {
      localStorage.setItem("voxsy-voice-settings", JSON.stringify(prefs));
    } catch {
      /* storage blocked */
    }
  }, [prefs]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch {
      /* labels need permission */
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const saved = readPrefs();
    prefsRef.current = saved;
    prefsReady.current = true;
    setPrefs(saved);
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  const call = useCallback(
    (body) => apiFetch(`/api/meetings/${token}/action`, { method: "POST", json: { ...body, joinToken: myToken.current } }),
    [token],
  );

  const attach = useCallback((peerToken, kind, stream) => {
    setStreams((prev) => ({
      ...prev,
      [peerToken]: {
        audio: prev[peerToken]?.audio ?? null,
        screen: prev[peerToken]?.screen ?? null,
        camera: prev[peerToken]?.camera ?? null,
        [kind]: stream,
      },
    }));
    if (kind !== "audio") return;
    if (!stream) return;
    let el = elements.current.get(peerToken);
    if (!el) {
      el = document.createElement("audio");
      el.autoplay = true;
      el.setAttribute("playsinline", "");
      el.style.display = "none";
      document.body.appendChild(el);
      elements.current.set(peerToken, el);
    }
    el.srcObject = stream;
    const vol = Math.min(1, Math.max(0, (prefsRef.current.master / 100) * ((prefsRef.current.volumes[peerToken] ?? 100) / 100)));
    el.volume = vol;
    const out = prefsRef.current.outputId;
    if (out && typeof el.setSinkId === "function") void el.setSinkId(out).catch(() => {});
    void el.play().catch(() => {});
  }, []);

  const volumeOf = useCallback((p) => {
    if (!p) return 1;
    if (p.micMuted) return 0;
    // Never zero volume just because p.micOn hasn't polled true yet! Remote track/silence controls speech.
    return Math.min(1, Math.max(0, (prefsRef.current.master / 100) * ((prefsRef.current.volumes[p.joinToken] ?? 100) / 100)));
  }, []);

  useEffect(() => {
    for (const p of participants) {
      const el = elements.current.get(p.joinToken);
      const v = volumeOf(p);
      if (el) el.volume = v;
      relayPlayerRef.current?.setPeerVolume(p.joinToken, v);
    }
  }, [participants, prefs, volumeOf]);

  const closePeer = useCallback((peerToken) => {
    const peer = peers.current.get(peerToken);
    if (!peer) return;
    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peers.current.delete(peerToken);
    const el = elements.current.get(peerToken);
    if (el) {
      el.pause();
      el.srcObject = null;
      el.remove();
      elements.current.delete(peerToken);
    }
    setStreams((prev) => {
      const next = { ...prev };
      delete next[peerToken];
      return next;
    });
  }, []);

  const sendSignal = useCallback(
    async (to, kind, payload) => {
      try {
        await call({ action: "signal", to, kind, payload });
      } catch {
        /* a lost race is normal during renegotiation */
      }
    },
    [call],
  );

  const announceKinds = useCallback(
    async (to) => {
      const targets = to ? [to] : participantsRef.current.map((p) => p.joinToken).filter((t) => t && t !== myToken.current);
      for (const target of targets) {
        for (const [streamId, kind] of streamKinds.current) {
          await sendSignal(target, "stream-meta", { streamId, kind });
        }
      }
    },
    [sendSignal],
  );

  const negotiatePeer = useCallback(
    async (peer, otherToken) => {
      if (peer.makingOffer || peer.pc.signalingState !== "stable") {
        peer.needsNegotiation = true;
        return;
      }
      try {
        peer.makingOffer = true;
        peer.needsNegotiation = false;
        const offer = await peer.pc.createOffer();
        if (peer.pc.signalingState !== "stable") return;
        await peer.pc.setLocalDescription(offer);
        await sendSignal(otherToken, "offer", peer.pc.localDescription);
      } catch (e) {
        console.warn("meeting offer failed", e);
      } finally {
        peer.makingOffer = false;
        if (peer.needsNegotiation && peer.pc.signalingState === "stable") {
          peer.needsNegotiation = false;
          void negotiatePeer(peer, otherToken);
        }
      }
    },
    [sendSignal],
  );

  /** Syncs our current mic/camera/screen tracks into a peer's 3 fixed transceivers. */
  const syncLocalMediaToPeer = useCallback(
    async (peer, otherToken, triggerOffer = false) => {
      let changed = false;
      try {
        if (peer.audioTransceiver) {
          const wantAudio = micTrack.current ?? null;
          if (peer.audioTransceiver.sender.track !== wantAudio) {
            await peer.audioTransceiver.sender.replaceTrack(wantAudio);
          }
          const wantDir = wantAudio ? "sendrecv" : "recvonly";
          if (peer.audioTransceiver.direction !== wantDir) {
            peer.audioTransceiver.direction = wantDir;
            changed = true;
          }
        }
        if (peer.cameraTransceiver) {
          const wantCam = cameraTrack.current ?? null;
          if (peer.cameraTransceiver.sender.track !== wantCam) {
            await peer.cameraTransceiver.sender.replaceTrack(wantCam);
          }
          const wantDir = wantCam ? "sendrecv" : "recvonly";
          if (peer.cameraTransceiver.direction !== wantDir) {
            peer.cameraTransceiver.direction = wantDir;
            changed = true;
          }
        }
        if (peer.screenTransceiver) {
          const wantScreen = screenTrack.current ?? null;
          if (peer.screenTransceiver.sender.track !== wantScreen) {
            await peer.screenTransceiver.sender.replaceTrack(wantScreen);
          }
          const wantDir = wantScreen ? "sendrecv" : "recvonly";
          if (peer.screenTransceiver.direction !== wantDir) {
            peer.screenTransceiver.direction = wantDir;
            changed = true;
          }
        }
      } catch (err) {
        console.warn("syncLocalMediaToPeer error", err);
      }
      if (triggerOffer || changed) {
        await negotiatePeer(peer, otherToken);
      }
    },
    [negotiatePeer],
  );

  const createPeer = useCallback(
    (other, isInitiator = false) => {
      const existing = peers.current.get(other.joinToken);
      if (existing) return existing;
      const pc = new RTCPeerConnection(RTC_CONFIG);
      watchIce(pc, `meet:${other.joinToken.slice(0, 6)}`);
      // Deterministic politeness for glare resolution: lexicographically larger token is polite.
      const polite = myToken.current > other.joinToken;
      const peer = {
        pc,
        makingOffer: false,
        ignoringOffer: false,
        needsNegotiation: false,
        polite,
        audioTransceiver: null,
        cameraTransceiver: null,
        screenTransceiver: null,
        pendingIce: pendingIce.current.get(other.joinToken) ?? [],
      };
      pendingIce.current.delete(other.joinToken);

      if (isInitiator) {
        // Pre-allocate 3 m-lines in strict order: 0 = audio, 1 = camera, 2 = screen
        peer.audioTransceiver = pc.addTransceiver("audio", {
          direction: micTrack.current ? "sendrecv" : "recvonly",
          streams: micStream.current ? [micStream.current] : [],
        });
        if (micTrack.current) void peer.audioTransceiver.sender.replaceTrack(micTrack.current).catch(() => {});

        peer.cameraTransceiver = pc.addTransceiver("video", {
          direction: cameraTrack.current ? "sendrecv" : "recvonly",
          streams: cameraStream.current ? [cameraStream.current] : [],
        });
        if (cameraTrack.current) void peer.cameraTransceiver.sender.replaceTrack(cameraTrack.current).catch(() => {});

        peer.screenTransceiver = pc.addTransceiver("video", {
          direction: screenTrack.current ? "sendrecv" : "recvonly",
          streams: screenStream.current ? [screenStream.current] : [],
        });
        if (screenTrack.current) void peer.screenTransceiver.sender.replaceTrack(screenTrack.current).catch(() => {});
      }

      peers.current.set(other.joinToken, peer);

      pc.onnegotiationneeded = () => {
        // Only auto-open the initial offer from the initiator; later track updates call negotiatePeer explicitly on BOTH sides!
        if (!isInitiator || peer.initialNegotiated) return;
        peer.initialNegotiated = true;
        void negotiatePeer(peer, other.joinToken);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) void sendSignal(other.joinToken, "ice", e.candidate.toJSON());
      };

      pc.ontrack = (e) => {
        if (!alive.current) return;
        const track = e.track;
        if (track.kind === "audio") {
          const publishAudio = () => {
            if (!alive.current) return;
            const stream = e.streams[0] ?? new MediaStream([track]);
            attach(other.joinToken, "audio", stream);
          };
          publishAudio();
          track.onunmute = publishAudio;
          return;
        }
        // Determine whether this video transceiver is slot 1 (camera) or slot 2 (screen)
        const videoTransceivers = pc.getTransceivers().filter((t) => t.receiver?.track?.kind === "video");
        const idx = videoTransceivers.indexOf(e.transceiver);
        const streamObj = new MediaStream([track]);
        let slotKind = "camera";
        if (idx === 1) slotKind = "screen";
        else if (idx === 0) slotKind = "camera";
        else if (e.streams[0] && streamKinds.current.has(e.streams[0].id)) {
          slotKind = streamKinds.current.get(e.streams[0].id);
        }

        const publish = () => {
          if (!alive.current) return;
          attach(other.joinToken, slotKind, new MediaStream([track]));
        };
        publish();
        track.onunmute = publish;
        track.onmute = () => {
          // When remote calls replaceTrack(null) or changes direction to recvonly, track mutes
          if (!alive.current) return;
          attach(other.joinToken, slotKind, null);
        };
        track.onended = () => {
          if (!alive.current) return;
          attach(other.joinToken, slotKind, null);
        };
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer(other.joinToken);
        if (pc.connectionState === "connected") playSound("connect");
      };

      for (const ice of peer.pendingIce.splice(0)) void pc.addIceCandidate(ice).catch(() => {});
      if (streamKinds.current.size) void announceKinds(other.joinToken);
      return peer;
    },
    [announceKinds, attach, closePeer, negotiatePeer, sendSignal],
  );

  const handleSignal = useCallback(
    async (signal, list) => {
      if (signal.from === myToken.current) return;
      const other = list.find((p) => p.joinToken === signal.from);
      if (!other) return;
      let payload;
      try {
        payload = JSON.parse(signal.payload);
      } catch {
        return;
      }
      if (signal.kind === "stream-meta") {
        if (payload?.streamId) {
          const kind = payload.kind === "camera" ? "camera" : "screen";
          streamKinds.current.set(payload.streamId, kind);
        }
        return;
      }
      const peer = createPeer(other, false);
      const kind = signal.kind;
      try {
        if (kind === "offer" || kind === "answer" || kind === "screen-offer" || kind === "screen-answer") {
          const description = payload;
          const offerCollision = description.type === "offer" && (peer.makingOffer || peer.pc.signalingState !== "stable");
          peer.ignoringOffer = !peer.polite && offerCollision;
          if (peer.ignoringOffer) return;

          if (offerCollision && peer.polite) {
            // Must be sequential: running rollback and setRemoteDescription in parallel races and throws,
            // which used to tear the whole peer connection down (and left the two sides out of sync).
            await peer.pc.setLocalDescription({ type: "rollback" }).catch(() => {});
            await peer.pc.setRemoteDescription(description);
          } else {
            await peer.pc.setRemoteDescription(description);
          }

          // Bind our transceivers on the answerer side if not yet bound (0=audio, 1=camera, 2=screen)
          const transceivers = peer.pc.getTransceivers();
          const audioTs = transceivers.filter((t) => t.receiver?.track?.kind === "audio");
          const videoTs = transceivers.filter((t) => t.receiver?.track?.kind === "video");
          if (!peer.audioTransceiver && audioTs[0]) peer.audioTransceiver = audioTs[0];
          if (!peer.cameraTransceiver && videoTs[0]) peer.cameraTransceiver = videoTs[0];
          if (!peer.screenTransceiver && videoTs[1]) peer.screenTransceiver = videoTs[1];

          for (const ice of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(ice).catch(() => {});

          if (description.type === "offer") {
            await syncLocalMediaToPeer(peer, other.joinToken, false);
            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(answer);
            await sendSignal(other.joinToken, "answer", peer.pc.localDescription);
          }
          if (peer.needsNegotiation && peer.pc.signalingState === "stable") {
            peer.needsNegotiation = false;
            void negotiatePeer(peer, other.joinToken);
          }
        } else if (kind === "ice" || kind === "screen-ice") {
          if (!peer.pc.remoteDescription) peer.pendingIce.push(payload);
          else await peer.pc.addIceCandidate(payload).catch(() => {});
        }
      } catch (e) {
        console.warn("meeting signal failed", kind, e);
        closePeer(other.joinToken);
      }
    },
    [closePeer, createPeer, negotiatePeer, sendSignal, syncLocalMediaToPeer],
  );

  /* ── microphone ── */
  const stopMic = useCallback(() => {
    if (levelFrame.current) cancelAnimationFrame(levelFrame.current);
    levelFrame.current = 0;
    if (speakingDetector.current.reset()) setSpeaking(false);
    emitMicLevel(0);
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    micTrack.current?.stop();
    micTrack.current = null;
    if (audioCtx.current) void audioCtx.current.close().catch(() => {});
    audioCtx.current = null;
    gainNode.current = null;
  }, []);

  const openMic = useCallback(
    async (deviceId) => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("این مرورگر دسترسی میکروفون ندارد");
      const id = deviceId ?? prefsRef.current.inputId;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...(id ? { deviceId: { ideal: id } } : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!alive.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const previousStream = micStream.current;
      const previousTrack = micTrack.current;
      const previousCtx = audioCtx.current;
      let outTrack = stream.getAudioTracks()[0];
      try {
        const ctx = new AudioContext();
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        gain.gain.value = prefsRef.current.micGain / 100;
        const dest = ctx.createMediaStreamDestination();
        source.connect(gain).connect(dest);
        outTrack = dest.stream.getAudioTracks()[0];
        audioCtx.current = ctx;
        gainNode.current = gain;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        let last = 0;
        if (levelFrame.current) cancelAnimationFrame(levelFrame.current);
        const measure = (t) => {
          if (t - last > 60) {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (const v of data) sum += (v - 128) ** 2;
            const level = Math.min(100, Math.round(Math.sqrt(sum / data.length) * 5));
            emitMicLevel(level);
            if (speakingDetector.current.push(level)) setSpeaking(speakingDetector.current.get());
            last = t;
          }
          levelFrame.current = requestAnimationFrame(measure);
        };
        levelFrame.current = requestAnimationFrame(measure);
      } catch {
        audioCtx.current = null;
        gainNode.current = null;
      }
      const shouldEnable = micOnRef.current && !myStateRef.current.micMuted;
      outTrack.enabled = shouldEnable;
      stream.getAudioTracks().forEach((t) => {
        t.enabled = shouldEnable;
      });
      micStream.current = stream;
      micTrack.current = outTrack;
      for (const [peerToken, peer] of peers.current.entries()) {
        await syncLocalMediaToPeer(peer, peerToken, true);
      }
      previousStream?.getTracks().forEach((t) => t.stop());
      if (previousTrack && previousTrack !== previousStream?.getAudioTracks()[0]) previousTrack.stop();
      if (previousCtx) void previousCtx.close().catch(() => {});
      await refreshDevices();
    },
    [refreshDevices, syncLocalMediaToPeer],
  );

  const previewMic = useCallback(async () => {
    setMicError("");
    try {
      await openMic();
      return true;
    } catch {
      setMicError("دسترسی به میکروفون داده نشد. بدون آن فقط شنونده خواهید بود.");
      return false;
    }
  }, [openMic]);

  /* ── lifecycle ── */
  const poll = useCallback(async () => {
    if (!myToken.current || busy.current) return;
    busy.current = true;
    const mine = myToken.current;
    try {
      const data = await apiFetch(`/api/meetings/${token}/state?joinToken=${encodeURIComponent(mine)}&after=${cursor.current}`);
      if (!alive.current || myToken.current !== mine) return;
      cursor.current = data.cursor;
      participantsRef.current = data.participants;
      setParticipants(data.participants);
      setMyState(data.myState);
      setAmHost(data.host);
      setServerTimeDelta(data.serverTime - Date.now());
      setGame(data.game ?? null);

      // If host blocked our share/camera while active, shut them down locally
      if (data.myState.shareBlocked) {
        if (screenTrack.current) {
          screenTrack.current.stop();
          screenTrack.current = null;
          screenStream.current = null;
          setLocalScreen(null);
          setSharing(false);
        }
        if (cameraTrack.current) {
          cameraTrack.current.stop();
          cameraTrack.current = null;
          cameraStream.current = null;
          setLocalCamera(null);
          setCameraOn(false);
        }
      }

      const here = new Set(data.participants.map((p) => p.joinToken));
      for (const key of [...peers.current.keys()]) if (!here.has(key)) closePeer(key);
      for (const signal of data.signals) await handleSignal(signal, data.participants);

      // Only the impolite side (lexicographically smaller token) initiates the brand-new peer connection
      for (const p of data.participants) {
        if (p.joinToken === mine || p.inLobby || peers.current.has(p.joinToken)) continue;
        if (mine < p.joinToken) {
          createPeer(p, true);
        }
      }
    } catch (e) {
      const msg = e.message || "";
      const code = e.body?.code;
      if (code === "EVICTED_OR_LEFT" || e.status === 409 || e.status === 410 || e.status === 404 || msg.includes("جلسه") || msg.includes("تمام شده")) {
        myToken.current = "";
        setJoinToken("");
        setPhase("idle");
        setMicOn(false);
        setSpeaking(false);
        setSharing(false);
        setCameraOn(false);
        setParticipants([]);
        setStreams({});
        setGame(null);
        stopMic();
        if (screenTrack.current) {
          screenTrack.current.stop();
          screenTrack.current = null;
          screenStream.current = null;
          setLocalScreen(null);
        }
        if (cameraTrack.current) {
          cameraTrack.current.stop();
          cameraTrack.current = null;
          cameraStream.current = null;
          setLocalCamera(null);
        }
        for (const key of [...peers.current.keys()]) closePeer(key);
        toast(msg || "از جلسه خارج شدید", "error");
      }
    } finally {
      busy.current = false;
    }
  }, [closePeer, createPeer, handleSignal, stopMic, token]);

  const join = useCallback(
    async (name, opts = {}) => {
      if (myToken.current) return { ok: true };
      setPhase("connecting");
      let savedSession = null;
      try {
        savedSession = JSON.parse(sessionStorage.getItem(`inebuly-meet-session:${token}`) || "null");
      } catch {
        savedSession = null;
      }
      const resumeJoinToken = opts.resumeJoinToken ?? savedSession?.joinToken ?? "";
      const effectiveName = (name ?? savedSession?.name ?? "").trim();
      try {
        const data = await apiFetch(`/api/meetings/${token}/join`, {
          method: "POST",
          json: {
            name: effectiveName,
            joinToken: resumeJoinToken,
            browserId: getBrowserId(),
            // If resuming our own tab session or user requested takeover, allow seamless re-entry!
            forceTakeover: opts.forceTakeover === true || Boolean(resumeJoinToken),
          },
        });
        if (!alive.current) return { ok: false };
        myToken.current = data.joinToken;
        setJoinToken(data.joinToken);
        try {
          sessionStorage.setItem(
            `inebuly-meet-session:${token}`,
            JSON.stringify({ joinToken: data.joinToken, name: effectiveName || me?.displayName || "" }),
          );
        } catch {
          /* ignore */
        }
        cursor.current = data.cursor;
        if (typeof data.audioCursor === "number") audioCursor.current = data.audioCursor;
        participantsRef.current = data.participants;
        setParticipants(data.participants);
        setMyState(data.myState);
        setAmHost(data.host);
        setServerTimeDelta(data.serverTime - Date.now());
        setGame(data.game ?? null);
        // Notify other tabs in the same browser immediately if we took over the meeting
        if (opts.forceTakeover && typeof BroadcastChannel !== "undefined") {
          try {
            const bc = new BroadcastChannel(`inebuly-meet-${token}`);
            bc.postMessage({ type: "evict", winnerJoinToken: data.joinToken });
            bc.close();
          } catch {
            /* ignore */
          }
        }
        if (!opts.silentSound) playSound(data.myState.inLobby ? "knock" : "join");
        setPhase(data.myState.inLobby ? "lobby" : "joined");
        return { ok: true };
      } catch (e) {
        setPhase("idle");
        const code = e.body?.code || null;
        if (resumeJoinToken && (e.status === 404 || e.status === 410)) {
          try { sessionStorage.removeItem(`inebuly-meet-session:${token}`); } catch {}
        }
        if (!opts.silentConflict || !code) {
          if (!opts.silentError) toast(e.message, "error");
        }
        return { ok: false, code, message: e.message, existingName: e.body?.existingName };
      }
    },
    [me?.displayName, token],
  );

  // Auto-rejoin immediately on page refresh if this browser tab already had an active meeting session!
  const autoRejoinedRef = useRef(false);
  useEffect(() => {
    if (autoRejoinedRef.current || myToken.current) return;
    let savedSession = null;
    try {
      savedSession = JSON.parse(sessionStorage.getItem(`inebuly-meet-session:${token}`) || "null");
    } catch {
      savedSession = null;
    }
    if (!savedSession?.joinToken) return;
    autoRejoinedRef.current = true;
    void join(savedSession.name || me?.displayName || "", {
      resumeJoinToken: savedSession.joinToken,
      forceTakeover: true,
      silentConflict: true,
      silentError: true,
      silentSound: true,
    });
  }, [join, me?.displayName, token]);

  const leave = useCallback(async () => {
    const old = myToken.current;
    try { sessionStorage.removeItem(`inebuly-meet-session:${token}`); } catch {}
    myToken.current = "";
    setJoinToken("");
    setPhase("idle");
    micOnRef.current = false;
    setMicOn(false);
    setSpeaking(false);
    setSharing(false);
    setCameraOn(false);
    setParticipants([]);
    setStreams({});
    setGame(null);
    stopMic();
    if (screenTrack.current) {
      screenTrack.current.stop();
      screenTrack.current = null;
      screenStream.current = null;
      setLocalScreen(null);
    }
    if (cameraTrack.current) {
      cameraTrack.current.stop();
      cameraTrack.current = null;
      cameraStream.current = null;
      setLocalCamera(null);
    }
    for (const key of [...peers.current.keys()]) closePeer(key);
    if (old) await apiFetch(`/api/meetings/${token}/action`, { method: "POST", json: { action: "leave", joinToken: old } }).catch(() => {});
    playSound("leave");
  }, [closePeer, stopMic, token]);

  useEffect(() => {
    if (!joinToken || (phase !== "joined" && phase !== "lobby")) return;
    if (!relayPlayerRef.current) relayPlayerRef.current = createRelayAudioPlayer();
    const sender = createRelayAudioSender({
      getTrack: () => (micOnRef.current ? micTrack.current : null),
      shouldSend: () => {
        if (!myToken.current || phase !== "joined" || !micOnRef.current || myStateRef.current.micMuted) return false;
        const others = participantsRef.current.filter((p) => !p.inLobby && p.joinToken !== myToken.current);
        if (!others.length) return false;
        return others.some((p) => {
          const peer = peers.current.get(p.joinToken);
          return !(peer?.pc?.connectionState === "connected" || peer?.pc?.iceConnectionState === "connected");
        });
      },
      onChunk: (data, mime) => {
        if (!myToken.current) return;
        void call({ action: "audio-chunk", data, mime }).catch(() => {});
      },
      sliceMs: 420,
    });
    relaySenderRef.current = sender;
    sender.start();

    let bc = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel(`inebuly-meet-${token}`);
        bc.onmessage = (ev) => {
          if (ev.data?.type === "evict" && ev.data?.winnerJoinToken && ev.data.winnerJoinToken !== myToken.current) {
            void leave();
            toast("شما با حساب دیگری در تب جدید وارد جلسه شدید؛ این تب از جلسه خارج شد.", "info");
          }
        };
      } catch {
        bc = null;
      }
    }
    const unlock = () => {
      if (audioCtx.current?.state === "suspended") void audioCtx.current.resume().catch(() => {});
      relayPlayerRef.current?.resume();
      for (const el of elements.current.values()) {
        if (el.paused) void el.play().catch(() => {});
      }
    };
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock, { passive: true });

    void poll();
    const ticker = window.setInterval(() => void poll(), 450);
    const beat = window.setInterval(() => {
      void call({ action: "heartbeat" }).catch((err) => {
        if (err?.body?.code === "EVICTED_OR_LEFT" || err?.status === 409 || err?.status === 410) {
          void poll();
        }
      });
    }, 4500);
    return () => {
      sender.stop();
      relaySenderRef.current = null;
      bc?.close();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      window.clearInterval(ticker);
      window.clearInterval(beat);
    };
  }, [call, joinToken, leave, phase, poll, token]);

  useEffect(() => {
    if (phase === "lobby" && !myState.inLobby) {
      setPhase("joined");
      playSound("join");
    }
  }, [myState.inLobby, phase]);

  useEffect(() => {
    return () => {
      alive.current = false;
      const old = myToken.current;
      myToken.current = "";
      relaySenderRef.current?.stop();
      relaySenderRef.current = null;
      relayPlayerRef.current?.destroy();
      relayPlayerRef.current = null;
      micStream.current?.getTracks().forEach((t) => t.stop());
      micTrack.current?.stop();
      screenStream.current?.getTracks().forEach((t) => t.stop());
      cameraStream.current?.getTracks().forEach((t) => t.stop());
      if (audioCtx.current) void audioCtx.current.close().catch(() => {});
      if (levelFrame.current) cancelAnimationFrame(levelFrame.current);
      for (const peer of peers.current.values()) peer.pc.close();
      peers.current.clear();
      for (const el of elements.current.values()) {
        el.pause();
        el.srcObject = null;
        el.remove();
      }
      elements.current.clear();
      // Only send leave on React component unmount (SPA navigation without minimizing).
      // On browser refresh, sessionStorage retains `inebuly-meet-session:${token}` so the reloaded page rebinds seamlessly!
      let hasSaved = false;
      try { hasSaved = Boolean(sessionStorage.getItem(`inebuly-meet-session:${token}`)); } catch {}
      if (old && !hasSaved) {
        void fetch(`/api/meetings/${token}/action`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "leave", joinToken: old }),
          keepalive: true,
          credentials: "same-origin",
        }).catch(() => {});
      }
    };
  }, [token]);

  /* ── controls ── */
  const toggleMic = useCallback(async () => {
    if (!myToken.current) return;
    if (myStateRef.current.micMuted) return toast("میزبان میکروفون شما را بسته است", "error");
    if (!micTrack.current) {
      try {
        await openMic();
        setMicError("");
      } catch {
        setMicError("دسترسی به میکروفون داده نشد؛ از تنظیمات مرورگر اجازه دهید.");
        return;
      }
    }
    if (audioCtx.current?.state === "suspended") void audioCtx.current.resume().catch(() => {});
    const next = !micOnRef.current;
    try {
      await call({ action: "mic", on: next });
      micOnRef.current = next;
      if (micTrack.current) micTrack.current.enabled = next;
      micStream.current?.getAudioTracks().forEach((t) => {
        t.enabled = next;
      });
      for (const [peerToken, peer] of peers.current.entries()) {
        await syncLocalMediaToPeer(peer, peerToken, true);
      }
      setMicOn(next);
    } catch (e) {
      toast(e.message, "error");
    }
  }, [call, openMic, syncLocalMediaToPeer]);

  const broadcastMediaUpdate = useCallback(async () => {
    for (const [peerToken, peer] of peers.current.entries()) {
      await syncLocalMediaToPeer(peer, peerToken, true);
    }
  }, [syncLocalMediaToPeer]);

  const stopShare = useCallback(async () => {
    if (screenTrack.current) {
      screenTrack.current.stop();
      screenTrack.current = null;
      screenStream.current = null;
      setLocalScreen(null);
    }
    streamKinds.current.forEach((kind, id) => kind === "screen" && streamKinds.current.delete(id));
    await broadcastMediaUpdate();
    setSharing(false);
    setShareError("");
    if (myToken.current) await call({ action: "share", on: false }).catch(() => {});
  }, [broadcastMediaUpdate, call]);

  const startShare = useCallback(
    async (quality = "720p", fps = 30) => {
      if (!myToken.current) return;
      if (!me?.permissions.includes("screen.share") && me) return toast("نقش شما اجازهٔ اشتراک صفحه ندارد", "error");
      if (myStateRef.current.shareBlocked) return toast("میزبان اشتراک صفحهٔ شما را بسته است", "error");
      if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") return toast("این مرورگر اشتراک صفحه را پشتیبانی نمی‌کند", "error");
      const c = QUALITY_CONSTRAINTS[quality] ?? QUALITY_CONSTRAINTS["720p"];
      try {
        setShareError("");
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: c.width }, height: { ideal: c.height }, frameRate: { ideal: fps } },
          audio: false,
        });
        const track = stream.getVideoTracks()[0];
        if (!track) throw new Error("صفحه‌ای برای اشتراک انتخاب نشد");
        if (screenTrack.current) screenTrack.current.stop();
        screenStream.current = stream;
        screenTrack.current = track;
        setLocalScreen(stream);
        setShareQuality(quality);
        setShareFps(fps);
        streamKinds.current.set(stream.id, "screen");
        track.onended = () => void stopShare();
        await announceKinds(null);
        await call({ action: "share", on: true, quality, fps });
        setSharing(true);
        await broadcastMediaUpdate();
      } catch (e) {
        const msg = e.message || "";
        setShareError(msg.includes("Permission") || msg.includes("NotAllowed") ? "اشتراک صفحه لغو شد" : msg);
        screenTrack.current = null;
        screenStream.current = null;
      }
    },
    [announceKinds, broadcastMediaUpdate, call, me, stopShare],
  );

  const changeShareQuality = useCallback(
    async (quality, fps) => {
      setShareQuality(quality);
      if (fps) setShareFps(fps);
      if (!sharing) return;
      await startShare(quality, fps ?? shareFps);
    },
    [sharing, shareFps, startShare],
  );

  /* ── camera ── */
  const stopCamera = useCallback(async () => {
    if (cameraTrack.current) {
      cameraTrack.current.stop();
      cameraTrack.current = null;
      cameraStream.current = null;
      setLocalCamera(null);
    }
    streamKinds.current.forEach((kind, id) => kind === "camera" && streamKinds.current.delete(id));
    await broadcastMediaUpdate();
    setCameraOn(false);
    if (myToken.current) await call({ action: "camera", on: false }).catch(() => {});
  }, [broadcastMediaUpdate, call]);

  const startCamera = useCallback(
    async (quality = "720p", fps = 30) => {
      if (!myToken.current) return;
      if (myStateRef.current.shareBlocked) return toast("میزبان اشتراک تصویر شما را بسته است", "error");
      if (!navigator.mediaDevices?.getUserMedia) return toast("این مرورگر دسترسی کمرا ندارد", "error");
      const c = QUALITY_CONSTRAINTS[quality] ?? QUALITY_CONSTRAINTS["720p"];
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: c.width }, height: { ideal: c.height }, frameRate: { ideal: fps } },
        });
        const track = stream.getVideoTracks()[0];
        if (!track) throw new Error("کمرا در دسترس نیست");
        if (cameraTrack.current) cameraTrack.current.stop();
        cameraStream.current = stream;
        cameraTrack.current = track;
        setLocalCamera(stream);
        setCameraQuality(quality);
        setCameraFps(fps);
        streamKinds.current.set(stream.id, "camera");
        track.onended = () => void stopCamera();
        await announceKinds(null);
        await call({ action: "camera", on: true, quality, fps });
        setCameraOn(true);
        await broadcastMediaUpdate();
        await refreshDevices();
      } catch (e) {
        const msg = e.message || "";
        toast(msg.includes("Permission") || msg.includes("NotAllowed") ? "دسترسی به کمرا داده نشد" : msg || "کمرا روشن نشد", "error");
      }
    },
    [announceKinds, broadcastMediaUpdate, call, refreshDevices, stopCamera],
  );

  const changeCameraQuality = useCallback(
    async (quality, fps) => {
      setCameraQuality(quality);
      if (fps) setCameraFps(fps);
      if (!cameraOn) return;
      await startCamera(quality, fps ?? cameraFps);
    },
    [cameraFps, cameraOn, startCamera],
  );

  /* ── games ── */
  const gameAction = useCallback(
    async (action, extra = {}) => {
      try {
        const data = await call({ action, ...extra });
        if (data?.game !== undefined) setGame(data.game);
        return data;
      } catch (e) {
        toast(e.message, "error");
        return null;
      }
    },
    [call],
  );

  const hostAction = useCallback(
    async (action, target) => {
      try {
        await call({ action, target });
        void poll();
      } catch (e) {
        toast(e.message, "error");
      }
    },
    [call, poll],
  );

  const setVolume = useCallback((peerToken, value) => {
    setPrefs((p) => ({ ...p, volumes: { ...p.volumes, [peerToken]: Math.min(100, Math.max(0, value)) } }));
  }, []);
  const setMaster = useCallback((value) => setPrefs((p) => ({ ...p, master: Math.min(100, Math.max(0, value)) })), []);
  const setMicGain = useCallback((value) => {
    const level = Math.min(200, Math.max(0, value));
    setPrefs((p) => ({ ...p, micGain: level }));
    if (gainNode.current) gainNode.current.gain.value = level / 100;
  }, []);
  const changeInput = useCallback(
    async (id) => {
      setPrefs((p) => ({ ...p, inputId: id }));
      prefsRef.current = { ...prefsRef.current, inputId: id };
      if (micTrack.current) {
        try {
          const wasOn = micOn;
          await openMic(id);
          if (micTrack.current) micTrack.current.enabled = wasOn;
          micStream.current?.getAudioTracks().forEach((t) => {
            t.enabled = wasOn;
          });
        } catch {
          toast("اتصال به این میکروفون ممکن نشد", "error");
        }
      }
    },
    [micOn, openMic],
  );
  const changeOutput = useCallback(async (id) => {
    const probe = document.createElement("audio");
    if (id && typeof probe.setSinkId !== "function") return toast("این مرورگر انتخاب خروجی صدا را پشتیبانی نمی‌کند", "error");
    if (id) {
      try {
        await probe.setSinkId(id);
      } catch {
        return toast("دسترسی به این خروجی داده نشد", "error");
      }
    }
    setPrefs((p) => ({ ...p, outputId: id }));
    prefsRef.current = { ...prefsRef.current, outputId: id };
    for (const el of elements.current.values()) if (typeof el.setSinkId === "function") void el.setSinkId(id).catch(() => {});
  }, []);

  const enableAudio = useCallback(() => {
    for (const el of elements.current.values()) void el.play().catch(() => {});
    if (audioCtx.current?.state === "suspended") void audioCtx.current.resume().catch(() => {});
  }, []);

  return {
    phase, participants, myState, amHost, joinToken, micOn, micError, speaking,
    sharing, shareQuality, shareFps, shareError,
    cameraOn, cameraQuality, cameraFps,
    streams, localScreen, localCamera, prefs, devices, serverTimeDelta, game,
    join, leave, previewMic, toggleMic,
    startShare, stopShare, changeShareQuality,
    startCamera, stopCamera, changeCameraQuality,
    gameCreate: (type) => gameAction("game-create", { game: type }),
    gameJoin: () => gameAction("game-join"),
    gameSpectate: () => gameAction("game-spectate"),
    gameStart: () => gameAction("game-start"),
    gameRematch: () => gameAction("game-rematch"),
    gameMove: (move) => gameAction("game-move", { move }),
    gameClose: async () => {
      const d = await gameAction("game-close");
      if (d?.closed) setGame(null);
      return d;
    },
    hostAction,
    setVolume, setMaster, setMicGain, changeInput, changeOutput, enableAudio, refreshDevices,
  };
}
