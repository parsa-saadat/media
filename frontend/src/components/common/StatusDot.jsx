import { Icon } from "./Icon";

export const STATUS_META = {
  online: { label: "آنلاین", color: "#22c55e", ring: "ring-emerald-400/30" },
  idle: { label: "کم‌حضور", color: "#f59e0b", ring: "ring-amber-400/30" },
  dnd: { label: "مزاحم نشوید", color: "#ef4444", ring: "ring-rose-400/30" },
  offline: { label: "آفلاین", color: "#6b7280", ring: "ring-white/10" },
};

export const MY_STATUS_META = {
  online: { label: "آنلاین", color: "#22c55e", hint: "دیگران شما را آنلاین می‌بینند" },
  idle: { label: "کم‌حضور", color: "#f59e0b", hint: "نشان می‌دهد مدتی است فعال نبوده‌اید" },
  dnd: { label: "مزاحم نشوید", color: "#ef4444", hint: "آنلاین هستید ولی اعلان‌ها بی‌صدا می‌مانند" },
  invisible: { label: "نامرئی", color: "#6b7280", hint: "به همه آفلاین نشان داده می‌شوید" },
};

/** What others see for my own chosen status ("invisible" reads as offline). */
export const toPresence = (status) =>
  !status || status === "invisible" ? "offline" : status;

/** Small presence dot, optionally with the Discord-style status text next to it. */
export function StatusDot({ status, size = 11, className = "" }) {
  const meta = STATUS_META[status ?? "offline"];
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      className={`inline-block shrink-0 rounded-full ring-2 ${meta.ring} ${className}`}
      style={{ width: size, height: size, background: meta.color }}
    />
  );
}

/** Presence dot plus optional custom status text/emoji (Discord-style). */
export function StatusLine({
  status,
  text,
  emoji,
  className = "",
}) {
  const meta = STATUS_META[status ?? "offline"];
  return (
    <span className={`flex min-w-0 items-center gap-1.5 text-[11px] ${className}`}>
      <StatusDot status={status} size={9} />
      {text ? (
        <span className="truncate text-muted" title={text}>
          {emoji && <span className="ml-1">{emoji}</span>}
          {text}
        </span>
      ) : (
        <span className="text-muted">{meta.label}</span>
      )}
    </span>
  );
}

/** The status picker used in the profile card: presence choice, then emoji and text live in
    two separate sections — the emoji field only accepts an emoji, the text field only text. */
export function StatusPicker({
  value,
  text,
  emoji,
  onChange,
}) {
  const options = Object.entries(MY_STATUS_META);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {options.map(([id, meta]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ status: id, statusText: text, statusEmoji: emoji })}
            aria-pressed={value === id}
            className={`flex items-center gap-2.5 rounded-lg p-3 text-right transition ${
              value === id ? "bg-accent/10 ring-1 ring-accent" : "bg-surface-2 hover:bg-surface-3"
            }`}
          >
            <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white/10" style={{ background: meta.color }} />
            <span className="min-w-0">
              <span className="block text-sm font-bold">{meta.label}</span>
              <span className="block truncate text-[10px] text-muted">{meta.hint}</span>
            </span>
            {value === id && <Icon name="check" size={15} className="ms-auto shrink-0 text-accent" />}
          </button>
        ))}
      </div>

      <div className="rounded-lg bg-surface-2 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted"><Icon name="smile" size={13} className="text-accent" /> بخش اول: فقط ایموجی حالت</p>
        <div className="flex flex-wrap gap-1.5">
          {["🙂", "😎", "😴", "🎯", "☕", "🎧", "📚", "💪", "🌙", "🔥"].map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onChange({ status: value, statusText: text, statusEmoji: e })}
              aria-pressed={emoji === e}
              className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg transition ${emoji === e ? "bg-accent/20 ring-1 ring-accent" : "bg-surface-3 hover:bg-surface-2"}`}
            >
              {e}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-muted">ایموجی انتخابی: <span className="text-base">{emoji || "—"}</span> — فقط از این بخش تنظیم می‌شود</p>
      </div>

      <div className="rounded-lg bg-surface-2 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted"><Icon name="edit" size={13} className="text-accent" /> بخش دوم: فقط متن حالت</p>
        <input
          value={text}
          onChange={(e) => onChange({ status: value, statusText: e.target.value.slice(0, 60), statusEmoji: emoji })}
          placeholder="وضعیت دلخواه… مثلاً: در جلسه‌ام"
          aria-label="متن وضعیت"
          maxLength={60}
          className="ring-glow w-full rounded-lg bg-surface px-4 py-2.5 text-sm outline-none"
        />
        <p className="mt-1.5 text-[10px] text-muted">در این بخش فقط متن بنویسید؛ ایموجی اینجا وارد نمی‌شود.</p>
      </div>
    </div>
  );
}
