import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getToken, toast } from "../utils/client";
import { createSpeakingDetector, emitMicLevel } from "../utils/micMeter";
import { createRelayAudioPlayer, createRelayAudioSender } from "../utils/liveAudioRelay";
import {
  buildMicConstraints,
  createMicAudioPipeline,
  DEFAULT_AUDIO_PREFS,
  readAudioPrefs,
  saveAudioPrefs,
  subscribeAudioPrefs,
} from "../utils/audioPrefs";

const DEFAULT_PREFS = DEFAULT_AUDIO_PREFS;

/** Capture constraints + target encoder bitrate per shared-screen quality. */
const QUALITY = {
  "360p": { width: 640, height: 360, frameRate: 20, bitrate: 750_000 },
  "480p": { width: 854, height: 480, frameRate: 24, bitrate: 1_150_000 },
  "720p": { width: 1280, height: 720, frameRate: 30, bitrate: 2_800_000 },
  "1080p": { width: 1920, height: 1080, frameRate: 30, bitrate: 6_000_000 },
};

async function applyVoiceScreenEncoding(sender, track, quality) {
  if (!sender || !track || typeof sender.getParameters !== "function") return;
  const spec = QUALITY[quality] ?? QUALITY["720p"];
  try {
    if ("contentHint" in track) track.contentHint = "detail";
  } catch {}
  try {
    const settings = track.getSettings?.() || {};
    const srcHeight = Number(settings.height) || spec.height;
    const scaleDown = srcHeight > spec.height ? Math.max(1, Number((srcHeight / spec.height).toFixed(2))) : 1;
    const params = sender.getParameters() || {};
    if (!Array.isArray(params.encodings) || params.encodings.length === 0) params.encodings = [{}];
    params.degradationPreference = "maintain-resolution";
    for (const enc of params.encodings) {
      enc.maxBitrate = spec.bitrate;
      enc.maxFramerate = spec.frameRate;
      enc.scaleResolutionDownBy = scaleDown;
      enc.priority = "high";
      enc.networkPriority = "high";
    }
    await sender.setParameters(params);
  } catch {}
}

function readPrefs() {
  return readAudioPrefs();
}

