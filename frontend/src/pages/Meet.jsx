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

const RESOLUTIONS = [
  { id: "480p", label: "۴۸۰p", hint: "سبک — اینترنت ضعیف" },
  { id: "720p", label: "۷۲۰p", hint: "تعادل کیفیت و سرعت" },
  { id: "1080p", label: "۱۰۸۰p", hint: "بالاترین کیفیت" },
];
const FPS_OPTIONS = [30, 60];

/** Clean, predictable responsive grid class by headcount when no stage is pinned/shared. */
function adaptiveGridClass(count) {
  if (count <= 1) return "grid-cols-1 max-w-4xl mx-auto w-full";
  if (count === 2) return "grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto w-full";
  if (count <= 4) return "grid-cols-1 sm:grid-cols-2 max-w-6xl mx-auto w-full";
  if (count <= 6) return "grid-cols-2 lg:grid-cols-3 w-full";
  if (count <= 9) return "grid-cols-2 md:grid-cols-3 w-full";
  return "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 w-full";
}

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

function Ctrl({ label, onClick, children, tone = "idle", disabled, title, onContextMenu }) {
  const look = {
    idle: "bg-surface-2 text-fg hover:bg-surface-3 border-line",
    on: "bg-emerald-500 text-[#0b2b1d] hover:bg-emerald-400 border-emerald-400/40",
    off: "bg-[#ea4335] text-white hover:bg-[#ea4335]/90 border-rose-400/40",
    warn: "bg-amber-400 text-[#3a2700] hover:bg-amber-300 border-amber-300/50",
  }[tone];
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className={`relative flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40 ${look}`}
    >
      {children}
    </button>
  );
}

/**
 * Resolution + frame-rate picker. Anchored ABOVE its button; while active it also lets the user stop or switch settings.
 */
