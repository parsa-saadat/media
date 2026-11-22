import { useEffect, useState } from "react";
import { faNum } from "../../utils/client";

const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

/**
 * Interactive theme-aware 3D-styled dice with tumble animation on rollSeq changes
 * and realistic cycling pips while busy.
 */
export function Dice({ value, rollKey, rolling, disabled, onRoll, label, accentColor }) {
  const [spinCount, setSpinCount] = useState(0);
  const [scrambleFace, setScrambleFace] = useState(null);

  useEffect(() => {
    if (rollKey === undefined || rollKey === null) return;
    setSpinCount((n) => n + 1);
  }, [rollKey]);

  useEffect(() => {
    if (!rolling) {
      setScrambleFace(null);
      return;
    }
    const id = setInterval(() => {
      setScrambleFace(Math.floor(Math.random() * 6) + 1);
    }, 85);
    return () => clearInterval(id);
  }, [rolling]);

  const shown = scrambleFace ?? value ?? null;
  const pips = shown ? PIPS[shown] ?? PIPS[6] : null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3" dir="rtl">
      <button
        type="button"
        disabled={disabled || rolling}
        onClick={onRoll}
        aria-label={label ?? "پرتاب تاس"}
        style={accentColor && !disabled ? { borderColor: accentColor, boxShadow: `0 8px 24px -6px ${accentColor}66` } : undefined}
        className={`group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 bg-surface-2 shadow-lg transition ${
          disabled
            ? "cursor-default border-line/70 opacity-65"
            : "cursor-pointer border-accent hover:scale-105 hover:bg-surface-3 active:scale-95"
        }`}
      >
        <svg
          key={spinCount}
          viewBox="0 0 100 100"
          className={`h-11 w-11 ${rolling ? "animate-spin" : spinCount > 0 ? "animate-[dice-roll_450ms_ease-out]" : ""}`}
        >
          <rect
            x="6"
            y="6"
            width="88"
            height="88"
            rx="18"
            style={{ fill: "var(--surface-3)", stroke: accentColor && !disabled ? accentColor : "var(--line)" }}
            strokeWidth="3.5"
          />
          {pips ? (
            pips.map(([cx, cy], i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r="8.5"
                style={{ fill: shown === 6 ? (accentColor || "var(--accent)") : "var(--fg)" }}
              />
            ))
          ) : (
            <text
              x="50"
              y="60"
              textAnchor="middle"
              fontSize="34"
              fontWeight="900"
              style={{ fill: "var(--muted)" }}
            >
              ؟
            </text>
          )}
        </svg>
        {shown !== null && !rolling && (
          <span
            className="absolute -top-2 -left-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black text-white shadow"
            style={{ background: accentColor || "var(--accent)" }}
          >
            {faNum(shown)}
          </span>
        )}
      </button>
      {label && (
        <button
          type="button"
          disabled={disabled || rolling}
          onClick={onRoll}
          className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            disabled
              ? "cursor-default bg-surface-2 text-muted"
              : "grad-accent press cursor-pointer text-on-accent shadow-md hover:brightness-110"
          }`}
        >
          {rolling ? "در حال پرتاب…" : label}
        </button>
      )}
    </div>
  );
}
