import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, faNum, toast } from "../utils/client";
import { navigate } from "../utils/router";
import { useSession } from "../utils/session";
import { useMeeting } from "../hooks/useMeeting";
import { Avatar } from "../components/common/Ui";
import { Icon } from "../components/common/Icon";
import { ContextMenu, useContextMenu } from "../components/common/ContextMenu";
import { useConfirm } from "../components/common/Confirm";
import { MicMeter, subscribeMicLevel } from "../utils/micMeter";
import GamesPanel from "../components/meet/GamesPanel";
import UserProfileModal from "../components/profile/UserProfileModal";
import DraggablePiP from "../components/common/DraggablePiP";
import AudioSettingsSection from "../components/common/AudioSettingsSection";

const RESOLUTIONS = [
  { id: "480p", label: "۴۸۰p", badge: "SD", res: "854×480", bitrate: "۱.۱Mbps", hint: "اینترنت ضعیف و مصرف کم" },
  { id: "720p", label: "۷۲۰p", badge: "HD", res: "1280×720", bitrate: "۲.۸Mbps", hint: "تعادل عالی وضوح و سرعت" },
  { id: "1080p", label: "۱۰۸۰p", badge: "FHD", res: "1920×1080", bitrate: "۶.۰Mbps", hint: "بالاترین وضوح کد و متن" },
];
const FPS_OPTIONS = [
  { value: 30, label: "۳۰ فریم", sub: "پایدار · متن و ارائه" },
  { value: 60, label: "۶۰ فریم", sub: "فوق‌روان · ویدیو و بازی" },
];

/** Clean, predictable FULL-WIDTH responsive grid class by headcount when no stage is pinned/shared.
 *  Participant cards always span the entire available stage width (even when count === 1).
 */
function adaptiveGridClass(count) {
  if (count <= 1) return "grid-cols-1 w-full";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2 w-full";
  if (count === 3) return "grid-cols-1 sm:grid-cols-3 w-full";
  if (count === 4) return "grid-cols-2 w-full";
  if (count <= 6) return "grid-cols-2 lg:grid-cols-3 w-full";
  if (count <= 9) return "grid-cols-2 md:grid-cols-3 w-full";
  return "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 w-full";
}

const CONN_META = {
  connecting: {
    label: "در حال اتصال…",
    short: "در حال اتصال…",
    dot: "bg-amber-400 animate-pulse",
    cls: "border-amber-400/40 bg-amber-500/18 text-amber-200",
  },
  connected: {
    label: "متصل (مستقیم)",
    short: "متصل",
    dot: "bg-emerald-400",
    cls: "border-emerald-400/40 bg-emerald-500/18 text-emerald-200",
  },
  relay: {
    label: "متصل (رله صوتی)",
    short: "متصل · رله",
    dot: "bg-sky-400",
    cls: "border-sky-400/40 bg-sky-500/18 text-sky-200",
  },
  reconnecting: {
    label: "تلاش مجدد اتصال…",
    short: "اتصال مجدد…",
    dot: "bg-rose-400 animate-ping",
    cls: "border-rose-400/40 bg-rose-500/18 text-rose-200",
  },
};

