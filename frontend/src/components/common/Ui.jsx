import { useEffect } from "react";
import { isOnline } from "../../utils/client";
import { useAvatarUrl } from "../../utils/avatarCache";
import { STATUS_META } from "./StatusDot";
import { Glyph, Icon } from "./Icon";

export function Avatar({
  name,
  color,
  size = 40,
  emoji,
  online,
  lastSeenAt,
  className = "",
  userId,
  avatarFileId,
  status,
}) {
  const showOnline = status ? status === "online" || status === "dnd" || status === "idle" : online ?? (lastSeenAt !== undefined ? isOnline(lastSeenAt) : false);
  const dotColor = status ? STATUS_META[status].color : "#34d399";
  const dotSize = Math.max(10, size * 0.26);
  const initials = (name || "?").trim().slice(0, 1).toUpperCase();
  const photo = useAvatarUrl(userId, avatarFileId);
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-xl font-bold text-white shadow-inner transition-transform duration-300 ${
          emoji ? "border border-white/10 bg-surface-2 text-accent" : ""
        }`}
        style={
          emoji
            ? { background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, var(--surface-2)), color-mix(in srgb, var(--accent-2) 16%, var(--surface-2)))" }
            : {
                background: `linear-gradient(135deg, ${color || "#8b5cf6"}, color-mix(in srgb, ${color || "#8b5cf6"} 55%, #000))`,
                fontSize: size * 0.42,
              }
        }
      >
        {photo ? (
          <img src={photo} alt={name} className="anim-fade-in h-full w-full object-cover" draggable={false} />
        ) : emoji ? (
          <Glyph value={emoji} size={size * 0.5} strokeWidth={1.7} />
        ) : (
          initials
        )}
      </div>
      {showOnline && (
        <span
          className="absolute -bottom-0.5 -left-0.5 flex items-center justify-center rounded-full border-2 border-surface transition-colors duration-300"
          style={{ width: dotSize, height: dotSize, background: dotColor }}
          title={status ? STATUS_META[status].label : "آنلاین"}
        >
          {status === "dnd" && <span className="block rounded-full bg-surface" style={{ width: dotSize * 0.45, height: dotSize * 0.16 }} />}
          {status === "idle" && <span className="block rounded-full border-surface" style={{ width: dotSize * 0.42, height: dotSize * 0.42, background: "var(--surface)" }} />}
        </span>
      )}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="anim-fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`anim-rise relative max-h-[90vh] w-full overflow-hidden rounded-xl border border-line bg-surface shadow-2xl ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg"
            aria-label="بستن"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="scroll-thin max-h-[calc(90vh-70px)] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}) {
  const styles = {
    primary: "grad-accent text-on-accent glow hover:brightness-110",
    soft: "bg-accent/15 text-accent hover:bg-accent/25",
    ghost: "bg-surface-2 text-fg hover:bg-surface-3",
    danger: "bg-rose-500/15 text-rose-400 hover:bg-rose-500/25",
  }[variant];
  return (
    <button
      {...props}
      className={`press inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      className={`ring-glow w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted/70 transition ${
        props.className || ""
      }`}
    />
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted/80">{hint}</span>}
    </label>
  );
}

export function Empty({ icon, title, text }) {
  return (
    <div className="flex items-center gap-4 px-6 py-10">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <Icon name={icon} size={24} />
      </div>
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        {text && <p className="mt-1 max-w-xs text-sm leading-6 text-muted">{text}</p>}
      </div>
    </div>
  );
}

export function Logo({ size = 36, showText = true }) {
  return (
    <div className="flex items-center gap-2.5" dir="ltr">
      <div
        className="grad-accent glow flex items-center justify-center rounded-xl font-black text-white"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v16" />
          <circle cx="12" cy="4" r="1.2" fill="currentColor" stroke="none" />
          <path d="M6 9l6 6 6-6" opacity=".65" />
        </svg>
      </div>
      {showText && <span className="text-lg font-black tracking-tight text-fg">inebuly</span>}
    </div>
  );
}
