import { useEffect, useRef, useState } from "react";
import { apiFetch, applyTheme, faNum, THEMES, toast } from "../../utils/client";
import { AVATAR_COLORS } from "../../config/colors";
import { CITIES, DEFAULT_CITY } from "../../config/cities";
import { AZAN_SETTINGS_EVENT, AZAN_TEST_EVENT, playAzanAudio, PRAYER_NAMES, prayerTimesFor } from "../../hooks/useAzan";
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
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio);
  const [color, setColor] = useState(me.avatarColor);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [theme, setTheme] = useState("violet");
  const [busy, setBusy] = useState(false);
  const [azan, setAzan] = useState(null);
  const [azanLoading, setAzanLoading] = useState(false);
  const [azanPreview, setAzanPreview] = useState(null);
  const previewRef = useRef(null);
  const previewIdRef = useRef(null);

  useEffect(() => {
    if (open) {
      setDisplayName(me.displayName);
      setBio(me.bio);
      setColor(me.avatarColor);
      setTheme(document.documentElement.getAttribute("data-theme") || "violet");
    }
  }, [open, me]);

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

  return (
    <Modal open={open} onClose={onClose} title="تنظیمات" wide>
      <div className="mb-5 flex items-center gap-4 rounded-xl border border-line bg-gradient-to-l from-accent/15 to-transparent p-4">
        <Avatar name={displayName} color={color} size={60} userId={me.id} avatarFileId={me.avatarFileId} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black">{me.displayName}</p>
          <p className="text-sm text-accent" dir="ltr">@{me.username}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {me.roles.map((r) => (
              <span key={r.id} className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: r.color + "26", color: r.color }}>
                {r.name}
              </span>
            ))}
          </div>
        </div>
        <Button variant="danger" onClick={onLogout}>
          <Icon name="logout" size={15} /> خروج
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-5 gap-1 rounded-lg bg-surface-2 p-1">
        {(
          [
            ["profile", "پروفایل"],
            ["theme", "تم"],
            ["azan", "اذان"],
            ["security", "امنیت"],
            ["blocks", "بلاک‌ها"],
          ]
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-md py-2 text-sm font-bold transition ${tab === id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg"}`}>
            {label}
          </button>
        ))}
      </div>

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
        <div className="space-y-4">
          <Field label="نام نمایشی">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={48} />
          </Field>
          <Field label="درباره من">
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} rows={2} className="ring-glow w-full resize-none rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm" />
          </Field>
          <Field label="رنگ آواتار">
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className={`h-9 w-9 rounded-lg transition ${color === c ? "scale-110 ring-2 ring-fg ring-offset-2 ring-offset-surface" : ""}`} style={{ background: c }} />
              ))}
            </div>
          </Field>
          <Field label="شماره موبایل">
            <Input value={me.phone} disabled dir="ltr" className="text-left opacity-60" />
          </Field>
          <Button onClick={() => save({ displayName, bio, avatarColor: color })} disabled={busy} className="w-full">
            ذخیره پروفایل
          </Button>
        </div>
      )}

      {tab === "theme" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                applyTheme(t.id);
                setTheme(t.id);
              }}
              className={`overflow-hidden rounded-xl border-2 text-right transition hover:scale-[1.02] ${theme === t.id ? "border-accent" : "border-line"}`}
            >
              <div className="relative h-20" style={{ background: t.colors[0] }}>
                <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 80% 20%, ${t.colors[1]}66, transparent 60%), radial-gradient(circle at 10% 90%, ${t.colors[2]}44, transparent 60%)` }} />
                <div className="absolute bottom-2 right-2 h-4 w-16 rounded-md" style={{ background: `linear-gradient(135deg, ${t.colors[1]}, ${t.colors[2]})` }} />
                <div className="absolute bottom-8 left-2 h-3.5 w-12 rounded-md bg-white/15" />
              </div>
              <div className="flex items-center justify-between bg-surface-2 px-3 py-2">
                <span className="text-xs font-bold">{t.name}</span>
                {theme === t.id && <Icon name="check" size={14} className="text-accent" />}
              </div>
            </button>
          ))}
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
    </Modal>
  );
}
