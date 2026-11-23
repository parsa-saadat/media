import { Icon } from "./Icon";

export const STATUS_META = {
  online: { label: "آنلاین", color: "#22c55e", ring: "ring-emerald-400/30" },
  idle: { label: "کم‌حضور", color: "#f59e0b", ring: "ring-amber-400/30" },
  dnd: { label: "مزاحم نشوید", color: "#ef4444", ring: "ring-rose-400/30" },
  offline: { label: "آفلاین", color: "#6b7280", ring: "ring-line" },
};

export const MY_STATUS_META = {
  online: { label: "آنلاین (خودکار)", color: "#22c55e", hint: "وقتی در اپ هستید آنلاین و هنگام خروج خودکار آفلاین می‌شوید" },
  idle: { label: "کم‌حضور (دستی)", color: "#f59e0b", hint: "انتخاب دستی: نشان می‌دهد پای سیستم نیستید یا کم‌حضورید" },
  dnd: { label: "مزاحم نشوید (دستی)", color: "#ef4444", hint: "انتخاب دستی: آنلاین هستید اما مایل به مزاحمت نیستید" },
  invisible: { label: "نامرئی / آفلاین", color: "#6b7280", hint: "حتی زمان حضور در برنامه، به دیگران آفلاین نشان داده می‌شوید" },
};

/** What others see for my own chosen status ("invisible" reads as offline). */
export const toPresence = (status, lastSeenAt) => {
  if (!status || status === "invisible" || status === "offline") return "offline";
  if (lastSeenAt !== undefined && lastSeenAt !== null) {
    const stale = Date.now() - new Date(lastSeenAt).getTime() > 75_000;
    if (stale) return "offline";
  }
  return STATUS_META[status] ? status : "online";
};

/** Small presence dot. */
export function StatusDot({ status, size = 11, className = "" }) {
  const meta = STATUS_META[status] || STATUS_META.offline;
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      className={`inline-block shrink-0 rounded-full ring-2 ${meta.ring} ${className}`}
      style={{ width: size, height: size, background: meta.color }}
    />
  );
}

/**
 * Presence dot plus clear status label (`آنلاین` / `آفلاین` / `کم‌حضور` / `مزاحم نشوید`)
 * and optional custom status text/emoji when not offline.
 */
export function StatusLine({
  status,
  text,
  emoji,
  className = "",
}) {
  const resolved = STATUS_META[status] ? status : "offline";
  const meta = STATUS_META[resolved];
  const isOffline = resolved === "offline";
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-[11px] ${className}`}>
      <StatusDot status={resolved} size={8.5} />
      <span
        className={`shrink-0 font-bold ${
          resolved === "online"
            ? "text-emerald-500"
            : resolved === "idle"
              ? "text-amber-500"
              : resolved === "dnd"
                ? "text-rose-500"
                : "text-muted"
        }`}
      >
        {meta.label}
      </span>
      {!isOffline && (text || emoji) && (
        <>
          <span className="text-muted/50">·</span>
          <span className="truncate text-muted" title={text}>
            {emoji && <span className="me-1">{emoji}</span>}
            {text}
          </span>
        </>
      )}
    </span>
  );
}

/** The status picker used in the profile card: manual presence choice + custom emoji & text. */
export function StatusPicker({
  value,
  text,
  emoji,
  onChange,
}) {
  const options = Object.entries(MY_STATUS_META);
  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map(([id, meta]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ status: id, statusText: text, statusEmoji: emoji })}
            aria-pressed={value === id}
            className={`no-glass-btn flex items-center gap-2.5 rounded-xl border p-3 text-right transition ${
              value === id
                ? "border-accent/55 bg-accent/14 ring-1 ring-accent/35"
                : "border-line bg-surface-2/80 hover:bg-surface-3"
            }`}
          >
            <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-line" style={{ background: meta.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-black text-fg sm:text-sm">{meta.label}</span>
              <span className="mt-0.5 block line-clamp-2 text-[10.5px] leading-4 text-muted">{meta.hint}</span>
            </span>
            {value === id && <Icon name="check" size={15} className="ms-auto shrink-0 text-accent" />}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface-2/70 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted">
          <Icon name="smile" size={13} className="text-accent" /> ایموجی وضعیت دلخواه (اختیاری)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {["", "🙂", "😎", "😴", "🎯", "☕", "🎧", "📚", "💪", "🌙", "🔥"].map((e) => (
            <button
              key={e || "none"}
              type="button"
              onClick={() => onChange({ status: value, statusText: text, statusEmoji: e })}
              aria-pressed={emoji === e}
              className={`no-glass-btn flex h-9 min-w-9 items-center justify-center rounded-xl border px-2 text-base transition ${
                emoji === e ? "border-accent bg-accent/20 ring-1 ring-accent/40" : "border-line bg-surface hover:bg-surface-3"
              }`}
            >
              {e || <span className="text-[10px] font-bold text-muted">بدون</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface-2/70 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted">
          <Icon name="edit" size={13} className="text-accent" /> متن وضعیت دلخواه (اختیاری)
        </p>
        <input
          value={text}
          onChange={(e) => onChange({ status: value, statusText: e.target.value.slice(0, 60), statusEmoji: emoji })}
          placeholder="مثلاً: در جلسه‌ام، در حال مطالعه…"
          aria-label="متن وضعیت"
          maxLength={60}
          className="ring-glow w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-muted/70"
        />
      </div>
    </div>
  );
}