export function useVoiceRoom(conversationId, me) {
  const [status, setStatus] = useState("idle");
  const [participants, setParticipants] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [restrictions, setRestrictions] = useState({ micMuted: false, playBlocked: false });
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [localScreen, setLocalScreen] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [shareQuality, setShareQuality] = useState("720p");
  const [shareError, setShareError] = useState("");
  const [remoteVideos, setRemoteVideos] = useState({});
  const [devices, setDevices] = useState([]);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [serverTimeDelta, setServerTimeDelta] = useState(0);
  const [connectionCount, setConnectionCount] = useState(0);
  const [conflictOtherDevice, setConflictOtherDevice] = useState(false);
  const [myConnState, setMyConnState] = useState("connecting");

  const prefsRef = useRef(prefs);
  const prefsReadyRef = useRef(false);
  const restrictionsRef = useRef(restrictions);
  const joinedRef = useRef("");
  const joinedAtTsRef = useRef(0);
  const lastReportedConnRef = useRef("");
  const cursorRef = useRef(0);
  const audioCursorRef = useRef(0);
  const relayPlayerRef = useRef(null);
  const relaySenderRef = useRef(null);
  const peersRef = useRef(new Map());
  const participantsRef = useRef([]);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const contextRef = useRef(null);
  const micPipelineRef = useRef(null);
  const hookInstanceId = useRef(`voice-${Math.random().toString(36).slice(2, 9)}`);
  const micOnRef = useRef(false);
  const busyPoll = useRef(false);
  const alive = useRef(true);
  const speakingDetector = useRef(createSpeakingDetector());
  const queuedIce = useRef(new Map());
  const screenStream = useRef(null);
  const screenTrack = useRef(null);
  const shareQualityRef = useRef("720p");
  const sharingRef = useRef(false);

  useEffect(() => {
    prefsRef.current = prefs;
    if (!prefsReadyRef.current) return;
    micPipelineRef.current?.updatePrefs(prefs);
  }, [prefs]);
  useEffect(() => { restrictionsRef.current = restrictions; }, [restrictions]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try { setDevices(await navigator.mediaDevices.enumerateDevices()); } catch {}
  }, []);

  useEffect(() => {
    alive.current = true;
    const saved = readPrefs();
    prefsRef.current = saved;
    prefsReadyRef.current = true;
    setPrefs(saved);
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    const unsub = subscribeAudioPrefs((next, src) => {
      if (src === hookInstanceId.current) return;
      prefsRef.current = next;
      setPrefs(next);
      micPipelineRef.current?.updatePrefs(next);
    });
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      unsub();
    };
  }, [refreshDevices]);

  const send = useCallback((body) =>
    apiFetch(`/api/voice/${conversationId}`, { method: "POST", json: body }), [conversationId]);

  const effectiveVolume = useCallback((userId) => {
    const p = prefsRef.current;
    const participant = participantsRef.current.find((item) => item.userId === userId);
    if (participant?.micMuted) return 0;
    return Math.min(1, Math.max(0, (p.master / 100) * ((p.volumes[String(userId)] ?? 100) / 100)));
  }, []);

  const setAudioOutput = useCallback(async (audio) => {
    const outputId = prefsRef.current.outputId;
    if (outputId && typeof audio.setSinkId === "function") {
      try { await audio.setSinkId(outputId); }
      catch { toast("انتخاب خروجی صدا در این مرورگر یا این پنجره مجاز نیست", "error"); }
    }
  }, []);

  const updateRemoteAudio = useCallback(() => {
    for (const [userId, peer] of peersRef.current) if (peer.audio) {
      peer.audio.volume = effectiveVolume(userId);
      void setAudioOutput(peer.audio);
    }
    for (const p of participantsRef.current) {
      relayPlayerRef.current?.setPeerVolume(String(p.userId), effectiveVolume(p.userId));
    }
  }, [effectiveVolume, setAudioOutput]);

  useEffect(() => { updateRemoteAudio(); }, [prefs, participants, updateRemoteAudio]);

  const closePeer = useCallback((userId) => {
    const peer = peersRef.current.get(userId);
    if (!peer) return;
    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    if (peer.audio) { peer.audio.pause(); peer.audio.srcObject = null; peer.audio.remove(); }
    peersRef.current.delete(userId);
    setRemoteVideos((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setConnectionCount((n) => Math.max(0, n - 1));
  }, []);

  const negotiatePeer = useCallback(async (peer, targetUserId) => {
    if (!joinedRef.current) return;
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
      await send({
        action: "signal",
        joinToken: joinedRef.current,
        toUserId: targetUserId,
        kind: "offer",
        payload: peer.pc.localDescription,
      });
    } catch (e) {
      console.warn("voice renegotiation failed", e);
    } finally {
      peer.makingOffer = false;
      if (peer.needsNegotiation && peer.pc.signalingState === "stable") {
        peer.needsNegotiation = false;
        void negotiatePeer(peer, targetUserId);
      }
    }
  }, [send]);

  const syncLocalMediaToPeer = useCallback(async (peer, targetUserId, triggerOffer = false) => {
    let changed = false;
    try {
      if (peer.audioTransceiver) {
        const wantAudio = trackRef.current ?? null;
        if (peer.audioTransceiver.sender.track !== wantAudio) {
          await peer.audioTransceiver.sender.replaceTrack(wantAudio);
        }
        const wantDir = wantAudio ? "sendrecv" : "recvonly";
        if (peer.audioTransceiver.direction !== wantDir) {
          peer.audioTransceiver.direction = wantDir;
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
        if (wantScreen) {
          await applyVoiceScreenEncoding(peer.screenTransceiver.sender, wantScreen, shareQualityRef.current);
        }
      }
    } catch (err) {
      console.warn("syncLocalMediaToPeer voice failed", err);
    }
    if (triggerOffer || changed) {
      await negotiatePeer(peer, targetUserId);
    }
  }, [negotiatePeer]);

  /** Computes our live WebRTC / audio-relay connection state and syncs changes to the server so peers see it. */
  const recomputeConnState = useCallback(() => {
    const jt = joinedRef.current;
    if (!jt) return;
    const others = participantsRef.current.filter((p) => p.userId !== me.id);
    let next = "connected";
    if (others.length > 0) {
      let connectedCount = 0;
      let reconnectingCount = 0;
      for (const p of others) {
        const peer = peersRef.current.get(p.userId);
        const cs = peer?.pc?.connectionState;
        const ice = peer?.pc?.iceConnectionState;
        if (cs === "connected" || ice === "connected" || ice === "completed") {
          connectedCount++;
        } else if (cs === "disconnected" || cs === "failed" || ice === "disconnected" || ice === "failed") {
          reconnectingCount++;
        }
      }
      if (connectedCount === others.length) {
        next = "connected";
      } else if (reconnectingCount > 0 && connectedCount === 0) {
        next = Date.now() - joinedAtTsRef.current > 3500 ? "relay" : "reconnecting";
      } else if (Date.now() - joinedAtTsRef.current > 3500) {
        next = "relay";
      } else {
        next = "connecting";
      }
    }
    setMyConnState(next);
    if (lastReportedConnRef.current !== next) {
      lastReportedConnRef.current = next;
      setParticipants((list) => list.map((p) => (p.userId === me.id ? { ...p, connState: next } : p)));
      void send({ action: "conn-state", joinToken: jt, state: next }).catch(() => {});
    }
  }, [me.id, send]);

  const stopMic = useCallback(() => {
    if (speakingDetector.current.reset()) setSpeaking(false);
    emitMicLevel(0);
    micPipelineRef.current?.close();
    micPipelineRef.current = null;
    contextRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current?.stop();
    trackRef.current = null;
  }, []);

  const acquireMic = useCallback(async (deviceId) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("این مرورگر یا صفحه اجازهٔ دسترسی به میکروفون ندارد. صفحه را روی HTTPS باز کنید.");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: buildMicConstraints(prefsRef.current, deviceId),
    });
    if (!alive.current) { stream.getTracks().forEach((t) => t.stop()); return; }
    const oldStream = streamRef.current;
    const oldTrack = trackRef.current;
    const oldPipeline = micPipelineRef.current;
    let outputTrack = stream.getAudioTracks()[0];
    const shouldEnable = micOnRef.current && !restrictionsRef.current.micMuted;
    // Keep raw microphone track enabled so WebAudio graph receives real samples!
    stream.getAudioTracks().forEach((t) => { t.enabled = true; });
    try {
      const pipe = createMicAudioPipeline(stream, prefsRef.current, {
        onLevel: (rawLevel, gateOpen) => {
          const active = !joinedRef.current || (micOnRef.current && !restrictionsRef.current.micMuted);
          const level = active ? rawLevel : 0;
          emitMicLevel(level);
          const effectiveSpeakingLevel = prefsRef.current.vadEnabled && !gateOpen ? 0 : level;
          if (speakingDetector.current.push(effectiveSpeakingLevel)) {
            setSpeaking(speakingDetector.current.get());
          }
        },
      });
      micPipelineRef.current = pipe;
      contextRef.current = pipe.context;
      if (pipe.outputTrack) outputTrack = pipe.outputTrack;
    } catch {
      micPipelineRef.current = null;
      contextRef.current = null;
    }
    outputTrack.enabled = shouldEnable;
    if (!contextRef.current) {
      stream.getAudioTracks().forEach((t) => { t.enabled = shouldEnable; });
    }
    streamRef.current = stream;
    trackRef.current = outputTrack;
    for (const [uid, peer] of peersRef.current.entries()) {
      await syncLocalMediaToPeer(peer, uid, true);
    }
    oldPipeline?.close();
    oldStream?.getTracks().forEach((t) => t.stop());
    if (oldTrack && oldTrack !== oldStream?.getAudioTracks()[0]) oldTrack.stop();
    await refreshDevices();
  }, [refreshDevices, syncLocalMediaToPeer]);

  const createPeer = useCallback((user, initiator) => {
    const existing = peersRef.current.get(user.userId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
    ] });
    // Numerical comparison so user IDs like 2 vs 10 never suffer string lexicographical bugs!
    const polite = Number(me.id) > Number(user.userId);
    const peer = {
      pc,
      polite,
      makingOffer: false,
      ignoringOffer: false,
      needsNegotiation: false,
      audioTransceiver: null,
      screenTransceiver: null,
      joinToken: user.joinToken,
      audio: null,
      pendingIce: queuedIce.current.get(user.userId) || [],
    };
    queuedIce.current.delete(user.userId);

    if (initiator) {
      peer.audioTransceiver = pc.addTransceiver("audio", {
        direction: trackRef.current ? "sendrecv" : "recvonly",
      });
      if (trackRef.current) void peer.audioTransceiver.sender.replaceTrack(trackRef.current).catch(() => {});

      peer.screenTransceiver = pc.addTransceiver("video", {
        direction: screenTrack.current ? "sendrecv" : "recvonly",
        streams: screenStream.current ? [screenStream.current] : [],
      });
      if (screenTrack.current) void peer.screenTransceiver.sender.replaceTrack(screenTrack.current).catch(() => {});
    }

    peersRef.current.set(user.userId, peer);
    setConnectionCount((n) => n + 1);

    pc.onnegotiationneeded = () => {
      if (!peer.audioTransceiver && !initiator) return;
      void negotiatePeer(peer, user.userId);
    };

    pc.ontrack = (event) => {
      if (!alive.current) return;
      if (event.track.kind === "video") {
        const track = event.track;
        const publish = () => {
          if (!alive.current) return;
          setRemoteVideos((prev) => ({ ...prev, [user.userId]: new MediaStream([track]) }));
        };
        publish();
        track.onunmute = publish;
        track.onmute = () => {
          if (!alive.current) return;
          setRemoteVideos((prev) => ({ ...prev, [user.userId]: null }));
        };
        track.onended = () => {
          if (!alive.current) return;
          setRemoteVideos((prev) => ({ ...prev, [user.userId]: null }));
        };
        return;
      }
      const audio = peer.audio || document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      audio.volume = effectiveVolume(user.userId);
      audio.style.display = "none";
      if (!peer.audio) document.body.appendChild(audio);
      peer.audio = audio;
      void setAudioOutput(audio);
      void audio.play().catch(() => {});
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && joinedRef.current) void send({
        action: "signal", joinToken: joinedRef.current, toUserId: user.userId,
        kind: "ice", payload: event.candidate.toJSON(),
      }).catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer(user.userId);
      recomputeConnState();
    };
    pc.oniceconnectionstatechange = () => {
      recomputeConnState();
    };
    return peer;
  }, [closePeer, effectiveVolume, me.id, negotiatePeer, recomputeConnState, send, setAudioOutput]);

  const flushIce = useCallback(async (peer) => {
    for (const ice of peer.pendingIce.splice(0)) {
      try { await peer.pc.addIceCandidate(ice); } catch {}
    }
  }, []);

  const handleSignal = useCallback(async (signal, users) => {
    const participant = users.find((p) => p.userId === signal.fromUserId);
    if (!participant || signal.fromUserId === me.id) return;
    let payload;
    try { payload = JSON.parse(signal.payload); } catch { return; }

    if (signal.kind === "offer" || signal.kind === "answer") {
      const peer = createPeer(participant, false);
      try {
        const offerCollision = payload.type === "offer" && (peer.makingOffer || peer.pc.signalingState !== "stable");
        peer.ignoringOffer = !peer.polite && offerCollision;
        if (peer.ignoringOffer) return;

        if (offerCollision && peer.polite) {
          await Promise.all([
            peer.pc.setLocalDescription({ type: "rollback" }).catch(() => {}),
            peer.pc.setRemoteDescription(payload),
          ]);
        } else {
          await peer.pc.setRemoteDescription(payload);
        }

        const transceivers = peer.pc.getTransceivers();
        const audioTs = transceivers.filter((t) => t.receiver?.track?.kind === "audio");
        const videoTs = transceivers.filter((t) => t.receiver?.track?.kind === "video");
        if (!peer.audioTransceiver && audioTs[0]) peer.audioTransceiver = audioTs[0];
        if (!peer.screenTransceiver && videoTs[0]) peer.screenTransceiver = videoTs[0];

        await flushIce(peer);

        if (payload.type === "offer") {
          await syncLocalMediaToPeer(peer, participant.userId, false);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          await send({
            action: "signal",
            joinToken: joinedRef.current,
            toUserId: participant.userId,
            kind: "answer",
            payload: peer.pc.localDescription,
          });
        }
        if (peer.needsNegotiation && peer.pc.signalingState === "stable") {
          peer.needsNegotiation = false;
          void negotiatePeer(peer, participant.userId);
        }
      } catch (e) {
        console.warn("Voice signal failed", signal.kind, e);
        closePeer(participant.userId);
      }
    } else if (signal.kind === "ice") {
      const peer = peersRef.current.get(participant.userId);
      const ice = payload;
      if (!peer) {
        const queue = queuedIce.current.get(participant.userId) || [];
        if (queue.length < 80) queue.push(ice);
        queuedIce.current.set(participant.userId, queue);
      } else if (!peer.pc.remoteDescription) peer.pendingIce.push(ice);
      else try { await peer.pc.addIceCandidate(ice); } catch {}
    }
  }, [closePeer, createPeer, flushIce, me.id, negotiatePeer, send, syncLocalMediaToPeer]);

  const poll = useCallback(async () => {
    if (!joinedRef.current || busyPoll.current) return;
    const myJoin = joinedRef.current;
    busyPoll.current = true;
    try {
      const data = await apiFetch(`/api/voice/${conversationId}?after=${cursorRef.current}&afterAudio=${audioCursorRef.current}`);
      if (!alive.current || joinedRef.current !== myJoin) return;
      cursorRef.current = data.cursor;
      if (typeof data.audioCursor === "number") audioCursorRef.current = data.audioCursor;
      participantsRef.current = data.participants;
      setParticipants(data.participants);
      setTracks(data.tracks);
      setRestrictions(data.myRestrictions);
      restrictionsRef.current = data.myRestrictions;
      setServerTimeDelta(data.serverTime - Date.now());
      if (!data.participants.some((p) => p.userId === me.id && p.joinToken === myJoin)) {
        toast("تماس شما در این پنجره پایان یافت (یا به دستگاه دیگری منتقل شد)", "info");
        joinedRef.current = "";
        try { sessionStorage.removeItem(`inebuly-voice-token:${conversationId}`); } catch {}
        setStatus("idle");
        stopMic();
        for (const id of [...peersRef.current.keys()]) closePeer(id);
        return;
      }
      if (data.myRestrictions.shareBlocked && sharingRef.current) {
        screenTrack.current?.stop();
        screenTrack.current = null;
        screenStream.current = null;
        setLocalScreen(null);
        sharingRef.current = false;
        setSharing(false);
        for (const [uid, peer] of peersRef.current.entries()) {
          await syncLocalMediaToPeer(peer, uid, true);
        }
      }
      const canSpeak = me.permissions.includes("voice.speak") && !data.myRestrictions.micMuted;
      if (!canSpeak && micOnRef.current) {
        micOnRef.current = false;
        setMicOn(false);
        if (trackRef.current) trackRef.current.enabled = false;
        streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
      }
      for (const [id, peer] of peersRef.current) {
        const p = data.participants.find((item) => item.userId === id);
        if (!p || peer.joinToken !== p.joinToken) closePeer(id);
      }
      for (const signal of data.signals) await handleSignal(signal, data.participants);
      if (typeof RTCPeerConnection !== "undefined") {
        for (const participant of data.participants) {
          if (participant.userId === me.id || Number(me.id) > Number(participant.userId) || peersRef.current.has(participant.userId)) continue;
          createPeer(participant, true);
        }
      }
      // Play relayed audio chunks ONLY for peers whose direct WebRTC P2P ICE is NOT yet connected!
      if (Array.isArray(data.audioChunks) && data.audioChunks.length > 0) {
        if (!relayPlayerRef.current) relayPlayerRef.current = createRelayAudioPlayer();
        for (const chunk of data.audioChunks) {
          const peer = peersRef.current.get(chunk.fromUserId);
          const p2pConnected = peer?.pc?.connectionState === "connected" || peer?.pc?.iceConnectionState === "connected";
          if (p2pConnected) continue;
          const vol = effectiveVolume(chunk.fromUserId);
          if (vol > 0) {
            void relayPlayerRef.current.playChunk(String(chunk.fromUserId), chunk.data, chunk.mime, vol);
          }
        }
      }
      recomputeConnState();
    } catch (err) {
      if (err.message.includes("پایان یافته") || err.message.includes("عضو این گفتگو") || err.message.includes("مسدودسازی")) {
        joinedRef.current = "";
        setStatus("idle");
        stopMic();
        for (const id of [...peersRef.current.keys()]) closePeer(id);
        toast(err.message, "error");
      }
    } finally { busyPoll.current = false; }
  }, [closePeer, conversationId, createPeer, effectiveVolume, handleSignal, me.id, me.permissions, recomputeConnState, stopMic, syncLocalMediaToPeer]);

  /** Internal: release the capture without touching the server (used when leaving). */
  const stopShareInternal = () => {
    screenTrack.current?.stop();
    screenTrack.current = null;
    screenStream.current = null;
    setLocalScreen(null);
    sharingRef.current = false;
    setSharing(false);
    setShareError("");
    setRemoteVideos({});
  };

  const stopShare = useCallback(() => {
    const wasSharing = sharingRef.current;
    if (screenTrack.current) {
      screenTrack.current.onended = null;
      screenTrack.current.stop();
      screenTrack.current = null;
    }
    screenStream.current = null;
    setLocalScreen(null);
    sharingRef.current = false;
    setSharing(false);
    setParticipants((list) =>
      list.map((p) => (p.userId === me.id ? { ...p, sharingOn: false } : p)),
    );
    void (async () => {
      for (const [uid, peer] of peersRef.current.entries()) {
        await syncLocalMediaToPeer(peer, uid, true).catch(() => {});
      }
      if (wasSharing && joinedRef.current) {
        await send({ action: "share", joinToken: joinedRef.current, on: false }).catch(() => {});
      }
    })();
  }, [me.id, send, syncLocalMediaToPeer]);

  const startShare = useCallback(async (quality) => {
    if (!joinedRef.current) return toast("اول به تماس بپیوندید", "error");
    if (!me.permissions.includes("screen.share")) return toast("نقش شما اجازهٔ اشتراک صفحه ندارد", "error");
    if (restrictionsRef.current.shareBlocked) return toast("مدیر اشتراک صفحهٔ شما را بسته است", "error");
    if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") return toast("این مرورگر اشتراک صفحه را پشتیبانی نمی‌کند", "error");
    const c = QUALITY[quality] ?? QUALITY["720p"];
    try {
      setShareError("");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: c.width, max: c.width },
          height: { ideal: c.height, max: c.height },
          frameRate: { ideal: c.frameRate, max: c.frameRate },
        },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("صفحه‌ای انتخاب نشد");
      await track.applyConstraints?.({
        width: { ideal: c.width, max: c.width },
        height: { ideal: c.height, max: c.height },
        frameRate: { ideal: c.frameRate, max: c.frameRate },
      }).catch(() => {});
      if (screenTrack.current) screenTrack.current.stop();
      screenStream.current = stream;
      screenTrack.current = track;
      shareQualityRef.current = quality;
      setLocalScreen(stream);
      sharingRef.current = true;
      setShareQuality(quality);
      setSharing(true);
      setParticipants((list) =>
        list.map((p) => (p.userId === me.id ? { ...p, sharingOn: true, shareQuality: quality } : p)),
      );
      track.onended = () => stopShare();
      void (async () => {
        await send({ action: "share", joinToken: joinedRef.current, on: true, quality }).catch(() => {});
        for (const [uid, peer] of peersRef.current.entries()) {
          await syncLocalMediaToPeer(peer, uid, true).catch(() => {});
        }
      })();
    } catch (e) {
      const msg = e.message || "";
      setShareError(msg.includes("Permission") || msg.includes("NotAllowed") ? "اشتراک صفحه لغو شد" : msg);
      screenTrack.current = null;
      screenStream.current = null;
      setLocalScreen(null);
      sharingRef.current = false;
      setSharing(false);
    }
  }, [me.permissions, send, stopShare, syncLocalMediaToPeer]);

  const leave = useCallback(async () => {
    const token = joinedRef.current;
    joinedRef.current = "";
    try { sessionStorage.removeItem(`inebuly-voice-token:${conversationId}`); } catch {}
    cursorRef.current = 0;
    setStatus("idle");
    setConflictOtherDevice(false);
    setTracks([]);
    setParticipants([]);
    setMicOn(false);
    setSpeaking(false);
    micOnRef.current = false;
    stopMic();
    stopShareInternal();
    for (const id of [...peersRef.current.keys()]) closePeer(id);
    queuedIce.current.clear();
    if (token) try { await send({ action: "leave", joinToken: token }); } catch {}
  }, [closePeer, conversationId, send, stopMic]);

  // Leave whenever the voice panel closes or its conversation changes.
  useEffect(() => {
    return () => {
      alive.current = false;
      const token = joinedRef.current;
      joinedRef.current = "";
      relaySenderRef.current?.stop();
      relaySenderRef.current = null;
      relayPlayerRef.current?.destroy();
      relayPlayerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      trackRef.current?.stop();
      screenStream.current?.getTracks().forEach((t) => t.stop());
      micPipelineRef.current?.close();
      micPipelineRef.current = null;
      contextRef.current = null;
      for (const peer of peersRef.current.values()) {
        peer.pc.close();
        if (peer.audio) { peer.audio.pause(); peer.audio.srcObject = null; peer.audio.remove(); }
      }
      peersRef.current.clear();
      if (token) void send({ action: "leave", joinToken: token }).catch(() => {});
    };
  }, [send]);

  useEffect(() => {
    if (status !== "joined") return;
    if (!relayPlayerRef.current) relayPlayerRef.current = createRelayAudioPlayer();
    const sender = createRelayAudioSender({
      getTrack: () => (micOnRef.current ? trackRef.current : null),
      shouldSend: () => {
        if (!joinedRef.current || !micOnRef.current || restrictionsRef.current.micMuted) return false;
        const others = participantsRef.current.filter((p) => p.userId !== me.id);
        if (!others.length) return false;
        // Send relayed audio whenever at least one peer is NOT connected via direct P2P WebRTC!
        return others.some((p) => {
          const peer = peersRef.current.get(p.userId);
          return !(peer?.pc?.connectionState === "connected" || peer?.pc?.iceConnectionState === "connected");
        });
      },
      onChunk: (data, mime) => {
        if (!joinedRef.current) return;
        void send({ action: "audio-chunk", joinToken: joinedRef.current, data, mime }).catch(() => {});
      },
      sliceMs: 420,
    });
    relaySenderRef.current = sender;
    sender.start();

    let bc = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel(`inebuly-voice-${conversationId}`);
        bc.onmessage = (ev) => {
          if (ev.data?.type === "evict" && ev.data?.winnerJoinToken && ev.data.winnerJoinToken !== joinedRef.current) {
            joinedRef.current = "";
            try { sessionStorage.removeItem(`inebuly-voice-token:${conversationId}`); } catch {}
            setStatus("idle");
            stopMic();
            stopShareInternal();
            for (const id of [...peersRef.current.keys()]) closePeer(id);
            toast("تماس به تب یا دستگاه جدید شما منتقل شد", "info");
          }
        };
      } catch {
        bc = null;
      }
    }
    const unlock = () => {
      if (contextRef.current?.state === "suspended") void contextRef.current.resume().catch(() => {});
      relayPlayerRef.current?.resume();
      for (const peer of peersRef.current.values()) {
        if (peer.audio && peer.audio.paused) void peer.audio.play().catch(() => {});
      }
    };
    const onTabClose = () => {
      // Note: on refresh we keep sessionStorage joinToken so same tab reconnects immediately;
      // if tab is closed completely, sessionStorage dies with it and VOICE_TIMEOUT_MS cleans up in 12s.
      const jt = joinedRef.current;
      const auth = getToken();
      if (!jt || document.visibilityState === "visible") return;
      void fetch(`/api/voice/${conversationId}${auth ? `?token=${encodeURIComponent(auth)}` : ""}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(auth ? { Authorization: `Bearer ${auth}`, "x-voxsy-token": auth } : {}),
        },
        body: JSON.stringify({ action: "heartbeat", joinToken: jt }),
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => {});
    };
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock, { passive: true });
    window.addEventListener("pagehide", onTabClose);
    void poll();
    // Poll every 450ms so relayed audio & signals arrive with sub-second conversational latency
    const ticker = setInterval(() => void poll(), 450);
    const heartbeat = setInterval(() => {
      if (joinedRef.current) void send({ action: "heartbeat", joinToken: joinedRef.current }).catch(() => {});
    }, 4500);
    return () => {
      sender.stop();
      relaySenderRef.current = null;
      bc?.close();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      window.removeEventListener("pagehide", onTabClose);
      clearInterval(ticker);
      clearInterval(heartbeat);
    };
  }, [closePeer, conversationId, me.id, poll, send, status, stopMic]);

  /** Lobby: open the microphone before joining so the user can see the level meter and pick a device. */
  const previewMic = useCallback(async () => {
    setMicError("");
    try {
      await acquireMic(prefsRef.current.inputId);
      if (trackRef.current) trackRef.current.enabled = false;
      return true;
    } catch (err) {
      setMicError("دسترسی به میکروفون داده نشد. از تنظیمات مرورگر مجوز را فعال کنید؛ بدون آن فقط شنونده خواهید بود.");
      console.warn("Microphone preview failed", err);
      return false;
    }
  }, [acquireMic]);

  const stopPreview = useCallback(() => {
    if (!joinedRef.current) stopMic();
  }, [stopMic]);

  const join = useCallback(async (options) => {
    if (joinedRef.current || status === "connecting") return;
    setStatus("connecting");
    setMicError("");
    setConflictOtherDevice(false);
    const wantMic = options?.micEnabled ?? false;
    const forceTakeover = options?.forceTakeover === true;
    let savedJoinToken = "";
    try { savedJoinToken = sessionStorage.getItem(`inebuly-voice-token:${conversationId}`) || ""; } catch {}
    if (me.permissions.includes("voice.speak") && !trackRef.current) {
      try { await acquireMic(prefsRef.current.inputId); }
      catch (err) {
        setMicError("دسترسی میکروفون ممکن نیست. می‌توانید فقط شنونده باشید؛ برای صحبت، مجوز میکروفون و HTTPS را بررسی کنید.");
        console.warn("Microphone unavailable", err);
      }
    }
    try {
      const data = await send({ action: "join", joinToken: savedJoinToken, forceTakeover });
      if (!alive.current) return;
      joinedAtTsRef.current = Date.now();
      lastReportedConnRef.current = "";
      setMyConnState("connecting");
      joinedRef.current = data.joinToken;
      try { sessionStorage.setItem(`inebuly-voice-token:${conversationId}`, data.joinToken); } catch {}
      cursorRef.current = data.cursor;
      if (typeof data.audioCursor === "number") audioCursorRef.current = data.audioCursor;
      participantsRef.current = data.participants;
      setParticipants(data.participants);
      setTracks(data.tracks);
      setRestrictions(data.myRestrictions);
      restrictionsRef.current = data.myRestrictions;
      setServerTimeDelta(data.serverTime - Date.now());
      setStatus("joined");
      if (forceTakeover && typeof BroadcastChannel !== "undefined") {
        try {
          const bc = new BroadcastChannel(`inebuly-voice-${conversationId}`);
          bc.postMessage({ type: "evict", winnerJoinToken: data.joinToken });
          bc.close();
        } catch {}
      }
      if (typeof RTCPeerConnection === "undefined") setMicError("مرورگر شما WebRTC ندارد؛ موسیقی کار می‌کند اما تماس میکروفونی در دسترس نیست.");
      if (wantMic && trackRef.current && me.permissions.includes("voice.speak") && !data.myRestrictions.micMuted) {
        try {
          if (contextRef.current?.state === "suspended") await contextRef.current.resume().catch(() => {});
          await send({ action: "mic", joinToken: data.joinToken, on: true });
          micOnRef.current = true;
          trackRef.current.enabled = true;
          streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
          setMicOn(true);
        } catch { /* stays muted */ }
      }
      toast(forceTakeover ? "دستگاه قبلی قطع شد و با این دستگاه وارد شدید" : "به تماس صوتی پیوستید", "success");
    } catch (err) {
      stopMic();
      setStatus("idle");
      if (err?.body?.code === "ALREADY_IN_VOICE_OTHER_DEVICE") {
        setConflictOtherDevice(true);
      } else {
        toast(err.message, "error");
      }
    }
  }, [acquireMic, conversationId, me.permissions, send, status, stopMic]);

  const toggleMic = useCallback(async () => {
    if (!joinedRef.current) return;
    if (restrictionsRef.current.micMuted || !me.permissions.includes("voice.speak")) return toast("مجوز میکروفون شما محدود شده است", "error");
    const next = !micOnRef.current;

    // Instant zero-delay mute!
    if (!next) {
      micOnRef.current = false;
      if (trackRef.current) trackRef.current.enabled = false;
      streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
      setMicOn(false);
      setSpeaking(false);
      setParticipants((list) =>
        list.map((p) => (p.userId === me.id ? { ...p, micOn: false } : p)),
      );
      void send({ action: "mic", joinToken: joinedRef.current, on: false }).catch(() => {});
      return;
    }

    if (!trackRef.current) {
      try { await acquireMic(prefsRef.current.inputId); setMicError(""); }
      catch { setMicError("دسترسی به میکروفون داده نشد. تنظیمات مرورگر را بررسی کنید."); return; }
    }
    if (contextRef.current?.state === "suspended") void contextRef.current.resume().catch(() => {});
    micOnRef.current = true;
    if (trackRef.current) trackRef.current.enabled = true;
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
    setMicOn(true);
    setParticipants((list) =>
      list.map((p) => (p.userId === me.id ? { ...p, micOn: true } : p)),
    );
    void (async () => {
      try {
        await send({ action: "mic", joinToken: joinedRef.current, on: true });
        for (const [uid, peer] of peersRef.current.entries()) {
          await syncLocalMediaToPeer(peer, uid, true);
        }
      } catch (err) {
        micOnRef.current = false;
        if (trackRef.current) trackRef.current.enabled = false;
        setMicOn(false);
        toast(err.message, "error");
      }
    })();
  }, [acquireMic, me.id, me.permissions, send, syncLocalMediaToPeer]);

  const updateAudioPrefs = useCallback((patchOrFn) => {
    const next = saveAudioPrefs(patchOrFn, hookInstanceId.current);
    prefsRef.current = next;
    setPrefs(next);
    micPipelineRef.current?.updatePrefs(next);
    return next;
  }, []);

  const changeInput = useCallback(async (id) => {
    const old = prefsRef.current.inputId;
    updateAudioPrefs({ inputId: id });
    if (joinedRef.current && me.permissions.includes("voice.speak")) {
      try { await acquireMic(id); setMicError(""); toast("میکروفون تغییر کرد", "success"); }
      catch { updateAudioPrefs({ inputId: old }); toast("اتصال به این میکروفون ممکن نیست", "error"); }
    }
  }, [acquireMic, me.permissions, updateAudioPrefs]);

  const changeOutput = useCallback(async (id) => {
    const test = document.createElement("audio");
    if (id && typeof test.setSinkId !== "function") return toast("مرورگر شما انتخاب خروجی صدا را پشتیبانی نمی‌کند", "error");
    if (id) try { await test.setSinkId(id); } catch { return toast("دسترسی به این خروجی صدا داده نشد", "error"); }
    updateAudioPrefs({ outputId: id });
    for (const peer of peersRef.current.values()) if (peer.audio && typeof peer.audio.setSinkId === "function") {
      try { await peer.audio.setSinkId(id); } catch {}
    }
  }, [updateAudioPrefs]);

  const setMaster = useCallback((n) => updateAudioPrefs({ master: Math.min(100, Math.max(0, n)) }), [updateAudioPrefs]);
  const setMicGain = useCallback((n) => {
    const level = Math.min(200, Math.max(0, n));
    updateAudioPrefs({ micGain: level });
  }, [updateAudioPrefs]);
  const setVolume = useCallback((userId, n) => updateAudioPrefs((p) => ({
    ...p, volumes: { ...p.volumes, [String(userId)]: Math.min(100, Math.max(0, n)) },
  })), [updateAudioPrefs]);
  const enableAudio = useCallback(() => {
    for (const peer of peersRef.current.values()) if (peer.audio) void peer.audio.play().catch(() => {});
    if (contextRef.current?.state === "suspended") void contextRef.current.resume().catch(() => {});
  }, []);

  return {
    status, join, leave, previewMic, stopPreview, participants, tracks, restrictions, micOn, micError,
    myConnState,
    speaking, sharing, shareQuality, shareError, remoteVideos, localScreen, startShare, stopShare,
    devices, prefs, serverTimeDelta, connectionCount, joinToken: joinedRef.current,
    conflictOtherDevice, clearConflict: () => setConflictOtherDevice(false),
    toggleMic, changeInput, changeOutput, setMaster, setMicGain, setVolume, updateAudioPrefs, enableAudio,
    refreshDevices,
  };
}