function Elapsed({ since }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const total = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return <span dir="ltr" className="tabular-nums">{h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`}</span>;
}

function Ctrl({ label, onClick, children, tone = "idle", disabled, title, onContextMenu, badge, pill = false }) {
  const look = {
    idle: "bg-surface-2/85 text-fg/85 hover:bg-surface-3 hover:text-fg border-line",
    on: "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border-emerald-400/45 shadow-[0_4px_18px_rgba(16,185,129,.18)]",
    off: "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border-rose-400/45 shadow-[0_4px_16px_rgba(244,63,94,.16)]",
    warn: "bg-amber-400/20 text-amber-300 hover:bg-amber-400/30 border-amber-300/45 shadow-[0_4px_16px_rgba(251,191,36,.16)]",
    accent: "bg-accent/20 text-accent hover:bg-accent/30 border-accent/50 shadow-[0_4px_18px_rgb(var(--glow)/0.2)]",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className={`press relative flex h-11 items-center justify-center gap-1.5 rounded-2xl border backdrop-blur transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40 ${
        pill ? "px-3.5 text-xs font-black" : "w-11"
      } ${look}`}
    >
      {children}
      {badge !== undefined && badge !== null && (
        <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-accent/40 bg-surface-2 px-1 text-[9px] font-black text-accent ring-1 ring-line">
          {badge}
        </span>
      )}
    </button>
  );
}

/**
 * Anchored floating studio popover for Camera & Screen Share settings.
 * Smooth spring-origin reveal directly above the dock button (no generic modal sheet!).
 */
function MediaPopover({ open, kind = "share", title, quality, fps, onPick, onClose, active, onStop, stopLabel, icon, startLabel }) {
  const [selQuality, setSelQuality] = useState(quality);
  const [selFps, setSelFps] = useState(fps);
  useEffect(() => {
    if (open) {
      setSelQuality(quality);
      setSelFps(fps);
    }
  }, [open, quality, fps]);
  if (!open) return null;

  const currentSpec = RESOLUTIONS.find((r) => r.id === selQuality) ?? RESOLUTIONS[1];

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label={title}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        animation: "dockPopoverIn .22s cubic-bezier(.16, 1, .3, 1) both",
        transformOrigin: "bottom center",
      }}
      className="fixed inset-x-3 bottom-20 z-50 mx-auto w-auto max-w-[19.5rem] rounded-2xl border border-line/90 bg-surface/95 p-3.5 text-fg shadow-[0_22px_55px_rgba(0,0,0,.65)] backdrop-blur-2xl sm:absolute sm:inset-x-auto sm:bottom-[calc(100%+12px)] sm:left-1/2 sm:mx-0 sm:w-[19.5rem] sm:-translate-x-1/2"
    >
      <style>{`
        @keyframes dockPopoverIn {
          from { opacity: 0; transform: translateY(10px) scale(.94); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (min-width: 640px) {
          @keyframes dockPopoverIn {
            from { opacity: 0; transform: translateX(-50%) translateY(10px) scale(.94); }
            to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
          }
        }
      `}</style>

      {/* Compact Studio Top Row */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "animate-pulse bg-emerald-400" : "bg-accent"}`} />
          <span className="truncate text-xs font-black text-fg">{title}</span>
        </div>
        <span dir="ltr" className="rounded-md border border-line bg-surface-2/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted">
          {currentSpec.res} · {currentSpec.bitrate}
        </span>
      </div>

      {/* Segmented Resolution Track */}
      <div className="mb-2.5">
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2/85 p-1">
          {RESOLUTIONS.map((q) => {
            const selected = selQuality === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setSelQuality(q.id)}
                aria-pressed={selected}
                className={`press flex flex-col items-center justify-center rounded-lg py-1.5 transition ${
                  selected
                    ? "border border-accent/45 bg-accent/18 text-accent shadow-sm"
                    : "border border-transparent text-muted hover:text-fg"
                }`}
              >
                <span className="text-xs font-black leading-4">{q.label}</span>
                <span className="text-[9px] font-bold opacity-75">{q.badge}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Segmented Frame-Rate Track */}
      <div className="mb-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2/85 p-1">
          {FPS_OPTIONS.map((f) => {
            const selected = selFps === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setSelFps(f.value)}
                aria-pressed={selected}
                className={`press flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${
                  selected
                    ? "border border-accent/45 bg-accent/18 text-accent shadow-sm"
                    : "border border-transparent text-muted hover:text-fg"
                }`}
              >
                <span>{f.label}</span>
                <span className="text-[9.5px] opacity-70">({f.value === 60 ? "روان" : "استاندارد"})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => { onPick(selQuality, selFps); onClose(); }}
          className="press flex w-full items-center justify-center gap-1.5 rounded-xl border border-accent/45 bg-accent/20 py-2 text-xs font-black text-accent transition hover:bg-accent/30"
        >
          <Icon name={icon} size={14} />
          <span>{active ? `اعمال کیفیت ${selQuality} · ${faNum(selFps)}fps` : startLabel}</span>
        </button>
        {active && (
          <button
            type="button"
            onClick={() => { onClose(); onStop(); }}
            className="press flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-400/35 bg-rose-500/15 py-1.5 text-[11px] font-bold text-rose-300 transition hover:bg-rose-500/25"
          >
            <Icon name="close" size={13} /> {stopLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * /meet/:token — Stand-alone meeting supporting simultaneous camera + screen share,
 * switchable stage focus, PiP presenter camera overlay, and adaptive participant grid.
 */
export default function Meet({ token, minimized = false, onMinimize, onExpand, onTerminated }) {
  const session = useSession();
  const me = session.user;
  const { confirm } = useConfirm();
  const { menu, open, close } = useContextMenu();
  const meeting = useMeeting(token, me);

  const [info, setInfo] = useState(null);
  const [notFound, setNotFound] = useState("");
  const [name, setName] = useState("");
  const [micPreview, setMicPreview] = useState("idle");
  const [joinWithMic, setJoinWithMic] = useState(true);
  const [showDevices, setShowDevices] = useState(false);
  const [panel, setPanel] = useState(null);
  const [mediaMenu, setMediaMenu] = useState(null);
  const [joinedAt, setJoinedAt] = useState(0);
  const [hidden, setHidden] = useState(new Set());
  /** Manual focus target: `{ token: joinToken, kind: "screen" | "camera" } | null` */
  const [stageTarget, setStageTarget] = useState(null);
  const [stageMinimized, setStageMinimized] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [picked, setPicked] = useState([]);
  const [inviting, setInviting] = useState(false);
  const [invitedNames, setInvitedNames] = useState([]);
  const [viewProfileId, setViewProfileId] = useState(null);
  const [roomFs, setRoomFs] = useState(false);
  const [streamFs, setStreamFs] = useState(false);
  const [gameExpanded, setGameExpanded] = useState(false);
  const [sideWidth, setSideWidth] = useState(() => {
    const saved = Number(localStorage.getItem("inebuly-meet-side-w"));
    return Number.isFinite(saved) && saved >= 290 && saved <= 640 ? saved : 370;
  });
  const [resizingSide, setResizingSide] = useState(false);
  const linkRef = useRef(null);
  const inviteRef = useRef(null);
  const cameraRef = useRef(null);
  const shareRef = useRef(null);
  const rootFsRef = useRef(null);
  const streamFsRef = useRef(null);

  const startSideResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sideWidth;
    setResizingSide(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onMove = (ev) => {
      // In RTL, the side panel is at the inline-end (left side of screen).
      // Dragging rightward (clientX increases) widens a left-docked panel!
      const delta = ev.clientX - startX;
      const next = Math.min(640, Math.max(290, startW + delta));
      setSideWidth(next);
      localStorage.setItem("inebuly-meet-side-w", String(next));
    };
    const onUp = () => {
      setResizingSide(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    const onFs = () => {
      const el = document.fullscreenElement;
      setRoomFs(Boolean(el && el === rootFsRef.current));
      setStreamFs(Boolean(el && el === streamFsRef.current));
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function toggleFullscreen(targetEl) {
    if (!targetEl) return;
    try {
      if (document.fullscreenElement === targetEl) {
        await document.exitFullscreen();
      } else {
        if (document.fullscreenElement) await document.exitFullscreen();
        await targetEl.requestFullscreen();
      }
    } catch {
      toast("مرورگر اجازهٔ تمام‌صفحه نداد", "error");
    }
  }

  // If minimized while not joined/lobby (e.g. session ended or left), clean up activeMeetToken
  useEffect(() => {
    if (minimized && meeting.phase === "idle") {
      onTerminated?.();
    }
  }, [minimized, meeting.phase, onTerminated]);

  useEffect(() => {
    let alive = true;
    apiFetch(`/api/meetings/${token}`)
      .then((d) => {
        if (!alive) return;
        setInfo(d.meeting);
        if (me) setName(me.displayName);
      })
      .catch((e) => alive && setNotFound(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Dynamic document title
  useEffect(() => {
    const titleText = info?.title || "جلسه";
    if (meeting.phase === "joined") {
      document.title = `در جلسه: ${titleText} — inebuly`;
    } else if (meeting.phase === "lobby") {
      document.title = `لابی: ${titleText} — inebuly`;
    } else {
      document.title = `${titleText} — inebuly`;
    }
  }, [info?.title, meeting.phase]);

  // Mic preview while waiting to join
  useEffect(() => {
    if (minimized || meeting.phase !== "idle" || notFound) return;
    let cancelled = false;
    setMicPreview("checking");
    void meeting.previewMic().then((ok) => {
      if (!cancelled) setMicPreview(ok ? "ready" : "blocked");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimized, meeting.phase, notFound]);

  useEffect(() => {
    if (meeting.phase === "joined" && !joinedAt) setJoinedAt(Date.now());
    if (meeting.phase !== "joined" && joinedAt) setJoinedAt(0);
  }, [joinedAt, meeting.phase]);

  // Close popovers on outside click
  useEffect(() => {
    if (!mediaMenu && !linkOpen && !inviteOpen) return;
    const onDown = (e) => {
      const t = e.target;
      if (linkOpen && !linkRef.current?.contains(t)) setLinkOpen(false);
      if (mediaMenu === "camera" && !cameraRef.current?.contains(t)) setMediaMenu(null);
      if (mediaMenu === "share" && !shareRef.current?.contains(t)) setMediaMenu(null);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setMediaMenu(null);
      setLinkOpen(false);
      setInviteOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [mediaMenu, linkOpen, inviteOpen]);

  const inCall = meeting.participants.filter((p) => !p.inLobby);
  const lobby = meeting.participants.filter((p) => p.inLobby);
  const myRow = inCall.find((p) => p.joinToken === meeting.joinToken) ?? null;

  const getParticipantStreams = (p) => {
    if (!p) return { camera: null, screen: null };
    if (p.joinToken === meeting.joinToken) {
      return { camera: meeting.localCamera, screen: meeting.localScreen };
    }
    return {
      camera: meeting.streams[p.joinToken]?.camera ?? null,
      screen: meeting.streams[p.joinToken]?.screen ?? null,
    };
  };

  // Collect all active visual feeds (screen shares + cameras) so user can switch between any of them
  const activeScreenItems = useMemo(() => {
    return inCall
      .filter((p) => !hidden.has(p.joinToken) && (p.sharingOn || getParticipantStreams(p).screen))
      .map((p) => ({
        key: `${p.joinToken}:screen`,
        token: p.joinToken,
        kind: "screen",
        who: p,
        stream: p.joinToken === meeting.joinToken ? meeting.localScreen : meeting.streams[p.joinToken]?.screen ?? null,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, inCall, meeting.joinToken, meeting.localScreen, meeting.streams]);

  // Determine what sits on the main stage:
  // 1) An explicitly pinned stageTarget ("screen" | "camera" | "user") if still valid
  // 2) Otherwise the first active screen share (unless user clicked minimize stage)
  const stage = useMemo(() => {
    if (stageMinimized) return null;
    if (stageTarget) {
      const p = inCall.find((x) => x.joinToken === stageTarget.token && !hidden.has(x.joinToken));
      if (p) {
        const s = getParticipantStreams(p);
        if (stageTarget.kind === "screen" && (p.sharingOn || s.screen)) {
          return { kind: "screen", stream: s.screen, who: p };
        }
        if (stageTarget.kind === "camera" && (p.cameraOn || s.camera)) {
          return { kind: "camera", stream: s.camera, who: p };
        }
        if (stageTarget.kind === "user") {
          if (p.cameraOn || s.camera) return { kind: "camera", stream: s.camera, who: p };
          return { kind: "user", stream: null, who: p };
        }
      }
    }
    if (activeScreenItems.length > 0) {
      const first = activeScreenItems[0];
      return { kind: "screen", stream: first.stream, who: first.who };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScreenItems, hidden, inCall, meeting.localCamera, meeting.localScreen, meeting.streams, stageMinimized, stageTarget]);

  // Reset stageMinimized if all shares end
  useEffect(() => {
    if (activeScreenItems.length === 0 && !stageTarget) {
      setStageMinimized(false);
    }
  }, [activeScreenItems.length, stageTarget]);

  // Every visible participant in the call
  const visibleParticipants = useMemo(
    () => inCall.filter((p) => !hidden.has(p.joinToken)),
    [hidden, inCall],
  );

  // When a user is spotlighted on stage (user/camera), push OTHER participants to the side strip
  // (or if only 1 person is in call, keep strip empty so stage fills nicely).
  // For screen share, keep everyone in the side strip so presenter's avatar/camera is also visible!
  const stripParticipants = useMemo(() => {
    if (!stage) return visibleParticipants;
    if (stage.kind === "screen") return visibleParticipants;
    const others = visibleParticipants.filter((p) => p.joinToken !== stage.who.joinToken);
    return others;
  }, [stage, visibleParticipants]);

  // Presenter's simultaneous camera stream for PiP badge inside the screen-share stage
  const presenterPiPCamera = useMemo(() => {
    if (!stage || stage.kind !== "screen") return null;
    const s = getParticipantStreams(stage.who);
    return s.camera || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, meeting.localCamera, meeting.streams]);

  async function enter(forceTakeover = false) {
    const res = await meeting.join(name.trim(), {
      forceTakeover,
      silentConflict: true,
      micEnabled: joinWithMic && micPreview !== "blocked",
    });
    if (res?.ok) {
      return;
    }
    if (res?.code === "BROWSER_SWITCH_CONFIRM") {
      const ok = await confirm({
        title: "ورود با حساب دیگر و خروج از تب قبلی؟",
        message:
          res.message ||
          `در تب دیگری از همین مرورگر با نام «${res.existingName || "کاربر"}» داخل این جلسه هستید. در صورت ادامه، تب قبلی به‌صورت خودکار از جلسه خارج می‌شود.`,
        confirmLabel: "ورود و بستن تب قبلی",
        variant: "danger",
        icon: "phone",
      });
      if (ok) await enter(true);
      return;
    }
    if (res?.message) {
      toast(res.message, "error");
    }
  }

  const meetingLink = typeof window === "undefined" ? "" : `${window.location.origin}/meet/${token}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(meetingLink);
      toast("لینک جلسه کپی شد", "success");
    } catch {
      toast(meetingLink, "info");
    }
  }

  async function openInvite() {
    setInviteOpen(true);
    setPicked([]);
    setInvitedNames([]);
    setFriendsLoading(true);
    try {
      const d = await apiFetch(`/api/meetings/${token}/invitable`);
      setFriends(d.friends);
    } catch (e) {
      toast(e.message, "error");
      setFriends([]);
    } finally {
      setFriendsLoading(false);
    }
  }

  async function sendInvites() {
    if (!picked.length) return;
    setInviting(true);
    try {
      const r = await apiFetch(`/api/meetings/${token}/invite`, { method: "POST", json: { userIds: picked } });
      setInvitedNames(r.invited);
      setPicked([]);
      setFriends((list) => list.filter((f) => !r.invited.includes(f.displayName)));
      toast(`دعوت‌نامه برای ${r.invited.length} نفر ارسال شد`, "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setInviting(false);
    }
  }

  async function endMeeting() {
    const ok = await confirm({
      title: "پایان جلسه برای همه؟",
      message: "همهٔ شرکت‌کنندگان از جلسه خارج می‌شوند و لینک غیرفعال می‌شود.",
      confirmLabel: "پایان جلسه",
      variant: "danger",
      icon: "phone-off",
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/meetings/${token}/end`, { method: "POST" });
      await meeting.leave();
      onTerminated?.();
      toast("جلسه پایان یافت", "success");
      navigate(me ? "/" : "/login");
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function requestLeave() {
    const ok = await confirm({
      title: meeting.amHost ? "خروج موقت از جلسه؟" : "خروج از جلسه؟",
      message: meeting.amHost
        ? "جلسه پایان نمی‌یابد و برای اعضا فعال می‌ماند؛ هر زمان بخواهید می‌توانید دوباره از فهرست جلسه‌ها وارد شوید یا آن را پایان دهید."
        : "میکروفون و تصویر شما قطع می‌شود.",
      confirmLabel: meeting.amHost ? "خروج بدون پایان جلسه" : "خروج",
      variant: meeting.amHost ? "primary" : "danger",
      icon: "door",
    });
    if (!ok) return;
    await meeting.leave();
    onTerminated?.();
    navigate(me ? "/" : "/login");
  }

  function minimizeToApp() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    if (onMinimize) onMinimize();
    else navigate(me ? "/" : "/login");
  }

  function personMenu(p) {
    const mine = p.joinToken === meeting.joinToken;
    const vol = meeting.prefs.volumes[p.joinToken] ?? 100;
    const s = getParticipantStreams(p);
    const items = [{ label: `${p.name}${p.isHost ? " · میزبان" : ""}${p.isGuest ? " · مهمان" : ""}`, type: "label" }];

    if (p.userId && me) {
      items.push({
        type: "item",
        key: "profile",
        label: "مشاهده پروفایل",
        icon: "user",
        onClick: () => setViewProfileId(p.userId),
      });
    }

    if (p.cameraOn || s.camera) {
      const isCamPinned = stage?.who.joinToken === p.joinToken && stage?.kind === "camera";
      items.push({
        type: "item",
        key: "pin-cam",
        label: isCamPinned ? "بستن بزرگ‌نمایی کمرا" : "نمایش بزرگ کمرا در صحنه",
        icon: "pin",
        onClick: () => {
          setStageMinimized(false);
          setStageTarget(isCamPinned ? null : { token: p.joinToken, kind: "camera" });
        },
      });
    }
    if (p.sharingOn || s.screen) {
      const isScreenPinned = stage?.who.joinToken === p.joinToken && stage?.kind === "screen";
      items.push({
        type: "item",
        key: "pin-screen",
        label: isScreenPinned ? "کوچک‌کردن اشتراک صفحه" : "نمایش اشتراک صفحه در صحنه",
        icon: "screen",
        onClick: () => {
          if (isScreenPinned) {
            setStageTarget(null);
            setStageMinimized(true);
          } else {
            setStageMinimized(false);
            setStageTarget({ token: p.joinToken, kind: "screen" });
          }
        },
      });
    }

    if (mine) {
      items.push({
        type: "slider",
        key: "mic-gain",
        label: "صدای میکروفون من",
        min: 0,
        max: 200,
        value: meeting.prefs.micGain,
        onChange: (v) => meeting.setMicGain(v),
      });
      items.push({ type: "divider" });
      items.push({
        type: "item",
        key: "mic",
        label: meeting.micOn ? "خاموش کردن میکروفون" : "روشن کردن میکروفون",
        icon: meeting.micOn ? "mic-off" : "mic",
        disabled: meeting.myState.micMuted,
        onClick: () => void meeting.toggleMic(),
      });
      items.push({
        type: "item",
        key: "cam",
        label: meeting.cameraOn ? "تنظیم / خاموش کردن کمرا" : "روشن کردن کمرا",
        icon: meeting.cameraOn ? "video" : "camera",
        onClick: () => setMediaMenu((m) => (m === "camera" ? null : "camera")),
      });
      return items;
    }

    items.push({
      type: "slider",
      key: "peer-vol",
      label: "بلندی صدای این عضو",
      min: 0,
      max: 100,
      value: vol,
      onChange: (v) => meeting.setVolume(p.joinToken, v),
    });
    items.push({
      type: "item",
      key: "vol",
      label: vol === 0 ? "وصل کردن صدا" : "قطع کامل صدا برای من",
      icon: vol === 0 ? "volume" : "volume-off",
      onClick: () => meeting.setVolume(p.joinToken, vol === 0 ? 100 : 0),
    });
    items.push({
      type: "item",
      key: "hide",
      label: hidden.has(p.joinToken) ? "نمایش دوبارهٔ این فرد" : "پنهان کردن این فرد برای من",
      icon: hidden.has(p.joinToken) ? "check" : "ban",
      onClick: () => setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(p.joinToken)) next.delete(p.joinToken);
        else next.add(p.joinToken);
        return next;
      }),
    });
    if (meeting.amHost && !p.isHost) {
      items.push({ type: "divider" });
      items.push({ type: "label", label: "اقدامات میزبان" });
      items.push({
        type: "item",
        key: "mute",
        label: p.micMuted ? "بازکردن میکروفون" : "بستن میکروفون",
        icon: p.micMuted ? "mic" : "mic-off",
        onClick: () => void meeting.hostAction(p.micMuted ? "unmute" : "mute", p.joinToken),
      });
      items.push({
        type: "item",
        key: "share",
        label: p.shareBlocked ? "اجازهٔ اشتراک تصویر/صفحه" : "بستن اشتراک تصویر/صفحه",
        icon: "screen",
        onClick: () => void meeting.hostAction(p.shareBlocked ? "allow-share" : "block-share", p.joinToken),
      });
      items.push({
        type: "item",
        key: "kick",
        label: "اخراج از جلسه",
        icon: "door",
        danger: true,
        onClick: () => void meeting.hostAction("kick", p.joinToken),
      });
    }
    return items;
  }

  if (minimized) {
    if (meeting.phase !== "joined" && meeting.phase !== "lobby") return null;
    const miniVideoStream = stage?.stream ?? (meeting.sharing ? meeting.localScreen : meeting.cameraOn ? meeting.localCamera : null);
    return (
      <DraggablePiP
        storageKey="inebuly-meet-pip"
        defaultCorner="bottom-right"
        className="flex w-[min(22rem,calc(100vw-1.75rem))] flex-col overflow-hidden rounded-2xl border border-accent/45 bg-surface/92 text-fg shadow-[0_22px_55px_rgba(0,0,0,.45)] backdrop-blur-2xl"
      >
        {/* Top drag bar */}
        <div
          data-pip-handle
          className="flex items-center justify-between border-b border-line/80 bg-surface-2/75 px-3 py-1.5 text-[10px] text-muted"
        >
          <span className="flex items-center gap-1.5 font-bold">
            <Icon name="move" size={11} className="text-accent" />
            <span>برای جابه‌جایی بکشید</span>
          </span>
          {joinedAt > 0 && (
            <span dir="ltr" className="font-mono font-bold text-accent">
              <Elapsed since={joinedAt} />
            </span>
          )}
        </div>

        {miniVideoStream && (
          <div
            onClick={() => (onExpand ? onExpand() : navigate(`/meet/${token}`))}
            className="relative h-36 w-full cursor-pointer overflow-hidden border-b border-line bg-black"
          >
            <Stage
              stream={miniVideoStream}
              name={stage?.who?.name ?? "شما"}
              kind={stage?.kind ?? "screen"}
              mirrored={Boolean(stage?.kind === "camera" && stage?.who?.joinToken === meeting.joinToken)}
            />
            <span className="absolute bottom-2 start-2 rounded-md border border-line/60 bg-surface/85 px-2 py-0.5 text-[10px] font-bold text-fg backdrop-blur">
              {stage?.kind === "camera" ? "تصویر کمرا" : "اشتراک صفحه"} · کلیک برای بزرگ‌نمایی
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 p-2.5">
          <button
            type="button"
            onClick={() => (onExpand ? onExpand() : navigate(`/meet/${token}`))}
            title="بازگشت به صفحهٔ کامل جلسه"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/35 bg-accent/18 text-accent transition hover:bg-accent/28"
          >
            <Icon name="radio" size={17} />
          </button>
          <div
            onClick={() => (onExpand ? onExpand() : navigate(`/meet/${token}`))}
            className="min-w-0 flex-1 cursor-pointer select-none"
          >
            <p className="truncate text-xs font-black text-fg">{info?.title ?? "جلسهٔ فعال"}</p>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold text-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span>{meeting.phase === "lobby" ? "در انتظار تأیید لابی" : `${faNum(inCall.length)} نفر در جلسه`}</span>
            </p>
          </div>
          {meeting.phase === "joined" && (
            <button
              type="button"
              disabled={meeting.myState.micMuted}
              onClick={() => void meeting.toggleMic()}
              title={meeting.micOn ? "خاموش کردن میکروفون" : "روشن کردن میکروفون"}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-40 ${
                meeting.micOn
                  ? "border-emerald-500/45 bg-emerald-500/20 text-emerald-500"
                  : "border-rose-500/45 bg-rose-500/20 text-rose-500"
              }`}
            >
              <Icon name={meeting.micOn ? "mic" : "mic-off"} size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => (onExpand ? onExpand() : navigate(`/meet/${token}`))}
            title="باز کردن کامل جلسه"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg hover:bg-surface-3"
          >
            <Icon name="maximize" size={14} />
          </button>
          <button
            type="button"
            onClick={() => void meeting.leave().then(() => onTerminated?.())}
            title="خروج از جلسه"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-500/45 bg-rose-500/20 text-rose-500 hover:bg-rose-500/30"
          >
            <Icon name="phone-off" size={14} />
          </button>
        </div>
      </DraggablePiP>
    );
  }

  if (notFound) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-bg p-6 text-center text-fg">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-2 text-rose-400"><Icon name="ban" size={28} /></span>
        <h1 className="text-xl font-black">جلسه در دسترس نیست</h1>
        <p className="max-w-sm text-sm leading-7 text-muted">{notFound}</p>
        <button onClick={() => { onTerminated?.(); navigate(me ? "/" : "/login"); }} className="rounded-lg bg-surface-2 px-5 py-2.5 text-sm font-bold text-fg hover:bg-surface-3">بازگشت</button>
      </div>
    );
  }

  /* ── pre-join / lobby ── */
  if (meeting.phase !== "joined") {
    const waiting = meeting.phase === "lobby";
    return (
      <div className="anim-surface-in fixed inset-0 z-40 flex flex-col overflow-x-hidden overflow-y-auto bg-bg text-fg">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon name="radio" size={18} /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{info?.title ?? "جلسه"}</p>
            <p className="truncate text-[11px] text-muted" dir="ltr">inebuly · /meet/{token}</p>
          </div>
          <button onClick={() => { onTerminated?.(); navigate(me ? "/" : "/login"); }} aria-label="بازگشت" className="ms-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><Icon name="close" size={17} /></button>
        </div>

        <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
          <section
            className="relative overflow-hidden rounded-xl shadow-2xl ring-1 ring-line"
            style={{ background: `radial-gradient(120% 120% at 25% 15%, ${me?.avatarColor ?? "var(--accent)"}33 0%, var(--surface-2) 70%)` }}
          >
            <div className="flex aspect-[16/10] flex-col items-center justify-center gap-4">
              {waiting ? (
                <>
                  <span className="flex h-20 w-20 items-center justify-center rounded-xl bg-surface-2/80 text-muted"><Icon name="clock" size={36} className="animate-pulse" /></span>
                  <p className="text-base font-bold">در انتظار تأیید میزبان…</p>
                  <p className="max-w-xs text-center text-xs leading-6 text-muted">میزبان باید اجازهٔ ورود شما را بدهد. تا آن زمان می‌توانید صدا و تصویر خود را آماده کنید.</p>
                </>
              ) : (
                <>
                  <Avatar name={name.trim() || me?.displayName || "مهمان"} color={me?.avatarColor ?? "#1a73e8"} size={128} userId={me?.id} avatarFileId={me?.avatarFileId} />
                  <p className="text-sm font-semibold text-fg/85">{name.trim() || me?.displayName || "مهمان"}</p>
                  <p className="text-xs text-muted">{micPreview === "ready" && joinWithMic ? "میکروفون آماده است" : micPreview === "blocked" ? "میکروفون در دسترس نیست" : "پیش‌نمایش شما"}</p>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-line bg-bg/50 px-4 py-3 backdrop-blur">
              <button
                onClick={() => setJoinWithMic((v) => !v)}
                disabled={micPreview === "blocked" || waiting}
                aria-pressed={joinWithMic}
                aria-label={joinWithMic ? "ورود با میکروفون خاموش" : "ورود با میکروفون روشن"}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition disabled:opacity-40 ${joinWithMic && micPreview !== "blocked" ? "bg-surface-3 text-fg" : "bg-[#ea4335] text-white"}`}
              >
                <Icon name={joinWithMic && micPreview !== "blocked" ? "mic" : "mic-off"} size={18} />
              </button>
              <div className="min-w-0 flex-1">
                <MicMeter active={joinWithMic && micPreview === "ready"} bars={14} barClassName="h-2.5 w-1.5 rounded-sm" />
              </div>
              <button
                onClick={() => setShowDevices((v) => !v)}
                aria-expanded={showDevices}
                aria-label="تنظیمات دستگاه صدا"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg hover:bg-surface-2"
              >
                <Icon name="sliders" size={18} />
              </button>
            </div>
            {showDevices && (
              <div className="scroll-thin max-h-[52vh] overflow-y-auto border-t border-line bg-bg/85 p-4 backdrop-blur-xl">
                <AudioSettingsSection
                  compact
                  showAppSounds={false}
                  externalCall={{
                    prefs: meeting.prefs,
                    devices: meeting.devices,
                    micActive: joinWithMic && micPreview === "ready",
                    updateAudioPrefs: meeting.updateAudioPrefs,
                    changeInput: async (id) => {
                      await meeting.changeInput(id);
                      const ok = await meeting.previewMic();
                      setMicPreview(ok ? "ready" : "blocked");
                    },
                    changeOutput: meeting.changeOutput,
                    setMicGain: meeting.setMicGain,
                    setMaster: meeting.setMaster,
                  }}
                />
              </div>
            )}
          </section>

          <section className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-right">
            <div>
              <h1 className="text-2xl font-black sm:text-3xl">{waiting ? "در لابی هستید" : "به جلسه بپیوندید"}</h1>
              <p className="mt-2 text-sm leading-7 text-muted">
                {info?.title ?? "…"}
                {info?.lobby ? " · ورود با تأیید میزبان" : " · ورود مستقیم"}
              </p>
            </div>

            {waiting ? (
              <button onClick={() => void meeting.leave()} className="flex items-center gap-2 rounded-lg bg-surface-2 px-6 py-3 text-sm font-bold text-fg hover:bg-surface-3">
                <Icon name="phone-off" size={18} /> ترک لابی
              </button>
            ) : (
              <>
                {!me && (
                  <label className="w-full max-w-sm text-right lg:max-w-none">
                    <span className="mb-1.5 flex items-center justify-between text-xs font-bold text-muted">
                      <span>نام نمایشی شما در جلسه</span>
                      <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-normal text-muted">اختیاری</span>
                    </span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && meeting.phase !== "connecting") void enter(); }}
                      maxLength={32}
                      placeholder="نام دلخواه خود را بنویسید…"
                      className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-fg outline-none focus:border-accent"
                    />
                  </label>
                )}
                <div className="flex w-full max-w-sm flex-col gap-2.5 sm:flex-row lg:max-w-none">
                  <button
                    onClick={() => void enter()}
                    disabled={meeting.phase === "connecting"}
                    className="press flex flex-1 items-center justify-center gap-2 rounded-xl border border-accent/50 bg-accent/22 px-6 py-3 text-sm font-black text-accent shadow-[0_8px_28px_rgb(var(--glow)/0.22)] backdrop-blur-xl transition hover:border-accent hover:bg-accent/32 disabled:opacity-55"
                  >
                    {meeting.phase === "connecting" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/35 border-t-accent" /> : <Icon name="video" size={18} />}
                    {meeting.phase === "connecting" ? "در حال ورود…" : "پیوستن به جلسه"}
                  </button>
                  <button onClick={() => { onTerminated?.(); navigate(me ? "/" : "/login"); }} className="press flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface-2/80 px-6 py-3 text-sm font-bold text-fg backdrop-blur-md hover:bg-surface-3">
                    بازگشت
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    );
  }

  /* ── in the meeting ── */
  return (
    <div ref={rootFsRef} className="anim-surface-in fixed inset-0 z-40 flex flex-col overflow-hidden bg-bg text-fg">
      {/* Header — Clean redesigned top-right with live connection status */}
      <header className="relative z-30 flex shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-3.5 py-2 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            <span dir="ltr" className="tabular-nums"><Elapsed since={joinedAt} /></span>
          </span>
          {(() => {
            const cMeta = CONN_META[meeting.myConnState] || CONN_META.connecting;
            return (
              <span
                title="وضعیت اتصال صوتی و تصویری شما"
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold backdrop-blur-md ${cMeta.cls}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${cMeta.dot}`} />
                <span>{cMeta.label}</span>
              </span>
            );
          })()}
          <div className="hidden h-4 w-px bg-line/80 sm:block" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-black leading-5 text-fg">{info?.title ?? "جلسه"}</p>
              <span className="shrink-0 rounded-md border border-line bg-surface-2/90 px-1.5 py-0.5 text-[10px] font-bold text-muted">
                {faNum(inCall.length)} نفر
              </span>
              {meeting.lobbyEnabled && (
                <span className="hidden shrink-0 rounded-md border border-amber-400/30 bg-amber-400/12 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 sm:inline">
                  لابی فعال
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Active shares switcher bar when multiple shares exist or stage was minimized */}
        {(activeScreenItems.length > 1 || (stageMinimized && activeScreenItems.length > 0)) && (
          <div className="ms-1 hidden items-center gap-1.5 md:flex">
            {activeScreenItems.map((item) => {
              const isCurrent = stage?.kind === "screen" && stage?.who.joinToken === item.token;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    setStageMinimized(false);
                    setStageTarget({ token: item.token, kind: "screen" });
                  }}
                  className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition ${
                    isCurrent
                      ? "border-accent/45 bg-accent/18 text-accent shadow-sm"
                      : "border-line bg-surface-2 text-muted hover:text-fg"
                  }`}
                >
                  <Icon name="screen" size={12} />
                  <span>صفحهٔ {item.token === meeting.joinToken ? "شما" : item.who.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
          {meeting.amHost && lobby.length > 0 && (
            <button
              onClick={() => setPanel("people")}
              className="press flex items-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-400/15 px-2.5 py-1.5 text-[11px] font-black text-amber-300"
            >
              <Icon name="clock" size={13} /> {faNum(lobby.length)} در انتظار
            </button>
          )}
          {meeting.game && (
            <button
              onClick={() => setPanel("games")}
              className="press flex items-center gap-1.5 rounded-xl border border-accent/35 bg-accent/15 px-2.5 py-1.5 text-[11px] font-bold text-accent"
            >
              <Icon name="gamepad" size={13} /> <span className="hidden sm:inline">{meeting.game.label}</span>
            </button>
          )}

          {meeting.amHost && (
            <button
              type="button"
              onClick={() => void meeting.setLobby(!meeting.lobbyEnabled)}
              title={meeting.lobbyEnabled ? "لابی فعال است (کلیک برای ورود آزاد همه)" : "ورود آزاد فعال است (کلیک برای فعال‌سازی لابی تأیید)"}
              className={`press hidden items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition lg:flex ${
                meeting.lobbyEnabled
                  ? "border-amber-400/40 bg-amber-400/15 text-amber-300"
                  : "border-emerald-400/30 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/20"
              }`}
            >
              <Icon name={meeting.lobbyEnabled ? "lock" : "check"} size={13} />
              <span>{meeting.lobbyEnabled ? "لابی تأیید: روشن" : "ورود مستقیم: آزاد"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => minimizeToApp()}
            aria-label="کوچک‌نمایی جلسه"
            title="کوچک‌نمایی جلسه و بازگشت به چت"
            className="press flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-2.5 text-[11px] font-bold text-fg transition hover:border-accent/50 hover:bg-surface-3"
          >
            <Icon name="pip" size={15} className="text-accent" />
            <span className="hidden sm:inline">کوچک‌نمایی</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleFullscreen(rootFsRef.current)}
            aria-label={roomFs ? "خروج از تمام‌صفحه" : "تمام‌صفحهٔ جلسه"}
            title={roomFs ? "خروج از تمام‌صفحه" : "تمام‌صفحه کردن جلسه"}
            className="press flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted transition hover:bg-surface-3 hover:text-fg"
          >
            <Icon name={roomFs ? "minimize" : "maximize"} size={15} />
          </button>

          <div className="relative" ref={linkRef}>
            <button
              onClick={() => { setLinkOpen((v) => !v); setInviteOpen(false); }}
              aria-label="لینک جلسه"
              aria-expanded={linkOpen}
              title="لینک جلسه"
              className={`press flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold transition ${
                linkOpen ? "border-accent/50 bg-accent/15 text-accent" : "border-line bg-surface-2 text-muted hover:text-fg"
              }`}
            >
              <Icon name="link" size={14} /> <span className="hidden md:inline">لینک</span>
            </button>
            {linkOpen && (
              <div className="anim-rise absolute end-0 top-11 z-30 w-[min(88vw,22rem)] rounded-2xl border border-line bg-surface p-3.5 shadow-2xl backdrop-blur-xl">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-black text-fg"><Icon name="link" size={14} className="text-accent" /> لینک ورود به جلسه</p>
                <input readOnly dir="ltr" value={meetingLink} onFocus={(e) => e.currentTarget.select()} aria-label="لینک جلسه" className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-[11px] text-fg/90 outline-none" />
                <p className="mt-2 text-[10px] leading-5 text-muted">
                  {meeting.lobbyEnabled
                    ? "لابی روشن است: افراد دارای لینک منتظر تأیید شما می‌مانند (دعوت‌شدگان مستقیم وارد می‌شوند)."
                    : "ورود مستقیم فعال است: هر فرد با این لینک بدون انتظار وارد جلسه می‌شود."}
                </p>
                <div className="mt-2.5">
                  <button onClick={() => void copyLink()} className="press flex w-full items-center justify-center gap-1.5 rounded-xl border border-accent/45 bg-accent/18 px-3 py-2 text-xs font-black text-accent hover:bg-accent/28">
                    <Icon name="copy" size={14} /> کپی لینک جلسه
                  </button>
                </div>
              </div>
            )}
          </div>

          {meeting.amHost && (
            <div className="relative" ref={inviteRef}>
              <button
                type="button"
                onClick={() => { setInviteOpen((v) => !v); setLinkOpen(false); if (!inviteOpen) void openInvite(); }}
                aria-label="دعوت از دوستان"
                aria-expanded={inviteOpen}
                title="دعوت مستقیم دوستان (بدون انتظار در لابی)"
                className={`press flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-black transition ${
                  inviteOpen
                    ? "border-accent/60 bg-accent/25 text-accent"
                    : "border-accent/45 bg-accent/16 text-accent hover:bg-accent/25"
                }`}
              >
                <Icon name="user-plus" size={14} /> <span className="hidden sm:inline">دعوت</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {inviteOpen && typeof document !== "undefined" && createPortal(
        <div
          dir="rtl"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          onMouseDown={() => setInviteOpen(false)}
        >
          <div
            className="anim-pop flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-surface/90 text-fg shadow-[0_28px_70px_rgba(0,0,0,.75)] backdrop-blur-2xl"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="دعوت از دوستان"
          >
            <div className="flex items-center gap-3 border-b border-line/75 bg-surface-2/60 px-4 py-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/18 text-accent shadow-sm">
                <Icon name="user-plus" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-fg">دعوت مستقیم دوستان</p>
                <p className="truncate text-[11px] text-muted">ارسال کارت ورود مستقیم به گفتگو</p>
              </div>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                aria-label="بستن"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-line/70 bg-surface-2/80 text-muted transition hover:border-rose-400/40 hover:bg-rose-500/18 hover:text-rose-300"
              >
                <Icon name="close" size={15} />
              </button>
            </div>

            <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {friendsLoading ? (
                <p className="p-8 text-center text-xs font-bold text-muted">در حال بارگذاری فهرست دوستان…</p>
              ) : friends.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface-2/70 p-6 text-center backdrop-blur-md">
                  <p className="text-sm font-black text-fg">دوست آماده‌ای برای دعوت نیست</p>
                  <p className="mt-1.5 text-xs leading-6 text-muted">
                    همهٔ دوستان شما هم‌اکنون در جلسه هستند یا می‌توانید لینک جلسه را مستقیماً بفرستید.
                  </p>
                </div>
              ) : (
                friends.map((f) => {
                  const on = picked.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setPicked((prev) => (on ? prev.filter((x) => x !== f.id) : [...prev, f.id]))}
                      aria-pressed={on}
                      className={`press flex w-full items-center gap-3 rounded-xl border p-2.5 text-right backdrop-blur-md transition ${
                        on
                          ? "border-accent/55 bg-accent/16 shadow-sm"
                          : "border-line bg-surface-2/70 hover:border-accent/35 hover:bg-surface-2"
                      }`}
                    >
                      <Avatar name={f.displayName} color={f.avatarColor} size={40} userId={f.id} avatarFileId={f.avatarFileId} status={f.status} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-fg">{f.displayName}</span>
                        <span className="block truncate text-xs font-semibold text-accent" dir="ltr">@{f.username}</span>
                      </span>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition ${
                          on ? "border-accent/60 bg-accent/25 text-accent" : "border-line bg-surface/80 text-muted"
                        }`}
                      >
                        {on && <Icon name="check" size={14} strokeWidth={2.8} />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {invitedNames.length > 0 && (
              <p className="border-t border-line/70 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300">
                دعوت‌نامه ارسال شد به: {invitedNames.join("، ")}
              </p>
            )}

            <div className="flex items-center gap-2 border-t border-line/75 bg-surface-2/60 px-4 py-3">
              <span className="flex-1 text-xs font-bold text-muted">
                {picked.length ? `${faNum(picked.length)} نفر انتخاب شده` : "انتخاب دوستان"}
              </span>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="press rounded-xl border border-line bg-surface-2/85 px-3.5 py-2 text-xs font-bold text-fg backdrop-blur-md hover:bg-surface-3"
              >
                بستن
              </button>
              <button
                type="button"
                onClick={() => void sendInvites()}
                disabled={!picked.length || inviting}
                className="press flex items-center gap-1.5 rounded-xl border border-accent/50 bg-accent/22 px-4 py-2 text-xs font-black text-accent backdrop-blur-md transition hover:border-accent hover:bg-accent/32 disabled:opacity-45"
              >
                <Icon name="send" size={14} className="-scale-x-100" />
                {inviting ? "در حال ارسال…" : "ارسال دعوت"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Main workspace: Stage + Participant Grid/Sidebar + Optional Resizable Side Panel */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className={`flex min-w-0 flex-1 gap-2.5 p-2.5 sm:p-3.5 ${stage && stripParticipants.length > 0 ? "flex-col lg:flex-row" : "flex-col"}`}>
          {/* Stage: Shared Screen, Pinned Camera, or Spotlighted User Tile */}
          {stage && (
            <div
              ref={streamFsRef}
              onClick={() => {
                if (stage.kind !== "screen") setStageTarget(null);
              }}
              className={`relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-line bg-[#090b10] shadow-xl ${
                stage.kind !== "screen" ? "cursor-zoom-out" : ""
              }`}
              style={
                stage.kind === "user"
                  ? { background: `radial-gradient(95% 95% at 50% 35%, ${stage.who.avatarColor}38 0%, var(--surface-2) 78%)` }
                  : undefined
              }
            >
              {stage.kind === "user" ? (
                <div className="flex flex-col items-center gap-3.5 px-4 text-center">
                  <div
                    className={`rounded-full p-1.5 transition ${
                      (stage.who.joinToken === meeting.joinToken ? meeting.micOn && meeting.speaking : stage.who.micOn && !stage.who.micMuted)
                        ? "ring-4 ring-accent/65"
                        : ""
                    }`}
                  >
                    <Avatar
                      name={stage.who.name}
                      color={stage.who.avatarColor}
                      size={132}
                      userId={stage.who.userId ?? undefined}
                      avatarFileId={stage.who.avatarFileId ?? undefined}
                    />
                  </div>
                  <div>
                    <p className="text-lg font-black text-fg">{stage.who.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {stage.who.micMuted ? "میکروفون بسته" : stage.who.micOn ? "میکروفون روشن" : "میکروفون خاموش"} · کلیک برای بازگشت به نمای شبکه‌ای
                    </p>
                  </div>
                </div>
              ) : (
                <Stage
                  stream={stage.stream}
                  name={stage.who.name}
                  kind={stage.kind}
                  mirrored={stage.kind === "camera" && stage.who.joinToken === meeting.joinToken}
                />
              )}

              {/* Top overlay controls on stage */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/75 via-black/30 to-transparent px-3 py-2.5"
              >
                <span className="flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
                  <Icon name={stage.kind === "camera" ? "video" : stage.kind === "user" ? "user" : "screen"} size={13} className="text-accent" />
                  {stage.kind === "camera"
                    ? `کمرای ${stage.who.joinToken === meeting.joinToken ? "شما" : stage.who.name} · ${stage.who.cameraQuality ?? "720p"}`
                    : stage.kind === "user"
                      ? `بزرگ‌نمایی ${stage.who.joinToken === meeting.joinToken ? "شما" : stage.who.name}`
                      : `صفحهٔ ${stage.who.joinToken === meeting.joinToken ? "شما" : stage.who.name} · ${stage.who.shareQuality ?? "720p"} · ${faNum(stage.who.shareFps ?? 30)} فریم`}
                </span>
                <span className="pointer-events-auto flex items-center gap-1.5">
                  {stage.kind !== "user" && (
                    <button
                      type="button"
                      onClick={() => void toggleFullscreen(streamFsRef.current)}
                      className="flex items-center gap-1 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur hover:bg-black/85"
                      title={streamFs ? "خروج از تمام‌صفحهٔ استریم" : "تمام‌صفحه کردن استریم"}
                    >
                      <Icon name={streamFs ? "minimize" : "maximize"} size={13} />
                      <span>{streamFs ? "کوچک‌نمایی" : "تمام‌صفحه"}</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (document.fullscreenElement === streamFsRef.current) void document.exitFullscreen().catch(() => {});
                      setStageTarget(null);
                      if (stage.kind === "screen") setStageMinimized(true);
                    }}
                    className="rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur hover:bg-black/80"
                    title="نمای شبکه‌ای افراد"
                  >
                    نمای شبکه‌ای
                  </button>
                  {stage.kind === "screen" && stage.who.joinToken === meeting.joinToken && (
                    <button onClick={() => void meeting.stopShare()} className="rounded-lg bg-rose-500/85 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur hover:bg-rose-500">
                      توقف اشتراک من
                    </button>
                  )}
                  {stage.kind === "screen" && stage.who.joinToken !== meeting.joinToken && meeting.amHost && !stage.who.isHost && (
                    <button onClick={() => void meeting.hostAction("block-share", stage.who.joinToken)} className="rounded-lg bg-rose-500/80 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur hover:bg-rose-500">
                      بستن اشتراک
                    </button>
                  )}
                </span>
              </div>

              {/* Simultaneous Presenter Camera PiP inside screen share stage */}
              {stage.kind === "screen" && presenterPiPCamera && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStageTarget({ token: stage.who.joinToken, kind: "camera" });
                  }}
                  title="بزرگ‌نمایی کمرای ارائه‌دهنده"
                  className="group absolute bottom-3 end-3 h-24 w-36 sm:h-28 sm:w-44 overflow-hidden rounded-xl border border-white/20 bg-black shadow-2xl transition hover:scale-[1.03]"
                >
                  <VideoTile stream={presenterPiPCamera} mirrored={stage.who.joinToken === meeting.joinToken} />
                  <span className="absolute bottom-1.5 start-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                    کمرای {stage.who.joinToken === meeting.joinToken ? "شما" : stage.who.name}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Banner if hidden participants or minimized share exist */}
          {(hidden.size > 0 || (stageMinimized && activeScreenItems.length > 0)) && !stage && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {stageMinimized && activeScreenItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setStageMinimized(false); setStageTarget({ token: item.token, kind: "screen" }); }}
                  className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/15 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/25"
                >
                  <Icon name="screen" size={13} /> بازگشت به اشتراک صفحهٔ {item.token === meeting.joinToken ? "شما" : item.who.name}
                </button>
              ))}
              {hidden.size > 0 && (
                <button
                  onClick={() => setHidden(new Set())}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs text-muted hover:text-fg"
                >
                  نمایش افراد پنهان‌شده ({faNum(hidden.size)})
                </button>
              )}
            </div>
          )}

          {/* Adaptive Participant Strip (when stage active & strip non-empty) or Responsive 1/2/3 Grid (when no stage) */}
          {(!stage || stripParticipants.length > 0) && (
            <div
              className={
                stage
                  ? "scroll-thin flex shrink-0 gap-2.5 overflow-x-auto lg:w-64 xl:w-72 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto"
                  : `scroll-thin grid min-h-0 flex-1 gap-2.5 sm:gap-3 overflow-y-auto auto-rows-fr ${adaptiveGridClass(visibleParticipants.length)}`
              }
            >
              {(stage ? stripParticipants : visibleParticipants).map((p) => {
                const mine = p.joinToken === meeting.joinToken;
                const speaking = mine ? meeting.micOn && meeting.speaking : p.micOn && !p.micMuted;
                const pStreams = getParticipantStreams(p);
                const cameraStream = pStreams.camera;
                const screenStream = pStreams.screen;
                const isPinnedThis = stage?.who.joinToken === p.joinToken;

                return (
                  <div
                    key={p.joinToken}
                    tabIndex={0}
                    aria-label={p.name}
                    onClick={() => {
                      setStageMinimized(false);
                      if (isPinnedThis && stage?.kind !== "screen") {
                        setStageTarget(null);
                      } else if (cameraStream) {
                        setStageTarget({ token: p.joinToken, kind: "camera" });
                      } else {
                        setStageTarget({ token: p.joinToken, kind: "user" });
                      }
                    }}
                    onContextMenu={(e) => open(e, personMenu(p))}
                    title="کلیک برای بزرگ‌نمایی در صحنهٔ اصلی"
                    className={`group anim-rise relative flex cursor-pointer items-center justify-center overflow-hidden rounded-2xl border transition-all duration-200 hover:border-accent/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                      stage
                        ? "h-32 w-48 shrink-0 lg:h-40 lg:w-full"
                        : visibleParticipants.length === 1
                          ? "min-h-[260px]"
                          : "min-h-[165px]"
                    } ${
                      speaking
                        ? "border-accent ring-2 ring-accent/70"
                        : isPinnedThis
                          ? "border-accent/55"
                          : "border-line"
                    }`}
                    style={{ background: `radial-gradient(120% 120% at 30% 20%, ${p.avatarColor}28 0%, var(--surface-2) 74%)` }}
                  >
                    {cameraStream ? (
                      <VideoTile stream={cameraStream} mirrored={mine} />
                    ) : (
                      <div className="pointer-events-none flex flex-col items-center gap-2 px-2 text-center">
                        <Avatar
                          name={p.name}
                          color={p.avatarColor}
                          size={stage ? 52 : visibleParticipants.length <= 2 ? 96 : visibleParticipants.length <= 4 ? 76 : 60}
                          userId={p.userId ?? undefined}
                          avatarFileId={p.avatarFileId ?? undefined}
                        />
                        {!stage && <p className="max-w-full truncate text-sm font-bold text-fg/90">{p.name}</p>}
                      </div>
                    )}

                    {/* Quick action buttons on top-end */}
                    <div className="absolute end-2 top-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStageMinimized(false);
                          if (screenStream && stage?.kind !== "screen") {
                            setStageTarget({ token: p.joinToken, kind: "screen" });
                          } else if (isPinnedThis) {
                            setStageTarget(null);
                          } else {
                            setStageTarget({ token: p.joinToken, kind: cameraStream ? "camera" : "user" });
                          }
                        }}
                        title="نمایش در صحنهٔ اصلی"
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white/80 opacity-0 backdrop-blur transition hover:bg-black/75 hover:text-white group-hover:opacity-100 focus:opacity-100"
                      >
                        <Icon name="maximize" size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); open(e, personMenu(p)); }}
                        aria-label={`گزینه‌های ${p.name}`}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white/80 backdrop-blur transition hover:bg-black/75 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                      >
                        <Icon name="more-vertical" size={14} />
                      </button>
                    </div>

                    {/* Top-start badges */}
                    <div className="absolute start-2 top-2 flex flex-wrap items-center gap-1">
                      {p.isHost && (
                        <span className="rounded-md border border-amber-400/45 bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-200 backdrop-blur-md">
                          میزبان
                        </span>
                      )}
                      {(() => {
                        const effectiveState = mine ? meeting.myConnState : (p.connState || "connecting");
                        const cm = CONN_META[effectiveState] || CONN_META.connecting;
                        return (
                          <span
                            title={cm.label}
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold backdrop-blur-md ${cm.cls}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${cm.dot}`} />
                            <span>{cm.short}</span>
                          </span>
                        );
                      })()}
                      {p.sharingOn && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setStageMinimized(false);
                            setStageTarget({ token: p.joinToken, kind: "screen" });
                          }}
                          className="flex items-center gap-1 rounded-md border border-accent/50 bg-accent/25 px-1.5 py-0.5 text-[10px] font-bold text-accent backdrop-blur-md"
                          title="مشاهدهٔ صفحهٔ اشتراکی"
                        >
                          <Icon name="screen" size={10} /> اشتراک صفحه
                        </button>
                      )}
                    </div>

                    {/* Bottom bar */}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pb-2 pt-7">
                      <span className="flex min-w-0 items-center gap-1 rounded bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                        {mine && <span className="text-white/60">(شما)</span>}
                        <span className="truncate">{p.name}</span>
                        {p.isGuest && <span className="rounded bg-white/15 px-1 text-[9px] text-white/75">مهمان</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {p.cameraOn && (
                          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-sky-400/40 bg-sky-500/25 text-sky-300 backdrop-blur" title={`کمرا روشن · ${p.cameraQuality}`}>
                            <Icon name="video" size={12} />
                          </span>
                        )}
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-md ${
                            p.micMuted
                              ? "border border-rose-400/40 bg-rose-500/25 text-rose-300 backdrop-blur"
                              : p.micOn
                                ? "border border-emerald-400/40 bg-emerald-500/25 text-emerald-300 backdrop-blur"
                                : "bg-black/55 text-white/65 backdrop-blur"
                          }`}
                          title={p.micMuted ? "میکروفون بسته" : p.micOn ? "میکروفون روشن" : "میکروفون خاموش"}
                        >
                          <Icon name={p.micOn && !p.micMuted ? "mic" : "mic-off"} size={12} />
                        </span>
                      </span>
                    </div>

                    {mine && meeting.micOn && (
                      <div className="absolute bottom-9 start-2.5 h-1 w-16 overflow-hidden rounded-full bg-black/30">
                        <LevelBar active />
                      </div>
                    )}
                  </div>
                );
              })}

              {visibleParticipants.length === 0 && !stage && (
                <p className="col-span-full flex items-center justify-center rounded-xl border border-dashed border-line p-8 text-center text-xs text-muted">
                  هنوز کسی در جلسه نیست. لینک جلسه را به اشتراک بگذارید.
                </p>
              )}
            </div>
          )}
        </main>

        {/* Resizable Side Panel (People / Audio / Games) */}
        {(panel === "people" || panel === "audio" || (panel === "games" && !gameExpanded)) && (
          <aside
            style={{ "--meet-side-w": `${sideWidth}px` }}
            className="anim-slide-panel fixed inset-0 z-30 flex flex-col bg-surface sm:relative sm:inset-auto sm:w-[var(--meet-side-w)] sm:shrink-0 sm:border-s sm:border-line"
          >
            {/* Drag-resize handle on desktop */}
            <div
              onMouseDown={startSideResize}
              title="تغییر اندازهٔ پنل کناری"
              className={`group/resize absolute inset-y-0 -start-1 z-20 hidden w-2.5 cursor-col-resize items-center justify-center sm:flex ${
                resizingSide ? "bg-accent/25" : "hover:bg-accent/15"
              }`}
            >
              <span className={`h-10 w-0.5 rounded-full transition ${resizingSide ? "bg-accent" : "bg-transparent group-hover/resize:bg-accent/60"}`} />
            </div>

            {panel === "audio" && (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b border-line p-2.5">
                  <Icon name="sliders" size={16} className="ms-1 text-accent" />
                  <p className="flex-1 text-sm font-black">تنظیمات صدا و نویزگیر</p>
                  <button
                    type="button"
                    onClick={() => setPanel(null)}
                    aria-label="بستن"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
                  <AudioSettingsSection
                    compact
                    showAppSounds={false}
                    externalCall={{
                      prefs: meeting.prefs,
                      devices: meeting.devices,
                      micActive: meeting.micOn && !meeting.myState.micMuted,
                      updateAudioPrefs: meeting.updateAudioPrefs,
                      changeInput: meeting.changeInput,
                      changeOutput: meeting.changeOutput,
                      setMicGain: meeting.setMicGain,
                      setMaster: meeting.setMaster,
                    }}
                  />
                </div>
              </>
            )}

            {panel === "people" && (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b border-line p-2.5">
                  <p className="flex-1 px-1.5 text-sm font-bold">افراد در جلسه ({faNum(inCall.length)})</p>
                  <button onClick={() => setPanel(null)} aria-label="بستن" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><Icon name="close" size={16} /></button>
                </div>
                <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
                  {meeting.amHost && (
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-black text-fg">نیاز به تأیید میزبان (لابی)</p>
                        <p className="mt-0.5 text-[10px] leading-4 text-muted">
                          {meeting.lobbyEnabled
                            ? "افراد دارای لینک منتظر تأیید می‌مانند (دعوت‌شدگان همیشه مستقیم وارد می‌شوند)"
                            : "هر کسی با لینک جلسه بلافاصله بدون انتظار وارد می‌شود"}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={meeting.lobbyEnabled}
                        onChange={(e) => void meeting.setLobby(e.target.checked)}
                        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                    </label>
                  )}

                  {meeting.amHost && lobby.length > 0 && (
                    <div className="rounded-xl bg-amber-400/10 p-3 ring-1 ring-amber-400/25">
                      <p className="mb-2 flex items-center gap-2 text-xs font-bold text-amber-400"><Icon name="clock" size={14} /> در انتظار تأیید ({faNum(lobby.length)})</p>
                      <div className="space-y-2">
                        {lobby.map((p) => (
                          <div key={p.joinToken} className="flex items-center gap-2">
                            <Avatar name={p.name} color={p.avatarColor} size={32} userId={p.userId ?? undefined} avatarFileId={p.avatarFileId ?? undefined} />
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                              {p.name}
                              {p.isGuest && <span className="text-[10px] font-normal text-muted"> · مهمان</span>}
                            </span>
                            <button onClick={() => void meeting.hostAction("admit", p.joinToken)} className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/30">راه بده</button>
                            <button onClick={() => void meeting.hostAction("kick", p.joinToken)} aria-label="رد کردن" className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-muted hover:bg-rose-500/20 hover:text-rose-400"><Icon name="close" size={13} /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {inCall.map((p) => {
                    const vol = meeting.prefs.volumes[p.joinToken] ?? 100;
                    const mine = p.joinToken === meeting.joinToken;
                    return (
                      <div key={p.joinToken} onContextMenu={(e) => open(e, personMenu(p))} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-2.5">
                        <Avatar name={p.name} color={p.avatarColor} size={36} userId={p.userId ?? undefined} avatarFileId={p.avatarFileId ?? undefined} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold">
                            {p.name}
                            {mine && <span className="text-[10px] font-normal text-muted"> (شما)</span>}
                            {p.isHost && <span className="ms-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] text-amber-400">میزبان</span>}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted">
                            {(() => {
                              const effectiveState = mine ? meeting.myConnState : (p.connState || "connecting");
                              const cm = CONN_META[effectiveState] || CONN_META.connecting;
                              return (
                                <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold ${cm.cls}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${cm.dot}`} />
                                  {cm.short}
                                </span>
                              );
                            })()}
                            <span className="flex items-center gap-1">
                              <Icon name={p.micMuted ? "mic-off" : p.micOn ? "mic" : "mic-off"} size={11} className={p.micMuted ? "text-red-400" : p.micOn ? "text-emerald-400" : ""} />
                              {p.micMuted ? "میکروفون بسته" : p.micOn ? "میکروفون روشن" : "میکروفون خاموش"}
                            </span>
                            {p.cameraOn && <span className="flex items-center gap-1 text-accent"><Icon name="video" size={11} /> کمرا ({p.cameraQuality})</span>}
                            {p.sharingOn && <span className="flex items-center gap-1 text-accent"><Icon name="screen" size={11} /> صفحه ({p.shareQuality})</span>}
                          </div>
                          {!mine && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <button onClick={() => meeting.setVolume(p.joinToken, vol === 0 ? 100 : 0)} aria-label="صدا" className="text-muted hover:text-fg">
                                <Icon name={vol === 0 ? "volume-off" : "volume"} size={13} />
                              </button>
                              <input type="range" min={0} max={100} value={vol} onChange={(e) => meeting.setVolume(p.joinToken, Number(e.target.value))} aria-label={`صدای ${p.name}`} className="h-1 min-w-0 flex-1 accent-[var(--accent)]" />
                            </div>
                          )}
                        </div>
                        <button onClick={(e) => open(e, personMenu(p))} aria-label={`گزینه‌های ${p.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-fg">
                          <Icon name="more-vertical" size={15} />
                        </button>
                      </div>
                    );
                  })}

                  <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-3 text-xs">
                    <div>
                      <p className="mb-1.5 font-bold text-fg/80">میکروفون من (صدای ارسالی)</p>
                      <div className="flex items-center gap-2">
                        <Icon name="mic" size={14} className="shrink-0 text-muted" />
                        <input type="range" min={0} max={200} value={meeting.prefs.micGain} onChange={(e) => meeting.setMicGain(Number(e.target.value))} aria-label="بلندی میکروفون من" className="h-1 min-w-0 flex-1 accent-[var(--accent)]" />
                        <span className="w-10 text-left tabular-nums text-muted">{faNum(meeting.prefs.micGain)}٪</span>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 font-bold text-fg/80">صدای دریافتی کلی</p>
                      <div className="flex items-center gap-2">
                        <Icon name="volume" size={14} className="shrink-0 text-muted" />
                        <input type="range" min={0} max={100} value={meeting.prefs.master} onChange={(e) => meeting.setMaster(Number(e.target.value))} aria-label="صدای کلی" className="h-1 flex-1 accent-[var(--accent)]" />
                        <span className="w-10 text-left tabular-nums text-muted">{faNum(meeting.prefs.master)}٪</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPanel("audio")}
                      className="press flex w-full items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent/14 py-2 text-xs font-black text-accent hover:bg-accent/24"
                    >
                      <Icon name="sliders" size={14} />
                      تنظیمات پیشرفتهٔ صدا، نویزگیر و آستانهٔ میکروفون
                    </button>
                  </div>
                </div>
              </>
            )}

            {panel === "games" && !gameExpanded && (
              <GamesPanel
                meeting={meeting}
                onClose={() => setPanel(null)}
                expanded={false}
                onToggleExpand={() => setGameExpanded(true)}
              />
            )}
          </aside>
        )}

        {/* Large-scale Expanded Game Arena Modal */}
        {panel === "games" && gameExpanded && (
          <div
            dir="rtl"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-md sm:p-6"
            onMouseDown={() => setGameExpanded(false)}
          >
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="anim-rise flex h-[min(92vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_28px_90px_rgba(0,0,0,.85)]"
            >
              <GamesPanel
                meeting={meeting}
                onClose={() => { setGameExpanded(false); setPanel(null); }}
                expanded={true}
                onToggleExpand={() => setGameExpanded(false)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Floating Studio Dock Control Bar */}
      {meeting.shareError && (
        <p role="alert" className="shrink-0 bg-amber-400/10 px-4 py-1.5 text-center text-xs text-amber-400">{meeting.shareError}</p>
      )}
      <footer className="flex shrink-0 items-center justify-center px-2.5 pb-2.5 pt-1.5 sm:px-4 sm:pb-3">
        <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-3xl border border-line bg-surface/90 px-2.5 py-2 shadow-[0_14px_40px_rgba(0,0,0,.45)] backdrop-blur-xl sm:gap-2 sm:px-3.5">
          {/* Audio & Video Group */}
          <Ctrl
            label={meeting.micOn ? "خاموش کردن میکروفون" : "روشن کردن میکروفون"}
            tone={meeting.micOn ? "on" : "off"}
            disabled={meeting.myState.micMuted}
            onClick={() => void meeting.toggleMic()}
            title={meeting.myState.micMuted ? "میزبان میکروفون شما را بسته است" : undefined}
          >
            <Icon name={meeting.micOn ? "mic" : "mic-off"} size={19} />
          </Ctrl>

          <div className="relative" ref={cameraRef}>
            <Ctrl
              label="تنظیمات کمرا"
              tone={meeting.cameraOn ? "on" : "idle"}
              disabled={meeting.myState.shareBlocked}
              onClick={() => { setMediaMenu((m) => (m === "camera" ? null : "camera")); setLinkOpen(false); setInviteOpen(false); }}
              title={meeting.myState.shareBlocked ? "میزبان اشتراک تصویر شما را بسته است" : "کیفیت کمرا و روشن/خاموش"}
              badge={meeting.cameraOn ? meeting.cameraQuality : null}
            >
              <Icon name={meeting.cameraOn ? "video" : "camera"} size={19} />
            </Ctrl>
            <MediaPopover
              open={mediaMenu === "camera"}
              kind="camera"
              title="تنظیمات تصویر کمرا"
              subtitle="انتخاب کیفیت تصویر و نرخ فریم دوربین"
              quality={meeting.cameraQuality}
              fps={meeting.cameraFps}
              onPick={(q, f) => void (meeting.cameraOn ? meeting.changeCameraQuality(q, f) : meeting.startCamera(q, f))}
              onClose={() => setMediaMenu(null)}
              active={meeting.cameraOn}
              onStop={() => void meeting.stopCamera()}
              stopLabel="خاموش کردن کمرا"
              icon="camera"
              startLabel="روشن کردن کمرا"
            />
          </div>

          <div className="relative" ref={shareRef}>
            <Ctrl
              label="اشتراک صفحهٔ نمایش"
              tone={meeting.sharing ? "accent" : "idle"}
              disabled={meeting.myState.shareBlocked}
              onClick={() => { setMediaMenu((m) => (m === "share" ? null : "share")); setLinkOpen(false); setInviteOpen(false); }}
              title={meeting.myState.shareBlocked ? "میزبان اشتراک صفحهٔ شما را بسته است" : "تنظیم کیفیت و اشتراک صفحه"}
              badge={meeting.sharing ? meeting.shareQuality : null}
            >
              <Icon name="screen" size={19} />
            </Ctrl>
            <MediaPopover
              open={mediaMenu === "share"}
              kind="share"
              title="اشتراک صفحهٔ نمایش"
              subtitle="وضوح واقعی ۴۸۰p / ۷۲۰p / ۱۰۸۰p با کنترل بیت‌ریت"
              quality={meeting.shareQuality}
              fps={meeting.shareFps}
              onPick={(q, f) => void (meeting.sharing ? meeting.changeShareQuality(q, f) : meeting.startShare(q, f))}
              onClose={() => setMediaMenu(null)}
              active={meeting.sharing}
              onStop={() => void meeting.stopShare()}
              stopLabel="توقف اشتراک صفحه"
              icon="screen"
              startLabel="انتخاب صفحه و شروع اشتراک"
            />
          </div>

          <div className="mx-0.5 h-7 w-px bg-line" />

          {/* Collaboration & Audio Settings Group */}
          <Ctrl
            label="تنظیمات صدا و نویزگیر"
            tone={panel === "audio" ? "warn" : "idle"}
            onClick={() => setPanel((p) => (p === "audio" ? null : "audio"))}
            title="تنظیمات میکروفون، حذف نویز جزئی و آستانهٔ ارسال صدا"
            badge={meeting.prefs.vadEnabled ? `${faNum(meeting.prefs.vadThreshold)}٪` : null}
          >
            <Icon name="sliders" size={19} />
          </Ctrl>
          <Ctrl
            label="بازی‌های گروهی"
            tone={panel === "games" ? "warn" : "idle"}
            onClick={() => setPanel((p) => (p === "games" ? null : "games"))}
          >
            <Icon name="gamepad" size={19} />
          </Ctrl>
          <Ctrl
            label="شرکت‌کنندگان"
            tone={panel === "people" ? "warn" : "idle"}
            onClick={() => setPanel((p) => (p === "people" ? null : "people"))}
            badge={meeting.amHost && lobby.length > 0 ? faNum(lobby.length) : faNum(inCall.length)}
          >
            <Icon name="users" size={19} />
          </Ctrl>

          <div className="mx-0.5 h-7 w-px bg-line" />

          {/* Leave / End Group */}
          {meeting.amHost ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void requestLeave()}
                aria-label="خروج از جلسه (بدون پایان)"
                title="خروج موقت (جلسه برای اعضا باز می‌ماند)"
                className="press flex h-11 items-center gap-1.5 rounded-2xl border border-line bg-surface-2/85 px-3.5 text-xs font-bold text-fg backdrop-blur-md transition hover:bg-surface-3"
              >
                <Icon name="door" size={17} /> <span className="hidden sm:inline">خروج</span>
              </button>
              <button
                type="button"
                onClick={() => void endMeeting()}
                aria-label="پایان جلسه برای همه"
                title="پایان کامل جلسه برای همهٔ اعضا"
                className="press flex h-11 items-center gap-1.5 rounded-2xl border border-rose-400/45 bg-rose-500/20 px-4 text-xs font-black text-rose-200 shadow-[0_6px_22px_rgba(244,63,94,.22)] backdrop-blur-xl transition hover:border-rose-400 hover:bg-rose-500/32"
              >
                <Icon name="phone-off" size={17} /> <span>پایان میت</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void requestLeave()}
              aria-label="خروج از جلسه"
              className="press flex h-11 items-center gap-1.5 rounded-2xl border border-rose-400/45 bg-rose-500/20 px-4 text-xs font-black text-rose-200 shadow-[0_6px_22px_rgba(244,63,94,.22)] backdrop-blur-xl transition hover:border-rose-400 hover:bg-rose-500/32"
            >
              <Icon name="phone-off" size={18} /> <span>خروج</span>
            </button>
          )}
        </div>
      </footer>

      <ContextMenu state={menu} onClose={close} />
      {viewProfileId && me && (
        <UserProfileModal
          userId={viewProfileId}
          me={me}
          onClose={() => setViewProfileId(null)}
          onMessage={() => {
            setViewProfileId(null);
            minimizeToApp();
          }}
        />
      )}
      {myRow?.micMuted && (
        <p className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-lg bg-rose-500/90 px-4 py-1.5 text-xs font-bold text-white shadow-lg">
          میکروفون شما توسط میزبان بسته شده است
        </p>
      )}
    </div>
  );
}

/** The main stage video: shared screen or pinned camera. */
function Stage({ stream, name, kind, mirrored = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream ?? null;
    if (stream) void el.play().catch(() => {});
  }, [stream]);
  if (!stream) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-white/55">
        در حال دریافت {kind === "camera" ? "تصویر کمرا" : "تصویر صفحهٔ"} {name}…
      </div>
    );
  }
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`h-full w-full bg-black object-contain ${mirrored ? "scale-x-[-1]" : ""}`}
    />
  );
}

/** A camera feed shown inside a participant tile. */
function VideoTile({ stream, mirrored }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className={`absolute inset-0 h-full w-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`} />;
}

/** Width-based mic level bar: repaints itself without re-rendering the call screen. */
function LevelBar({ active }) {
  const ref = useRef(null);
  useEffect(
    () => subscribeMicLevel((level) => {
      const el = ref.current;
      if (el) el.style.width = `${active ? Math.min(100, level) : 0}%`;
    }),
    [active],
  );
  return <div ref={ref} className="h-full rounded-full bg-emerald-400 transition-[width] duration-100" style={{ width: 0 }} />;
}
