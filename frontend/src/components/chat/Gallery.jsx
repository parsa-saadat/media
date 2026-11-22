import { useCallback, useEffect, useRef, useState } from "react";
import { downloadAuthed, toast } from "../../utils/client";
import { Icon } from "../common/Icon";
import { useConfirm } from "../common/Confirm";

/**
 * Full-screen photo viewer: arrow keys, swipe, click zones and on-screen buttons move between photos;
 * the owner can delete the current one or make it the profile picture.
 */
export default function Gallery({
  photos,
  names,
  index,
  onChange,
  onClose,
  owner,
  onDelete,
  onMakeAvatar,
}) {
  const { confirm } = useConfirm();
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const touchX = useRef(null);
  const fileId = photos[index];

  const go = useCallback(
    (delta) => {
      if (photos.length < 2) return;
      onChange((index + delta + photos.length) % photos.length);
    },
    [index, onChange, photos.length],
  );

  // Load the current photo through the authenticated endpoint.
  useEffect(() => {
    if (!fileId) return;
    let alive = true;
    let objectUrl = "";
    setLoading(true);
    setSrc("");
    const token = typeof window !== "undefined" ? window.__voxsyToken : "";
    void (async () => {
      try {
        const res = await fetch(`/api/files/${fileId}`, { headers: token ? { "x-voxsy-token": token } : {}, cache: "no-store", credentials: "same-origin" });
        if (!res.ok) throw new Error("load failed");
        const blob = await res.blob();
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (alive) toast("بارگذاری عکس ممکن نشد", "error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  async function remove() {
    if (!owner || !onDelete || !fileId) return;
    const ok = await confirm({
      title: "حذف این عکس؟",
      message: "عکس برای همیشه حذف می‌شود. اگر عکس پروفایل اصلی باشد، عکس بعدی جای آن را می‌گیرد.",
      confirmLabel: "حذف عکس",
      variant: "danger",
      icon: "trash",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onDelete(fileId);
      if (photos.length <= 1) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[75] flex flex-col bg-black/92 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="نمایش عکس پروفایل"
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX ?? null;
        touchX.current = null;
        if (start === null || end === null) return;
        const dx = end - start;
        if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1); // swipe left = next (RTL)
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="flex shrink-0 items-center gap-3 px-4 py-3 text-white">
        <button onClick={onClose} aria-label="بستن" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20">
          <Icon name="close" size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{names?.[fileId] ?? "عکس پروفایل"}</p>
          <p className="text-[11px] text-white/60">
            عکس {index + 1} از {photos.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {owner && onMakeAvatar && photos.length > 1 && (
            <button
              onClick={() => void onMakeAvatar(fileId)}
              disabled={busy}
              className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-bold transition hover:bg-white/20 disabled:opacity-50"
            >
              <Icon name="star" size={15} /> عکس اصلی
            </button>
          )}
          <button
            onClick={() => void downloadAuthed(`/api/files/${fileId}?download=1`, `photo-${fileId}`).catch((e) => toast(e.message, "error"))}
            aria-label="دانلود عکس"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
          >
            <Icon name="download" size={17} />
          </button>
          {owner && onDelete && (
            <button
              onClick={() => void remove()}
              disabled={busy}
              aria-label="حذف عکس"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/25 text-rose-200 transition hover:bg-rose-500/40 disabled:opacity-50"
            >
              <Icon name="trash" size={17} />
            </button>
          )}
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {photos.length > 1 && (
          <button
            onClick={() => go(-1)}
            aria-label="عکس قبلی"
            className="absolute start-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
          >
            <Icon name="chevron-right" size={22} />
          </button>
        )}
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-white/70">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            <span className="text-xs">در حال بارگذاری عکس…</span>
          </div>
        ) : src ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={src} alt={names?.[fileId] ?? "عکس پروفایل"} className="anim-fade-in max-h-full max-w-full rounded-lg object-contain shadow-2xl" draggable={false} />
        ) : (
          <p className="text-sm text-white/70">عکس در دسترس نیست</p>
        )}
        {photos.length > 1 && (
          <button
            onClick={() => go(1)}
            aria-label="عکس بعدی"
            className="absolute end-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
          >
            <Icon name="chevron-left" size={22} />
          </button>
        )}
      </main>

      {photos.length > 1 && (
        <footer className="scroll-thin flex shrink-0 gap-2 overflow-x-auto px-4 pb-5 pt-2">
          {photos.map((id, i) => (
            <button
              key={id}
              onClick={() => onChange(i)}
              aria-label={`عکس ${i + 1}`}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition ${i === index ? "border-accent opacity-100" : "border-transparent opacity-55 hover:opacity-90"}`}
            >
              <Thumb fileId={id} />
            </button>
          ))}
        </footer>
      )}
    </div>
  );
}

function Thumb({ fileId }) {
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
    <span className="flex h-full w-full items-center justify-center bg-surface-3 text-muted">
      <Icon name="image" size={16} />
    </span>
  );
}
