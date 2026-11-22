import { useEffect, useRef, useState } from "react";

/**
 * Microphone levels change many times per second. Pushing them through React state re-renders the
 * whole call screen on every frame, which is what made tiles visibly jump while somebody spoke.
 * This store hands levels straight to the few elements that draw them, so nothing else re-renders.
 */
const listeners = new Set();
let current = 0;

export function emitMicLevel(level) {
  current = level;
  for (const l of listeners) l(level);
}

export function getMicLevel() {
  return current;
}

export function subscribeMicLevel(listener) {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Turns a raw level into a stable "is speaking" signal: it turns on above `onThreshold` and only
 * releases below `offThreshold`, then stays on for `holdMs`. Without this hysteresis a normal voice
 * flickers on and off several times a second.
 */
export function createSpeakingDetector({ onThreshold = 14, offThreshold = 5, holdMs = 700 } = {}) {
  let speaking = false;
  let releaseAt = 0;
  return {
    get: () => speaking,
    /** returns true when the state actually changed */
    push(level) {
      const now = Date.now();
      if (!speaking) {
        if (level >= onThreshold) {
          speaking = true;
          releaseAt = now + holdMs;
          return true;
        }
        return false;
      }
      if (level >= offThreshold) {
        releaseAt = now + holdMs;
        return false;
      }
      if (now >= releaseAt) {
        speaking = false;
        return true;
      }
      return false;
    },
    reset() {
      const was = speaking;
      speaking = false;
      releaseAt = 0;
      return was;
    },
  };
}

/** A level meter that redraws itself without re-rendering its parent. */
export function MicMeter({
  active,
  bars = 12,
  className = "",
  barClassName = "h-2.5 w-1.5 rounded-full",
  onColor = "bg-emerald-400",
  hotColor = "bg-amber-400",
  offColor = "bg-white/12",
}) {
  const refs = useRef([]);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const paint = (level) => {
      const lit = activeRef.current ? Math.round((Math.min(100, level) / 100) * bars) : 0;
      for (let i = 0; i < bars; i++) {
        const el = refs.current[i];
        if (!el) continue;
        const want = i < lit ? (i > bars - 3 ? hotColor : onColor) : offColor;
        if (el.className !== `${barClassName} ${want} transition-colors duration-100`) {
          el.className = `${barClassName} ${want} transition-colors duration-100`;
        }
      }
    };
    paint(getMicLevel());
    return subscribeMicLevel(paint);
  }, [bars, barClassName, hotColor, offColor, onColor]);

  return (
    <div className={`flex items-center gap-1 ${className}`} aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={`${barClassName} ${offColor} transition-colors duration-100`}
        />
      ))}
    </div>
  );
}

/** Percentage value of my own mic level, for width-based bars; updates without re-rendering parents. */
export function useMicLevel(active, intervalMs = 90) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    let frame = 0;
    let last = -1;
    const unsubscribe = subscribeMicLevel((value) => {
      // throttle state updates; a bar does not need 60fps
      const now = performance.now();
      if (Math.abs(value - last) < 4 && now - frame < intervalMs) return;
      frame = now;
      last = value;
      setLevel(value);
    });
    return unsubscribe;
  }, [active, intervalMs]);
  return level;
}
