import { useEffect, useRef, useState } from "react";
import {
  apiFetch,
  applyTheme,
  applyThemeConfig,
  faNum,
  getThemeConfig,
  THEME_ACCENTS,
  THEMES,
  toast,
} from "../../utils/client";
import { CITIES, DEFAULT_CITY } from "../../config/cities";
import { CHAT_WALLPAPERS, getWallpaperSettings, saveWallpaperSettings, svgToDataUri } from "../../config/wallpapers";
import { AZAN_SETTINGS_EVENT, AZAN_TEST_EVENT, playAzanAudio, PRAYER_NAMES, prayerTimesFor } from "../../hooks/useAzan";
import { usePwaInstall } from "../../hooks/usePwaInstall";
import AudioSettingsSection from "./AudioSettingsSection";
import { MyProfileEditor } from "../profile/ProfileModal";
import { Avatar, Button, Field, Input, Modal } from "./Ui";
import { Icon, ROOM_ICONS } from "./Icon";

export function CreateModal({
  type,
  onClose,
  friends,
  onCreated,
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("landmark");
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (type) {
      setName("");
      setDescription("");
      setSelected([]);
      setEmoji("users");
    }
  }, [type]);

  async function create() {
    setBusy(true);
    try {
      const d = await apiFetch("/api/conversations", {
        method: "POST",
        json: { type, name, description, emoji, members: selected },
      });
      toast("گروه ساخته شد", "success");
      onCreated(d.conversation.id);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!type} onClose={onClose} title="ساخت گروه خصوصی">
      <div className="space-y-4">
        <div className="rounded-lg bg-accent/10 p-3 text-xs leading-6 text-muted">
          گروه‌ها خصوصی‌اند: فقط کسانی که اضافه می‌کنید آن را می‌بینند. برای گفتگوی عمومی یک «جلسه (میت)» بسازید و لینک آن را بفرستید — ورود با لینک، بدون ثبت‌نام.
        </div>
        <Field label="آیکون">
          <div className="flex flex-wrap gap-1.5">
            {ROOM_ICONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-label={e}
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${
                  emoji === e ? "bg-accent/25 text-accent ring-2 ring-accent" : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-fg"
                }`}
              >
                <Icon name={e} size={19} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="نام">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: خانواده" maxLength={48} autoFocus />
        </Field>
        <Field label="توضیحات (اختیاری)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            rows={2}
            className="ring-glow w-full resize-none rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm"
          />
        </Field>
        {friends.length > 0 && (
          <Field label={`افزودن دوستان (${selected.length} انتخاب شده)`}>
            <div className="scroll-thin max-h-48 space-y-1 overflow-y-auto rounded-lg bg-surface/60 p-1">
              {friends.map((f) => {
                const on = selected.includes(f.user.username);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelected((s) => (on ? s.filter((x) => x !== f.user.username) : [...s, f.user.username]))}
                    className={`flex w-full items-center gap-3 rounded-lg p-2 text-right transition ${on ? "bg-accent/15" : "hover:bg-surface-2"}`}
                  >
                    <Avatar name={f.user.displayName} color={f.user.avatarColor} size={34} userId={f.user.id} avatarFileId={f.user.avatarFileId} />
                    <span className="flex-1 text-sm font-semibold">{f.user.displayName}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${on ? "border-accent bg-accent text-white" : "border-line"}`}>
                      {on && <Icon name="check" size={12} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        <Button onClick={create} disabled={busy || name.trim().length < 2} className="w-full py-3">
          {busy ? "در حال ساخت..." : "ساختن"}
        </Button>
      </div>
    </Modal>
  );
}

