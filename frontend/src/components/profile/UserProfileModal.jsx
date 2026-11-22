import { useEffect, useState } from "react";
import { apiFetch, faNum, toast } from "../../utils/client";
import { Avatar, Button, Modal } from "../common/Ui";
import { Icon } from "../common/Icon";
import { StatusLine } from "../common/StatusDot";
import Gallery from "../chat/Gallery";
import { useConfirm } from "../common/Confirm";

/**
 * Another person's profile: cover, gallery (swipe/arrow between photos), Discord-style status,
 * bio, roles and the actions you may take (message, friend request, block).
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
  const [viewer, setViewer] = useState(null);

  useEffect(() => {
    let alive = true;
    setProfile(null);
    setError("");
    apiFetch(`/api/users/${userId}/profile`)
      .then((d) => alive && setProfile(d.profile))
      .catch((e) => alive && setError(e.message));
    apiFetch("/api/friends")
      .then((d) => {
        if (!alive) return;
        const find = (list) => list.find((f) => f.user.id === userId);
        if (find(d.friends)) { setRelation("friend"); setFriendId(find(d.friends).id); }
        else if (find(d.incoming)) { setRelation("incoming"); setFriendId(find(d.incoming).id); }
        else if (find(d.outgoing)) { setRelation("outgoing"); setFriendId(find(d.outgoing).id); }
        else setRelation("none");
      })
      .catch(() => {});
    return () => { alive = false; };
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
    const ok = await confirm({ title: `حذف ${profile.displayName} از دوستان؟`, message: "برای دوستی دوباره باید درخواست جدید بفرستید.", confirmLabel: "حذف کن", variant: "danger", icon: "trash" });
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

  const photos = profile?.photos ?? [];

  return (
    <>
      <Modal open onClose={onClose} title="پروفایل" wide>
        {error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400"><Icon name="ban" size={24} /></span>
            <p className="text-sm font-bold">{error}</p>
            <Button variant="ghost" onClick={onClose}>بستن</Button>
          </div>
        ) : !profile ? (
          <div className="space-y-4 py-4">
            <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* cover + identity — with the person's banner when they set one */}
            <div className="relative overflow-hidden rounded-xl p-5" style={{ background: `linear-gradient(135deg, ${profile.avatarColor}26, transparent 65%), var(--surface-2)` }}>
              {profile.bannerFileId && (
                <img src={`/api/banners/${profile.id}?v=${profile.bannerFileId}`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
              <div className="pointer-events-none absolute -left-10 -top-14 h-40 w-40 rounded-full blur-3xl" style={{ background: `${profile.avatarColor}33` }} />
              <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:items-end">
                <button onClick={() => photos.length && setViewer(0)} disabled={!photos.length} aria-label="نمایش بزرگ عکس پروفایل" className="press relative shrink-0 disabled:cursor-default">
                  <Avatar name={profile.displayName} color={profile.avatarColor} size={104} userId={profile.id} avatarFileId={profile.avatarFileId} status={profile.status} />
                  {photos.length > 1 && (
                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur">
                      🖼 {faNum(photos.length)} عکس
                    </span>
                  )}
                </button>
                <div className="min-w-0 flex-1 text-center sm:text-right">
                  <h3 className="truncate text-2xl font-black text-white drop-shadow">{profile.displayName}</h3>
                  <p className="text-sm text-accent" dir="ltr">@{profile.username}</p>
                  <div className="mt-1.5"><StatusLine status={profile.status} text={profile.statusText} emoji={profile.statusEmoji} /></div>
                  <p className="mt-1.5 text-[11px] text-white/70">عضو از {new Date(profile.joinedAt).toLocaleDateString("fa-IR")}</p>
                </div>
              </div>
            </div>

            {/* gallery lives behind the profile photo: tap it to browse every picture */}

            {/* bio */}
            <div>
              <p className="mb-1.5 text-xs font-bold text-muted">درباره</p>
              <p className="rounded-lg bg-surface-2/60 p-4 text-sm leading-7">
                {profile.bio?.trim() ? profile.bio : <span className="text-muted">چیزی ننوشته است.</span>}
              </p>
            </div>

            {/* actions */}
            <div className="flex flex-wrap gap-2">
              {profile.id === me.id ? (
                <Button onClick={() => onMessage(me.id)} className="w-full"><Icon name="bookmark" size={16} /> باز کردن پیام‌های ذخیره‌شده</Button>
              ) : (
                <>
                  <Button onClick={() => onMessage(profile.id)} disabled={busy}><Icon name="chat" size={16} /> پیام خصوصی</Button>
                  {relation === "none" && me.permissions.includes("friends.request") && (
                    <Button variant="soft" onClick={() => void request()} disabled={busy}><Icon name="user" size={16} /> درخواست دوستی</Button>
                  )}
                  {relation === "incoming" && (
                    <>
                      <Button onClick={() => void respond("accept")} disabled={busy}><Icon name="check" size={16} /> پذیرفتن</Button>
                      <Button variant="ghost" onClick={() => void respond("reject")} disabled={busy}><Icon name="close" size={16} /> رد کردن</Button>
                    </>
                  )}
                  {relation === "outgoing" && <Button variant="ghost" disabled><Icon name="clock" size={16} /> در انتظار پاسخ</Button>}
                  {relation === "friend" && (
                    <Button variant="ghost" onClick={() => void removeFriend()} disabled={busy}><Icon name="trash" size={16} /> حذف از دوستان</Button>
                  )}
                  <Button variant="danger" onClick={() => void block()} disabled={busy} className="ms-auto"><Icon name="ban" size={16} /> مسدود کردن</Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {viewer !== null && photos.length > 0 && (
        <Gallery
          photos={photos}
          names={Object.fromEntries(photos.map((id) => [id, profile?.displayName ?? ""]))}
          index={viewer}
          onChange={setViewer}
          onClose={() => setViewer(null)}
          owner={false}
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
    <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-muted"><Icon name="image" size={18} /></span>
  );
}
