import { useEffect, useRef, useState } from "react";
import { apiFetch, faNum, toast } from "../../utils/client";
import { invalidateAvatar } from "../../utils/avatarCache";
import { Avatar, Button, Field, Input, Modal } from "../common/Ui";
import { Icon } from "../common/Icon";
import Gallery from "../chat/Gallery";
import { StatusPicker, toPresence } from "../common/StatusDot";
import { useConfirm } from "../common/Confirm";

const COLORS = ["#8b5cf6", "#06b6d4", "#22c55e", "#f97316", "#ec4899", "#eab308", "#3b82f6", "#ef4444"];

/**
 * My profile card: cover with gallery, Discord-style status, bio, role badges, image quota and
 * editing (name, bio, colour, photo upload/remove, choose which photo is the avatar).
 */
export default function ProfileModal({
  me,
  open,
  onClose,
  onSaved,
  onMessage,
}) {
  const { confirm } = useConfirm();
  const [tab, setTab] = useState("overview");
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio);
  const [avatarColor, setAvatarColor] = useState(me.avatarColor);
  const [status, setStatus] = useState(me.status ?? "online");
  const [statusText, setStatusText] = useState(me.statusText ?? "");
  const [statusEmoji, setStatusEmoji] = useState(me.statusEmoji ?? "");
  const [photos, setPhotos] = useState(me.photos ?? []);
  /** kept locally so the cover updates the moment a photo is added, removed or promoted */
  const [avatarId, setAvatarId] = useState(me.avatarFileId ?? null);
  const [bannerId, setBannerId] = useState(me.bannerFileId ?? null);
  const [quota, setQuota] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState(null);
  const fileRef = useRef(null);
  const bannerRef = useRef(null);

  const canUpload = me.permissions.includes("avatar.upload");

  useEffect(() => {
    if (!open) return;
    setTab("overview");
    setDisplayName(me.displayName);
    setBio(me.bio);
    setAvatarColor(me.avatarColor);
    setStatus(me.status ?? "online");
    setStatusText(me.statusText ?? "");
    setStatusEmoji(me.statusEmoji ?? "");
    setPhotos(me.photos ?? []);
    setAvatarId(me.avatarFileId ?? null);
    setBannerId(me.bannerFileId ?? null);
    void refresh();
  }, [open, me]);

  /** The server is the source of truth for the gallery, so several photos never get out of sync. */
  async function refresh() {
    try {
      const d = await apiFetch("/api/profile");
      setPhotos(d.photos ?? []);
      setAvatarId(d.avatarFileId ?? null);
      setBannerId(d.bannerFileId ?? null);
      setQuota(d.quota ?? null);
    } catch {
      apiFetch("/api/files/quota/images").then(setQuota).catch(() => setQuota(null));
    }
  }

  async function uploadBanner(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("فقط فایل تصویری مجاز است", "error");
    if (file.size > 8 * 1024 * 1024) return toast("حداکثر حجم بنر ۸ مگابایت است", "error");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const d = await apiFetch("/api/profile/banner", { method: "POST", body: fd });
      setBannerId(d.bannerFileId);
      toast("بنر پروفایل ذخیره شد", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
      if (bannerRef.current) bannerRef.current.value = "";
    }
  }

  async function removeBanner() {
    setBusy(true);
    try {
      await apiFetch("/api/profile/banner", { method: "DELETE" });
      setBannerId(null);
      toast("بنر حذف شد", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await apiFetch("/api/auth/me", { method: "PATCH", json: { displayName: displayName.trim(), bio, avatarColor } });
      toast("پروفایل ذخیره شد", "success");
      setTab("overview");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveStatus() {
    setBusy(true);
    try {
      await apiFetch("/api/profile/status", { method: "PATCH", json: { status, statusText, statusEmoji } });
      toast("وضعیت ذخیره شد", "success");
      setTab("overview");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file, asAvatar) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("فقط فایل تصویری مجاز است", "error");
    if (file.size > 8 * 1024 * 1024) return toast("حداکثر حجم هر عکس ۸ مگابایت است", "error");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (asAvatar) fd.append("avatar", "true");
      const d = await apiFetch("/api/profile/photos", { method: "POST", body: fd });
      setPhotos(d.photos);
      setAvatarId(d.avatarFileId);
      invalidateAvatar(me.id);
      toast(asAvatar ? "عکس پروفایل ذخیره شد" : "عکس به گالری اضافه شد", "success");
      onSaved();
      void refresh();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto(fileId) {
    setBusy(true);
    try {
      const d = await apiFetch(`/api/profile/photos/${fileId}`, { method: "DELETE" });
      setPhotos(d.photos);
      setAvatarId(d.avatarFileId);
      invalidateAvatar(me.id);
      toast("عکس حذف شد", "success");
      onSaved();
      if (d.photos.length === 0) setViewer(null);
      else setViewer((v) => (v === null ? null : Math.min(v, d.photos.length - 1)));
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function makeAvatar(fileId) {
    try {
      await apiFetch(`/api/profile/avatar/${fileId}`, { method: "POST" });
      setAvatarId(fileId);
      invalidateAvatar(me.id);
      toast("این عکس، عکس پروفایل اصلی شد", "success");
      onSaved();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function resetAll() {
    if (!photos.length) return;
    const ok = await confirm({
      title: "حذف همهٔ عکس‌ها؟",
      message: `${faNum(photos.length)} عکس برای همیشه حذف می‌شود.`,
      confirmLabel: "حذف همه",
      variant: "danger",
      icon: "trash",
    });
    if (!ok) return;
    for (const id of [...photos]) await removePhoto(id);
    setViewer(null);
  }

  const tabs = [
    { id: "overview", label: "نمای کلی", icon: "user" },
    { id: "status", label: "وضعیت", icon: "sparkles" },
    { id: "edit", label: "ویرایش", icon: "edit" },
  ];

  return (
    <>
      <Modal open={open} onClose={onClose} title="پروفایل من" wide>
        <div className="space-y-5">
          {/* cover — with the user's banner image when they set one */}
          <div className="relative overflow-hidden rounded-xl p-5" style={{ background: `linear-gradient(135deg, ${avatarColor}2e, transparent 60%), var(--surface-2)` }}>
            {bannerId && (
              <img src={`/api/banners/${me.id}?v=${bannerId}`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" style={{ filter: "saturate(1.05)" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="pointer-events-none absolute -left-10 -top-16 h-44 w-44 rounded-full blur-3xl" style={{ background: `${avatarColor}33` }} />
            <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:items-end">
              <button onClick={() => photos.length && setViewer(0)} disabled={!photos.length} aria-label="نمایش بزرگ عکس پروفایل" className="press relative shrink-0 disabled:cursor-default">
                <Avatar name={displayName} color={avatarColor} size={104} userId={me.id} avatarFileId={avatarId} status={toPresence(status)} />
                {photos.length > 1 && (
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur">
                    🖼 {faNum(photos.length)} عکس
                  </span>
                )}
              </button>
              <div className="min-w-0 flex-1 text-center sm:text-right">
                <h3 className="truncate text-2xl font-black text-white drop-shadow">{displayName}</h3>
                <p className="text-sm text-accent" dir="ltr">@{me.username}</p>
                <p className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-white/85 sm:justify-start">
                  <span className="h-2 w-2 rounded-full" style={{ background: toPresence(status) === "online" ? "#22c55e" : toPresence(status) === "idle" ? "#f59e0b" : toPresence(status) === "dnd" ? "#ef4444" : "#6b7280" }} />
                  {statusEmoji} {statusText || (status === "invisible" ? "نامرئی" : status === "dnd" ? "مزاحم نشوید" : status === "idle" ? "کم‌حضور" : "آنلاین")}
                </p>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                  {me.roles.map((r) => (
                    <span key={r.id} className="rounded-full bg-black/40 px-2.5 py-0.5 text-[11px] font-bold backdrop-blur" style={{ color: r.color }}>{r.name}</span>
                  ))}
                </div>
              </div>
              {canUpload && (
                <div className="flex shrink-0 flex-wrap justify-center gap-2">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void upload(e.target.files?.[0], photos.length === 0)} />
                  <input ref={bannerRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void uploadBanner(e.target.files?.[0])} />
                  <Button variant="soft" onClick={() => fileRef.current?.click()} disabled={busy} className="!bg-black/40 !px-3 !py-2 text-xs !text-white hover:!bg-black/60">
                    <Icon name="camera" size={15} /> {photos.length ? "افزودن عکس" : "گذاشتن عکس"}
                  </Button>
                  <Button variant="soft" onClick={() => bannerRef.current?.click()} disabled={busy} className="!bg-black/40 !px-3 !py-2 text-xs !text-white hover:!bg-black/60">
                    <Icon name="image" size={15} /> {bannerId ? "تغییر بنر" : "بنر"}
                  </Button>
                  {bannerId && (
                    <Button variant="danger" onClick={() => void removeBanner()} disabled={busy} className="!bg-black/40 !px-3 !py-2 text-xs !text-rose-300 hover:!bg-black/60">
                      <Icon name="trash" size={14} />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* tabs */}
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-bold transition sm:text-xs ${tab === t.id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg"}`}>
                <Icon name={t.icon} size={14} /> {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { icon: "image", label: "عکس‌ها", value: faNum(photos.length) },
                  { icon: "shield", label: "نقش‌ها", value: faNum(me.roles.length) },
                  { icon: "phone", label: "موبایل", value: <span dir="ltr" className="text-[11px]">{me.phone}</span> },
                  { icon: "clock", label: "وضعیت", value: statusText ? statusText.slice(0, 10) : status === "invisible" ? "نامرئی" : "آنلاین" },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-surface-2/60 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon name={s.icon} size={16} /></span>
                    <span className="min-w-0"><span className="block truncate text-xs font-black">{s.value}</span><span className="block text-[10px] text-muted">{s.label}</span></span>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold text-muted">دربارهٔ من</p>
                <p className="rounded-lg bg-surface-2/60 p-4 text-sm leading-7">
                  {bio?.trim() ? bio : <span className="text-muted">هنوز چیزی ننوشته‌ای. از تب «ویرایش» یک جمله دربارهٔ خودت بنویس.</span>}
                </p>
              </div>
              {quota && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-2/60 px-4 py-3 text-xs">
                  <span className="flex items-center gap-2 text-muted"><Icon name="image" size={15} className="text-accent" /> سهمیهٔ تصویر</span>
                  {quota.unlimited ? (
                    <span className="font-bold text-emerald-400">نامحدود</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="font-bold">{faNum(quota.used)} از {faNum(quota.limit)}</span>
                      <span className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-3">
                        <span className={`block h-full rounded-full transition-all duration-500 ${quota.used >= quota.limit ? "bg-rose-500" : "grad-accent"}`} style={{ width: `${Math.min(100, (quota.used / Math.max(1, quota.limit)) * 100)}%` }} />
                      </span>
                    </span>
                  )}
                  <span className="ms-auto text-[11px] text-muted">تعیین‌شده توسط مدیر نقش</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-4 py-3 text-xs">
                <span className="flex items-center gap-2 text-muted"><Icon name="image" size={15} className="text-accent" /> گالری عکس‌ها</span>
                {photos.length > 0 ? (
                  <button onClick={() => setViewer(0)} className="press font-bold text-accent hover:underline">دیدن {faNum(photos.length)} عکس</button>
                ) : canUpload ? (
                  <button onClick={() => fileRef.current?.click()} disabled={busy} className="press font-bold text-accent hover:underline">افزودن اولین عکس</button>
                ) : (
                  <span className="text-muted">گالری خالی است</span>
                )}
              </div>

              {onMessage && (
                <Button onClick={() => onMessage(me.id)} className="w-full"><Icon name="bookmark" size={16} /> پیام‌های ذخیره‌شده (Saved Messages)</Button>
              )}
            </div>
          )}

          {tab === "status" && (
            <div className="space-y-4">
              <StatusPicker value={status} text={statusText} emoji={statusEmoji} onChange={(next) => { setStatus(next.status); setStatusText(next.statusText); setStatusEmoji(next.statusEmoji); }} />
              <Button onClick={() => void saveStatus()} disabled={busy} className="w-full">{busy ? "در حال ذخیره…" : "ذخیرهٔ وضعیت"}</Button>
              <p className="text-[11px] leading-6 text-muted">«نامرئی» شما را به همه آفلاین نشان می‌دهد؛ «مزاحم نشوید» آنلاین است ولی اعلان‌ها بی‌صدا می‌ماند.</p>
            </div>
          )}

          {tab === "edit" && (
            <div className="space-y-4">
              <Field label="نام نمایشی"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={48} /></Field>
              <Field label="دربارهٔ من" hint="یک یا دو جمله؛ در پروفایل شما به دیگران نشان داده می‌شود.">
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={200} className="ring-glow w-full resize-none rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm outline-none" placeholder="مثلاً: برنامه‌نویس، کتاب‌خوان و قهوه‌خور" />
              </Field>
              <div>
                <p className="mb-1.5 text-xs font-bold text-muted">رنگ آواتار</p>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => setAvatarColor(c)} aria-label={`رنگ ${c}`} className={`h-9 w-9 rounded-xl transition ${avatarColor === c ? "scale-110 ring-2 ring-fg ring-offset-2 ring-offset-surface" : ""}`} style={{ background: c }} />
                  ))}
                </div>
              </div>
              <Button onClick={() => void save()} disabled={busy} className="w-full">{busy ? "در حال ذخیره…" : "ذخیرهٔ پروفایل"}</Button>
            </div>
          )}
        </div>
      </Modal>

      {viewer !== null && photos.length > 0 && (
        <Gallery
          photos={photos}
          names={Object.fromEntries(photos.map((id) => [id, me.displayName]))}
          index={viewer}
          onChange={setViewer}
          onClose={() => setViewer(null)}
          owner
          onDelete={removePhoto}
          onMakeAvatar={makeAvatar}
        />
      )}
    </>
  );
}

function PhotoThumb({ fileId }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    const token = typeof window !== "undefined" ? window.__voxsyToken : "";
    void fetch(`/api/files/${fileId}`, { headers: token ? { "x-voxsy-token": token } : {}, cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!alive || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);
  return src ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt="" className="h-full w-full object-cover transition duration-500 hover:scale-105" draggable={false} />
  ) : (
    <span className="flex h-full w-full items-center justify-center bg-surface-3 text-muted"><Icon name="image" size={18} /></span>
  );
}
