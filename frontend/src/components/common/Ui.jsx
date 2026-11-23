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
  const resolvedStatus = status
    ? STATUS_META[status]
      ? status
      : "offline"
    : online !== undefined
      ? online
        ? "online"
        : "offline"
      : lastSeenAt !== undefined
        ? isOnline(lastSeenAt)
          ? "online"
          : "offline"
        : null;
  const showDot = resolvedStatus !== null;
  const dotColor = resolvedStatus ? STATUS_META[resolvedStatus].color : "#22c55e";
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
      {showDot && (
        <span
          className="absolute -bottom-0.5 -left-0.5 flex items-center justify-center rounded-full border-2 border-surface transition-colors duration-300"
          style={{ width: dotSize, height: dotSize, background: dotColor }}
          title={resolvedStatus ? STATUS_META[resolvedStatus].label : ""}
        >
          {resolvedStatus === "dnd" && <span className="block rounded-full bg-white" style={{ width: dotSize * 0.48, height: dotSize * 0.16 }} />}
          {resolvedStatus === "idle" && <span className="block rounded-full bg-surface" style={{ width: dotSize * 0.42, height: dotSize * 0.42 }} />}
          {resolvedStatus === "offline" && <span className="block rounded-full bg-surface" style={{ width: dotSize * 0.4, height: dotSize * 0.4 }} />}
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
  maxWidthClass,
  bodyClassName,
  noBodyScroll = false,
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" onMouseDown={onClose}>
      <div className="anim-fade-in absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className={`anim-rise relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface/92 shadow-2xl backdrop-blur-2xl ${
          maxWidthClass || (wide ? "max-w-2xl" : "max-w-md")
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5 sm:px-6 sm:py-4">
          <h3 className="text-base font-black sm:text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg"
            aria-label="بستن"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div
          className={`min-h-0 flex-1 ${
            noBodyScroll ? "overflow-hidden" : "scroll-thin overflow-y-auto"
          } ${bodyClassName || "p-5 sm:p-6"}`}
        >
          {children}
        </div>
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
    primary: "border border-accent/45 bg-accent/20 text-accent shadow-[0_6px_22px_rgb(var(--glow)/0.18)] backdrop-blur-md hover:bg-accent/30 hover:border-accent/65",
    soft: "border border-accent/30 bg-accent/14 text-accent backdrop-blur-md hover:bg-accent/24",
    ghost: "border border-line bg-surface-2/80 text-fg backdrop-blur-md hover:bg-surface-3",
    danger: "border border-rose-400/35 bg-rose-500/15 text-rose-300 backdrop-blur-md hover:bg-rose-500/25 hover:border-rose-400/55",
  }[variant];
  return (
    <button
      {...props}
      className={`press inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      className={`ring-glow w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-fg transition ${
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

export function Empty({ icon, title, text, action }) {
  return (
    <div className="mx-1 my-4 flex flex-col items-center justify-center rounded-2xl border border-line/80 bg-gradient-to-b from-surface-2/65 via-surface/75 to-surface/40 px-5 py-8 text-center shadow-sm">
      <div className="relative mb-3.5 flex h-16 w-16 items-center justify-center">
        <span
          className="pointer-events-none absolute inset-0 rounded-2xl blur-xl opacity-45"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
        />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15 text-accent shadow-inner">
          <Icon name={icon} size={25} strokeWidth={1.8} />
        </span>
      </div>
      <p className="text-sm font-black text-fg">{title}</p>
      {text && <p className="mt-1.5 max-w-[230px] text-xs leading-6 text-muted">{text}</p>}
      {action && <div className="mt-3.5">{action}</div>}
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
