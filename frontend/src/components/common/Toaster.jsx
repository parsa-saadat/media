import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Avatar } from "./Ui";

export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let n = 0;
    const onToast = (e) => {
      const d = e.detail || {};
      const id = ++n;
      const duration = d.kind === "incoming-message" ? 5200 : d.duration || 3800;
      setItems((x) => {
        // Keep max 4 visible toasts cleanly
        const next = [...x, { ...d, id }];
        return next.slice(-4);
      });
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), duration);
    };
    window.addEventListener("voxsy-toast", onToast);
    return () => window.removeEventListener("voxsy-toast", onToast);
  }, []);

  const dismiss = (id) => setItems((x) => x.filter((i) => i.id !== id));

  const messageToasts = items.filter((t) => t.kind === "incoming-message");
  const regularToasts = items.filter((t) => t.kind !== "incoming-message");

  return (
    <>
      {/* Top-center sleek incoming message popup cards */}
      {messageToasts.length > 0 && (
        <div
          dir="rtl"
          className="pointer-events-none fixed left-1/2 top-4 z-[110] flex w-[min(94vw,24rem)] -translate-x-1/2 flex-col gap-2"
        >
          {messageToasts.map((t) => (
            <div
              key={t.id}
              role="status"
              onClick={() => {
                dismiss(t.id);
                t.onClick?.();
              }}
              className="anim-rise pointer-events-auto group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border border-accent/35 bg-surface/88 px-3.5 py-3 text-right shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition hover:border-accent/65 hover:bg-surface"
            >
              <div className="pointer-events-none absolute inset-y-0 right-0 w-1 bg-accent" />
              <Avatar
                name={t.senderName || t.title || "?"}
                color={t.avatarColor || "#7c3aed"}
                size={42}
                userId={t.senderId}
                avatarFileId={t.avatarFileId}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[9.5px] font-black text-accent">
                    <Icon name="chat" size={11} /> پیام جدید
                  </span>
                  <span className="truncate text-xs font-black text-fg">{t.title}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted group-hover:text-fg/90">
                  {t.body || t.message}
                </p>
              </div>
              <button
                type="button"
                aria-label="بستن اعلان"
                onClick={(ev) => {
                  ev.stopPropagation();
                  dismiss(t.id);
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line/60 bg-surface-2/70 text-muted transition hover:bg-surface-3 hover:text-fg"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Standard bottom status toasts */}
      {regularToasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
          {regularToasts.map((t) => (
            <div
              key={t.id}
              onClick={() => {
                if (t.onClick) {
                  dismiss(t.id);
                  t.onClick();
                }
              }}
              className={`anim-rise pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur-xl glass ${
                t.onClick ? "cursor-pointer" : ""
              } ${
                t.kind === "error"
                  ? "border-rose-500/40 text-rose-300"
                  : t.kind === "success"
                    ? "border-emerald-500/40 text-emerald-300"
                    : "border-line text-fg"
              }`}
            >
              <span
                className={
                  t.kind === "error"
                    ? "text-rose-400"
                    : t.kind === "success"
                      ? "text-emerald-400"
                      : "text-accent"
                }
              >
                <Icon
                  name={t.kind === "error" ? "ban" : t.kind === "success" ? "check" : "chat"}
                  size={16}
                />
              </span>
              {t.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