function MediaPopover({ open, title, quality, fps, onPick, onClose, active, onStop, stopLabel, icon, startLabel }) {
  const [selQuality, setSelQuality] = useState(quality);
  const [selFps, setSelFps] = useState(fps);
  useEffect(() => {
    if (open) {
      setSelQuality(quality);
      setSelFps(fps);
    }
  }, [open, quality, fps]);
  if (!open) return null;
  return (
    <div className="anim-rise absolute bottom-[calc(100%+10px)] left-1/2 z-30 w-[min(16rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl bg-surface-2 p-2.5 shadow-2xl ring-1 ring-line">
      <p className="px-1 pb-2 text-[11px] font-bold text-muted">{title}</p>
      <div className="mb-2 grid grid-cols-3 gap-1.5">
        {RESOLUTIONS.map((q) => (
          <button
            key={q.id}
            onClick={() => setSelQuality(q.id)}
            aria-pressed={selQuality === q.id}
            className={`rounded-lg px-2 py-2 text-center text-xs font-bold transition ${selQuality === q.id ? "bg-accent text-on-accent" : "bg-surface-3 text-fg/75 hover:bg-surface-2 hover:text-fg"}`}
          >
            {q.label}
            <span className="mt-0.5 block text-[9px] font-normal opacity-70">{q.hint}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {FPS_OPTIONS.map((f) => (
          <button
            key={f}
            onClick={() => setSelFps(f)}
            aria-pressed={selFps === f}
            className={`rounded-lg px-2 py-2 text-center text-xs font-bold transition ${selFps === f ? "bg-accent text-on-accent" : "bg-surface-3 text-fg/75 hover:bg-surface-2 hover:text-fg"}`}
          >
            {faNum(f)} فریم بر ثانیه
          </button>
        ))}
      </div>
      <button
        onClick={() => { onPick(selQuality, selFps); onClose(); }}
        className="grad-accent press mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-black text-on-accent"
      >
        <Icon name={icon} size={14} /> {active ? "اعمال تنظیمات" : startLabel}
      </button>
      {active && (
        <button
          onClick={() => { onClose(); onStop(); }}
          className="press mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500/90 py-2 text-xs font-bold text-white transition hover:bg-rose-500"
        >
          <Icon name="close" size={14} /> {stopLabel}
        </button>
      )}
      <button onClick={onClose} className="mt-1 w-full rounded-lg py-1.5 text-[11px] text-muted hover:text-fg">بستن</button>
    </div>
  );
}

/**
 * /meet/:token — Stand-alone meeting supporting simultaneous camera + screen share,
 * switchable stage focus, PiP presenter camera overlay, and adaptive participant grid.
 */
export default function Meet({ token }) {
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
  const linkRef = useRef(null);
  const inviteRef = useRef(null);
  const cameraRef = useRef(null);
  const shareRef = useRef(null);

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
    if (meeting.phase !== "idle" || notFound) return;
    let cancelled = false;
    setMicPreview("checking");
    void meeting.previewMic().then((ok) => {
      if (!cancelled) setMicPreview(ok ? "ready" : "blocked");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.phase, notFound]);

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
  // 1) An explicitly pinned stageTarget (screen or camera) if still valid
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

  // Every visible participant stays in the participant strip/grid!
  // That way even when someone shares their screen, their camera/avatar tile ALSO remains visible simultaneously.
  const visibleParticipants = useMemo(
    () => inCall.filter((p) => !hidden.has(p.joinToken)),
    [hidden, inCall],
  );

  // Presenter's simultaneous camera stream for PiP badge inside the screen-share stage
  const presenterPiPCamera = useMemo(() => {
    if (!stage || stage.kind !== "screen") return null;
    const s = getParticipantStreams(stage.who);
    return s.camera || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, meeting.localCamera, meeting.streams]);

  async function enter(forceTakeover = false) {
    const res = await meeting.join(name.trim(), { forceTakeover, silentConflict: true });
    if (res?.ok) {
      if (joinWithMic && micPreview === "ready") window.setTimeout(() => void meeting.toggleMic(), 700);
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
      toast("جلسه پایان یافت", "success");
      navigate("/");
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
    navigate("/");
  }

  function personMenu(p) {
    const mine = p.joinToken === meeting.joinToken;
    const vol = meeting.prefs.volumes[p.joinToken] ?? 100;
    const s = getParticipantStreams(p);
    const items = [{ label: `${p.name}${p.isHost ? " · میزبان" : ""}${p.isGuest ? " · مهمان" : ""}`, type: "label" }];

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

  if (notFound) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-bg p-6 text-center text-fg">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-2 text-rose-400"><Icon name="ban" size={28} /></span>
        <h1 className="text-xl font-black">جلسه در دسترس نیست</h1>
        <p className="max-w-sm text-sm leading-7 text-muted">{notFound}</p>
        <button onClick={() => navigate(me ? "/" : "/login")} className="rounded-lg bg-surface-2 px-5 py-2.5 text-sm font-bold text-fg hover:bg-surface-3">بازگشت</button>
      </div>
    );
  }

  /* ── pre-join / lobby ── */
  if (meeting.phase !== "joined") {
    const waiting = meeting.phase === "lobby";
    return (
      <div className="anim-surface-in flex min-h-[100dvh] flex-col overflow-y-auto bg-bg text-fg">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon name="radio" size={18} /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{info?.title ?? "جلسه"}</p>
            <p className="truncate text-[11px] text-muted" dir="ltr">inebuly · /meet/{token}</p>
          </div>
          <button onClick={() => navigate(me ? "/" : "/login")} aria-label="بازگشت" className="ms-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><Icon name="close" size={17} /></button>
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
              <div className="grid gap-3 border-t border-line bg-bg/70 p-4 text-xs backdrop-blur sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-bold text-muted">میکروفون</span>
                  <select
                    value={meeting.prefs.inputId}
                    onChange={(e) => void meeting.changeInput(e.target.value).then(() => meeting.previewMic().then((ok) => setMicPreview(ok ? "ready" : "blocked")))}
                    className="w-full rounded-lg bg-surface-2 px-3 py-2 text-fg outline-none ring-1 ring-line"
                  >
                    <option value="">پیش‌فرض سیستم</option>
                    {meeting.devices.filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default").map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `میکروفون ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-bold text-muted">بلندگو</span>
                  <select
                    value={meeting.prefs.outputId}
                    onChange={(e) => void meeting.changeOutput(e.target.value)}
                    className="w-full rounded-lg bg-surface-2 px-3 py-2 text-fg outline-none ring-1 ring-line"
                  >
                    <option value="">پیش‌فرض سیستم</option>
                    {meeting.devices.filter((d) => d.kind === "audiooutput" && d.deviceId && d.deviceId !== "default").map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `خروجی ${i + 1}`}</option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block font-bold text-muted">بلندی صدای میکروفون من</span>
                  <div className="flex items-center gap-3">
                    <Icon name="mic" size={14} className="shrink-0 text-muted" />
                    <input type="range" min={0} max={200} value={meeting.prefs.micGain} onChange={(e) => meeting.setMicGain(Number(e.target.value))} aria-label="بلندی میکروفون من" className="h-1.5 min-w-0 flex-1 accent-[var(--accent)]" />
                    <span className="w-12 text-left tabular-nums text-muted">{faNum(meeting.prefs.micGain)}٪</span>
                  </div>
                </label>
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
                      className="w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-muted/70 focus:border-accent"
                    />
                  </label>
                )}
                <div className="flex w-full max-w-sm flex-col gap-2.5 sm:flex-row lg:max-w-none">
                  <button
                    onClick={() => void enter()}
                    disabled={meeting.phase === "connecting"}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-bold text-on-accent shadow-lg transition hover:brightness-110 disabled:opacity-60"
                  >
                    {meeting.phase === "connecting" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-accent/40 border-t-on-accent" /> : <Icon name="phone" size={18} />}
                    {meeting.phase === "connecting" ? "در حال ورود…" : "پیوستن به جلسه"}
                  </button>
                  <button onClick={() => navigate(me ? "/" : "/login")} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-6 py-3 text-sm font-bold text-fg hover:bg-surface-3">
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
    <div className="anim-surface-in fixed inset-0 z-40 flex flex-col overflow-hidden bg-bg text-fg">
      {/* Header */}
      <header className="relative z-30 flex shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-2 sm:px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon name="radio" size={18} /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-5">{info?.title ?? "جلسه"}</p>
          <p className="truncate text-[10px] text-muted" dir="ltr">inebuly · <Elapsed since={joinedAt} /></p>
        </div>

        {/* Active shares switcher bar when multiple shares exist or stage was minimized */}
        {(activeScreenItems.length > 1 || (stageMinimized && activeScreenItems.length > 0)) && (
          <div className="hidden items-center gap-1.5 md:flex ms-3">
            {activeScreenItems.map((item) => {
              const isCurrent = stage?.kind === "screen" && stage?.who.joinToken === item.token;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    setStageMinimized(false);
                    setStageTarget({ token: item.token, kind: "screen" });
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${isCurrent ? "bg-accent text-on-accent" : "bg-surface-2 text-muted hover:text-fg"}`}
                >
                  <Icon name="screen" size={12} />
                  <span>صفحهٔ {item.token === meeting.joinToken ? "شما" : item.who.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="ms-auto flex items-center gap-2">
          {meeting.amHost && lobby.length > 0 && (
            <button onClick={() => setPanel("people")} className="flex items-center gap-1.5 rounded-lg bg-amber-400/15 px-2.5 py-1.5 text-[11px] font-bold text-amber-400">
              <Icon name="clock" size={13} /> {faNum(lobby.length)} در انتظار
            </button>
          )}
          {meeting.game && (
            <button onClick={() => setPanel("games")} className="flex items-center gap-1.5 rounded-lg bg-accent/20 px-2.5 py-1.5 text-[11px] font-bold text-accent">
              <Icon name="gamepad" size={13} /> {meeting.game.label}
            </button>
          )}
          <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted">{faNum(inCall.length)} نفر</span>

          <div className="relative" ref={linkRef}>
            <button
              onClick={() => { setLinkOpen((v) => !v); setInviteOpen(false); }}
              aria-label="لینک جلسه"
              aria-expanded={linkOpen}
              title="لینک جلسه"
              className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition ${linkOpen ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
            >
              <Icon name="link" size={15} /> <span className="hidden sm:inline">لینک</span>
            </button>
            {linkOpen && (
              <div className="anim-rise absolute end-0 top-11 z-30 w-[min(88vw,23rem)] rounded-xl bg-surface-2 p-3 shadow-2xl ring-1 ring-line">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-fg/85"><Icon name="link" size={14} className="text-accent" /> لینک ورود به جلسه</p>
                <input readOnly dir="ltr" value={meetingLink} onFocus={(e) => e.currentTarget.select()} aria-label="لینک جلسه" className="w-full rounded-lg bg-surface px-3 py-2 font-mono text-[11px] text-fg/85 outline-none ring-1 ring-line" />
                <p className="mt-2 text-[10px] leading-5 text-muted">هر فردی با این لینک می‌تواند وارد شود{info?.lobby ? " و در لابی منتظر تأیید میزبان بماند" : ""}.</p>
                <div className="mt-2.5 flex gap-2">
                  <button onClick={() => void copyLink()} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-on-accent hover:brightness-110"><Icon name="copy" size={14} /> کپی لینک</button>
                  <button onClick={() => window.open(meetingLink, "_blank", "noopener")} className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-fg/75 ring-1 ring-line hover:bg-surface-3"><Icon name="globe" size={14} /> تب جدید</button>
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
                title="دعوت از دوستان"
                className={`press flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold shadow-sm transition ${
                  inviteOpen
                    ? "grad-accent text-on-accent ring-2 ring-accent/40"
                    : "border border-accent/50 bg-accent/20 text-fg hover:bg-accent hover:text-on-accent"
                }`}
              >
                <Icon name="user-plus" size={15} /> <span className="hidden sm:inline">دعوت دوستان</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {inviteOpen && typeof document !== "undefined" && createPortal(
        <div
          dir="rtl"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onMouseDown={() => setInviteOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-line bg-surface text-fg shadow-[0_28px_70px_rgba(0,0,0,.85)]"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="دعوت از دوستان"
          >
            <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-3.5">
              <span className="grad-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-on-accent shadow-sm">
                <Icon name="user-plus" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-fg">دعوت از دوستان</p>
                <p className="truncate text-xs text-muted">کارت دعوت مستقیم به گفتگوی خصوصی دوستتان ارسال می‌شود</p>
              </div>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                aria-label="بستن"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 text-fg hover:bg-rose-500/20 hover:text-rose-400"
              >
                <Icon name="close" size={15} />
              </button>
            </div>

            <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto bg-surface p-3">
              {friendsLoading ? (
                <p className="p-8 text-center text-xs font-bold text-fg">در حال بارگذاری فهرست دوستان…</p>
              ) : friends.length === 0 ? (
                <div className="rounded-lg border border-line bg-surface-2 p-6 text-center">
                  <p className="text-sm font-black text-fg">دوست آماده‌ای برای دعوت نیست</p>
                  <p className="mt-1.5 text-xs leading-6 text-muted">
                    همهٔ دوستان شما هم‌اکنون در جلسه حضور دارند یا هنوز دوستی اضافه نکرده‌اید. می‌توانید لینک جلسه را مستقیماً بفرستید.
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
                      className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-right transition ${
                        on
                          ? "border-accent bg-surface-3 ring-1 ring-accent"
                          : "border-line bg-surface-2 hover:border-accent/50 hover:bg-surface-3"
                      }`}
                    >
                      <Avatar name={f.displayName} color={f.avatarColor} size={40} userId={f.id} avatarFileId={f.avatarFileId} status={f.status} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-fg">{f.displayName}</span>
                        <span className="block truncate text-xs font-semibold text-accent" dir="ltr">@{f.username}</span>
                      </span>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
                          on ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-muted"
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
              <p className="border-t border-line bg-surface-2 px-4 py-2 text-xs font-bold text-emerald-400">
                دعوت‌نامه ارسال شد به: {invitedNames.join("، ")}
              </p>
            )}

            <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-4 py-3">
              <span className="flex-1 text-xs font-bold text-fg">
                {picked.length ? `${faNum(picked.length)} نفر انتخاب شده` : "یک یا چند دوست را انتخاب کنید"}
              </span>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="rounded-lg border border-line bg-surface-3 px-3.5 py-2 text-xs font-bold text-fg hover:bg-surface"
              >
                بستن
              </button>
              <button
                type="button"
                onClick={() => void sendInvites()}
                disabled={!picked.length || inviting}
                className="grad-accent press flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-black text-on-accent shadow-md transition hover:brightness-110 disabled:opacity-45"
              >
                <Icon name="send" size={14} className="-scale-x-100" />
                {inviting ? "در حال ارسال…" : "ارسال دعوت"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Main workspace: Stage + Participant Grid/Sidebar + Optional Side Panel */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className={`flex min-w-0 flex-1 gap-2.5 p-2.5 sm:p-3.5 ${stage ? "flex-col lg:flex-row" : "flex-col"}`}>
          {/* Stage: Shared Screen or Pinned Camera */}
          {stage && (
            <div className="relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-line bg-[#090b10] shadow-xl">
              <Stage
                stream={stage.stream}
                name={stage.who.name}
                kind={stage.kind}
                mirrored={stage.kind === "camera" && stage.who.joinToken === meeting.joinToken}
              />

              {/* Top overlay controls on stage */}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/75 via-black/30 to-transparent px-3 py-2.5">
                <span className="flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
                  <Icon name={stage.kind === "camera" ? "video" : "screen"} size={13} className="text-accent" />
                  {stage.kind === "camera"
                    ? `کمرای ${stage.who.joinToken === meeting.joinToken ? "شما" : stage.who.name} · ${stage.who.cameraQuality ?? "720p"}`
                    : `صفحهٔ ${stage.who.joinToken === meeting.joinToken ? "شما" : stage.who.name} · ${stage.who.shareQuality ?? "720p"} · ${faNum(stage.who.shareFps ?? 30)} فریم`}
                </span>
                <span className="pointer-events-auto flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setStageTarget(null);
                      if (stage.kind === "screen") setStageMinimized(true);
                    }}
                    className="rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white/85 backdrop-blur hover:bg-black/80"
                    title="نمای شبکه‌ای افراد"
                  >
                    نمای شبکه‌ای
                  </button>
                  {stage.kind === "screen" && stage.who.joinToken === meeting.joinToken && (
                    <button onClick={() => void meeting.stopShare()} className="rounded-md bg-rose-500/85 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur hover:bg-rose-500">
                      توقف اشتراک من
                    </button>
                  )}
                  {stage.kind === "screen" && stage.who.joinToken !== meeting.joinToken && meeting.amHost && !stage.who.isHost && (
                    <button onClick={() => void meeting.hostAction("block-share", stage.who.joinToken)} className="rounded-md bg-rose-500/80 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur hover:bg-rose-500">
                      بستن اشتراک
                    </button>
                  )}
                </span>
              </div>

              {/* Simultaneous Presenter Camera PiP inside screen share stage */}
              {stage.kind === "screen" && presenterPiPCamera && (
                <button
                  type="button"
                  onClick={() => setStageTarget({ token: stage.who.joinToken, kind: "camera" })}
                  title="بزرگ‌نمایی کمرای ارائه‌دهنده"
                  className="group absolute bottom-3 end-3 h-24 w-36 sm:h-28 sm:w-44 overflow-hidden rounded-lg border border-white/20 bg-black shadow-2xl transition hover:scale-[1.03]"
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
                  className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/20"
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

          {/* Adaptive Participant Strip (when stage active) or Responsive Grid (when no stage) */}
          <div
            className={
              stage
                ? "scroll-thin flex shrink-0 gap-2.5 overflow-x-auto lg:w-64 xl:w-72 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto"
                : `scroll-thin grid min-h-0 flex-1 gap-2.5 sm:gap-3 overflow-y-auto auto-rows-fr ${adaptiveGridClass(visibleParticipants.length)}`
            }
          >
            {visibleParticipants.map((p) => {
              const mine = p.joinToken === meeting.joinToken;
              const speaking = mine ? meeting.micOn && meeting.speaking : p.micOn && !p.micMuted;
              const pStreams = getParticipantStreams(p);
              const cameraStream = pStreams.camera;
              const screenStream = pStreams.screen;
              const isPinnedCam = stage?.kind === "camera" && stage?.who.joinToken === p.joinToken;
              const isPinnedScreen = stage?.kind === "screen" && stage?.who.joinToken === p.joinToken;

              return (
                <div
                  key={p.joinToken}
                  tabIndex={0}
                  aria-label={p.name}
                  onDoubleClick={() => {
                    if (cameraStream) {
                      setStageMinimized(false);
                      setStageTarget(isPinnedCam ? null : { token: p.joinToken, kind: "camera" });
                    } else if (screenStream) {
                      setStageMinimized(false);
                      setStageTarget({ token: p.joinToken, kind: "screen" });
                    }
                  }}
                  onContextMenu={(e) => open(e, personMenu(p))}
                  className={`group anim-rise relative flex items-center justify-center overflow-hidden rounded-xl border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                    stage
                      ? "h-32 w-48 shrink-0 lg:h-40 lg:w-full"
                      : visibleParticipants.length === 1
                        ? "min-h-[260px]"
                        : "min-h-[165px]"
                  } ${
                    speaking
                      ? "border-accent ring-2 ring-accent/70"
                      : isPinnedCam || isPinnedScreen
                        ? "border-accent/50"
                        : "border-line"
                  }`}
                  style={{ background: `radial-gradient(120% 120% at 30% 20%, ${p.avatarColor}26 0%, var(--surface-2) 74%)` }}
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
                      />
                      {!stage && <p className="max-w-full truncate text-sm font-bold text-fg/90">{p.name}</p>}
                    </div>
                  )}

                  {/* Quick action buttons on top-end */}
                  <div className="absolute end-2 top-2 flex items-center gap-1">
                    {(cameraStream || screenStream) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (screenStream && !isPinnedScreen) {
                            setStageMinimized(false);
                            setStageTarget({ token: p.joinToken, kind: "screen" });
                          } else if (cameraStream) {
                            setStageMinimized(false);
                            setStageTarget(isPinnedCam ? null : { token: p.joinToken, kind: "camera" });
                          }
                        }}
                        title="نمایش در صحنهٔ اصلی"
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white/80 opacity-0 backdrop-blur transition hover:bg-black/75 hover:text-white group-hover:opacity-100 focus:opacity-100"
                      >
                        <Icon name="pin" size={13} />
                      </button>
                    )}
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
                  <div className="absolute start-2 top-2 flex items-center gap-1">
                    {p.isHost && (
                      <span className="rounded bg-amber-400/95 px-1.5 py-0.5 text-[10px] font-bold text-[#3a2700]">
                        میزبان
                      </span>
                    )}
                    {p.sharingOn && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStageMinimized(false);
                          setStageTarget({ token: p.joinToken, kind: "screen" });
                        }}
                        className="flex items-center gap-1 rounded bg-accent/90 px-1.5 py-0.5 text-[10px] font-bold text-on-accent shadow"
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
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#1a73e8] text-white" title={`کمرا روشن · ${p.cameraQuality}`}>
                          <Icon name="video" size={12} />
                        </span>
                      )}
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-md ${
                          p.micMuted
                            ? "bg-[#ea4335] text-white"
                            : p.micOn
                              ? "bg-emerald-500/85 text-[#062417]"
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
        </main>

        {/* People Side Panel */}
        {panel === "people" && (
          <aside className="anim-slide-panel flex w-80 shrink-0 flex-col border-s border-line bg-surface sm:w-96">
            <div className="flex shrink-0 items-center gap-2 border-b border-line p-2.5">
              <p className="flex-1 px-1.5 text-sm font-bold">افراد در جلسه ({faNum(inCall.length)})</p>
              <button onClick={() => setPanel(null)} aria-label="بستن" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><Icon name="close" size={16} /></button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
              {meeting.amHost && lobby.length > 0 && (
                <div className="rounded-xl bg-amber-400/10 p-3 ring-1 ring-amber-400/25">
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold text-amber-400"><Icon name="clock" size={14} /> در انتظار تأیید ({faNum(lobby.length)})</p>
                  <div className="space-y-2">
                    {lobby.map((p) => (
                      <div key={p.joinToken} className="flex items-center gap-2">
                        <Avatar name={p.name} color={p.avatarColor} size={32} />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                          {p.name}
                          {p.isGuest && <span className="text-[10px] font-normal text-muted"> · مهمان</span>}
                        </span>
                        <button onClick={() => void meeting.hostAction("admit", p.joinToken)} className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-bold text-[#0b2b1d] hover:bg-emerald-400">راه بده</button>
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
                    <Avatar name={p.name} color={p.avatarColor} size={36} userId={p.userId ?? undefined} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">
                        {p.name}
                        {mine && <span className="text-[10px] font-normal text-muted"> (شما)</span>}
                        {p.isHost && <span className="ms-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] text-amber-400">میزبان</span>}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted">
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
              </div>
            </div>
          </aside>
        )}

        {panel === "games" && (
          <aside className="anim-slide-panel flex w-80 shrink-0 flex-col border-s border-line bg-surface sm:w-96">
            <GamesPanel meeting={meeting} onClose={() => setPanel(null)} />
          </aside>
        )}
      </div>

      {/* Footer Control Bar */}
      {meeting.shareError && (
        <p role="alert" className="shrink-0 bg-amber-400/10 px-4 py-1.5 text-center text-xs text-amber-400">{meeting.shareError}</p>
      )}
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-line bg-surface/60 px-3 py-2.5 sm:gap-2.5 sm:py-3 backdrop-blur">
        <Ctrl
          label={meeting.micOn ? "خاموش کردن میکروفون" : "روشن کردن میکروفون"}
          tone={meeting.micOn ? "on" : "off"}
          disabled={meeting.myState.micMuted}
          onClick={() => void meeting.toggleMic()}
          title={meeting.myState.micMuted ? "میزبان میکروفون شما را بسته است" : undefined}
        >
          <Icon name={meeting.micOn ? "mic" : "mic-off"} size={20} />
        </Ctrl>

        <div className="relative" ref={cameraRef}>
          <Ctrl
            label="تنظیمات کمرا"
            tone={meeting.cameraOn ? "on" : "idle"}
            disabled={meeting.myState.shareBlocked}
            onClick={() => { setMediaMenu((m) => (m === "camera" ? null : "camera")); setLinkOpen(false); setInviteOpen(false); }}
            title={meeting.myState.shareBlocked ? "میزبان اشتراک تصویر شما را بسته است" : "کیفیت کمرا و روشن/خاموش"}
          >
            <Icon name={meeting.cameraOn ? "video" : "camera"} size={20} />
            {meeting.cameraOn && <span className="absolute -top-1 -end-1 rounded bg-accent px-1 text-[8px] font-black text-on-accent">{faNum(meeting.cameraFps)}</span>}
          </Ctrl>
          <MediaPopover
            open={mediaMenu === "camera"}
            title="تنظیمات کمرا"
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
            label="تنظیمات اشتراک صفحه"
            tone={meeting.sharing ? "warn" : "idle"}
            disabled={meeting.myState.shareBlocked}
            onClick={() => { setMediaMenu((m) => (m === "share" ? null : "share")); setLinkOpen(false); setInviteOpen(false); }}
            title={meeting.myState.shareBlocked ? "میزبان اشتراک صفحهٔ شما را بسته است" : "اشتراک صفحهٔ نمایش"}
          >
            <Icon name="screen" size={20} />
            {meeting.sharing && <span className="absolute -top-1 -end-1 rounded bg-rose-500 px-1 text-[8px] font-black text-white">{faNum(meeting.shareFps)}</span>}
          </Ctrl>
          <MediaPopover
            open={mediaMenu === "share"}
            title="اشتراک صفحهٔ نمایش"
            quality={meeting.shareQuality}
            fps={meeting.shareFps}
            onPick={(q, f) => void (meeting.sharing ? meeting.changeShareQuality(q, f) : meeting.startShare(q, f))}
            onClose={() => setMediaMenu(null)}
            active={meeting.sharing}
            onStop={() => void meeting.stopShare()}
            stopLabel="توقف اشتراک صفحه"
            icon="screen"
            startLabel="شروع اشتراک صفحه"
          />
        </div>

        <Ctrl label="بازی‌ها" tone={panel === "games" ? "warn" : "idle"} onClick={() => setPanel((p) => (p === "games" ? null : "games"))}>
          <Icon name="gamepad" size={20} />
        </Ctrl>
        <Ctrl label="افراد" tone={panel === "people" ? "warn" : "idle"} onClick={() => setPanel((p) => (p === "people" ? null : "people"))}>
          <Icon name="users" size={20} />
          {meeting.amHost && lobby.length > 0 && (
            <span className="absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded bg-amber-400 px-1 text-[9px] font-black text-[#3a2700]">
              {faNum(lobby.length)}
            </span>
          )}
        </Ctrl>
        <Ctrl label="کپی لینک جلسه" onClick={() => void copyLink()}>
          <Icon name="link" size={19} />
        </Ctrl>

        <div className="mx-1 h-8 w-px bg-line" />

        {meeting.amHost ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => void requestLeave()}
              aria-label="خروج از جلسه (بدون پایان)"
              title="خروج از جلسه — جلسه باز می‌ماند و بعداً می‌توانید برگردید"
              className="press flex h-11 items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3.5 text-xs font-bold text-fg transition hover:bg-surface-3 sm:h-12 sm:px-4 sm:text-sm"
            >
              <Icon name="door" size={18} /> <span>خروج</span>
            </button>
            <button
              onClick={() => void endMeeting()}
              aria-label="پایان جلسه برای همه"
              title="بستن کامل جلسه برای همهٔ اعضا"
              className="press flex h-11 items-center gap-1.5 rounded-xl bg-[#ea4335] px-3.5 text-xs font-bold text-white shadow-lg transition hover:bg-[#d93025] sm:h-12 sm:px-5 sm:text-sm"
            >
              <Icon name="phone-off" size={18} /> <span className="hidden sm:inline">پایان جلسه</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => void requestLeave()}
            aria-label="خروج از جلسه"
            className="press flex h-11 sm:h-12 items-center gap-2 rounded-xl bg-[#ea4335] px-4 sm:px-6 text-xs sm:text-sm font-bold text-white shadow-lg transition hover:bg-[#d93025]"
          >
            <Icon name="phone-off" size={19} /> <span className="hidden sm:inline">خروج</span>
          </button>
        )}
      </footer>

      <ContextMenu state={menu} onClose={close} />
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
