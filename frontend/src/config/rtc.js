/**
 * WebRTC ICE configuration shared by the meeting and voice-room hooks.
 *
 * STUN alone only works when both peers can reach each other directly. Behind CGNAT, mobile data,
 * strict/symmetric NATs or filtered networks the connection fails and audio, camera and screen share
 * all stay dead (black video, no sound). A TURN server relays the media and fixes that.
 *
 * Configure in frontend/.env (see .env.example):
 *   VITE_TURN_URL=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:443?transport=tcp
 *   VITE_TURN_USERNAME=...
 *   VITE_TURN_CREDENTIAL=...
 *   VITE_FORCE_RELAY=true   (optional: only use TURN, handy for testing)
 */
const env = import.meta.env || {};

const STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

const turnUrls = String(env.VITE_TURN_URL || "").split(",").map((s) => s.trim()).filter(Boolean);
const TURN = turnUrls.length
  ? [{ urls: turnUrls, username: env.VITE_TURN_USERNAME || "", credential: env.VITE_TURN_CREDENTIAL || "" }]
  : [];

export const HAS_TURN = TURN.length > 0;

export const RTC_CONFIG = {
  iceServers: [...STUN, ...TURN],
  iceCandidatePoolSize: 4,
  ...(env.VITE_FORCE_RELAY === "true" && HAS_TURN ? { iceTransportPolicy: "relay" } : {}),
};

/** Logs the connection state and warns when a failure is most likely caused by a missing TURN server. */
export function watchIce(pc, label = "peer") {
  pc.addEventListener("iceconnectionstatechange", () => {
    console.info(`[rtc] ${label} ice=${pc.iceConnectionState} conn=${pc.connectionState}`);
    if (pc.iceConnectionState === "failed" && !HAS_TURN) {
      console.warn("[rtc] ICE failed and no TURN server is configured (VITE_TURN_URL). Peers behind NAT/CGNAT cannot connect; audio/camera/screen stay black.");
    }
  });
}
