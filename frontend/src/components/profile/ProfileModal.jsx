import { useEffect, useRef, useState } from "react";
import { apiFetch, faNum, toast } from "../../utils/client";
import { invalidateAvatar } from "../../utils/avatarCache";
import { Avatar, Button, Field, Input, Modal } from "../common/Ui";
import { Icon } from "../common/Icon";
import Gallery from "../chat/Gallery";
import { StatusLine, StatusPicker, toPresence } from "../common/StatusDot";
import { useConfirm } from "../common/Confirm";

/**
 * Reusable My-Profile Studio — used both inside `ProfileModal` and directly inside
 * `SettingsModal` (`ویرایش پروفایل`) so users can edit their single profile photo, banner,
 * presence status, display name, and bio cleanly on mobile & desktop without wrapping glitches!
 *
 * Rules enforced:
 * - Avatar color is assigned automatically on registration and cannot be manually changed.
 * - Maximum 1 profile photo per user (uploading a new photo replaces the previous one).
 */
export function MyProfileEditor({
  me,
  onSaved,
  onMessage,
  defaultTab = "overview",
  compact = false,
}) {
  const { confirm } = useConfirm();
  const [tab, setTab] = useState(defaultTab);
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio ?? "");
  const [status, setStatus] = useState(me.status ?? "online");
  const [statusText, setStatusText] = useState(me.statusText ?? "");
  const [statusEmoji, setStatusEmoji] = useState(me.statusEmoji ?? "");
  const [avatarId, setAvatarId] = useState(me.avatarFileId ?? null);
  const [bannerId, setBannerId] = useState(me.bannerFileId ?? null);
  const [quota, setQuota] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const fileRef = useRef(null);
  const bannerRef = useRef(null);

  const canUpload = me.permissions?.includes("avatar.upload");
  const autoAvatarColor = me.avatarColor || "#8b5cf6";

  useEffect(() => {
    setDisplayName(me.displayName);
    setBio(me.bio ?? "");
    setStatus(me.status ?? "online");
    setStatusText(me.statusText ?? "");
    setStatusEmoji(me.statusEmoji ?? "");
    setAvatarId(me.avatarFileId ?? null);
    setBannerId(me.bannerFileId ?? null);
    void refresh();
  }, [me]);

  async function refresh() {
    try {
      const d = await apiFetch("/api/profile");
      setAvatarId(d.avatarFileId ?? d.photos?.[0] ?? null);
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
      onSaved?.();
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
      onSaved?.();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    if (!displayName.trim()) return toast("نام نمایشی نمی‌تواند خالی باشد", "error");
    setBusy(true);
    try {
      await apiFetch("/api/auth/me", {
        method: "PATCH",
        json: { displayName: displayName.trim(), bio },
      });
      toast("اطلاعات پروفایل ذخیره شد", "success");
      onSaved?.();
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
      toast("وضعیت حضور ذخیره شد", "success");
      onSaved?.();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatarPhoto(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("فقط فایل تصویری مجاز است", "error");
    if (file.size > 8 * 1024 * 1024) return toast("حداکثر حجم عکس پروفایل ۸ مگابایت است", "error");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("avatar", "true");
      const d = await apiFetch("/api/profile/photos", { method: "POST", body: fd });
      setAvatarId(d.avatarFileId);
      invalidateAvatar(me.id);
      toast("عکس پروفایل به‌روزرسانی شد", "success");
      onSaved?.();
      void refresh();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAvatarPhoto() {
    if (!avatarId) return;
    const ok = await confirm({
      title: "حذف عکس پروفایل؟",
      message: "عکس پروفایل شما حذف شده و حرف اول نامتان با رنگ خودکار نمایش داده می‌شود.",
      confirmLabel: "حذف عکس",
      variant: "danger",
      icon: "trash",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch(`/api/profile/photos/${avatarId}`, { method: "DELETE" });
      setAvatarId(null);
      setViewerOpen(false);
      invalidateAvatar(me.id);
      toast("عکس پروفایل حذف شد", "success");
      onSaved?.();
      void refresh();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  // Concise single-line labels so they NEVER stack or collide on narrow mobile screens
  const tabs = [
    { id: "overview", label: "نمای کلی", icon: "user" },
    { id: "edit", label: "ویرایش", icon: "edit" },
    { id: "status", label: "وضعیت حضور", icon: "sparkles" },
  ];

  const presence = toPresence(status);

  return (
    <div className="space-y-4">
      {/* Pro Hero Profile Card — Theme-harmonized banner + overlapping avatar */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-2/65 shadow-sm">
        {/* Banner Stage */}
        <div
          className={`relative w-full overflow-hidden ${compact ? "h-28 sm:h-32" : "h-32 sm:h-36"}`}
          style={{
            background: `radial-gradient(120% 120% at 85% 15%, ${autoAvatarColor}55, transparent 62%), radial-gradient(100% 100% at 10% 90%, color-mix(in srgb, var(--accent) 42%, transparent), transparent 65%), var(--surface-3)`,
          }}
        >
          {bannerId && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/banners/${me.id}?v=${bannerId}`}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: "linear-gradient(to top, color-mix(in srgb, var(--surface-2) 65%, transparent), transparent 55%)",
            }}
          />

          {/* Top-left floating banner action pills */}
          {canUpload && (
            <div className="absolute left-3 top-3 flex items-center gap-1.5">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => void uploadAvatarPhoto(e.target.files?.[0])}
              />
              <input
                ref={bannerRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void uploadBanner(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => bannerRef.current?.click()}
                className="press flex items-center gap-1.5 rounded-xl border border-line/70 bg-surface/85 px-2.5 py-1.5 text-[11px] font-bold text-fg shadow-md backdrop-blur-xl transition hover:border-accent/50 hover:text-accent disabled:opacity-50"
              >
                <Icon name="image" size={13} />
                <span className="whitespace-nowrap">{bannerId ? "تغییر بنر" : "افزودن بنر"}</span>
              </button>
              {bannerId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeBanner()}
                  title="حذف بنر"
                  className="press flex h-7 w-7 items-center justify-center rounded-xl border border-rose-400/40 bg-surface/85 text-rose-400 shadow-md backdrop-blur-xl hover:bg-rose-500/20"
                >
                  <Icon name="trash" size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Identity Row under Banner */}
        <div className="relative px-4 pb-4 sm:px-5">
          <div className="-mt-11 flex flex-col items-center gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end">
              {/* Single Avatar with camera & remove controls */}
              <div className="relative shrink-0 rounded-2xl bg-surface p-1 shadow-xl ring-1 ring-line">
                <button
                  type="button"
                  onClick={() => (avatarId ? setViewerOpen(true) : canUpload ? fileRef.current?.click() : undefined)}
                  aria-label="تصویر پروفایل"
                  className="press relative block"
                >
                  <Avatar
                    name={displayName}
                    color={autoAvatarColor}
                    size={compact ? 82 : 90}
                    userId={me.id}
                    avatarFileId={avatarId}
                    status={presence}
                  />
                </button>
                {canUpload && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    title={avatarId ? "جایگزینی عکس پروفایل" : "آپلود عکس پروفایل"}
                    className="press absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-xl border border-accent/50 bg-surface text-accent shadow-md transition hover:bg-accent hover:text-on-accent"
                  >
                    <Icon name="camera" size={13} />
                  </button>
                )}
              </div>

              <div className="min-w-0 pt-1 text-center sm:pb-0.5 sm:text-right">
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                  <h3 className="max-w-full truncate text-lg font-black text-fg sm:text-xl">{displayName}</h3>
                  {me.roles?.map((r) => (
                    <span
                      key={r.id}
                      className="whitespace-nowrap rounded-lg border px-2 py-0.5 text-[10px] font-bold"
                      style={{
                        background: `color-mix(in srgb, ${r.color} 15%, var(--surface))`,
                        borderColor: `color-mix(in srgb, ${r.color} 38%, transparent)`,
                        color: r.color,
                      }}
                    >
                      {r.name}
                    </span>
                  ))}
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs sm:justify-start">
                  <button
                    type="button"
                    dir="ltr"
                    onClick={() => {
                      void navigator.clipboard?.writeText(`@${me.username}`).then(() => toast("نام کاربری کپی شد", "success"));
                    }}
                    title="کلیک برای کپی نام کاربری"
                    className="font-bold text-accent hover:underline"
                  >
                    @{me.username}
                  </button>
                  <span className="text-line">•</span>
                  <StatusLine status={presence} text={statusText} emoji={statusEmoji} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {canUpload && avatarId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeAvatarPhoto()}
                  className="no-glass-btn press flex items-center gap-1 rounded-xl border border-rose-400/35 bg-rose-500/12 px-2.5 py-1.5 text-[11px] font-bold text-rose-400 hover:bg-rose-500/20"
                >
                  <Icon name="trash" size={13} />
                  <span className="whitespace-nowrap">حذف عکس</span>
                </button>
              )}
              {onMessage && (
                <Button variant="soft" onClick={() => onMessage(me.id)} className="!px-3 !py-1.5 text-xs whitespace-nowrap">
                  <Icon name="bookmark" size={14} /> ذخیره‌شده‌ها
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Tabs — single-line non-wrapping pills on mobile & desktop */}
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2/80 p-1">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={active}
              className={`no-glass-btn press flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold transition sm:gap-1.5 sm:text-xs ${
                active
                  ? "border border-accent/45 bg-accent/16 text-accent shadow-sm"
                  : "border border-transparent text-muted hover:text-fg"
              }`}
            >
              <Icon name={t.icon} size={14} className="shrink-0" />
              <span className="truncate whitespace-nowrap">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Overview */}
      {tab === "overview" && (
        <div className="space-y-3.5">
          {/* Bio Card */}
          <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-black text-muted">دربارهٔ من</span>
              <button
                type="button"
                onClick={() => setTab("edit")}
                className="no-glass-btn flex items-center gap-1 text-[11px] font-bold text-accent hover:underline"
              >
                <Icon name="edit" size={12} /> ویرایش
              </button>
            </div>
            <p className="text-sm leading-7 text-fg">
              {bio?.trim() ? (
                bio
              ) : (
                <span className="text-xs text-muted">
                  هنوز بیوگرافی ننوشته‌اید. از تب «ویرایش» یک معرفی کوتاه بنویسید.
                </span>
              )}
            </p>
          </div>

          {/* Info Bento Grid */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/60 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/14 text-accent">
                <Icon name="phone" size={16} />
              </span>
              <div className="min-w-0">
                <span className="block text-[10px] font-semibold text-muted">شماره موبایل</span>
                <span dir="ltr" className="block truncate text-xs font-black text-fg">
                  {me.phone}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/60 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/14 text-accent">
                <Icon name="sparkles" size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold text-muted">سهمیهٔ آپلود تصویر</span>
                <span className="block truncate text-xs font-black text-fg">
                  {!quota
                    ? "—"
                    : quota.unlimited
                      ? "نامحدود"
                      : `${faNum(quota.used)} از ${faNum(quota.limit)}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Edit Profile */}
      {tab === "edit" && (
        <div className="space-y-4 rounded-2xl border border-line bg-surface-2/55 p-4">
          {canUpload && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-line bg-surface/70 p-3">
              <div className="min-w-0">
                <p className="text-xs font-black text-fg">تصویر پروفایل</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  هر کاربر یک تصویر پروفایل دارد؛ با انتخاب عکس جدید، تصویر قبلی جایگزین می‌شود.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button variant="soft" onClick={() => fileRef.current?.click()} disabled={busy} className="!px-3 !py-1.5 text-xs whitespace-nowrap">
                  <Icon name="camera" size={14} /> {avatarId ? "تغییر عکس" : "انتخاب عکس"}
                </Button>
                {avatarId && (
                  <Button variant="danger" onClick={() => void removeAvatarPhoto()} disabled={busy} className="!px-2.5 !py-1.5 text-xs">
                    <Icon name="trash" size={14} />
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نام نمایشی">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={48} placeholder="نام نمایشی شما" />
            </Field>
            <Field label="شماره موبایل (غیرقابل تغییر)">
              <Input value={me.phone} disabled dir="ltr" className="text-left opacity-65" />
            </Field>
          </div>

          <Field label="دربارهٔ من (بیوگرافی)" hint={`${faNum((bio || "").length)} / ۲۰۰ کاراکتر`}>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={200}
              className="ring-glow w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg outline-none placeholder:text-muted/70"
              placeholder="یک جمله کوتاه دربارهٔ خودتان بنویسید…"
            />
          </Field>

          <Button onClick={() => void saveProfile()} disabled={busy} className="w-full">
            <Icon name="check" size={16} />
            {busy ? "در حال ذخیره…" : "ذخیرهٔ تغییرات پروفایل"}
          </Button>
        </div>
      )}

      {/* TAB 3: Presence & Custom Status */}
      {tab === "status" && (
        <div className="space-y-4 rounded-2xl border border-line bg-surface-2/55 p-4">
          <StatusPicker
            value={status}
            text={statusText}
            emoji={statusEmoji}
            onChange={(next) => {
              setStatus(next.status);
              setStatusText(next.statusText);
              setStatusEmoji(next.statusEmoji);
            }}
          />
          <Button onClick={() => void saveStatus()} disabled={busy} className="w-full">
            <Icon name="check" size={16} />
            {busy ? "در حال ذخیره…" : "ذخیرهٔ وضعیت حضور"}
          </Button>
        </div>
      )}

      {viewerOpen && avatarId && (
        <Gallery
          photos={[avatarId]}
          names={{ [avatarId]: me.displayName }}
          index={0}
          onChange={() => {}}
          onClose={() => setViewerOpen(false)}
          owner
          onDelete={() => void removeAvatarPhoto()}
        />
      )}
    </div>
  );
}

export default function ProfileModal({
  me,
  open,
  onClose,
  onSaved,
  onMessage,
}) {
  return (
    <Modal open={open} onClose={onClose} title="پروفایل من" wide>
      <MyProfileEditor
        me={me}
        onSaved={onSaved}
        onMessage={
          onMessage
            ? (id) => {
                onClose();
                onMessage(id);
              }
            : undefined
        }
      />
    </Modal>
  );
}
