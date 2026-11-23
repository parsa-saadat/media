import { useEffect, useState } from "react";
import { apiFetch, toast } from "../../utils/client";
import { Avatar, Button, Modal } from "../common/Ui";
import { Icon } from "../common/Icon";
import { StatusLine } from "../common/StatusDot";
import Gallery from "../chat/Gallery";
import { useConfirm } from "../common/Confirm";

/**
 * Another person's profile card — sleek, theme-aware overlapping cover layout,
 * copyable @username, role badges, live presence status, and relationship actions.
 */
export default function UserProfileModal({
  userId,
  me,
  onClose,
  onMessage,
}) {
  const { confirm } = useConfirm();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [relation, setRelation] = useState("none");
  const [friendId, setFriendId] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setProfile(null);
    setError("");
    const fetchProfile = () =>
      apiFetch(`/api/users/${userId}/profile`)
        .then((d) => alive && setProfile(d.profile))
        .catch((e) => alive && setError(e.message));
    void fetchProfile();
    const poll = setInterval(fetchProfile, 10000);
    apiFetch("/api/friends")
      .then((d) => {
        if (!alive) return;
        const find = (list) => list.find((f) => f.user.id === userId);
        if (find(d.friends)) {
          setRelation("friend");
          setFriendId(find(d.friends).id);
        } else if (find(d.incoming)) {
          setRelation("incoming");
          setFriendId(find(d.incoming).id);
        } else if (find(d.outgoing)) {
          setRelation("outgoing");
          setFriendId(find(d.outgoing).id);
        } else {
          setRelation("none");
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [userId]);

  async function request() {
    if (!profile) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/friends", { method: "POST", json: { username: profile.username } });
      toast(r.accepted ? "اکنون دوست هستید" : "درخواست دوستی ارسال شد", "success");
      setRelation(r.accepted ? "friend" : "outgoing");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function respond(action) {
    if (!friendId) return;
    setBusy(true);
    try {
      await apiFetch(`/api/friends/${friendId}`, { method: "PATCH", json: { action } });
      toast(action === "accept" ? "درخواست پذیرفته شد" : "درخواست رد شد", action === "accept" ? "success" : "info");
      setRelation(action === "accept" ? "friend" : "none");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeFriend() {
    if (!friendId || !profile) return;
    const ok = await confirm({
      title: `حذف ${profile.displayName} از دوستان؟`,
      message: "برای دوستی دوباره باید درخواست جدید بفرستید.",
      confirmLabel: "حذف کن",
      variant: "danger",
      icon: "trash",
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/friends/${friendId}`, { method: "DELETE" });
      setRelation("none");
      setFriendId(null);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function block() {
    if (!profile) return;
    const ok = await confirm({
      title: `مسدود کردن ${profile.displayName}؟`,
      message: "پیام، تماس خصوصی و درخواست دوستی بین شما ممکن نخواهد بود.",
      confirmLabel: "مسدود کن",
      variant: "danger",
      icon: "ban",
    });
    if (!ok) return;
    try {
      await apiFetch("/api/blocks", { method: "POST", json: { userId: profile.id } });
      toast("کاربر مسدود شد", "success");
      onClose();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  const avatarFileId = profile?.avatarFileId ?? profile?.photos?.[0] ?? null;

  return (
    <>
      <Modal open onClose={onClose} title="پروفایل کاربر" wide>
        {error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <Icon name="ban" size={24} />
            </span>
            <p className="text-sm font-bold text-fg">{error}</p>
            <Button variant="ghost" onClick={onClose}>
              بستن
            </Button>
          </div>
        ) : !profile ? (
          <div className="space-y-4 py-4">
            <div className="h-32 animate-pulse rounded-2xl bg-surface-2" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
            <div className="h-16 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Theme-aware Hero Card */}
            <div className="overflow-hidden rounded-2xl border border-line bg-surface-2/65 shadow-sm">
              {/* Banner */}
              <div
                className="relative h-32 w-full overflow-hidden sm:h-36"
                style={{
                  background: `radial-gradient(120% 120% at 85% 15%, ${profile.avatarColor || "#8b5cf6"}55, transparent 62%), radial-gradient(100% 100% at 10% 90%, color-mix(in srgb, var(--accent) 42%, transparent), transparent 65%), var(--surface-3)`,
                }}
              >
                {profile.bannerFileId && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/api/banners/${profile.id}?v=${profile.bannerFileId}`}
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
                    background: "linear-gradient(to top, color-mix(in srgb, var(--surface-2) 68%, transparent), transparent 55%)",
                  }}
                />
              </div>

              {/* Overlapping Identity Row */}
              <div className="relative px-4 pb-4 sm:px-5">
                <div className="-mt-11 flex flex-col items-center gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end">
                    <div className="relative shrink-0 rounded-2xl bg-surface p-1 shadow-xl ring-1 ring-line">
                      <button
                        type="button"
                        onClick={() => avatarFileId && setViewerOpen(true)}
                        disabled={!avatarFileId}
                        aria-label="نمایش بزرگ عکس پروفایل"
                        className="press relative block disabled:cursor-default"
                      >
                        <Avatar
                          name={profile.displayName}
                          color={profile.avatarColor}
                          size={88}
                          userId={profile.id}
                          avatarFileId={avatarFileId}
                          status={profile.status}
                        />
                      </button>
                    </div>

                    <div className="min-w-0 pt-1 text-center sm:pb-0.5 sm:text-right">
                      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                        <h3 className="max-w-full truncate text-lg font-black text-fg sm:text-xl">{profile.displayName}</h3>
                        {profile.roles?.map((r) => (
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
                            void navigator.clipboard?.writeText(`@${profile.username}`).then(() => toast("نام کاربری کپی شد", "success"));
                          }}
                          title="کلیک برای کپی نام کاربری"
                          className="font-bold text-accent hover:underline"
                        >
                          @{profile.username}
                        </button>
                        <span className="text-line">•</span>
                        <StatusLine status={profile.status} text={profile.statusText} emoji={profile.statusEmoji} />
                      </div>
                    </div>
                  </div>

                  {relation === "friend" && (
                    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-bold text-emerald-500">
                      <Icon name="check" size={13} /> دوست شما
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bio & Metadata */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-line bg-surface-2/60 p-3.5 sm:col-span-2">
                <p className="mb-1 text-[11px] font-black text-muted">دربارهٔ کاربر</p>
                <p className="text-sm leading-7 text-fg">
                  {profile.bio?.trim() ? profile.bio : <span className="text-xs text-muted">بیوگرافی ثبت نشده است.</span>}
                </p>
              </div>

              <div className="flex flex-col justify-center rounded-2xl border border-line bg-surface-2/60 p-3.5">
                <span className="text-[11px] font-bold text-muted">تاریخ عضویت</span>
                <span className="mt-1 text-sm font-black text-fg">
                  {new Date(profile.joinedAt).toLocaleDateString("fa-IR")}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {profile.id === me.id ? (
                <Button onClick={() => onMessage(me.id)} className="w-full">
                  <Icon name="bookmark" size={16} /> باز کردن پیام‌های ذخیره‌شده
                </Button>
              ) : (
                <>
                  <Button onClick={() => onMessage(profile.id)} disabled={busy}>
                    <Icon name="chat" size={16} /> ارسال پیام
                  </Button>
                  {relation === "none" && me.permissions.includes("friends.request") && (
                    <Button variant="soft" onClick={() => void request()} disabled={busy}>
                      <Icon name="user-plus" size={16} /> درخواست دوستی
                    </Button>
                  )}
                  {relation === "incoming" && (
                    <>
                      <Button onClick={() => void respond("accept")} disabled={busy}>
                        <Icon name="check" size={16} /> پذیرفتن دوستی
                      </Button>
                      <Button variant="ghost" onClick={() => void respond("reject")} disabled={busy}>
                        <Icon name="close" size={16} /> رد کردن
                      </Button>
                    </>
                  )}
                  {relation === "outgoing" && (
                    <Button variant="ghost" disabled>
                      <Icon name="clock" size={16} /> در انتظار پذیرش
                    </Button>
                  )}
                  {relation === "friend" && (
                    <Button variant="ghost" onClick={() => void removeFriend()} disabled={busy}>
                      <Icon name="trash" size={15} /> حذف از دوستان
                    </Button>
                  )}
                  <Button variant="danger" onClick={() => void block()} disabled={busy} className="ms-auto">
                    <Icon name="ban" size={15} /> مسدود کردن
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {viewerOpen && avatarFileId && (
        <Gallery
          photos={[avatarFileId]}
          names={{ [avatarFileId]: profile?.displayName ?? "" }}
          index={0}
          onChange={() => {}}
          onClose={() => setViewerOpen(false)}
          owner={false}
        />
      )}
    </>
  );
}
