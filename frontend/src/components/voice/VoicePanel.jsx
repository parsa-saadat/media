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

const tileCols = (n) => {
  if (n <= 1) return "grid-cols-1";
  if (n === 2) return "grid-cols-1 sm:grid-cols-2";
  if (n <= 4) return "grid-cols-2";
  if (n <= 9) return "grid-cols-2 lg:grid-cols-3";
  return "grid-cols-3 lg:grid-cols-4";
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

/** Level meter driven by the shared store, so it never re-renders the call screen. */
function LevelMeter({ active, bars = 10 }) {
  return <MicMeter active={active} bars={bars} barClassName="h-2.5 w-1.5 rounded-full" />;
}

/** Width-based bar for my own tile. */
function LevelBar() {
  const ref = useRef(null);
  useEffect(
    () => subscribeMicLevel((level) => {
      const el = ref.current;
      if (el) el.style.width = `${Math.min(100, level)}%`;
    }),
    [],
  );
  return <div ref={ref} className="h-full rounded-full bg-emerald-400 transition-[width] duration-100" style={{ width: 0 }} />;
}

function roundBtn(label, opts) {
  const base = "flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8ab4f8] disabled:cursor-not-allowed disabled:opacity-40";
  let look = "border-white/10 bg-white/10 text-white hover:bg-white/15";
  if (opts.active === "on") look = "border-emerald-400/30 bg-emerald-500 text-[#0b2b1d] hover:bg-emerald-400";
  if (opts.active === "off") look = "border-red-400/30 bg-[#ea4335] text-white hover:bg-[#ea4335]/90";
  if (opts.active === "warn") look = "border-amber-400/40 bg-amber-400 text-[#3a2700] hover:bg-amber-300";
  if (opts.danger) look = "border-red-500/40 bg-[#ea4335] text-white hover:bg-[#d93025]";
  return (
    <button key={label} onClick={opts.onClick} disabled={opts.disabled} aria-label={label} title={opts.title ?? label} className={`${base} ${look}`}>
      {opts.children}
    </button>
  );
}

export default function VoicePanel({ conversationId, me, detail, onClose, onOpenDirect }) {
  const { confirm } = useConfirm();
  const { menu, open, close } = useContextMenu();
  const voice = useVoiceRoom(conversationId, me);
  const [tab, setTab] = useState(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [audioFile, setAudioFile] = useState(null);
  const [source, setSource] = useState("link");
  const [busy, setBusy] = useState(false);
  const [lobbyPeople, setLobbyPeople] = useState([]);
  const [joinedAt, setJoinedAt] = useState(0);
  const [pinned, setPinned] = useState(null);
  const [hiddenShares, setHiddenShares] = useState(new Set());
  const [shareMenu, setShareMenu] = useState(false);
  const shareRef = useRef(null);
  // lobby choices
  const [micReady, setMicReady] = useState("idle");
  const [joinWithMic, setJoinWithMic] = useState(true);
  const [showLobbyDevices, setShowLobbyDevices] = useState(false);

  const canSpeak = me.permissions.includes("voice.speak");
  const isMod = me.permissions.includes("voice.moderate") || (detail.type !== "direct" && ["owner", "admin"].includes(detail.myRole));
  const canKick = detail.type !== "direct" && (["owner", "admin"].includes(detail.myRole) || me.permissions.includes("rooms.manage"));
  const canPlay = me.permissions.includes("voice.play") && !voice.restrictions.playBlocked;
  const canShare = me.permissions.includes("screen.share") && !voice.restrictions.shareBlocked;
  const sharer = voice.participants.find((p) => p.sharingOn && !hiddenShares.has(p.userId)) ?? null;
  const myTrack = voice.tracks.find((t) => t.userId === me.id);

  // Lobby: who is already inside (refreshed every few seconds while we wait).
  useEffect(() => {
    if (voice.status !== "idle") return;
    let alive = true;
    const load = () => apiFetch(`/api/voice/${conversationId}`).then((d) => { if (alive) setLobbyPeople(d.participants); }).catch(() => {});
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => { alive = false; clearInterval(t); };
  }, [conversationId, voice.status]);

  // Lobby: open the microphone for the level meter as soon as the lobby shows.
  useEffect(() => {
    if (voice.status !== "idle" || !canSpeak) return;
    let cancelled = false;
    setMicReady("checking");
    void voice.previewMic().then((ok) => { if (!cancelled) setMicReady(ok ? "ready" : "blocked"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.status, canSpeak]);

  // Leaving the lobby without joining releases the microphone.
  useEffect(() => () => { voice.stopPreview(); }, [voice.stopPreview]);

  useEffect(() => {
    if (!shareMenu) return;
    const onDown = (e) => {
      if (!shareRef.current?.contains(e.target)) setShareMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [shareMenu]);

  useEffect(() => {
    if (voice.status === "joined" && !joinedAt) setJoinedAt(Date.now());
    if (voice.status === "idle" && joinedAt) setJoinedAt(0);
  }, [voice.status, joinedAt]);

  const pinnedId = pinned && voice.participants.some((p) => p.userId === pinned) ? pinned : null;
  const tiles = useMemo(() => (pinnedId ? voice.participants.filter((p) => p.userId === pinnedId) : voice.participants), [pinnedId, voice.participants]);
  const layout = tileCols(tiles.length || 1);
  const avatarSize = tiles.length <= 1 ? 168 : tiles.length === 2 ? 132 : tiles.length <= 4 ? 104 : 72;

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
      toast("ربات شما به تماس اضافه شد", "success");
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
      message: "این فرد از تماس خارج و از فهرست اعضا حذف می‌شود. می‌تواند دوباره دعوت شود.",
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
    const ok = await confirm({ title: "مسدود کردن کاربر", message: `«${person.displayName}» مسدود می‌شود؛ پیام و تماس خصوصی بین شما ممکن نخواهد بود.`, confirmLabel: "مسدود کن", variant: "danger", icon: "ban" });
    if (!ok) return;
    try {
      await apiFetch("/api/blocks", { method: "POST", json: { userId: person.userId } });
      toast("کاربر مسدود شد", "success");
    } catch (err) { toast(err.message, "error"); }
  }

  /** Right-click menu for a participant. Moderator actions live in their own labelled section. */
  function personMenu(person) {
    const mine = person.userId === me.id;
    const vol = voice.prefs.volumes[String(person.userId)] ?? 100;
    const items = [
      { type: "label", label: mine ? `${person.displayName} (شما)` : person.displayName },
      { type: "item", key: "pin", label: pinnedId === person.userId ? "برداشتن پین" : "پین کردن روی صفحه", icon: "pin", onClick: () => setPinned((p) => (p === person.userId ? null : person.userId)) },
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
      title: "خروج از جلسه؟",
      message: "پس از خروج، میکروفون و ربات موسیقی شما قطع می‌شود.",
      confirmLabel: "خروج از جلسه",
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

  /* ───────────────────────── Lobby (before joining) ───────────────────────── */
  if (!joined) {
    const connecting = voice.status === "connecting";
    const micStatusText =
      !canSpeak ? "نقش شما اجازهٔ صحبت ندارد؛ فقط شنونده خواهید بود"
      : micReady === "checking" ? "در حال بررسی میکروفون…"
      : micReady === "blocked" ? "دسترسی میکروفون داده نشد"
      : joinWithMic ? "میکروفون آماده است — با صدای روشن وارد می‌شوید"
      : "با میکروفون خاموش وارد می‌شوید";
    const kindLabel = detail.type === "direct" ? "تماس دونفره" : detail.type === "group" ? "جلسهٔ گروه خصوصی" : "جلسهٔ اتاق عمومی";
    return (
      <div className="anim-surface-in fixed inset-0 z-40 flex flex-col overflow-y-auto bg-[#0f0f10] text-[#e8eaed]">
        {/* top bar */}
        <div className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300"><Icon name="radio" size={18} /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{detail.name}</p>
            <p className="truncate text-[11px] text-white/45">{kindLabel}</p>
          </div>
          <button onClick={onClose} aria-label="بستن" className="ms-auto flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"><Icon name="close" size={17} /></button>
        </div>

        <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 items-center gap-8 px-4 pb-8 sm:px-6 lg:grid-cols-[1.25fr_1fr]">
          {/* self preview card */}
          <section aria-label="پیش‌نمایش شما" className="relative overflow-hidden rounded-xl border border-white/8 bg-[#1b1b1f] shadow-2xl" style={{ background: `radial-gradient(120% 120% at 25% 15%, ${me.avatarColor}33 0%, #1b1b1f 70%)` }}>
            <div className="flex aspect-[16/10] flex-col items-center justify-center gap-4">
              <div className={`transition-transform duration-300 ${joinWithMic && micReady === "ready" && voice.speaking ? "scale-105" : ""}`}>
                <Avatar name={me.displayName} color={me.avatarColor} size={140} userId={me.id} avatarFileId={me.avatarFileId} />
              </div>
              <div>
                <p className="text-center text-lg font-black">{me.displayName}</p>
                <p className="text-center text-[11px] text-white/50" dir="ltr">@{me.username}</p>
              </div>
            </div>
            {/* mic meter + quick toggles */}
            <div className="flex items-center gap-3 border-t border-white/5 bg-black/30 px-4 py-3">
              <button
                onClick={() => setJoinWithMic((v) => !v)}
                disabled={!canSpeak || micReady === "blocked"}
                aria-pressed={joinWithMic}
                aria-label={joinWithMic ? "ورود با میکروفون خاموش" : "ورود با میکروفون روشن"}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-40 ${joinWithMic && canSpeak && micReady !== "blocked" ? "border-white/10 bg-white/10 text-white hover:bg-white/15" : "border-red-400/30 bg-[#ea4335] text-white"}`}
              >
                <Icon name={joinWithMic && canSpeak && micReady !== "blocked" ? "mic" : "mic-off"} size={19} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{micStatusText}</p>
                <div className="mt-1.5"><LevelMeter active={canSpeak && micReady === "ready" && joinWithMic} bars={12} /></div>
              </div>
              <button onClick={() => setShowLobbyDevices((v) => !v)} aria-expanded={showLobbyDevices} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/15" aria-label="تنظیمات دستگاه صدا" title="تنظیمات دستگاه صدا">
                <Icon name="sliders" size={18} />
              </button>
            </div>
            {showLobbyDevices && (
              <div className="grid gap-3 border-t border-white/5 bg-black/20 p-4 text-xs sm:grid-cols-2">
                <label className="block"><span className="mb-1 block font-bold text-white/60">میکروفون</span>
                  <select value={voice.prefs.inputId} onChange={(e) => { void voice.changeInput(e.target.value); if (canSpeak) void voice.previewMic().then((ok) => setMicReady(ok ? "ready" : "blocked")); }} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none"><option value="">میکروفون پیش‌فرض سیستم</option>{inputDevices.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `میکروفون ${i + 1}`}</option>)}</select></label>
                <label className="block"><span className="mb-1 block font-bold text-white/60">بلندگو{outputSupported ? "" : " (در این مرورگر قابل انتخاب نیست)"}</span>
                  <select disabled={!outputSupported} value={voice.prefs.outputId} onChange={(e) => void voice.changeOutput(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none disabled:opacity-40"><option value="">بلندگوی پیش‌فرض سیستم</option>{outputDevices.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `خروجی ${i + 1}`}</option>)}</select></label>
                <div className="flex items-center gap-2 sm:col-span-2"><button onClick={() => void testSpeaker()} className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-white/70 hover:text-white"><Icon name="play" size={12} /> تست بلندگو</button><button onClick={() => void voice.refreshDevices()} className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-white/70 hover:text-white"><Icon name="refresh" size={12} /> بارگذاری دستگاه‌ها</button></div>
              </div>
            )}
          </section>

          {/* join column */}
          <section className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-right">
            <div>
              <h1 className="text-2xl font-black sm:text-3xl">آمادهٔ پیوستن هستید؟</h1>
              <p className="mt-2 text-sm leading-7 text-white/60">{lobbyPeople.length === 0 ? "هنوز کسی در جلسه نیست؛ شما اولین نفر خواهید بود." : `${faNum(lobbyPeople.length)} نفر هم‌اکنون در جلسه هستند.`}</p>
            </div>

            {lobbyPeople.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3 space-x-reverse">
                  {lobbyPeople.slice(0, 5).map((p) => (
                    <span key={p.userId} className="rounded-lg ring-2 ring-[#0f0f10]" title={p.displayName}><Avatar name={p.displayName} color={p.avatarColor} size={40} userId={p.userId} avatarFileId={p.avatarFileId} /></span>
                  ))}
                </div>
                <p className="text-xs text-white/60">
                  {lobbyPeople.slice(0, 2).map((p) => p.displayName).join("، ")}
                  {lobbyPeople.length > 2 ? ` و ${faNum(lobbyPeople.length - 2)} نفر دیگر` : ""}
                </p>
              </div>
            )}

            {voice.micError && micReady === "blocked" && (
              <p role="alert" className="max-w-md rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-right text-xs leading-6 text-amber-300">{voice.micError}</p>
            )}

            <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row lg:max-w-none">
              <button
                onClick={() => void voice.join({ micEnabled: joinWithMic && canSpeak && micReady === "ready" })}
                disabled={connecting}
                className="flex h-13 flex-1 items-center justify-center gap-2 rounded-full bg-[#1a73e8] px-7 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-[#1a73e8]/85 disabled:opacity-60"
              >
                {connecting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Icon name="phone" size={19} />}
                {connecting ? "در حال پیوستن…" : "پیوستن به جلسه"}
              </button>
              <button onClick={onClose} disabled={connecting} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-bold text-white/80 transition hover:bg-white/10 disabled:opacity-60">
                برگشت به گفتگو
              </button>
            </div>

            <ul className="grid w-full max-w-md gap-2 text-right text-[11px] leading-5 text-white/55 lg:max-w-none">
              <li className="flex items-center gap-2"><Icon name="lock" size={13} className="shrink-0 text-emerald-300" /> صدای تماس مستقیم بین مرورگرها رد و بدل می‌شود؛ روی سرور ذخیره نمی‌شود.</li>
              <li className="flex items-center gap-2"><Icon name="bot" size={13} className="shrink-0 text-[#8ab4f8]" /> هر شرکت‌کننده یک ربات موسیقی شخصی دارد؛ مدیر می‌تواند آن را قطع کند.</li>
              <li className="flex items-center gap-2"><Icon name="volume" size={13} className="shrink-0 text-white/60" /> صدای هر نفر را جداگانه می‌توانید کم یا زیاد کنید.</li>
            </ul>
          </section>
        </div>
      </div>
    );
  }

  /* ───────────────────────── In-call ───────────────────────── */
  return (
    <div className="anim-surface-in fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#101010] text-[#e8eaed]">
      {/* top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/5 px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-300"><Icon name="radio" size={18} /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-5">{detail.name}</p>
            <p className="truncate text-[10px] text-white/45" dir="ltr">گفتگوی صوتی · <Elapsed since={joinedAt} /></p>
          </div>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] text-emerald-300 md:flex">
            <Icon name="lock" size={12} /> رمزنگاری‌شده
          </span>
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/60">{faNum(voice.participants.length)} نفر</span>
          <button onClick={onClose} aria-label="بستن" title="بستن پنجرهٔ جلسه" className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"><Icon name="close" size={17} /></button>
        </div>
      </div>

      {/* stage + side */}
      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col p-2 sm:p-4">
          {(voice.sharing || sharer) && (
            <div className="relative mb-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-white/10 bg-black">
              <RemoteScreen
                stream={voice.sharing ? voice.localScreen : (sharer ? voice.remoteVideos[sharer.userId] ?? null : null)}
                name={voice.sharing ? "شما" : sharer?.displayName ?? ""}
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/75 to-transparent px-3 py-2">
                <span className="flex items-center gap-1.5 rounded-lg bg-black/50 px-2 py-1 text-[11px] font-bold backdrop-blur">
                  <Icon name="screen" size={13} />{" "}
                  {voice.sharing ? "صفحهٔ شما" : `صفحهٔ ${sharer?.displayName}`} · {voice.sharing ? voice.shareQuality : sharer?.shareQuality ?? "720p"}
                </span>
                <span className="pointer-events-auto flex gap-1">
                  {voice.sharing ? (
                    <button onClick={() => void voice.stopShare()} className="rounded-lg bg-rose-500/80 px-2 py-1 text-[11px] font-bold text-white backdrop-blur hover:bg-rose-500">توقف اشتراک صفحهٔ من</button>
                  ) : (
                    sharer && (
                      <>
                        <button onClick={() => setHiddenShares((prev) => new Set(prev).add(sharer.userId))} className="rounded-lg bg-black/50 px-2 py-1 text-[11px] text-white/85 backdrop-blur hover:bg-black/70">پنهان برای من</button>
                        {isMod && sharer.userId !== me.id && (
                          <button onClick={() => void moderate(sharer.userId, "shareBlocked", true)} className="rounded-lg bg-rose-500/75 px-2 py-1 text-[11px] font-bold text-white backdrop-blur hover:bg-rose-500">بستن اشتراک</button>
                        )}
                      </>
                    )
                  )}
                </span>
              </div>
            </div>
          )}
          {hiddenShares.size > 0 && (
            <button onClick={() => setHiddenShares(new Set())} className="mb-2 self-start rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/70 hover:text-white">
              <Icon name="screen" size={12} className="inline" /> نمایش دوبارهٔ اشتراک‌های پنهان ({hiddenShares.size})
            </button>
          )}
          <div className={`grid min-h-0 ${sharer ? "max-h-40 shrink-0 grid-flow-col gap-2 overflow-x-auto" : `flex-1 gap-2 sm:mx-auto sm:w-full sm:max-w-6xl sm:gap-3 ${layout}`}`}>
            {tiles.map((person) => {
              const mine = person.userId === me.id;
              const speaking = mine ? voice.micOn && voice.speaking : person.micOn && !person.micMuted;
              return (
                <div
                  key={person.userId}
                  onClick={() => setPinned((p) => (p === person.userId ? null : person.userId))}
                  onContextMenu={(event) => open(event, personMenu(person))}
                  role="button"
                  tabIndex={0}
                  aria-label={`${person.displayName}${pinnedId === person.userId ? " (پین‌شده)" : ""}`}
                  className={`group anim-rise relative flex min-h-0 items-center justify-center overflow-hidden rounded-lg border transition-[box-shadow,border-color,transform] duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8ab4f8] ${
                    speaking ? "border-transparent ring-4 ring-[#8ab4f8]/80 anim-pulse-ring" : "border-white/5 ring-0"
                  } ${pinnedId ? "min-h-[280px]" : ""}`}
                  style={{ background: `radial-gradient(120% 120% at 30% 20%, ${person.avatarColor}2e 0%, #1f1f23 72%)` }}
                >
                  {pinnedId === person.userId && <span className="absolute start-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] text-white/85 backdrop-blur"><Icon name="pin" size={12} /> پین‌شده</span>}
                  {person.sharingOn && <span className="absolute start-3 bottom-14 flex items-center gap-1 rounded-full bg-[#1a73e8] px-2 py-1 text-[10px] font-bold text-white"><Icon name="screen" size={11} /> {person.shareQuality ?? "720p"}</span>}
                  {/* kebab for touch users (same menu as right-click) */}
                  <button
                    onClick={(e) => { e.stopPropagation(); open(e, personMenu(person)); }}
                    aria-label={`گزینه‌های ${person.displayName}`}
                    className="absolute end-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/70 opacity-0 backdrop-blur transition hover:bg-black/60 hover:text-white group-hover:opacity-100 focus:opacity-100"
                  >
                    <Icon name="more-vertical" size={16} />
                  </button>
                  <div className="pointer-events-none flex flex-col items-center gap-3">
                    <div className={speaking ? "scale-110 transition-all duration-500 drop-shadow-[0_0_30px_rgba(138,180,248,.35)]" : "transition-all duration-500"}>
                      <Avatar name={person.displayName} color={person.avatarColor} size={avatarSize} userId={person.userId} avatarFileId={person.avatarFileId} />
                    </div>
                    <p className="pointer-events-none text-sm font-bold text-white/75 sm:text-base">{person.displayName}</p>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 pb-3 pt-10">
                    <span className="flex min-w-0 items-center gap-1.5 rounded-lg bg-black/45 px-2 py-1 text-xs font-semibold text-white backdrop-blur">
                      {mine && <span className="text-white/60">(شما)</span>}
                      <span className="truncate">{person.displayName}</span>
                    </span>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${person.micMuted ? "bg-[#ea4335] text-white" : person.micOn ? "bg-black/50 text-white backdrop-blur" : "bg-black/50 text-white/70 backdrop-blur"}`} title={person.micMuted ? "میکروفون توسط مدیر بسته شده" : person.micOn ? "در حال صحبت" : "میکروفون خاموش"}>
                      <Icon name={person.micOn && !person.micMuted ? "mic" : "mic-off"} size={15} />
                    </span>
                  </div>
                  {mine && voice.micOn && (
                    <div className="absolute bottom-14 start-3 h-1 w-24 overflow-hidden rounded-full bg-white/10"><LevelBar /></div>
                  )}
                </div>
              );
            })}
          </div>

          {myTrack && (
            <div className="pointer-events-none absolute start-4 top-4 z-10 max-w-xs">
              <div className="pointer-events-auto"><BotPlayer track={myTrack} mine volume={voice.prefs.master * ((voice.prefs.volumes[String(me.id)] ?? 100) / 100)} outputId={voice.prefs.outputId} serverTimeDelta={voice.serverTimeDelta} onPause={() => trackAction("pause")} onResume={() => trackAction("resume")} onStop={() => trackAction("stop")} /></div>
            </div>
          )}
        </main>

        {/* side panel */}
        {tab && (
          <aside className="anim-slide-panel flex w-80 shrink-0 flex-col border-s border-white/5 bg-[#1c1c1e] sm:w-96">
            <div className="flex shrink-0 items-center gap-2 border-b border-white/5 p-2">
              {([["people", "users", "افراد"], ["bot", "bot", "ربات‌ها"], ["audio", "sliders", "تنظیمات"]]).map(([id, icon, label]) => (
                <button key={id} onClick={() => setTab(id)} className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-bold transition ${tab === id ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}>
                  <Icon name={icon} size={14} />{label}
                </button>
              ))}
              <button onClick={() => setTab(null)} aria-label="بستن پنل" className="flex h-9 w-9 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"><Icon name="close" size={16} /></button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {tab === "people" && (
                <>
                  <p className="px-1 text-[11px] font-bold text-white/45">در جلسه ({faNum(voice.participants.length)})</p>
                  {voice.participants.map((p) => {
                    const mine = p.userId === me.id;
                    const vol = voice.prefs.volumes[String(p.userId)] ?? 100;
                    return (
                      <div key={p.userId} onContextMenu={(event) => open(event, personMenu(p))} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-2.5">
                        <Avatar name={p.displayName} color={p.avatarColor} size={38} userId={p.userId} avatarFileId={p.avatarFileId} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{p.displayName} {mine && <span className="text-[10px] font-normal text-white/45">(شما)</span>}</p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <Icon name={p.micMuted ? "mic-off" : p.micOn ? "mic" : "mic-off"} size={11} className={p.micMuted ? "text-red-400" : p.micOn ? "text-emerald-400" : "text-white/40"} />
                            <span className="text-[10px] text-white/45">{p.micMuted ? "بی‌صدا شده" : p.micOn ? "صحبت می‌کند" : "میکروفون خاموش"}</span>
                          </div>
                          {!mine && <div className="mt-1.5 flex items-center gap-2"><button className="text-white/45 hover:text-white" onClick={() => voice.setVolume(p.userId, vol === 0 ? 100 : 0)} aria-label="صدا"><Icon name={vol === 0 ? "volume-off" : "volume"} size={13} /></button><input aria-label={`صدای ${p.displayName}`} type="range" min={0} max={100} value={vol} onChange={(e) => voice.setVolume(p.userId, Number(e.target.value))} className="h-1 min-w-0 flex-1 accent-[#8ab4f8]" /></div>}
                        </div>
                        <button onClick={(e) => open(e, personMenu(p))} aria-label={`گزینه‌های ${p.displayName}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"><Icon name="more-vertical" size={16} /></button>
                      </div>
                    );
                  })}
                  {voice.participants.length === 1 && <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs leading-6 text-white/45">هنوز تنها هستید. لینک اتاق را با دیگران به اشتراک بگذارید.</p>}
                </>
              )}
              {tab === "bot" && (
                <>
                  <div className="rounded-lg border border-white/5 bg-white/5 p-3">
                    <div className="flex items-center gap-2"><Icon name="bot" size={17} className="text-[#8ab4f8]" /><p className="text-sm font-bold">ربات موسیقی شما</p></div>
                    <p className="mt-1 text-[11px] leading-5 text-white/50">آهنگ مستقیم (mp3/ogg/wav) یا آپلود در تماس برای همه پخش می‌شود. لینک‌های Spotify/SoundCloud با پلیر رسمی باز می‌شوند.</p>
                    {!canPlay && <p className="mt-2 rounded-xl border border-red-400/30 bg-red-500/10 p-2 text-[11px] text-red-300">مجوز پخش ربات شما غیرفعال است.</p>}
                    {canPlay && (
                      <div className="mt-3 space-y-2">
                        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1">
                          <button onClick={() => setSource("link")} className={`rounded-lg py-1.5 text-[11px] font-bold ${source === "link" ? "bg-white/10 text-white" : "text-white/50"}`}>لینک</button>
                          <button onClick={() => setSource("file")} className={`rounded-lg py-1.5 text-[11px] font-bold ${source === "file" ? "bg-white/10 text-white" : "text-white/50"}`}>آپلود</button>
                        </div>
                        {source === "link" ? <Input dir="ltr" placeholder="https://…/music.mp3" value={url} onChange={(e) => setUrl(e.target.value)} className="!border-white/10 !bg-black/30 !text-xs !text-white text-left" /> : <label className="block cursor-pointer rounded-xl border border-dashed border-white/15 p-3 text-center text-[11px] text-white/60 hover:border-[#8ab4f8]/40 hover:text-[#8ab4f8]"><input type="file" accept="audio/*,.mp3,.ogg,.m4a,.wav,.flac,.aac,.opus,.webm" className="hidden" onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)} />{audioFile ? audioFile.name : "انتخاب فایل صوتی"}</label>}
                        <Input placeholder="نام آهنگ (اختیاری)" value={title} onChange={(e) => setTitle(e.target.value)} className="!border-white/10 !bg-black/30 !text-xs !text-white" />
                        <button disabled={busy} onClick={() => submitTrack()} className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#1a73e8] py-2 text-xs font-bold text-white disabled:opacity-50"><Icon name="play" size={13} />{busy ? "در حال آماده‌سازی…" : "پخش در جلسه"}</button>
                        <button onClick={() => void playDemo()} disabled={busy} className="flex w-full items-center justify-center gap-1.5 rounded-full border border-white/10 py-2 text-xs font-bold text-white/70 hover:text-white disabled:opacity-40"><Icon name="music" size={13} />پخش صدای نمونه</button>
                      </div>
                    )}
                  </div>
                  {voice.tracks.length > 0 && <div className="space-y-2"><p className="px-1 text-[11px] font-bold text-white/45">ربات‌های فعال ({faNum(voice.tracks.length)})</p>{voice.tracks.map((track) => <BotPlayer key={track.userId} track={track} mine={track.userId === me.id} volume={voice.prefs.master * ((voice.prefs.volumes[String(track.userId)] ?? 100) / 100)} outputId={voice.prefs.outputId} serverTimeDelta={voice.serverTimeDelta} onPause={() => trackAction("pause")} onResume={() => trackAction("resume")} onStop={() => trackAction("stop", track.userId)} />)}</div>}
                </>
              )}
              {tab === "audio" && (
                <div className="space-y-3 rounded-lg border border-white/5 bg-white/5 p-3 text-xs text-white/80">
                  <label className="block"><span className="mb-1 block font-bold text-white/60">میکروفون</span>
                    <select value={voice.prefs.inputId} onChange={(e) => voice.changeInput(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none"><option value="">میکروفون پیش‌فرض سیستم</option>{inputDevices.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `میکروفون ${i + 1}`}</option>)}</select></label>
                  <label className="flex items-center gap-2"><span className="font-bold text-white/60">حساسیت</span><input type="range" min={0} max={200} value={voice.prefs.micGain} onChange={(e) => voice.setMicGain(Number(e.target.value))} className="h-1 flex-1 accent-[#8ab4f8]" /><span className="w-8 text-left tabular-nums">{faNum(voice.prefs.micGain)}٪</span></label>
                  <label className="block"><span className="mb-1 block font-bold text-white/60">خروجی صدا {outputSupported ? "" : "(این مرورگر انتخاب بلندگو را پشتیبانی نمی‌کند)"}</span>
                    <select disabled={!outputSupported} value={voice.prefs.outputId} onChange={(e) => voice.changeOutput(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none disabled:opacity-40"><option value="">بلندگوی پیش‌فرض سیستم</option>{outputDevices.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `خروجی ${i + 1}`}</option>)}</select></label>
                  <label className="flex items-center gap-2"><span className="font-bold text-white/60">صدای کلی</span><input type="range" min={0} max={100} value={voice.prefs.master} onChange={(e) => voice.setMaster(Number(e.target.value))} className="h-1 flex-1 accent-[#8ab4f8]" /><span className="w-8 text-left tabular-nums">{faNum(voice.prefs.master)}٪</span></label>
                  <div className="flex gap-2"><button onClick={() => void testSpeaker()} className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-2 text-[11px] text-white/70 hover:text-white"><Icon name="play" size={12} /> تست بلندگو</button><button onClick={() => void voice.refreshDevices()} className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-2 text-[11px] text-white/70 hover:text-white"><Icon name="refresh" size={12} /> بارگذاری دستگاه‌ها</button></div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* control bar */}
      {voice.shareError && <p role="alert" className="shrink-0 bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-300">{voice.shareError}</p>}
      <footer className="flex shrink-0 items-center justify-center gap-2 border-t border-white/5 px-3 py-3 sm:gap-4 sm:py-4">
        {roundBtn("میکروفون", { active: voice.micOn ? "on" : "off", onClick: () => void voice.toggleMic(), disabled: voice.restrictions.micMuted || !canSpeak, title: voice.restrictions.micMuted ? "مدیر میکروفون شما را بسته است" : voice.micOn ? "خاموش کردن میکروفون" : "روشن کردن میکروفون", children: <Icon name={voice.micOn ? "mic" : "mic-off"} size={22} /> })}
        <div className="relative" ref={shareRef}>
          {roundBtn(voice.sharing ? "توقف اشتراک صفحه" : "اشتراک صفحهٔ نمایش", {
            active: voice.sharing ? "warn" : undefined,
            disabled: !canShare,
            title: voice.restrictions.shareBlocked ? "مدیر اشتراک صفحهٔ شما را بسته است" : voice.sharing ? "توقف اشتراک صفحه" : "اشتراک صفحهٔ نمایش",
            onClick: () => (voice.sharing ? void voice.stopShare() : setShareMenu((v) => !v)),
            children: <Icon name="screen" size={21} />,
          })}
          {shareMenu && !voice.sharing && (
            <div className="anim-rise absolute bottom-16 start-1/2 z-20 w-64 -translate-x-1/2 rounded-lg border border-white/10 bg-[#1c1c1e] p-2 shadow-2xl">
              <p className="px-2 pb-1.5 pt-1 text-[11px] font-bold text-white/50">کیفیت اشتراک صفحه</p>
              {([["360p", "۳۶۰p", "سبک — اینترنت ضعیف"], ["720p", "۷۲۰p", "تعادل کیفیت و سرعت"], ["1080p", "۱۰۸۰p", "بالاترین کیفیت"]]).map(([id, label, hint]) => (
                <button key={id} onClick={() => { setShareMenu(false); void voice.startShare(id); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-xs transition hover:bg-white/10">
                  <span className="flex-1"><span className="block font-bold text-white">{label}</span><span className="block text-[10px] text-white/45">{hint}</span></span>
                  {voice.shareQuality === id && <Icon name="check" size={14} className="text-emerald-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
        {roundBtn("افراد", { active: tab === "people" ? "warn" : undefined, onClick: () => setTab((t) => (t === "people" ? null : "people")), children: <Icon name="users" size={22} /> })}
        {roundBtn("ربات‌ها", { active: tab === "bot" ? "warn" : undefined, onClick: () => setTab((t) => (t === "bot" ? null : "bot")), children: <Icon name="bot" size={22} /> })}
        {roundBtn("تنظیمات صدا", { active: tab === "audio" ? "warn" : undefined, onClick: () => setTab((t) => (t === "audio" ? null : "audio")), children: <Icon name="sliders" size={20} /> })}
        <div className="mx-1 h-10 w-px bg-white/10" />
        <button onClick={() => void requestLeave()} className="flex h-12 items-center gap-2 rounded-full bg-[#ea4335] px-5 text-sm font-bold text-white shadow-lg transition hover:bg-[#d93025] sm:h-14 sm:px-7" aria-label="خروج از جلسه">
          <Icon name="phone-off" size={21} /> <span className="hidden sm:inline">خروج</span>
        </button>
      </footer>
      <ContextMenu state={menu} onClose={close} />
    </div>
  );
}

/** A remote participant's shared screen inside a group or private call. */
function RemoteScreen({ stream, name }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream]);
  if (!stream) return <div className="flex h-full items-center justify-center text-xs text-white/45">در انتظار تصویر صفحهٔ {name}…</div>;
  return <video ref={ref} autoPlay playsInline muted className="h-full w-full bg-black object-contain" />;
}