export function SettingsModal({
  open,
  onClose,
  me,
  onSaved,
  onLogout,
}) {
  const [tab, setTab] = useState("profile");
  const [blocked, setBlocked] = useState(null);
  const [blockName, setBlockName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [themeCfg, setThemeCfg] = useState(getThemeConfig);
  const [wallpaper, setWallpaper] = useState(getWallpaperSettings);
  const [busy, setBusy] = useState(false);
  const [azan, setAzan] = useState(null);
  const [azanLoading, setAzanLoading] = useState(false);
  const [azanPreview, setAzanPreview] = useState(null);
  const previewRef = useRef(null);
  const previewIdRef = useRef(null);
  const wpFileRef = useRef(null);
  const { isInstalled, isIos, canInstall, promptInstall } = usePwaInstall();

  useEffect(() => {
    if (open) {
      setThemeCfg(getThemeConfig());
      setWallpaper(getWallpaperSettings());
    }
  }, [open, me]);

  function updateThemeAxis(patch) {
    const next = applyThemeConfig({ ...themeCfg, ...patch, presetId: null });
    setThemeCfg(next);
  }

  function pickPresetTheme(id) {
    applyTheme(id);
    setThemeCfg(getThemeConfig());
  }

  function onPickCustomWallpaper(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("لطفاً یک فایل تصویری انتخاب کنید", "error");
    if (file.size > 8 * 1024 * 1024) return toast("حداکثر حجم تصویر پس‌زمینه ۸ مگابایت است", "error");
    const reader = new FileReader();
    reader.onload = () => {
      // Compress / cap resolution via canvas so localStorage never overflows
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        const next = saveWallpaperSettings({ id: "custom", customDataUrl: dataUrl });
        setWallpaper(next);
        toast("تصویر پس‌زمینهٔ گفتگو اعمال شد", "success");
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    if (!open || tab !== "blocks") return;
    apiFetch("/api/blocks").then((d) => setBlocked(d.blocked)).catch((e) => toast(e.message, "error"));
  }, [open, tab]);

  useEffect(() => {
    if (!open || tab !== "azan") return;
    setAzanLoading(true);
    apiFetch("/api/azan/settings")
      .then((d) => setAzan({ ...d.settings, city: d.settings.city ?? DEFAULT_CITY }))
      .catch((e) => toast(e.message, "error"))
      .finally(() => setAzanLoading(false));
    return () => {
      if (previewRef.current) {
        previewRef.current.pause();
        if (previewRef.current.__objectUrl) URL.revokeObjectURL(previewRef.current.__objectUrl);
      }
      previewRef.current = null;
      previewIdRef.current = null;
      setAzanPreview(null);
    };
  }, [open, tab]);

  function patchAzan(next) {
    setAzan((prev) => ({ ...prev, ...next }));
  }

  async function saveAzan(patch) {
    try {
      const d = await apiFetch("/api/azan/settings", { method: "PATCH", json: patch });
      setAzan((prev) => ({
        ...d.settings,
        sounds: d.settings.sounds ?? prev?.sounds ?? [],
        city: d.settings.city ?? DEFAULT_CITY,
      }));
      window.dispatchEvent(new CustomEvent(AZAN_SETTINGS_EVENT));
      toast("تنظیمات اذان ذخیره شد", "success");
    } catch (e) {
      toast(e.message, "error");
    }
  }

  function stopPreview() {
    if (previewRef.current) {
      previewRef.current.pause();
      if (previewRef.current.__objectUrl) {
        URL.revokeObjectURL(previewRef.current.__objectUrl);
        previewRef.current.__objectUrl = null;
      }
      previewRef.current = null;
    }
    previewIdRef.current = null;
    setAzanPreview(null);
  }

  async function playPreview(sound) {
    if (previewIdRef.current === sound.fileId) return stopPreview();
    stopPreview();
    previewIdRef.current = sound.fileId;
    setAzanPreview(sound.fileId);
    try {
      const audio = await playAzanAudio(sound.fileId, azan?.volume ?? 80, previewRef);
      if (audio) {
        audio.onended = () => stopPreview();
        audio.onerror = () => {
          stopPreview();
          toast("پخش این صدا ممکن نشد", "error");
        };
      }
    } catch {
      stopPreview();
      toast("پخش صدا ممکن نشد؛ لطفاً دوباره تلاش کنید", "error");
    }
  }

  function testFullAzan() {
    stopPreview();
    window.dispatchEvent(
      new CustomEvent(AZAN_TEST_EVENT, {
        detail: {
          prayer: "dhuhr",
          soundFileId: azan?.soundFileId ?? azan?.sounds?.[0]?.fileId ?? null,
          volume: azan?.volume ?? 80,
        },
      }),
    );
  }

  async function blockAccount() {
    if (!blockName.trim()) return;
    try {
      await apiFetch("/api/blocks", { method: "POST", json: { username: blockName.trim() } });
      toast("کاربر مسدود شد", "success");
      setBlockName("");
      const d = await apiFetch("/api/blocks");
      setBlocked(d.blocked);
    } catch (e) { toast(e.message, "error"); }
  }

  async function unblockAccount(id) {
    try {
      await apiFetch(`/api/blocks/${id}`, { method: "DELETE" });
      setBlocked((list) => list?.filter((u) => u.id !== id) || []);
      toast("مسدودیت برداشته شد", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  async function save(body) {
    setBusy(true);
    try {
      await apiFetch("/api/auth/me", { method: "PATCH", json: body });
      toast("ذخیره شد", "success");
      onSaved();
      setCurrentPassword("");
      setNewPassword("");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  const SETTINGS_TABS = [
    { id: "profile", icon: "user", label: "ویرایش پروفایل", sub: "عکس، بنر، بیوگرافی و وضعیت" },
    { id: "audio", icon: "mic", label: "صدا و میکروفون", sub: "نویزگیر ملایم و آستانهٔ صدا" },
    { id: "theme", icon: "palette", label: "تم و ظاهر", sub: "شیشه‌ای، تیره/روشن و رنگ اصلی" },
    { id: "azan", icon: "landmark", label: "اذان و اوقات شرعی", sub: "پخش خودکار و شهر" },
    { id: "security", icon: "shield", label: "امنیت و رمز", sub: "گذرواژه و حفاظت حساب" },
    { id: "blocks", icon: "lock", label: "مسدودشده‌ها", sub: "مدیریت کاربران بلاک‌شده" },
  ];
  const activeMeta = SETTINGS_TABS.find((t) => t.id === tab) || SETTINGS_TABS[0];

  const renderCompactPresetCard = (t) => {
    const selected = themeCfg.presetId === t.id;
    const isLight = t.mode === "light";
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => pickPresetTheme(t.id)}
        className={`group overflow-hidden rounded-xl border text-right transition hover:-translate-y-0.5 ${
          selected ? "border-accent ring-2 ring-accent/35 shadow-sm" : "border-line hover:border-accent/45"
        }`}
      >
        <div className="relative h-9" style={{ background: t.colors[0] }}>
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 82% 22%, ${t.colors[1]}66, transparent 62%), radial-gradient(circle at 14% 88%, ${t.colors[2]}55, transparent 62%)`,
            }}
          />
          {t.glass && (
            <span className="absolute left-1.5 top-1 rounded bg-white/15 px-1 py-0.2 text-[8px] font-bold text-white backdrop-blur">
              شیشه‌ای
            </span>
          )}
          <div
            className="absolute bottom-1.5 right-2 h-2.5 w-9 rounded shadow-sm"
            style={{ background: `linear-gradient(135deg, ${t.colors[1]}, ${t.colors[2]})` }}
          />
          <div
            className={`absolute bottom-1.5 left-2 h-2 w-6 rounded ${
              isLight ? "border border-black/10 bg-black/10" : "bg-white/20"
            }`}
          />
        </div>
        <div
          className={`flex items-center justify-between gap-1 px-2 py-1.5 ${
            selected ? "bg-accent/15 text-accent" : "bg-surface-2 text-fg"
          }`}
        >
          <span className="truncate text-[10.5px] font-bold">{t.name}</span>
          {selected && <Icon name="check" size={12} className="shrink-0 text-accent" />}
        </div>
      </button>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تنظیمات برنامه"
      maxWidthClass="max-w-4xl"
      bodyClassName="p-0"
      noBodyScroll
    >
      <div className="flex h-[min(78dvh,680px)] min-h-[480px] flex-col overflow-hidden md:flex-row">
        {/* Fixed Non-Scrolling Right Sidebar Navigation */}
        <aside className="flex shrink-0 flex-col border-b border-line bg-surface-2/45 p-3 md:h-full md:w-64 md:border-b-0 md:border-e md:p-4">
          {/* Compact User Card */}
          <div className="mb-3 hidden items-center gap-3 rounded-2xl border border-line/80 bg-gradient-to-l from-accent/14 via-surface/75 to-surface/60 p-3 md:flex">
            <Avatar name={me.displayName} color={me.avatarColor} size={44} userId={me.id} avatarFileId={me.avatarFileId} status={me.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-fg">{me.displayName}</p>
              <p className="truncate text-[11px] font-semibold text-accent" dir="ltr">@{me.username}</p>
              {!!me.roles?.length && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {me.roles.slice(0, 2).map((r) => (
                    <span
                      key={r.id}
                      className="rounded px-1.5 py-0.5 text-[9.5px] font-bold"
                      style={{ background: r.color + "24", color: r.color }}
                    >
                      {r.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Nav Items: Horizontal scroll with edge fade halo on mobile, fixed column on desktop */}
          <div className="relative md:flex md:min-h-0 md:flex-1 md:flex-col">
            <nav
              className="scroll-thin flex gap-1.5 overflow-x-auto pb-1 pe-8 md:flex-1 md:flex-col md:overflow-y-auto md:pb-0 md:pe-0"
              aria-label="بخش‌های تنظیمات"
            >
              {SETTINGS_TABS.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`no-glass-btn press flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-right transition md:w-full md:gap-2.5 md:py-2.5 ${
                      active
                        ? "border-accent/45 bg-accent/16 text-accent shadow-sm"
                        : "border-transparent text-muted hover:bg-surface-2 hover:text-fg"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition md:h-8 md:w-8 ${
                        active ? "bg-accent/22 text-accent" : "bg-surface-3/80 text-muted"
                      }`}
                    >
                      <Icon name={item.icon} size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block whitespace-nowrap text-xs font-black md:truncate">{item.label}</span>
                      <span className="hidden truncate text-[10px] text-muted md:block">{item.sub}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
            {/* Mobile scroll-hint fade halo at the end (left edge in RTL) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-start pl-0.5 md:hidden"
              style={{
                background:
                  "linear-gradient(to right, color-mix(in srgb, var(--surface) 96%, var(--bg)) 22%, transparent 100%)",
              }}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line/80 bg-surface-2/90 text-accent shadow-sm">
                <Icon name="chevron-left" size={12} />
              </span>
            </div>
          </div>

          <div className="mt-3 hidden shrink-0 border-t border-line pt-3 md:block">
            <Button variant="danger" onClick={onLogout} className="w-full !py-2 text-xs">
              <Icon name="logout" size={15} /> خروج از حساب کاربری
            </Button>
          </div>
        </aside>

        {/* Independent Scrolling Main Content Pane */}
        <div className="scroll-thin min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-line/80 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/35 bg-accent/14 text-accent">
                <Icon name={activeMeta.icon} size={18} />
              </span>
              <div>
                <h4 className="text-sm font-black text-fg sm:text-base">{activeMeta.label}</h4>
                <p className="text-[11px] text-muted">{activeMeta.sub}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="press flex items-center gap-1.5 rounded-xl border border-rose-400/35 bg-rose-500/14 px-2.5 py-1.5 text-[11px] font-bold text-rose-300 md:hidden"
            >
              <Icon name="logout" size={13} /> خروج
            </button>
          </div>

          {tab === "audio" && <AudioSettingsSection showAppSounds />}

      {tab === "azan" && (azanLoading ? (
        <div className="flex flex-col items-center gap-3 py-10 text-muted">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          <p className="text-xs">در حال دریافت تنظیمات اذان…</p>
        </div>
      ) : azan && (
        <div className="space-y-4">
          {/* Master Toggle */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon name="bell" size={16} className={azan.enabled ? "text-emerald-400" : "text-muted"} />
                <span className="text-sm font-black">پخش خودکار اذان</span>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${azan.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-surface-3 text-muted"}`}>
                  {azan.enabled ? "فعال" : "خاموش"}
                </span>
              </div>
              <span className="mt-1 block text-[11px] text-muted">
                {azan.enabled ? "در وقت نمازهای انتخاب‌شده در پایین، نوای اذان پخش می‌شود." : "پخش اذان خاموش است؛ برای تنظیم اذان‌های دلخواه آن را روشن کنید."}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              dir="ltr"
              aria-checked={azan.enabled}
              onClick={() => {
                const nextEnabled = !azan.enabled;
                patchAzan({ enabled: nextEnabled });
                void saveAzan({ enabled: nextEnabled });
              }}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors ${azan.enabled ? "bg-emerald-500" : "bg-surface-3"}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${azan.enabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {/* Conditional Detailed Settings when Azan is ON */}
          {azan.enabled ? (
            <div className="anim-fade-in space-y-4 rounded-xl border border-line bg-surface-2/40 p-4">
              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <p className="text-xs font-bold text-fg">انتخاب اذان‌های قابل پخش</p>
                  <button
                    type="button"
                    onClick={() => {
                      const allOn = Object.keys(PRAYER_NAMES).every((k) => azan.prayers?.[k] !== false);
                      const prayers = Object.fromEntries(Object.keys(PRAYER_NAMES).map((k) => [k, !allOn]));
                      patchAzan({ prayers });
                      void saveAzan({ prayers });
                    }}
                    className="text-[11px] font-semibold text-accent hover:underline"
                  >
                    {Object.keys(PRAYER_NAMES).every((k) => azan.prayers?.[k] !== false) ? "خاموش کردن همه" : "روشن کردن همه"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {Object.entries(PRAYER_NAMES).map(([key, label]) => {
                    const on = azan.prayers?.[key] !== false;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          const prayers = { ...azan.prayers, [key]: !on };
                          patchAzan({ prayers });
                          void saveAzan({ prayers });
                        }}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-bold transition ${
                          on ? "border-accent bg-accent/15 text-accent" : "border-line bg-surface-2 text-muted hover:text-fg"
                        }`}
                      >
                        <Icon name={on ? "check" : "close"} size={13} />
                        {label.replace("اذان ", "")}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-muted">هر کدام از اذان‌های بالا را روشن بگذارید، سر وقت شرعی پخش خواهد شد.</p>
              </div>

              <div className="border-t border-line pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold text-fg">صدای اذان</p>
                  <button
                    type="button"
                    onClick={testFullAzan}
                    className="flex items-center gap-1 rounded-md bg-accent/15 px-2.5 py-1 text-[11px] font-bold text-accent hover:bg-accent/25"
                  >
                    <Icon name="bell" size={12} /> تست اعلان و پخش اذان
                  </button>
                </div>
                {azan.sounds?.length ? (
                  <div className="space-y-1.5">
                    {azan.sounds.map((s) => {
                      const selected = azan.soundFileId === s.fileId;
                      return (
                        <div key={s.fileId} className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition ${selected ? "border-accent bg-accent/12" : "border-line bg-surface-2 hover:bg-surface-3"}`}>
                          <button
                            type="button"
                            onClick={() => void playPreview(s)}
                            aria-label="پیش‌نمایش صدا"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-accent hover:bg-accent/25"
                          >
                            <Icon name={azanPreview === s.fileId ? "pause" : "play"} size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => { patchAzan({ soundFileId: s.fileId }); void saveAzan({ soundFileId: s.fileId }); }}
                            className="min-w-0 flex-1 text-right"
                          >
                            <span className="block truncate text-xs font-bold">{s.name}</span>
                            <span className="block text-[10px] text-muted">{faNum(Math.max(1, Math.round((s.size || 0) / 1024)))} کیلوبایت</span>
                          </button>
                          {selected && <Icon name="check" size={16} className="shrink-0 text-emerald-400" />}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-lg border border-line bg-surface-2 p-3 text-[11px] leading-6 text-muted">
                    هنوز صدای اذانی اضافه نشده است. مدیر می‌تواند از پنل مدیریت → «محتوا و اذان» فایل صوتی اضافه کند.
                  </p>
                )}
              </div>

              <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                <Field label="بلندی صدای اذان">
                  <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
                    <Icon name={azan.volume === 0 ? "volume-off" : "volume"} size={15} className="text-muted" />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={azan.volume ?? 80}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        patchAzan({ volume: v });
                        if (previewRef.current) previewRef.current.volume = Math.min(1, Math.max(0, v / 100));
                      }}
                      onMouseUp={(e) => void saveAzan({ volume: Number(e.currentTarget.value) })}
                      onTouchEnd={(e) => void saveAzan({ volume: Number(e.currentTarget.value) })}
                      className="h-1.5 flex-1 accent-[var(--accent)]"
                      aria-label="بلندی صدای اذان"
                    />
                    <span className="w-9 text-left text-xs font-bold tabular-nums text-fg">{faNum(azan.volume ?? 80)}٪</span>
                  </div>
                </Field>

                <Field label="شهر (محاسبهٔ اوقات شرعی)">
                  <select
                    value={azan.city?.name ?? DEFAULT_CITY.name}
                    onChange={(e) => {
                      const city = CITIES.find((c) => c.name === e.target.value) ?? DEFAULT_CITY;
                      patchAzan({ city });
                      void saveAzan({ city: { name: city.name, lat: city.lat, lng: city.lng } });
                    }}
                    className="ring-glow w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-fg"
                  >
                    {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-surface-2/30 p-4 text-center text-xs text-muted">
              پخش خودکار اذان غیرفعال است. با روشن کردن دکمهٔ بالا می‌توانید مشخص کنید کدام اذان‌ها (صبح، ظهر، عصر، مغرب، عشاء) و با چه صدایی پخش شوند.
            </div>
          )}

          {/* Today's Prayer Times Always Helpful at Bottom */}
          <div className="rounded-xl border border-line bg-surface-2 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Icon name="clock" size={14} className="text-accent" />
                اوقات شرعی امروز ({azan.city?.name ?? DEFAULT_CITY.name})
              </p>
              {!azan.enabled && (
                <select
                  value={azan.city?.name ?? DEFAULT_CITY.name}
                  onChange={(e) => {
                    const city = CITIES.find((c) => c.name === e.target.value) ?? DEFAULT_CITY;
                    patchAzan({ city });
                    void saveAzan({ city: { name: city.name, lat: city.lat, lng: city.lng } });
                  }}
                  className="rounded-md border border-line bg-surface-3 px-2 py-1 text-[11px] text-fg outline-none"
                >
                  {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              )}
            </div>
            <div className="grid grid-cols-5 gap-1.5 text-center">
              {Object.entries(prayerTimesFor(azan.city ?? DEFAULT_CITY) ?? {}).map(([key, at]) => {
                const activePrayer = azan.enabled && azan.prayers?.[key] !== false;
                return (
                  <span key={key} className={`rounded-lg border px-1 py-2 ${activePrayer ? "border-accent/35 bg-accent/10" : "border-line bg-surface-3/70"}`}>
                    <span className="block text-[10px] text-muted">{PRAYER_NAMES[key]?.replace("اذان ", "")}</span>
                    <span className="mt-0.5 block text-xs font-bold tabular-nums text-fg">
                      {at ? new Date(at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      {tab === "profile" && (
        <MyProfileEditor me={me} onSaved={onSaved} compact defaultTab="edit" />
      )}

      {tab === "theme" && (
        <div className="space-y-5">
          {/* Installable PWA Card */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 p-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/35 bg-accent/18 text-accent">
                <Icon name="app-install" size={20} />
              </span>
              <div>
                <p className="text-xs font-black text-fg">
                  {isInstalled ? "نسخهٔ وب‌اپلیکیشن (PWA) نصب شده است" : "نصب وب‌اپلیکیشن inebuly"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {isInstalled
                    ? "برنامه در حالت مستقل و تمام‌صفحه اجرا می‌شود."
                    : isIos
                      ? "در Safari روی دکمهٔ Share و سپس Add to Home Screen بزنید."
                      : "اجرای سریع و تمام‌صفحه روی موبایل و دسکتاپ بدون نیاز به مرورگر"}
                </p>
              </div>
            </div>
            {!isInstalled && canInstall && !isIos && (
              <Button
                variant="soft"
                onClick={() =>
                  void promptInstall().then((r) => {
                    if (r.outcome === "accepted") toast("نصب برنامه آغاز شد", "success");
                  })
                }
                className="!px-3.5 !py-2 text-xs font-bold"
              >
                <Icon name="app-install" size={15} /> نصب برنامه
              </Button>
            )}
          </div>

          {/* 3-Step Custom Theme Builder */}
          <div className="space-y-4 rounded-2xl border border-line bg-surface-2/45 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-xs font-black text-fg sm:text-sm">شخصی‌سازی سه‌مرحله‌ای تم</h5>
                <p className="mt-0.5 text-[11px] text-muted">
                  بافت پنل‌ها، تیرگی یا روشنی پس‌زمینه و رنگ اصلی برنامه را به دلخواه ترکیب کنید.
                </p>
              </div>
              <span className="rounded-lg border border-accent/35 bg-accent/14 px-2 py-1 text-[10px] font-bold text-accent">
                {themeCfg.glass ? "شیشه‌ای" : "مات"} • {themeCfg.mode === "light" ? "روشن" : "تیره"}
              </span>
            </div>

            {/* Step 1 & Step 2 side by side on desktop */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Step 1: Glass vs Solid */}
              <div className="rounded-xl border border-line bg-surface/65 p-3">
                <p className="mb-2 text-[11px] font-black text-muted">۱. بافت و حالت پنل‌ها</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateThemeAxis({ glass: true })}
                    className={`press flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-bold whitespace-nowrap transition sm:px-3 ${
                      themeCfg.glass
                        ? "border-accent bg-accent/16 text-accent ring-1 ring-accent/30"
                        : "border-line bg-surface-2/80 text-muted hover:text-fg"
                    }`}
                  >
                    <Icon name="sparkles" size={14} className="shrink-0" />
                    <span>شیشه‌ای</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateThemeAxis({ glass: false })}
                    className={`press flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-bold whitespace-nowrap transition sm:px-3 ${
                      !themeCfg.glass
                        ? "border-accent bg-accent/16 text-accent ring-1 ring-accent/30"
                        : "border-line bg-surface-2/80 text-muted hover:text-fg"
                    }`}
                  >
                    <Icon name="layers" size={14} className="shrink-0" />
                    <span>یکدست (مات)</span>
                  </button>
                </div>
              </div>

              {/* Step 2: Black (Dark) vs White (Light) */}
              <div className="rounded-xl border border-line bg-surface/65 p-3">
                <p className="mb-2 text-[11px] font-black text-muted">۲. زمینهٔ سیاه یا سفید</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateThemeAxis({ mode: "dark" })}
                    className={`press flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-bold whitespace-nowrap transition sm:px-3 ${
                      themeCfg.mode !== "light"
                        ? "border-accent bg-accent/16 text-accent ring-1 ring-accent/30"
                        : "border-line bg-surface-2/80 text-muted hover:text-fg"
                    }`}
                  >
                    <Icon name="moon" size={14} className="shrink-0" />
                    <span className="sm:hidden">سیاه (تیره)</span>
                    <span className="hidden sm:inline">تم سیاه (تیره)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateThemeAxis({ mode: "light" })}
                    className={`press flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-bold whitespace-nowrap transition sm:px-3 ${
                      themeCfg.mode === "light"
                        ? "border-accent bg-accent/16 text-accent ring-1 ring-accent/30"
                        : "border-line bg-surface-2/80 text-muted hover:text-fg"
                    }`}
                  >
                    <Icon name="sun" size={14} className="shrink-0" />
                    <span className="sm:hidden">سفید (روشن)</span>
                    <span className="hidden sm:inline">تم سفید (روشن)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Step 3: Primary Accent Colors */}
            <div className="rounded-xl border border-line bg-surface/65 p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-[11px] font-black text-muted">۳. رنگ اصلی برنامه</p>
                <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[10.5px] font-bold text-fg hover:border-accent/45">
                  <input
                    type="color"
                    value={themeCfg.customColor || "#8b5cf6"}
                    onChange={(e) => updateThemeAxis({ accentId: "custom", customColor: e.target.value })}
                    className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  رنگ دلخواه
                </label>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {THEME_ACCENTS.map((acc) => {
                  const active = themeCfg.accentId === acc.id;
                  const c1 = themeCfg.mode === "light" ? acc.light[0] : acc.dark[0];
                  const c2 = themeCfg.mode === "light" ? acc.light[1] : acc.dark[1];
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => updateThemeAxis({ accentId: acc.id })}
                      className={`press flex flex-col items-center gap-1.5 rounded-xl border p-2 transition ${
                        active
                          ? "border-accent bg-accent/14 ring-2 ring-accent/30"
                          : "border-line bg-surface-2/60 hover:border-accent/40"
                      }`}
                    >
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full shadow-sm"
                        style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
                      >
                        {active && <Icon name="check" size={13} className="text-white drop-shadow" />}
                      </span>
                      <span className={`truncate text-[10px] font-bold ${active ? "text-accent" : "text-fg"}`}>
                        {acc.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Compact Default Preset Themes */}
          <div className="rounded-2xl border border-line bg-surface-2/35 p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-black text-fg">
                <Icon name="palette" size={14} className="text-accent" />
                تم‌های پیش‌فرض آماده
              </span>
              <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[10px] font-bold text-muted">
                {faNum(THEMES.length)} تم
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {THEMES.map(renderCompactPresetCard)}
            </div>
          </div>

          {/* Chat Background / Wallpaper Picker with Theme Tint */}
          <div className="border-t border-line pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black text-fg">تصویر پس‌زمینهٔ گفتگوها</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  لایهٔ رنگی تصویر به‌صورت هوشمند با رنگ تم انتخابی شما هماهنگ می‌شود.
                </p>
              </div>
              <input
                ref={wpFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  onPickCustomWallpaper(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => wpFileRef.current?.click()}
                className="press flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/15 px-3 py-2 text-xs font-bold text-accent hover:bg-accent/25"
              >
                <Icon name="image" size={14} /> آپلود عکس دلخواه
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {/* Custom uploaded option if available */}
              {wallpaper.customDataUrl && (
                <button
                  type="button"
                  onClick={() => setWallpaper(saveWallpaperSettings({ id: "custom" }))}
                  className={`group relative overflow-hidden rounded-xl border text-right transition ${
                    wallpaper.id === "custom" ? "border-accent ring-1 ring-accent/50" : "border-line hover:border-accent/40"
                  }`}
                >
                  <div className="relative h-20 w-full overflow-hidden bg-bg">
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url("${wallpaper.customDataUrl}")` }}
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 42%, transparent), color-mix(in srgb, var(--bg) 68%, transparent))",
                        mixBlendMode: "multiply",
                      }}
                    />
                  </div>
                  <div className={`flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold ${wallpaper.id === "custom" ? "bg-accent/15 text-accent" : "bg-surface-2 text-fg"}`}>
                    <span className="truncate">تصویر من</span>
                    {wallpaper.id === "custom" && <Icon name="check" size={13} />}
                  </div>
                </button>
              )}

              {CHAT_WALLPAPERS.map((w) => {
                const selected = wallpaper.id === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWallpaper(saveWallpaperSettings({ id: w.id }))}
                    className={`group relative overflow-hidden rounded-xl border text-right transition ${
                      selected ? "border-accent ring-1 ring-accent/50" : "border-line hover:border-accent/40"
                    }`}
                  >
                    <div
                      className="relative h-20 w-full overflow-hidden"
                      style={{
                        background:
                          "radial-gradient(120% 100% at 85% 15%, color-mix(in srgb, var(--accent) 32%, transparent), transparent 65%), radial-gradient(100% 100% at 15% 90%, color-mix(in srgb, var(--accent-2) 26%, transparent), transparent 65%), var(--bg)",
                      }}
                    >
                      {w.kind === "animated-aurora" && (
                        <>
                          <span className="wp-aurora-1 absolute -top-3 -right-3 h-16 w-16 rounded-full blur-md" style={{ background: "color-mix(in srgb, var(--accent) 55%, transparent)" }} />
                          <span className="wp-aurora-2 absolute -bottom-3 -left-3 h-16 w-16 rounded-full blur-md" style={{ background: "color-mix(in srgb, var(--accent-2) 50%, transparent)" }} />
                        </>
                      )}
                      {w.kind === "animated-orbs" && (
                        <>
                          <span className="wp-orb-1 absolute right-3 top-2 h-8 w-8 rounded-full blur-[3px]" style={{ background: "color-mix(in srgb, var(--accent) 55%, transparent)" }} />
                          <span className="wp-orb-2 absolute bottom-2 left-3 h-9 w-9 rounded-full blur-[3px]" style={{ background: "color-mix(in srgb, var(--accent-2) 50%, transparent)" }} />
                        </>
                      )}
                      {w.kind === "animated-stars" && (
                        <div
                          className="wp-stars-drift absolute -inset-8"
                          style={{
                            backgroundImage:
                              "radial-gradient(circle at 12px 14px, color-mix(in srgb, var(--accent) 85%, var(--fg)) 1.3px, transparent 2px), radial-gradient(circle at 46px 34px, color-mix(in srgb, var(--accent-2) 85%, var(--fg)) 1.5px, transparent 2.2px)",
                            backgroundSize: "58px 58px",
                          }}
                        />
                      )}
                      {w.kind === "animated-waves" && (
                        <svg className="wp-wave-float absolute bottom-0 left-0 h-12 w-[150%] max-w-none" viewBox="0 0 400 120" preserveAspectRatio="none">
                          <path d="M0,50 C100,10 200,95 300,45 L400,60 L400,120 L0,120 Z" fill="color-mix(in srgb, var(--accent) 32%, transparent)" />
                          <path d="M0,80 C120,110 240,40 400,80 L400,120 L0,120 Z" fill="color-mix(in srgb, var(--accent-2) 28%, transparent)" />
                        </svg>
                      )}
                      {w.svg && (
                        <div
                          className="absolute inset-0 opacity-85"
                          style={{
                            backgroundImage: svgToDataUri(w.svg),
                            backgroundSize: w.size === "cover" ? "cover" : "96px 96px",
                          }}
                        />
                      )}
                      {w.badge && (
                        <span className="absolute left-1.5 top-1.5 rounded-md border border-accent/40 bg-surface/85 px-1.5 py-0.5 text-[9px] font-black text-accent backdrop-blur">
                          {w.badge}
                        </span>
                      )}
                      <div className="absolute bottom-2 right-2 h-3 w-11 rounded-md border border-accent/40 bg-accent/25" />
                      <div className="absolute bottom-6 left-2 h-2.5 w-8 rounded-md bg-surface-2/90" />
                    </div>
                    <div className={`flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold ${selected ? "bg-accent/15 text-accent" : "bg-surface-2 text-fg"}`}>
                      <span className="truncate">{w.name}</span>
                      {selected && <Icon name="check" size={13} />}
                    </div>
                  </button>
                );
              })}
            </div>

            {wallpaper.id !== "none" && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
                <span className="text-xs font-bold text-muted">شدت طرح و رنگ پس‌زمینه</span>
                <input
                  type="range"
                  min={15}
                  max={95}
                  value={wallpaper.intensity}
                  onChange={(e) => setWallpaper(saveWallpaperSettings({ intensity: Number(e.target.value) }))}
                  className="h-1.5 flex-1 accent-[var(--accent)]"
                />
                <span className="w-10 text-left text-xs font-bold tabular-nums text-fg">{faNum(wallpaper.intensity)}٪</span>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "blocks" && (
        <div className="space-y-4">
          <p className="text-xs leading-6 text-muted">افراد مسدودشده نمی‌توانند برای شما پیام یا درخواست دوستی بفرستند و تماس خصوصی برقرار کنند.</p>
          <div className="flex gap-2">
            <Input dir="ltr" placeholder="@username" value={blockName} onChange={(e) => setBlockName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && blockAccount()} className="text-left" />
            <Button variant="danger" onClick={blockAccount} disabled={!blockName.trim()}><Icon name="ban" size={15} /> بلاک</Button>
          </div>
          <p className="text-xs font-bold text-muted">مسدودشده‌ها ({blocked?.length ?? 0})</p>
          {blocked === null ? <p className="py-5 text-center text-xs text-muted">در حال بارگذاری...</p> : blocked.length === 0 ? (
            <div className="rounded-lg bg-surface-2 p-6 text-center text-sm text-muted">کاربری مسدود نشده است</div>
          ) : blocked.map((user) => (
            <div key={user.id} className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
              <Avatar name={user.displayName} color={user.avatarColor} size={38} userId={user.id} avatarFileId={user.avatarFileId} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{user.displayName}</p><p className="truncate text-xs text-muted" dir="ltr">@{user.username}</p></div>
              <Button variant="soft" onClick={() => unblockAccount(user.id)} className="text-xs">رفع بلاک</Button>
            </div>
          ))}
        </div>
      )}

          {tab === "security" && (
            <div className="space-y-4">
              <Field label="رمز عبور فعلی">
                <Input type="password" dir="ltr" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </Field>
              <Field label="رمز عبور جدید" hint="حداقل ۶ کاراکتر">
                <Input type="password" dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </Field>
              <Button onClick={() => save({ currentPassword, newPassword })} disabled={busy || newPassword.length < 6} className="w-full">
                تغییر رمز عبور
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
