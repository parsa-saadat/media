import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, toast } from "../utils/client";
import { createSpeakingDetector, emitMicLevel } from "../utils/micMeter";

const DEFAULT_PREFS = { inputId: "", outputId: "", master: 100, micGain: 100, volumes: {} };

/** Capture constraints per shared-screen quality. */
const QUALITY = {
  "360p": { width: 640, height: 360, frameRate: 15 },
  "720p": { width: 1280, height: 720, frameRate: 24 },
  "1080p": { width: 1920, height: 1080, frameRate: 30 },
};

function readPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem("voxsy-voice-settings") || "{}");
    return { ...DEFAULT_PREFS, ...raw, volumes: raw.volumes || {} };
  } catch { return DEFAULT_PREFS; }
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

  const prefsRef = useRef(prefs);
  const prefsReadyRef = useRef(false);
  const restrictionsRef = useRef(restrictions);
  const joinedRef = useRef("");
  const cursorRef = useRef(0);
  const peersRef = useRef(new Map());
  const participantsRef = useRef([]);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const contextRef = useRef(null);
  const gainRef = useRef(null);
  const micOnRef = useRef(false);
  const busyPoll = useRef(false);
  const alive = useRef(true);
  const levelFrame = useRef(0);
  const speakingDetector = useRef(createSpeakingDetector());
  const queuedIce = useRef(new Map());
  const screenStream = useRef(null);
  const screenTrack = useRef(null);
  const sharingRef = useRef(false);

  useEffect(() => {
    prefsRef.current = prefs;
    if (!prefsReadyRef.current) return;
    try { localStorage.setItem("voxsy-voice-settings", JSON.stringify(prefs)); } catch {}
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
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  const send = useCallback((body) =>
    apiFetch(`/api/voice/${conversationId}`, { method: "POST", json: body }), [conversationId]);

  const effectiveVolume = useCallback((userId) => {
    const p = prefsRef.current;
    const participant = participantsRef.current.find((item) => item.userId === userId);
    if (participant && (!participant.micOn || participant.micMuted)) return 0;
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
      }
    } catch (err) {
      console.warn("syncLocalMediaToPeer voice failed", err);
    }
    if (triggerOffer || changed) {
      await negotiatePeer(peer, targetUserId);
    }
  }, [negotiatePeer]);

  const stopMic = useCallback(() => {
    if (levelFrame.current) cancelAnimationFrame(levelFrame.current);
    levelFrame.current = 0;
    if (speakingDetector.current.reset()) setSpeaking(false);
    emitMicLevel(0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current?.stop();
    trackRef.current = null;
    if (contextRef.current) void contextRef.current.close().catch(() => {});
    contextRef.current = null;
    gainRef.current = null;
  }, []);

  const acquireMic = useCallback(async (deviceId) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("این مرورگر یا صفحه اجازهٔ دسترسی به میکروفون ندارد. صفحه را روی HTTPS باز کنید.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
      ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    } });
    if (!alive.current) { stream.getTracks().forEach((t) => t.stop()); return; }
    const oldStream = streamRef.current;
    const oldTrack = trackRef.current;
    const oldContext = contextRef.current;
    let outputTrack = stream.getAudioTracks()[0];
    let context = null;
    let gain = null;
    try {
      context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      gain = context.createGain();
      gain.gain.value = prefsRef.current.micGain / 100;
      const destination = context.createMediaStreamDestination();
      source.connect(gain).connect(destination);
      outputTrack = destination.stream.getAudioTracks()[0];
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      if (levelFrame.current) cancelAnimationFrame(levelFrame.current);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastUpdate = 0;
      const measure = (time) => {
        if (time - lastUpdate > 60) {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += (v - 128) ** 2;
          const level = Math.min(100, Math.round(Math.sqrt(sum / data.length) * 5));
          emitMicLevel(level);
          if (speakingDetector.current.push(level)) setSpeaking(speakingDetector.current.get());
          lastUpdate = time;
        }
        levelFrame.current = requestAnimationFrame(measure);
      };
      levelFrame.current = requestAnimationFrame(measure);
    } catch { if (context) void context.close().catch(() => {}); context = null; gain = null; }
    outputTrack.enabled = micOnRef.current && !restrictionsRef.current.micMuted;
    stream.getAudioTracks().forEach((t) => { t.enabled = outputTrack.enabled; });
    streamRef.current = stream;
    trackRef.current = outputTrack;
    contextRef.current = context;
    gainRef.current = gain;
    for (const [uid, peer] of peersRef.current.entries()) {
      await syncLocalMediaToPeer(peer, uid, true);
    }
    oldStream?.getTracks().forEach((t) => t.stop());
    if (oldTrack && oldTrack !== oldStream?.getAudioTracks()[0]) oldTrack.stop();
    if (oldContext) void oldContext.close().catch(() => {});
    await refreshDevices();
  }, [refreshDevices, syncLocalMediaToPeer]);

  const createPeer = useCallback((user, initiator) => {
    const existing = peersRef.current.get(user.userId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ] });
    const polite = String(me.id) > String(user.userId);
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
    };
    return peer;
  }, [closePeer, effectiveVolume, me.id, negotiatePeer, send, setAudioOutput]);

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
      const data = await apiFetch(`/api/voice/${conversationId}?after=${cursorRef.current}`);
      if (!alive.current || joinedRef.current !== myJoin) return;
      cursorRef.current = data.cursor;
      participantsRef.current = data.participants;
      setParticipants(data.participants);
      setTracks(data.tracks);
      setRestrictions(data.myRestrictions);
      restrictionsRef.current = data.myRestrictions;
      setServerTimeDelta(data.serverTime - Date.now());
      if (!data.participants.some((p) => p.userId === me.id && p.joinToken === myJoin)) {
        toast("ارتباط تماس قطع شد؛ دوباره به تماس بپیوندید", "error");
        joinedRef.current = "";
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
          if (participant.userId === me.id || String(me.id) > String(participant.userId) || peersRef.current.has(participant.userId)) continue;
          createPeer(participant, true);
        }
      }
    } catch (err) {
      if (err.message.includes("پایان یافته") || err.message.includes("عضو این گفتگو") || err.message.includes("مسدودسازی")) {
        joinedRef.current = "";
        setStatus("idle");
        stopMic();
        for (const id of [...peersRef.current.keys()]) closePeer(id);
        toast(err.message, "error");
      }
    } finally { busyPoll.current = false; }
  }, [closePeer, conversationId, createPeer, handleSignal, me.id, me.permissions, stopMic, syncLocalMediaToPeer]);

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

  const stopShare = useCallback(async () => {
    const wasSharing = sharingRef.current;
    screenTrack.current?.stop();
    screenTrack.current = null;
    screenStream.current = null;
    setLocalScreen(null);
    sharingRef.current = false;
    setSharing(false);
    for (const [uid, peer] of peersRef.current.entries()) {
      await syncLocalMediaToPeer(peer, uid, true);
    }
    if (wasSharing && joinedRef.current) await send({ action: "share", joinToken: joinedRef.current, on: false }).catch(() => {});
  }, [send, syncLocalMediaToPeer]);

  const startShare = useCallback(async (quality) => {
    if (!joinedRef.current) return toast("اول به تماس بپیوندید", "error");
    if (!me.permissions.includes("screen.share")) return toast("نقش شما اجازهٔ اشتراک صفحه ندارد", "error");
    if (restrictionsRef.current.shareBlocked) return toast("مدیر اشتراک صفحهٔ شما را بسته است", "error");
    if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") return toast("این مرورگر اشتراک صفحه را پشتیبانی نمی‌کند", "error");
    const c = QUALITY[quality] ?? QUALITY["720p"];
    try {
      setShareError("");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: c.width }, height: { ideal: c.height }, frameRate: { ideal: c.frameRate } },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("صفحه‌ای انتخاب نشد");
      if (screenTrack.current) screenTrack.current.stop();
      screenStream.current = stream;
      screenTrack.current = track;
      setLocalScreen(stream);
      sharingRef.current = true;
      setShareQuality(quality);
      track.onended = () => void stopShare();
      await send({ action: "share", joinToken: joinedRef.current, on: true, quality });
      setSharing(true);
      for (const [uid, peer] of peersRef.current.entries()) {
        await syncLocalMediaToPeer(peer, uid, true);
      }
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
    cursorRef.current = 0;
    setStatus("idle");
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
  }, [closePeer, send, stopMic]);

  // Leave whenever the voice panel closes or its conversation changes.
  useEffect(() => {
    return () => {
      alive.current = false;
      const token = joinedRef.current;
      joinedRef.current = "";
      streamRef.current?.getTracks().forEach((t) => t.stop());
      trackRef.current?.stop();
      screenStream.current?.getTracks().forEach((t) => t.stop());
      if (contextRef.current) void contextRef.current.close().catch(() => {});
      if (levelFrame.current) cancelAnimationFrame(levelFrame.current);
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
    void poll();
    const ticker = setInterval(() => void poll(), 1400);
    const heartbeat = setInterval(() => {
      if (joinedRef.current) void send({ action: "heartbeat", joinToken: joinedRef.current }).catch(() => {});
    }, 5000);
    return () => { clearInterval(ticker); clearInterval(heartbeat); };
  }, [poll, send, status]);

  /** Lobby: open the microphone before joining so the user can see the level meter and pick a device. */
  const previewMic = useCallback(async () => {
    setMicError("");
    try {
      await acquireMic(prefsRef.current.inputId);
      if (trackRef.current) trackRef.current.enabled = false;
      streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
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
    const wantMic = options?.micEnabled ?? false;
    if (me.permissions.includes("voice.speak") && !trackRef.current) {
      try { await acquireMic(prefsRef.current.inputId); }
      catch (err) {
        setMicError("دسترسی میکروفون ممکن نیست. می‌توانید فقط شنونده باشید؛ برای صحبت، مجوز میکروفون و HTTPS را بررسی کنید.");
        console.warn("Microphone unavailable", err);
      }
    }
    try {
      const data = await send({ action: "join" });
      if (!alive.current) return;
      joinedRef.current = data.joinToken;
      cursorRef.current = data.cursor;
      participantsRef.current = data.participants;
      setParticipants(data.participants);
      setTracks(data.tracks);
      setRestrictions(data.myRestrictions);
      restrictionsRef.current = data.myRestrictions;
      setServerTimeDelta(data.serverTime - Date.now());
      setStatus("joined");
      if (typeof RTCPeerConnection === "undefined") setMicError("مرورگر شما WebRTC ندارد؛ موسیقی کار می‌کند اما تماس میکروفونی در دسترس نیست.");
      if (wantMic && trackRef.current && me.permissions.includes("voice.speak") && !data.myRestrictions.micMuted) {
        try {
          await send({ action: "mic", joinToken: data.joinToken, on: true });
          micOnRef.current = true;
          trackRef.current.enabled = true;
          streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
          setMicOn(true);
        } catch { /* stays muted */ }
      }
      toast("به تماس صوتی پیوستید", "success");
    } catch (err) { stopMic(); setStatus("idle"); toast(err.message, "error"); }
  }, [acquireMic, me.permissions, send, status, stopMic]);

  const toggleMic = useCallback(async () => {
    if (!joinedRef.current) return;
    if (restrictionsRef.current.micMuted || !me.permissions.includes("voice.speak")) return toast("مجوز میکروفون شما محدود شده است", "error");
    if (!trackRef.current) {
      try { await acquireMic(prefsRef.current.inputId); setMicError(""); }
      catch { setMicError("دسترسی به میکروفون داده نشد. تنظیمات مرورگر را بررسی کنید."); return; }
    }
    const next = !micOnRef.current;
    try {
      await send({ action: "mic", joinToken: joinedRef.current, on: next });
      micOnRef.current = next;
      if (trackRef.current) trackRef.current.enabled = next;
      streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
      for (const [uid, peer] of peersRef.current.entries()) {
        await syncLocalMediaToPeer(peer, uid, true);
      }
      setMicOn(next);
    } catch (err) { toast(err.message, "error"); }
  }, [acquireMic, me.permissions, send, syncLocalMediaToPeer]);

  const changeInput = useCallback(async (id) => {
    const old = prefsRef.current.inputId;
    setPrefs((p) => ({ ...p, inputId: id }));
    prefsRef.current = { ...prefsRef.current, inputId: id };
    if (joinedRef.current && me.permissions.includes("voice.speak")) {
      try { await acquireMic(id); setMicError(""); toast("میکروفون تغییر کرد", "success"); }
      catch { setPrefs((p) => ({ ...p, inputId: old })); prefsRef.current.inputId = old; toast("اتصال به این میکروفون ممکن نیست", "error"); }
    }
  }, [acquireMic, me.permissions]);

  const changeOutput = useCallback(async (id) => {
    const test = document.createElement("audio");
    if (id && typeof test.setSinkId !== "function") return toast("مرورگر شما انتخاب خروجی صدا را پشتیبانی نمی‌کند", "error");
    if (id) try { await test.setSinkId(id); } catch { return toast("دسترسی به این خروجی صدا داده نشد", "error"); }
    setPrefs((p) => ({ ...p, outputId: id }));
    prefsRef.current = { ...prefsRef.current, outputId: id };
    for (const peer of peersRef.current.values()) if (peer.audio && typeof peer.audio.setSinkId === "function") {
      try { await peer.audio.setSinkId(id); } catch {}
    }
  }, []);

  const setMaster = useCallback((n) => setPrefs((p) => ({ ...p, master: Math.min(100, Math.max(0, n)) })), []);
  const setMicGain = useCallback((n) => {
    const level = Math.min(200, Math.max(0, n));
    setPrefs((p) => ({ ...p, micGain: level }));
    if (gainRef.current) gainRef.current.gain.value = level / 100;
  }, []);
  const setVolume = useCallback((userId, n) => setPrefs((p) => ({
    ...p, volumes: { ...p.volumes, [String(userId)]: Math.min(100, Math.max(0, n)) },
  })), []);
  const enableAudio = useCallback(() => {
    for (const peer of peersRef.current.values()) if (peer.audio) void peer.audio.play().catch(() => {});
    if (contextRef.current?.state === "suspended") void contextRef.current.resume().catch(() => {});
  }, []);

  return {
    status, join, leave, previewMic, stopPreview, participants, tracks, restrictions, micOn, micError,
    speaking, sharing, shareQuality, shareError, remoteVideos, localScreen, startShare, stopShare,
    devices, prefs, serverTimeDelta, connectionCount, joinToken: joinedRef.current,
    toggleMic, changeInput, changeOutput, setMaster, setMicGain, setVolume, enableAudio,
    refreshDevices,
  };
}
