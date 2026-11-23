import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, faNum, shortTime, toast } from "../../utils/client";
import { navigate } from "../../utils/router";
import { Icon } from "./Icon";
import { playSound } from "../../utils/sounds";

const KIND_ICON = {
  message: "chat",
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

/** Bell + drop-down panel. Polls every 10s, plays a sound and shows a toast for new non-message items. */
export default function Notifications({ onOpenProfile, onOpenConversation }) {
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
        // Incoming chat messages have a dedicated fast rich toast in Chat.jsx; avoid duplicate bell toast if on Chat screen
        const nonMessageFresh = fresh.filter((n) => n.kind !== "message" || !onOpenConversation);
        if (nonMessageFresh.length) {
          playSound("message");
          const latest = nonMessageFresh[0];
          toast(
            latest.title + (nonMessageFresh.length > 1 ? ` (+${faNum(nonMessageFresh.length - 1)})` : ""),
            "info",
          );
        }
      }
      firstLoad.current = false;
    } catch {
      /* session problems are handled globally */
    }
  }, [onOpenConversation]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  // Place the panel next to the bell, clear of the nav rail and fully inside the viewport.
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
      const gap = 10;
      const desktopRail = window.innerWidth >= 768 && bell.right > window.innerWidth - 96;
      if (desktopRail) {
        // Open cleanly to the left of the RTL nav rail, aligned near the bottom of the bell
        const wantedLeft = bell.left - width - gap;
        const left = Math.min(Math.max(gap, wantedLeft), window.innerWidth - width - gap);
        const wantedTop = bell.bottom - height;
        const top = Math.min(Math.max(gap, wantedTop), window.innerHeight - height - gap);
        setPos({ top, left });
        return;
      }
      // Mobile / top-header bell: open below the bell, clamped inside the viewport
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
    if (n.kind === "message" && n.conversationId) {
      if (onOpenConversation) {
        onOpenConversation(n.conversationId);
      } else {
        navigate(`/?chat=${encodeURIComponent(n.conversationId)}`);
      }
      return;
    }
    if (n.kind === "friend-request") navigate("/");
    else if (n.path) navigate(n.path);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="اعلان‌ها"
        aria-expanded={open}
        className={`group press relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
          open ? "bg-accent/20 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"
        }`}
      >
        <Icon name="bell" size={19} />
        {unread > 0 && (
          <span className="anim-badge absolute -left-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-surface">
            {faNum(unread > 99 ? 99 : unread)}
          </span>
        )}
        <span
          className={`pointer-events-none absolute right-[calc(100%+10px)] top-1/2 z-[140] hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-line px-2.5 py-1 text-[11px] font-bold text-fg shadow-xl transition popover-blur md:block ${
            open ? "opacity-0" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          اعلان‌ها
        </span>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          dir="rtl"
          className="popover-blur anim-rise fixed z-[130] flex max-h-[min(70vh,32rem)] w-[min(92vw,22rem)] flex-col overflow-hidden rounded-2xl border border-line text-fg shadow-2xl"
          style={pos ? { top: pos.top, left: pos.left, visibility: "visible" } : { top: -9999, left: -9999, visibility: "hidden" }}
        >
          <div className="flex shrink-0 items-center gap-1.5 border-b border-line/80 bg-surface-2/40 px-4 py-3">
            <h3 className="flex-1 text-sm font-black text-fg">اعلان‌ها</h3>
            {onOpenProfile && (
              <button onClick={() => { setOpen(false); onOpenProfile(); }} className="rounded-lg px-2 py-1 text-[11px] font-bold text-muted transition hover:bg-surface-2 hover:text-accent">
                پروفایل
              </button>
            )}
            <button onClick={() => void markAll()} disabled={busy || !unread} className="rounded-lg px-2 py-1 text-[11px] font-bold text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:text-muted/55">
              خواندن همه
            </button>
            <button onClick={() => void clearAll()} disabled={busy || !items.length} className="rounded-lg px-2 py-1 text-[11px] font-bold text-rose-400 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:text-muted/55">
              پاک کردن
            </button>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2.5">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent/25 bg-accent/12 text-accent">
                  <Icon name="bell" size={21} />
                </span>
                <p className="text-sm font-black text-fg">اعلانی ندارید</p>
                <p className="max-w-[240px] text-xs leading-6 text-muted">درخواست دوستی، دعوت به جلسه و پیام‌های تازه در این بخش نمایش داده می‌شود.</p>
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
