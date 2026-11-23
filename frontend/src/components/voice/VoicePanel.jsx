import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, faNum, toast } from "../../utils/client";
import { createDemoWav } from "../../utils/demoAudio";
import { Avatar, Input } from "../common/Ui";
import { Icon } from "../common/Icon";
import BotPlayer from "./BotPlayer";
import { useVoiceRoom } from "../../hooks/useVoiceRoom";
import { MicMeter, subscribeMicLevel } from "../../utils/micMeter";
import { useContextMenu, ContextMenu } from "../common/ContextMenu";
import { useConfirm } from "../common/Confirm";
import DraggablePiP from "../common/DraggablePiP";
import AudioSettingsSection from "../common/AudioSettingsSection";

const RESOLUTIONS = [
  { id: "480p", label: "۴۸۰p", badge: "SD", res: "854×480", bitrate: "۱.۱Mbps" },
  { id: "720p", label: "۷۲۰p", badge: "HD", res: "1280×720", bitrate: "۲.۸Mbps" },
  { id: "1080p", label: "۱۰۸۰p", badge: "FHD", res: "1920×1080", bitrate: "۶.۰Mbps" },
];

/**
 * Full-width adaptive grid matching Meet.jsx so 1+ participants fill the available stage cleanly.
 */
function adaptiveGridClass(count) {
  if (count <= 1) return "grid-cols-1 w-full";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2 w-full";
  if (count === 3) return "grid-cols-1 sm:grid-cols-3 w-full";
  if (count === 4) return "grid-cols-2 w-full";
  if (count <= 6) return "grid-cols-2 lg:grid-cols-3 w-full";
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
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const text = hh > 0 ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`;
  return <span dir="ltr" className="tabular-nums">{text}</span>;
}

function LevelMeter({ active, bars = 10 }) {
  return <MicMeter active={active} bars={bars} barClassName="h-2.5 w-1.5 rounded-full" />;
}

function LevelBar({ active = true }) {
  const ref = useRef(null);
  useEffect(
    () =>
      subscribeMicLevel((level) => {
        const el = ref.current;
        if (el) el.style.width = `${active ? Math.min(100, level) : 0}%`;
      }),
    [active],
  );
  return <div ref={ref} className="h-full rounded-full bg-emerald-400 transition-[width] duration-100" style={{ width: 0 }} />;
}

/** Studio Dock Button matching Meet.jsx with translucent active states */
function Ctrl({ label, onClick, children, tone = "idle", disabled, title, badge }) {
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
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className={`press relative flex h-11 w-11 items-center justify-center rounded-2xl border backdrop-blur transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40 ${look}`}
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

/** Anchored floating Screen-Share popover matching Meet.jsx */
function SharePopover({ open, quality, onPick, onClose, active, onStop }) {
  const [selQuality, setSelQuality] = useState(quality || "720p");
  useEffect(() => {
    if (open && quality) setSelQuality(quality);
  }, [open, quality]);
  if (!open) return null;

  const currentSpec = RESOLUTIONS.find((r) => r.id === selQuality) ?? RESOLUTIONS[1];

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label="اشتراک صفحهٔ نمایش"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        animation: "dockPopoverIn .22s cubic-bezier(.16, 1, .3, 1) both",
        transformOrigin: "bottom center",
      }}
      className="fixed inset-x-3 bottom-20 z-50 mx-auto w-auto max-w-[19rem] rounded-2xl border border-line/90 bg-surface/95 p-3.5 text-fg shadow-[0_22px_55px_rgba(0,0,0,.65)] backdrop-blur-2xl sm:absolute sm:inset-x-auto sm:bottom-[calc(100%+12px)] sm:left-1/2 sm:mx-0 sm:w-[19rem] sm:-translate-x-1/2"
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "animate-pulse bg-emerald-400" : "bg-accent"}`} />
          <span className="truncate text-xs font-black text-fg">اشتراک صفحهٔ نمایش</span>
        </div>
        <span dir="ltr" className="rounded-md border border-line bg-surface-2/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted">
          {currentSpec.res} · {currentSpec.bitrate}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2/85 p-1">
        {RESOLUTIONS.map((q) => {
          const selected = selQuality === q.id;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setSelQuality(q.id)}
              aria-pressed={selected}
              className={`press flex flex-col items-center justify-center rounded-lg py-1.5 transition ${
                selected ? "border border-accent/45 bg-accent/18 text-accent shadow-sm" : "border border-transparent text-muted hover:text-fg"
              }`}
            >
              <span className="text-xs font-black leading-4">{q.label}</span>
              <span className="text-[9px] font-bold opacity-75">{q.badge}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => { onPick(selQuality); onClose(); }}
          className="press flex w-full items-center justify-center gap-1.5 rounded-xl border border-accent/45 bg-accent/20 py-2 text-xs font-black text-accent transition hover:bg-accent/30"
        >
          <Icon name="screen" size={14} />
          <span>{active ? `اعمال کیفیت ${selQuality}` : "انتخاب صفحه و شروع اشتراک"}</span>
        </button>
        {active && (
          <button
            type="button"
            onClick={() => { onClose(); onStop(); }}
            className="press flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-400/35 bg-rose-500/15 py-1.5 text-[11px] font-bold text-rose-300 transition hover:bg-rose-500/25"
          >
            <Icon name="close" size={13} /> توقف اشتراک صفحه
          </button>
        )}
      </div>
    </div>
  );
}

function StageVideo({ stream, name }) {
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
        در حال دریافت تصویر صفحهٔ {name}…
      </div>
    );
  }
  return <video ref={ref} autoPlay playsInline muted className="h-full w-full bg-black object-contain" />;
}

