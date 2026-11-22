import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, faNum, shortTime, toast } from "../../utils/client";
import { navigate } from "../../utils/router";
import { Icon } from "./Icon";
import { playSound } from "../../utils/sounds";

const KIND_ICON = {
  "friend-request": "user",
  "friend-accept": "users",
  blocked: "ban",
  "meeting-invite": "radio",
  "meeting-admitted": "check",
  "meeting-started": "radio",
  muted: "mic-off",
  "share-blocked": "screen",
  kicked: "door",
  "password-changed": "key",
  system: "info",
};

/** Bell + drop-down panel. Polls every 15s, plays a sound and shows a toast for new items. */
export default function Notifications({ onOpenProfile }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  /** fixed position, measured from the bell and clamped inside the viewport */
  const [pos, setPos] = useState(null);
  const known = useRef(new Set());
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/api/notifications");
      const fresh = data.items.filter((n) => !known.current.has(n.id));
      for (const n of data.items) known.current.add(n.id);
      setItems(data.items);
      setUnread(data.unread);
      if (!firstLoad.current && fresh.length) {
        playSound("message");
        const latest = fresh[0];
        toast(latest.title + (fresh.length > 1 ? ` (+${faNum(fresh.length - 1)})` : ""), "info");
      }
      firstLoad.current = false;
    } catch {
      /* session problems are handled globally */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  // Place the panel next to the bell, fully inside the window (it used to overflow to one side).
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const bell = rootRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!bell) return;
      const width = panel?.width ?? 352;
      const height = panel?.height ?? 420;
      const gap = 8;
      // Prefer opening toward the page content (to the left of the bell in RTL), then clamp.
      const wanted = bell.left - width + bell.width;
      const left = Math.min(Math.max(gap, wanted), window.innerWidth - width - gap);
      const top = Math.min(bell.bottom + gap, window.innerHeight - height - gap);
      setPos({ top: Math.max(gap, top), left });
    };
    place();
    const raf = window.requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
    };
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAll() {
    setBusy(true);
    try {
      const r = await apiFetch("/api/notifications/read", { method: "PATCH", json: { ids: [] } });
      setUnread(r.unread);
      setItems((list) => list.map((n) => ({ ...n, read: true })));
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    setBusy(true);
    try {
      await apiFetch("/api/notifications", { method: "DELETE" });
      setItems([]);
      setUnread(0);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function activate(n) {
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    void apiFetch("/api/notifications/read", { method: "PATCH", json: { ids: [n.id] } })
      .then((r) => setUnread(r.unread))
      .catch(() => {});
    setOpen(false);
    if (n.kind === "friend-request") navigate("/");
    else if (n.path) navigate(n.path);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="اعلان‌ها"
        aria-expanded={open}
        title="اعلان‌ها"
        className={`press relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
          open ? "bg-accent/20 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"
        }`}
      >
        <Icon name="bell" size={19} />
        {unread > 0 && (
          <span className="anim-badge absolute -left-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-surface">
            {faNum(unread > 99 ? 99 : unread)}
          </span>
        )}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className="anim-rise fixed z-[80] flex max-h-[min(70vh,32rem)] w-[min(92vw,22rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
          style={pos ? { top: pos.top, left: pos.left, visibility: "visible" } : { top: -9999, left: -9999, visibility: "hidden" }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
            <h3 className="flex-1 text-sm font-black">اعلان‌ها</h3>
            {onOpenProfile && (
              <button onClick={() => { setOpen(false); onOpenProfile(); }} className="rounded-md px-2 py-1 text-[11px] text-muted hover:text-accent">
                پروفایل
              </button>
            )}
            <button onClick={() => void markAll()} disabled={busy || !unread} className="rounded-md px-2 py-1 text-[11px] text-accent disabled:opacity-40">
              خواندن همه
            </button>
            <button onClick={() => void clearAll()} disabled={busy || !items.length} className="rounded-md px-2 py-1 text-[11px] text-rose-400 disabled:opacity-40">
              پاک کردن
            </button>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <Icon name="bell" size={20} />
                </span>
                <p className="text-sm font-bold">اعلانی ندارید</p>
                <p className="text-[11px] text-muted">درخواست دوستی، دعوت به جلسه و اقدامات مدیر اینجا نشان داده می‌شود.</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => activate(n)}
                  className={`flex w-full items-start gap-3 rounded-lg p-3 text-right transition hover:bg-surface-2 ${n.read ? "opacity-70" : ""}`}
                >
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${n.read ? "bg-surface-2 text-muted" : "bg-accent/15 text-accent"}`}>
                    <Icon name={KIND_ICON[n.kind] ?? "info"} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold">{n.title}</span>
                      {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">{n.body}</span>
                    <span className="mt-1 block text-[10px] text-muted/70">{shortTime(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