export default function VoicePanel({ conversationId, me, detail, onClose, onOpenDirect, onOpenProfile }) {
  const { confirm } = useConfirm();
  const { menu, open, close } = useContextMenu();
  const voice = useVoiceRoom(conversationId, me);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState(null); // "people" | "music" | null
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [audioFile, setAudioFile] = useState(null);
  const [source, setSource] = useState("link");
  const [busy, setBusy] = useState(false);
  const [lobbyPeople, setLobbyPeople] = useState([]);
  const [joinedAt, setJoinedAt] = useState(0);
  /** `{ userId: string, kind: "screen" | "user" } | null` */
  const [stageTarget, setStageTarget] = useState(null);
  const [stageMinimized, setStageMinimized] = useState(false);
  const [shareMenu, setShareMenu] = useState(false);
  const [roomFs, setRoomFs] = useState(false);
  const [streamFs, setStreamFs] = useState(false);
  const [sideWidth, setSideWidth] = useState(() => {
    const saved = Number(localStorage.getItem("inebuly-meet-side-w"));
    return Number.isFinite(saved) && saved >= 290 && saved <= 640 ? saved : 370;
  });
  const [resizingSide, setResizingSide] = useState(false);

  const shareRef = useRef(null);
  const rootFsRef = useRef(null);
  const streamFsRef = useRef(null);
  // lobby choices
  const [micReady, setMicReady] = useState("idle");
  const [joinWithMic, setJoinWithMic] = useState(true);
  const [showLobbyDevices, setShowLobbyDevices] = useState(false);

  const canSpeak = me.permissions.includes("voice.speak");
  const isMod = me.permissions.includes("voice.moderate") || (detail.type !== "direct" && ["owner", "admin"].includes(detail.myRole));
  const canKick = detail.type !== "direct" && (["owner", "admin"].includes(detail.myRole) || me.permissions.includes("rooms.manage"));
  const canPlay = me.permissions.includes("voice.play") && !voice.restrictions.playBlocked;
  const canShare = me.permissions.includes("screen.share") && !voice.restrictions.shareBlocked;

  const startSideResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sideWidth;
    setResizingSide(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev) => {
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

  // Lobby: who is already inside
  useEffect(() => {
    if (voice.status !== "idle") return;
    let alive = true;
    const load = () => apiFetch(`/api/voice/${conversationId}`).then((d) => { if (alive) setLobbyPeople(d.participants); }).catch(() => {});
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => { alive = false; clearInterval(t); };
  }, [conversationId, voice.status]);

  // Lobby mic preview
  useEffect(() => {
    if (voice.status !== "idle" || !canSpeak) return;
    let cancelled = false;
    setMicReady("checking");
    void voice.previewMic().then((ok) => { if (!cancelled) setMicReady(ok ? "ready" : "blocked"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.status, canSpeak]);

  useEffect(() => () => { voice.stopPreview(); }, [voice.stopPreview]);

  useEffect(() => {
    if (!shareMenu) return;
    const onDown = (e) => {
      if (!shareRef.current?.contains(e.target)) setShareMenu(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setShareMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [shareMenu]);

  useEffect(() => {
    if (voice.status === "joined" && !joinedAt) setJoinedAt(Date.now());
    if (voice.status === "idle" && joinedAt) setJoinedAt(0);
  }, [voice.status, joinedAt]);

  useEffect(() => {
    const onFsChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement || null;
      setRoomFs(Boolean(fsEl && fsEl === rootFsRef.current));
      setStreamFs(Boolean(fsEl && fsEl === streamFsRef.current));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  async function toggleElementFullscreen(el) {
    if (!el) return;
    try {
      const current = document.fullscreenElement || document.webkitFullscreenElement;
      if (current === el) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
      } else {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      }
    } catch {
      toast("نمایش تمام‌صفحه در این مرورگر مجاز نیست", "error");
    }
  }

  // Active screen shares
  const activeScreenItems = useMemo(() => {
    return voice.participants
      .filter((p) => p.sharingOn || (p.userId === me.id ? voice.localScreen : voice.remoteVideos[p.userId]))
      .map((p) => ({
        userId: p.userId,
        who: p,
        stream: p.userId === me.id ? voice.localScreen : voice.remoteVideos[p.userId] ?? null,
      }));
  }, [me.id, voice.localScreen, voice.participants, voice.remoteVideos]);

  // Main stage target (screen share or spotlighted user tile)
  const stage = useMemo(() => {
    if (stageMinimized) return null;
    if (stageTarget) {
      const p = voice.participants.find((x) => x.userId === stageTarget.userId);
      if (p) {
        const s = p.userId === me.id ? voice.localScreen : voice.remoteVideos[p.userId] ?? null;
        if (stageTarget.kind === "screen" && (p.sharingOn || s)) {
          return { kind: "screen", stream: s, who: p };
        }
        if (stageTarget.kind === "user") {
          return { kind: "user", stream: null, who: p };
        }
      }
    }
    if (activeScreenItems.length > 0) {
      const first = activeScreenItems[0];
      return { kind: "screen", stream: first.stream, who: first.who };
    }
    return null;
  }, [activeScreenItems, me.id, stageMinimized, stageTarget, voice.localScreen, voice.participants, voice.remoteVideos]);

  useEffect(() => {
    if (activeScreenItems.length === 0 && !stageTarget) setStageMinimized(false);
  }, [activeScreenItems.length, stageTarget]);

  const stripParticipants = useMemo(() => {
    if (!stage) return voice.participants;
    if (stage.kind === "screen") return voice.participants;
    return voice.participants.filter((p) => p.userId !== stage.who.userId);
  }, [stage, voice.participants]);

  async function act(body) {
    return apiFetch(`/api/voice/${conversationId}/track`, { method: "POST", json: { ...body, joinToken: voice.joinToken } });
  }

  async function submitTrack(fileOverride) {
    if (!voice.joinToken) return toast("اول به تماس بپیوندید", "error");
    if (!canPlay) return toast("مجوز پخش موسیقی ندارید", "error");
    setBusy(true);
    try {
      const file = fileOverride || (source === "file" ? audioFile : null);
      let body;
      if (file) {
        if (!me.permissions.includes("files.upload")) throw new Error("مجوز آپلود فایل ندارید؛ از لینک مستقیم استفاده کنید");
        if (file.size > 15 * 1024 * 1024) throw new Error("حداکثر حجم فایل ۱۵ مگابایت است");
        if (!(file.type.startsWith("audio/") || /\.(mp3|m4a|ogg|wav|flac|aac|webm|opus)$/i.test(file.name))) throw new Error("فایل انتخاب‌شده صوتی نیست");
        const fd = new FormData();
        fd.append("file", file);
        const uploaded = await apiFetch("/api/files", { method: "POST", body: fd });
        body = { action: "start", fileId: uploaded.file.id, title: title.trim() || file.name };
      } else {
        if (!url.trim()) throw new Error("لینک صوتی را وارد کنید");
        body = { action: "start", url: url.trim(), title: title.trim() };
      }
      await act(body);
      toast("ربات موسیقی به تماس اضافه شد", "success");
      setAudioFile(null);
    } catch (err) { toast(err.message, "error"); }
    finally { setBusy(false); }
  }

  async function playDemo() {
    try { await submitTrack(createDemoWav()); } catch (err) { toast(err.message, "error"); }
  }

  async function trackAction(action, userId) {
    try { await act({ action, ...(userId ? { userId } : {}) }); }
    catch (err) { toast(err.message, "error"); }
  }

  async function moderate(userId, field, enabled) {
    try {
      await apiFetch(`/api/voice/${conversationId}`, { method: "POST", json: { action: "moderate", userId, field, enabled } });
      toast(enabled ? "محدودیت اعمال شد" : "محدودیت برداشته شد", "success");
    } catch (err) { toast(err.message, "error"); }
  }

  async function kickFromChat(person) {
    const ok = await confirm({
      title: `حذف ${person.displayName} از ${detail.type === "room" ? "اتاق" : "گروه"}`,
      message: "این فرد از تماس خارج و از فهرست اعضا حذف می‌شود.",
      confirmLabel: "حذف کن",
      variant: "danger",
      icon: "door",
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/conversations/${conversationId}/members`, { method: "PATCH", json: { userId: person.userId, action: "kick" } });
      toast(`${person.displayName} حذف شد`, "success");
    } catch (err) { toast(err.message, "error"); }
  }

  async function blockPerson(person) {
    const ok = await confirm({ title: "مسدود کردن کاربر", message: `«${person.displayName}» مسدود می‌شود.`, confirmLabel: "مسدود کن", variant: "danger", icon: "ban" });
    if (!ok) return;
    try {
      await apiFetch("/api/blocks", { method: "POST", json: { userId: person.userId } });
      toast("کاربر مسدود شد", "success");
    } catch (err) { toast(err.message, "error"); }
  }

  function personMenu(person) {
    const mine = person.userId === me.id;
    const vol = voice.prefs.volumes[String(person.userId)] ?? 100;
    const isPinned = stage?.who.userId === person.userId && stage?.kind === "user";
    const items = [
      { type: "label", label: mine ? `${person.displayName} (شما)` : person.displayName },
      { type: "item", key: "profile", label: mine ? "مشاهده پروفایل من" : "مشاهده پروفایل", icon: "user", onClick: () => onOpenProfile?.(person.userId) },
      {
        type: "item",
        key: "pin",
        label: isPinned ? "خروج از بزرگ‌نمایی" : "بزرگ‌نمایی روی صحنه",
        icon: "maximize",
        onClick: () => {
          setStageMinimized(false);
          setStageTarget(isPinned ? null : { userId: person.userId, kind: "user" });
        },
      },
    ];
    if (mine) {
      items.push({
        type: "slider",
        key: "mic-gain",
        label: "حساسیت میکروفون من",
        min: 0,
        max: 200,
        value: voice.prefs.micGain,
        onChange: (v) => voice.setMicGain(v),
      });
      items.push({ type: "divider" });
      items.push({ type: "item", key: "mic", label: voice.micOn ? "خاموش کردن میکروفون من" : "روشن کردن میکروفون من", icon: voice.micOn ? "mic-off" : "mic", disabled: voice.restrictions.micMuted || !canSpeak, onClick: () => void voice.toggleMic() });
      return items;
    }
    items.push({
      type: "slider",
      key: "peer-vol",
      label: "بلندی صدای این فرد",
      min: 0,
      max: 100,
      value: vol,
      onChange: (v) => voice.setVolume(person.userId, v),
    });
    items.push({ type: "item", key: "msg", label: "پیام خصوصی", icon: "chat", onClick: () => onOpenDirect?.(person.userId) });
    items.push({ type: "item", key: "vol", label: vol === 0 ? "وصل کردن صدای این فرد برای من" : "قطع صدای این فرد برای من", icon: vol === 0 ? "volume" : "volume-off", onClick: () => voice.setVolume(person.userId, vol === 0 ? 100 : 0) });
    if (isMod || canKick) {
      items.push({ type: "divider" });
      items.push({ type: "label", label: "اقدامات مدیر" });
      if (isMod) {
        items.push({ type: "item", key: "mute", label: person.micMuted ? "بازگرداندن میکروفون" : "بی‌صدا کردن برای همه", icon: person.micMuted ? "mic" : "mic-off", onClick: () => void moderate(person.userId, "micMuted", !person.micMuted) });
        items.push({ type: "item", key: "play", label: person.playBlocked ? "اجازهٔ پخش موسیقی" : "ممنوع کردن پخش موسیقی", icon: "bot", onClick: () => void moderate(person.userId, "playBlocked", !person.playBlocked) });
        items.push({ type: "item", key: "share", label: person.shareBlocked ? "اجازهٔ اشتراک صفحه" : "بستن اشتراک صفحه", icon: "screen", onClick: () => void moderate(person.userId, "shareBlocked", !person.shareBlocked) });
      }
      if (canKick) items.push({ type: "item", key: "kick", label: `حذف از ${detail.type === "room" ? "اتاق" : "گروه"}`, icon: "door", danger: true, onClick: () => void kickFromChat(person) });
    }
    items.push({ type: "divider" });
    items.push({ type: "item", key: "block", label: "مسدود کردن این کاربر", icon: "ban", danger: true, onClick: () => void blockPerson(person) });
    return items;
  }

  async function testSpeaker() {
    let ctx = null;
    try {
      ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const out = ctx.createMediaStreamDestination();
      oscillator.type = "sine";
      oscillator.frequency.value = 660;
      gain.gain.value = Math.max(0.02, (voice.prefs.master / 100) * 0.16);
      oscillator.connect(gain).connect(out);
      const audio = document.createElement("audio");
      audio.srcObject = out.stream;
      if (voice.prefs.outputId && typeof audio.setSinkId === "function") await audio.setSinkId(voice.prefs.outputId);
      await audio.play();
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.35);
      const cleanCtx = ctx;
      window.setTimeout(() => { audio.pause(); audio.srcObject = null; void cleanCtx.close().catch(() => {}); }, 700);
    } catch { if (ctx) void ctx.close().catch(() => {}); toast("تست خروجی صدا در این مرورگر ممکن نیست", "error"); }
  }

  async function requestLeave() {
    const ok = await confirm({
      title: "قطع تماس؟",
      message: "پس از خروج، میکروفون و اشتراک صفحهٔ شما قطع می‌شود.",
      confirmLabel: "قطع تماس",
      variant: "danger",
      icon: "phone-off",
    });
    if (!ok) return;
    await voice.leave();
    onClose();
  }

  const joined = voice.status === "joined";
  const outputSupported = typeof HTMLAudioElement !== "undefined" && typeof HTMLAudioElement.prototype.setSinkId === "function";
  const inputDevices = voice.devices.filter((d) => d.kind === "audioinput");
  const outputDevices = voice.devices.filter((d) => d.kind === "audiooutput");

  /* ───────────────────────── Pre-join Lobby (matches Meet.jsx!) ───────────────────────── */
  if (!joined) {
    const connecting = voice.status === "connecting";
    const micStatusText =
      !canSpeak ? "نقش شما اجازهٔ صحبت ندارد؛ فقط شنونده خواهید بود"
      : micReady === "checking" ? "در حال بررسی میکروفون…"
      : micReady === "blocked" ? "دسترسی میکروفون داده نشد"
      : joinWithMic ? "میکروفون آماده است — با صدای روشن وارد می‌شوید"
      : "با میکروفون خاموش وارد می‌شوید";
    const kindLabel = detail.type === "direct" ? "تماس دونفره" : detail.type === "group" ? "تماس گروهی" : "تماس اتاق";

    return (
      <div className="anim-surface-in fixed inset-0 z-40 flex flex-col overflow-y-auto bg-bg text-fg">
        {/* Clean top bar without icon box */}
        <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="rounded-full border border-accent/35 bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold text-accent">
              {kindLabel}
            </span>
            <div className="h-4 w-px bg-line" />
            <p className="truncate text-sm font-black text-fg">{detail.name}</p>
          </div>
          <button onClick={onClose} aria-label="بستن" className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted transition hover:bg-surface-3 hover:text-fg">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
          {/* Self preview card */}
          <section
            aria-label="پیش‌نمایش شما"
            className="relative overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-2xl"
            style={{ background: `radial-gradient(120% 120% at 25% 15%, ${me.avatarColor}30 0%, var(--surface-2) 72%)` }}
          >
            <div className="flex aspect-[16/10] flex-col items-center justify-center gap-4">
              <div className={`transition-transform duration-300 ${joinWithMic && micReady === "ready" && voice.speaking ? "scale-105" : ""}`}>
                <Avatar name={me.displayName} color={me.avatarColor} size={132} userId={me.id} avatarFileId={me.avatarFileId} />
              </div>
              <div>
                <p className="text-center text-lg font-black text-fg">{me.displayName}</p>
                <p className="text-center text-xs text-accent" dir="ltr">@{me.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-line bg-surface/85 px-4 py-3 backdrop-blur">
              <button
                onClick={() => setJoinWithMic((v) => !v)}
                disabled={!canSpeak || micReady === "blocked"}
                aria-pressed={joinWithMic}
                className={`press flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition disabled:opacity-40 ${
                  joinWithMic && canSpeak && micReady !== "blocked"
                    ? "border-emerald-400/45 bg-emerald-500/20 text-emerald-300"
                    : "border-rose-400/45 bg-rose-500/20 text-rose-300"
                }`}
              >
                <Icon name={joinWithMic && canSpeak && micReady !== "blocked" ? "mic" : "mic-off"} size={19} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-fg">{micStatusText}</p>
                <div className="mt-1.5"><LevelMeter active={canSpeak && micReady === "ready" && joinWithMic} bars={12} /></div>
              </div>
              <button
                onClick={() => setShowLobbyDevices((v) => !v)}
                aria-expanded={showLobbyDevices}
                className={`press flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition ${
                  showLobbyDevices ? "border-accent/45 bg-accent/18 text-accent" : "border-line bg-surface-2 text-muted hover:text-fg"
                }`}
                title="تنظیمات دستگاه صدا"
              >
                <Icon name="sliders" size={18} />
              </button>
            </div>
            {showLobbyDevices && (
              <div className="grid gap-3 border-t border-line bg-surface p-4 text-xs sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-bold text-muted">میکروفون</span>
                  <select value={voice.prefs.inputId} onChange={(e) => { void voice.changeInput(e.target.value); if (canSpeak) void voice.previewMic().then((ok) => setMicReady(ok ? "ready" : "blocked")); }} className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-fg outline-none">
                    <option value="">میکروفون پیش‌فرض سیستم</option>
                    {inputDevices.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `میکروفون ${i + 1}`}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-bold text-muted">بلندگو</span>
                  <select disabled={!outputSupported} value={voice.prefs.outputId} onChange={(e) => void voice.changeOutput(e.target.value)} className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-fg outline-none disabled:opacity-40">
                    <option value="">بلندگوی پیش‌فرض سیستم</option>
                    {outputDevices.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `خروجی ${i + 1}`}</option>)}
                  </select>
                </label>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <button onClick={() => void testSpeaker()} className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-muted hover:text-fg"><Icon name="play" size={12} /> تست بلندگو</button>
                  <button onClick={() => void voice.refreshDevices()} className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-muted hover:text-fg"><Icon name="refresh" size={12} /> بارگذاری دستگاه‌ها</button>
                </div>
              </div>
            )}
          </section>

          {/* Join column */}
          <section className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-right">
            <div>
              <h1 className="text-2xl font-black sm:text-3xl">آمادهٔ شروع تماس هستید؟</h1>
              <p className="mt-2 text-sm leading-7 text-muted">
                {lobbyPeople.length === 0 ? "هنوز کسی در تماس نیست؛ شما اولین نفر خواهید بود." : `${faNum(lobbyPeople.length)} نفر هم‌اکنون در تماس هستند.`}
              </p>
            </div>

            {lobbyPeople.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3 space-x-reverse">
                  {lobbyPeople.slice(0, 5).map((p) => (
                    <span key={p.userId} className="rounded-xl ring-2 ring-bg" title={p.displayName}>
                      <Avatar name={p.displayName} color={p.avatarColor} size={40} userId={p.userId} avatarFileId={p.avatarFileId} />
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted">
                  {lobbyPeople.slice(0, 2).map((p) => p.displayName).join("، ")}
                  {lobbyPeople.length > 2 ? ` و ${faNum(lobbyPeople.length - 2)} نفر دیگر` : ""}
                </p>
              </div>
            )}

            {(voice.conflictOtherDevice || lobbyPeople.some((p) => p.userId === me.id)) && (
              <div className="w-full max-w-md rounded-2xl border border-amber-400/35 bg-amber-500/10 p-3.5 text-right">
                <p className="flex items-center gap-2 text-xs font-black text-amber-300">
                  <Icon name="devices" size={16} /> شما با تب یا دستگاه دیگری در این تماس هستید
                </p>
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => void voice.join({ micEnabled: joinWithMic && canSpeak && micReady === "ready", forceTakeover: true })}
                  className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/45 bg-amber-400/20 px-4 py-2.5 text-xs font-black text-amber-300 transition hover:bg-amber-400/30 disabled:opacity-50"
                >
                  <Icon name="devices" size={15} /> قطع دستگاه دیگر و ورود با این پنجره
                </button>
              </div>
            )}

            <div className="flex w-full max-w-sm flex-col gap-2.5 sm:flex-row lg:max-w-none">
              <button
                onClick={() => void voice.join({ micEnabled: joinWithMic && canSpeak && micReady === "ready" })}
                disabled={connecting}
                className="grad-accent press flex flex-1 items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-on-accent shadow-lg transition hover:brightness-110 disabled:opacity-60"
              >
                {connecting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-accent/40 border-t-on-accent" /> : <Icon name="phone" size={18} />}
                {connecting ? "در حال پیوستن…" : "ورود به تماس"}
              </button>
              <button onClick={onClose} disabled={connecting} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-6 py-3 text-sm font-bold text-fg transition hover:bg-surface-3 disabled:opacity-60">
                بازگشت به گفتگو
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  /* ───────────────────────── Minimized Floating Window ───────────────────────── */
  if (minimized) {
    const miniStream = stage?.kind === "screen" ? stage.stream : voice.sharing ? voice.localScreen : null;
    return (
      <DraggablePiP
        storageKey="inebuly-voice-pip"
        defaultCorner="bottom-left"
        className="flex w-[min(22rem,calc(100vw-1.75rem))] flex-col overflow-hidden rounded-2xl border border-accent/45 bg-surface/92 text-fg shadow-[0_22px_55px_rgba(0,0,0,.45)] backdrop-blur-2xl"
      >
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

        {miniStream && (
          <div onClick={() => setMinimized(false)} className="relative h-36 w-full cursor-pointer overflow-hidden border-b border-line bg-black">
            <StageVideo stream={miniStream} name={stage?.who?.displayName ?? "شما"} />
          </div>
        )}

        <div className="flex items-center gap-2 p-2.5">
          <div onClick={() => setMinimized(false)} className="min-w-0 flex-1 cursor-pointer select-none px-1">
            <p className="truncate text-xs font-black text-fg">{detail.name}</p>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold text-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span>{faNum(voice.participants.length)} نفر در تماس</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void voice.toggleMic()}
            disabled={voice.restrictions.micMuted || !canSpeak}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs transition ${
              voice.micOn
                ? "border-emerald-500/45 bg-emerald-500/20 text-emerald-500"
                : "border-rose-500/45 bg-rose-500/20 text-rose-500"
            }`}
          >
            <Icon name={voice.micOn ? "mic" : "mic-off"} size={15} />
          </button>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            title="بزرگ‌نمایی تماس"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg hover:bg-surface-3"
          >
            <Icon name="maximize" size={15} />
          </button>
          <button
            type="button"
            onClick={() => void requestLeave()}
            title="قطع تماس"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-500/45 bg-rose-500/20 text-rose-500 hover:bg-rose-500/30"
          >
            <Icon name="phone-off" size={15} />
          </button>
        </div>

        {/* Hidden BotPlayers so music keeps playing while minimized */}
        <div className="hidden">
          {voice.tracks.map((tr) => (
            <BotPlayer key={tr.userId} track={tr} serverDelta={voice.serverTimeDelta} volume={(voice.prefs.master / 100) * ((voice.prefs.volumes[String(tr.userId)] ?? 100) / 100)} sinkId={voice.prefs.outputId} />
          ))}
        </div>
      </DraggablePiP>
    );
  }

  /* ───────────────────────── Active Call Room (Identical to Meet.jsx!) ───────────────────────── */
  return (
    <div ref={rootFsRef} className="anim-surface-in fixed inset-0 z-40 flex flex-col overflow-hidden bg-bg text-fg">
      {/* Header — Clean redesigned top-right with live connection status */}
      <header className="relative z-30 flex shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-3.5 py-2 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            <Elapsed since={joinedAt} />
          </span>
          {(() => {
            const cMeta = CONN_META[voice.myConnState] || CONN_META.connecting;
            return (
              <span
                title="وضعیت اتصال صوتی شما"
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold backdrop-blur-md ${cMeta.cls}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${cMeta.dot}`} />
                <span>{cMeta.label}</span>
              </span>
            );
          })()}
          <div className="hidden h-4 w-px bg-line/80 sm:block" />
          <div className="min-w-0 flex items-center gap-2">
            <p className="truncate text-sm font-black leading-5 text-fg">{detail.name}</p>
            <span className="shrink-0 rounded-md border border-line bg-surface-2/90 px-1.5 py-0.5 text-[10px] font-bold text-muted">
              {faNum(voice.participants.length)} نفر
            </span>
          </div>
        </div>

        {(activeScreenItems.length > 1 || (stageMinimized && activeScreenItems.length > 0)) && (
          <div className="ms-1 hidden items-center gap-1.5 md:flex">
            {activeScreenItems.map((item) => {
              const isCurrent = stage?.kind === "screen" && stage?.who.userId === item.userId;
              return (
                <button
                  key={item.userId}
                  onClick={() => {
                    setStageMinimized(false);
                    setStageTarget({ userId: item.userId, kind: "screen" });
                  }}
                  className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition ${
                    isCurrent ? "border-accent/45 bg-accent/18 text-accent shadow-sm" : "border-line bg-surface-2 text-muted hover:text-fg"
                  }`}
                >
                  <Icon name="screen" size={12} />
                  <span>صفحهٔ {item.userId === me.id ? "شما" : item.who.displayName}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
          {voice.tracks.length > 0 && (
            <button
              onClick={() => setTab("music")}
              className="press flex items-center gap-1.5 rounded-xl border border-accent/35 bg-accent/15 px-2.5 py-1.5 text-[11px] font-bold text-accent"
            >
              <Icon name="bot" size={13} /> <span className="hidden sm:inline">{faNum(voice.tracks.length)} ربات موسیقی</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
              setMinimized(true);
            }}
            aria-label="کوچک‌نمایی تماس"
            title="کوچک‌نمایی تماس و بازگشت به چت"
            className="press flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-2.5 text-[11px] font-bold text-fg transition hover:border-accent/50 hover:bg-surface-3"
          >
            <Icon name="pip" size={15} className="text-accent" />
            <span className="hidden sm:inline">کوچک‌نمایی</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleElementFullscreen(rootFsRef.current)}
            aria-label={roomFs ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
            className="press flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted transition hover:bg-surface-3 hover:text-fg"
          >
            <Icon name={roomFs ? "minimize" : "maximize"} size={15} />
          </button>
        </div>
      </header>

      {/* Active Music Bot Players */}
      {voice.tracks.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface/60 px-3.5 py-1.5">
          {voice.tracks.map((tr) => (
            <BotPlayer
              key={tr.userId}
              track={tr}
              serverDelta={voice.serverTimeDelta}
              volume={(voice.prefs.master / 100) * ((voice.prefs.volumes[String(tr.userId)] ?? 100) / 100)}
              sinkId={voice.prefs.outputId}
              canControl={tr.userId === me.id || isMod}
              onAction={(a) => void trackAction(a, tr.userId)}
            />
          ))}
        </div>
      )}

      {/* Main Stage + Adaptive 1/2/3 Grid + Resizable Side Panel */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className={`flex min-w-0 flex-1 gap-2.5 p-2.5 sm:p-3.5 ${stage && stripParticipants.length > 0 ? "flex-col lg:flex-row" : "flex-col"}`}>
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
                  ? { background: `radial-gradient(95% 95% at 50% 35%, ${stage.who.avatarColor || "#8b5cf6"}38 0%, var(--surface-2) 78%)` }
                  : undefined
              }
            >
              {stage.kind === "user" ? (
                <div className="flex flex-col items-center gap-3.5 px-4 text-center">
                  <div
                    className={`rounded-full p-1.5 transition ${
                      (stage.who.userId === me.id ? voice.micOn && voice.speaking : stage.who.micOn && !stage.who.micMuted)
                        ? "ring-4 ring-accent/65"
                        : ""
                    }`}
                  >
                    <Avatar
                      name={stage.who.displayName}
                      color={stage.who.avatarColor}
                      size={132}
                      userId={stage.who.userId}
                      avatarFileId={stage.who.avatarFileId}
                    />
                  </div>
                  <div>
                    <p className="text-lg font-black text-fg">{stage.who.displayName}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {stage.who.micMuted ? "میکروفون بسته" : stage.who.micOn ? "میکروفون روشن" : "میکروفون خاموش"} · کلیک برای بازگشت به نمای شبکه‌ای
                    </p>
                  </div>
                </div>
              ) : (
                <StageVideo stream={stage.stream} name={stage.who.displayName} />
              )}

              <div
                onClick={(e) => e.stopPropagation()}
                className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/75 via-black/30 to-transparent px-3 py-2.5"
              >
                <span className="flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
                  <Icon name={stage.kind === "user" ? "user" : "screen"} size={13} className="text-accent" />
                  {stage.kind === "user"
                    ? `بزرگ‌نمایی ${stage.who.userId === me.id ? "شما" : stage.who.displayName}`
                    : `صفحهٔ ${stage.who.userId === me.id ? "شما" : stage.who.displayName} · ${stage.who.shareQuality ?? "720p"}`}
                </span>
                <span className="pointer-events-auto flex items-center gap-1.5">
                  {stage.kind === "screen" && (
                    <button
                      type="button"
                      onClick={() => void toggleElementFullscreen(streamFsRef.current)}
                      className="flex items-center gap-1 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur hover:bg-black/85"
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
                  >
                    نمای شبکه‌ای
                  </button>
                  {stage.kind === "screen" && stage.who.userId === me.id && (
                    <button onClick={() => void voice.stopShare()} className="rounded-lg bg-rose-500/85 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur hover:bg-rose-500">
                      توقف اشتراک من
                    </button>
                  )}
                </span>
              </div>
            </div>
          )}

          {stageMinimized && activeScreenItems.length > 0 && !stage && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {activeScreenItems.map((item) => (
                <button
                  key={item.userId}
                  onClick={() => { setStageMinimized(false); setStageTarget({ userId: item.userId, kind: "screen" }); }}
                  className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/15 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/25"
                >
                  <Icon name="screen" size={13} /> بازگشت به اشتراک صفحهٔ {item.userId === me.id ? "شما" : item.who.displayName}
                </button>
              ))}
            </div>
          )}

          {(!stage || stripParticipants.length > 0) && (
            <div
              className={
                stage
                  ? "scroll-thin flex shrink-0 gap-2.5 overflow-x-auto lg:w-64 xl:w-72 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto"
                  : `scroll-thin grid min-h-0 flex-1 gap-2.5 sm:gap-3 overflow-y-auto auto-rows-fr ${adaptiveGridClass(voice.participants.length)}`
              }
            >
              {(stage ? stripParticipants : voice.participants).map((p) => {
                const mine = p.userId === me.id;
                const speaking = mine ? voice.micOn && voice.speaking : p.micOn && !p.micMuted;
                const isPinnedThis = stage?.who.userId === p.userId;

                return (
                  <div
                    key={p.userId}
                    tabIndex={0}
                    onClick={() => {
                      setStageMinimized(false);
                      if (isPinnedThis && stage?.kind !== "screen") setStageTarget(null);
                      else setStageTarget({ userId: p.userId, kind: "user" });
                    }}
                    onContextMenu={(e) => open(e, personMenu(p))}
                    title="کلیک برای بزرگ‌نمایی در صحنهٔ اصلی"
                    className={`group anim-rise relative flex cursor-pointer items-center justify-center overflow-hidden rounded-2xl border transition-all duration-200 hover:border-accent/45 ${
                      stage
                        ? "h-32 w-48 shrink-0 lg:h-40 lg:w-full"
                        : voice.participants.length <= 1
                          ? "min-h-[260px]"
                          : "min-h-[165px]"
                    } ${
                      speaking ? "border-accent ring-2 ring-accent/70" : isPinnedThis ? "border-accent/55" : "border-line"
                    }`}
                    style={{ background: `radial-gradient(120% 120% at 30% 20%, ${p.avatarColor || "#8b5cf6"}28 0%, var(--surface-2) 74%)` }}
                  >
                    <div className="pointer-events-none flex flex-col items-center gap-2 px-2 text-center">
                      <Avatar
                        name={p.displayName}
                        color={p.avatarColor}
                        size={stage ? 52 : voice.participants.length <= 2 ? 96 : voice.participants.length <= 4 ? 76 : 60}
                        userId={p.userId}
                        avatarFileId={p.avatarFileId}
                      />
                      {!stage && <p className="max-w-full truncate text-sm font-bold text-fg/90">{p.displayName}</p>}
                    </div>

                    <div className="absolute start-2 top-2 flex flex-wrap items-center gap-1">
                      {(() => {
                        const effectiveState = mine ? voice.myConnState : (p.connState || "connecting");
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
                            setStageTarget({ userId: p.userId, kind: "screen" });
                          }}
                          className="flex items-center gap-1 rounded-md border border-accent/50 bg-accent/25 px-1.5 py-0.5 text-[10px] font-bold text-accent backdrop-blur-md"
                        >
                          <Icon name="screen" size={10} /> اشتراک صفحه
                        </button>
                      )}
                    </div>

                    <div className="absolute end-2 top-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStageMinimized(false);
                          setStageTarget(isPinnedThis ? null : { userId: p.userId, kind: "user" });
                        }}
                        title="نمایش در صحنهٔ اصلی"
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white/80 opacity-0 backdrop-blur transition hover:bg-black/75 hover:text-white group-hover:opacity-100"
                      >
                        <Icon name="maximize" size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); open(e, personMenu(p)); }}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white/80 backdrop-blur transition hover:bg-black/75 hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Icon name="more-vertical" size={14} />
                      </button>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pb-2 pt-7">
                      <span className="flex min-w-0 items-center gap-1 rounded bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                        {mine && <span className="text-white/60">(شما)</span>}
                        <span className="truncate">{p.displayName}</span>
                      </span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-md ${
                          p.micMuted
                            ? "border border-rose-400/40 bg-rose-500/25 text-rose-300 backdrop-blur"
                            : p.micOn
                              ? "border border-emerald-400/40 bg-emerald-500/25 text-emerald-300 backdrop-blur"
                              : "bg-black/55 text-white/65 backdrop-blur"
                        }`}
                      >
                        <Icon name={p.micOn && !p.micMuted ? "mic" : "mic-off"} size={12} />
                      </span>
                    </div>

                    {mine && voice.micOn && (
                      <div className="absolute bottom-9 start-2.5 h-1 w-16 overflow-hidden rounded-full bg-black/30">
                        <LevelBar active />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* Resizable Side Panel (People / Music Bot) */}
        {tab && (
          <aside
            style={{ "--meet-side-w": `${sideWidth}px` }}
            className="anim-slide-panel fixed inset-0 z-30 flex flex-col bg-surface sm:relative sm:inset-auto sm:w-[var(--meet-side-w)] sm:shrink-0 sm:border-s sm:border-line"
          >
            <div
              onMouseDown={startSideResize}
              title="تغییر اندازهٔ پنل کناری"
              className={`group/resize absolute inset-y-0 -start-1 z-20 hidden w-2.5 cursor-col-resize items-center justify-center sm:flex ${
                resizingSide ? "bg-accent/25" : "hover:bg-accent/15"
              }`}
            >
              <span className={`h-10 w-0.5 rounded-full transition ${resizingSide ? "bg-accent" : "bg-transparent group-hover/resize:bg-accent/60"}`} />
            </div>

            <div className="flex shrink-0 items-center gap-2 border-b border-line p-2.5">
              <p className="flex-1 px-1.5 text-sm font-bold">
                {tab === "music"
                  ? "ربات پخش موسیقی"
                  : tab === "audio"
                    ? "تنظیمات صدا و نویزگیر"
                    : `افراد در تماس (${faNum(voice.participants.length)})`}
              </p>
              <button onClick={() => setTab(null)} aria-label="بستن" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
                <Icon name="close" size={16} />
              </button>
            </div>

            {tab === "audio" && (
              <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
                <AudioSettingsSection
                  compact
                  showAppSounds={false}
                  externalCall={{
                    prefs: voice.prefs,
                    devices: voice.devices,
                    micActive: voice.micOn && !voice.restrictions.micMuted,
                    updateAudioPrefs: voice.updateAudioPrefs,
                    changeInput: voice.changeInput,
                    changeOutput: voice.changeOutput,
                    setMicGain: voice.setMicGain,
                    setMaster: voice.setMaster,
                  }}
                />
              </div>
            )}

            {tab === "people" && (
              <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
                {voice.participants.map((p) => {
                  const mine = p.userId === me.id;
                  const vol = voice.prefs.volumes[String(p.userId)] ?? 100;
                  return (
                    <div key={p.userId} onContextMenu={(e) => open(e, personMenu(p))} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-2.5">
                      <Avatar name={p.displayName} color={p.avatarColor} size={36} userId={p.userId} avatarFileId={p.avatarFileId} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-xs font-bold">
                            {p.displayName}
                            {mine && <span className="text-[10px] font-normal text-muted"> (شما)</span>}
                          </p>
                          {(() => {
                            const effectiveState = mine ? voice.myConnState : (p.connState || "connecting");
                            const cm = CONN_META[effectiveState] || CONN_META.connecting;
                            return (
                              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold ${cm.cls}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${cm.dot}`} />
                                {cm.short}
                              </span>
                            );
                          })()}
                        </div>
                        {!mine && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <button onClick={() => voice.setVolume(p.userId, vol === 0 ? 100 : 0)} className="text-muted hover:text-fg">
                              <Icon name={vol === 0 ? "volume-off" : "volume"} size={13} />
                            </button>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={vol}
                              onChange={(e) => voice.setVolume(p.userId, Number(e.target.value))}
                              className="h-1 min-w-0 flex-1 accent-[var(--accent)]"
                            />
                          </div>
                        )}
                      </div>
                      <button onClick={(e) => open(e, personMenu(p))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-fg">
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
                      <input type="range" min={0} max={200} value={voice.prefs.micGain} onChange={(e) => voice.setMicGain(Number(e.target.value))} className="h-1 min-w-0 flex-1 accent-[var(--accent)]" />
                      <span className="w-10 text-left tabular-nums text-muted">{faNum(voice.prefs.micGain)}٪</span>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 font-bold text-fg/80">صدای دریافتی کلی</p>
                    <div className="flex items-center gap-2">
                      <Icon name="volume" size={14} className="shrink-0 text-muted" />
                      <input type="range" min={0} max={100} value={voice.prefs.master} onChange={(e) => voice.setMaster(Number(e.target.value))} className="h-1 flex-1 accent-[var(--accent)]" />
                      <span className="w-10 text-left tabular-nums text-muted">{faNum(voice.prefs.master)}٪</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === "music" && (
              <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5 text-xs">
                <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2 p-1">
                  <button
                    type="button"
                    onClick={() => setSource("link")}
                    className={`rounded-lg py-1.5 font-bold transition ${source === "link" ? "border border-accent/40 bg-accent/15 text-accent" : "text-muted hover:text-fg"}`}
                  >
                    لینک مستقیم
                  </button>
                  <button
                    type="button"
                    onClick={() => setSource("file")}
                    className={`rounded-lg py-1.5 font-bold transition ${source === "file" ? "border border-accent/40 bg-accent/15 text-accent" : "text-muted hover:text-fg"}`}
                  >
                    آپلود فایل صوتی
                  </button>
                </div>

                <Input placeholder="عنوان آهنگ (اختیاری)" value={title} onChange={(e) => setTitle(e.target.value)} />

                {source === "link" ? (
                  <Input dir="ltr" placeholder="https://.../music.mp3" value={url} onChange={(e) => setUrl(e.target.value)} />
                ) : (
                  <input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} className="w-full rounded-xl border border-line bg-surface-2 p-2 text-xs" />
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !canPlay}
                    onClick={() => void submitTrack()}
                    className="press flex-1 rounded-xl border border-accent/45 bg-accent/20 py-2.5 font-black text-accent transition hover:bg-accent/30 disabled:opacity-45"
                  >
                    {busy ? "در حال ارسال…" : "پخش در تماس"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !canPlay}
                    onClick={() => void playDemo()}
                    className="press rounded-xl border border-line bg-surface-2 px-3 py-2.5 font-bold text-muted hover:text-fg disabled:opacity-45"
                  >
                    تست نمونه
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Studio Dock Control Bar — matches Meet.jsx */}
      {voice.shareError && (
        <p role="alert" className="shrink-0 bg-amber-400/10 px-4 py-1.5 text-center text-xs text-amber-400">{voice.shareError}</p>
      )}
      <footer className="flex shrink-0 items-center justify-center px-2.5 pb-2.5 pt-1.5 sm:px-4 sm:pb-3">
        <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-3xl border border-line bg-surface/90 px-2.5 py-2 shadow-[0_14px_40px_rgba(0,0,0,.45)] backdrop-blur-xl sm:gap-2 sm:px-3.5">
          <Ctrl
            label={voice.micOn ? "خاموش کردن میکروفون" : "روشن کردن میکروفون"}
            tone={voice.micOn ? "on" : "off"}
            disabled={voice.restrictions.micMuted || !canSpeak}
            onClick={() => void voice.toggleMic()}
          >
            <Icon name={voice.micOn ? "mic" : "mic-off"} size={19} />
          </Ctrl>

          <div className="relative" ref={shareRef}>
            <Ctrl
              label="اشتراک صفحهٔ نمایش"
              tone={voice.sharing ? "accent" : "idle"}
              disabled={!canShare}
              onClick={() => setShareMenu((v) => !v)}
              badge={voice.sharing ? voice.shareQuality : null}
            >
              <Icon name="screen" size={19} />
            </Ctrl>
            <SharePopover
              open={shareMenu}
              quality={voice.shareQuality}
              onPick={(q) => void voice.startShare(q)}
              onClose={() => setShareMenu(false)}
              active={voice.sharing}
              onStop={() => void voice.stopShare()}
            />
          </div>

          <div className="mx-0.5 h-7 w-px bg-line" />

          <Ctrl
            label="تنظیمات صدا و نویزگیر"
            tone={tab === "audio" ? "warn" : "idle"}
            onClick={() => setTab((t) => (t === "audio" ? null : "audio"))}
            badge={voice.prefs.vadEnabled ? `${faNum(voice.prefs.vadThreshold)}٪` : null}
          >
            <Icon name="sliders" size={19} />
          </Ctrl>

          {canPlay && (
            <Ctrl
              label="ربات پخش موسیقی"
              tone={tab === "music" ? "warn" : "idle"}
              onClick={() => setTab((t) => (t === "music" ? null : "music"))}
            >
              <Icon name="bot" size={19} />
            </Ctrl>
          )}

          <Ctrl
            label="افراد در تماس"
            tone={tab === "people" ? "warn" : "idle"}
            onClick={() => setTab((t) => (t === "people" ? null : "people"))}
            badge={faNum(voice.participants.length)}
          >
            <Icon name="users" size={19} />
          </Ctrl>

          <div className="mx-0.5 h-7 w-px bg-line" />

          <button
            type="button"
            onClick={() => void requestLeave()}
            aria-label="قطع تماس"
            className="press flex h-11 items-center gap-1.5 rounded-2xl border border-rose-400/45 bg-rose-500/20 px-4 text-xs font-black text-rose-200 shadow-[0_6px_22px_rgba(244,63,94,.22)] backdrop-blur-xl transition hover:border-rose-400 hover:bg-rose-500/32"
          >
            <Icon name="phone-off" size={18} /> <span>قطع تماس</span>
          </button>
        </div>
      </footer>

      <ContextMenu state={menu} onClose={close} />
    </div>
  );
}
