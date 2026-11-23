import { useCallback, useEffect, useRef, useState } from "react";

const MARGIN = 14;

/**
 * Draggable Picture-in-Picture / Mini-Window container.
 * - Smoothly follows pointer/touch with zero transition lag while dragging (`will-change: transform`).
 * - Snaps with a silky spring physics curve (`cubic-bezier(0.22, 1, 0.36, 1)`) to the nearest
 *   viewport edge/corner on release and stays clamped on window resize!
 */
export default function DraggablePiP({
  storageKey = "inebuly-pip-pos",
  defaultCorner = "bottom-right", // "bottom-right" | "bottom-left" | "top-right" | "top-left"
  className = "",
  children,
}) {
  const boxRef = useRef(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startPtrRef = useRef({ x: 0, y: 0, origX: 0, origY: 0 });
  const [dragging, setDragging] = useState(false);

  const computeInitial = useCallback(() => {
    if (typeof window === "undefined") return { x: MARGIN, y: MARGIN };
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
        return {
          x: Math.max(MARGIN, Math.min(window.innerWidth - 280, saved.x)),
          y: Math.max(MARGIN, Math.min(window.innerHeight - 100, saved.y)),
        };
      }
    } catch {}
    const w = 340;
    const h = 92;
    const isRight = defaultCorner.includes("right");
    const isBottom = defaultCorner.includes("bottom");
    return {
      x: isRight ? Math.max(MARGIN, window.innerWidth - w - MARGIN) : MARGIN,
      y: isBottom ? Math.max(MARGIN, window.innerHeight - h - MARGIN) : MARGIN,
    };
  }, [defaultCorner, storageKey]);

  const [pos, setPos] = useState(computeInitial);
  const posRef = useRef(pos);
  posRef.current = pos;

  const clampAndSnap = useCallback(
    (rawX, rawY, snapEdge = true) => {
      if (typeof window === "undefined") return { x: rawX, y: rawY };
      const rect = boxRef.current?.getBoundingClientRect();
      const w = rect?.width || 330;
      const h = rect?.height || 86;
      const maxX = Math.max(MARGIN, window.innerWidth - w - MARGIN);
      const maxY = Math.max(MARGIN, window.innerHeight - h - MARGIN);
      let x = Math.min(maxX, Math.max(MARGIN, rawX));
      const y = Math.min(maxY, Math.max(MARGIN, rawY));
      if (snapEdge) {
        // Magnetic horizontal edge snap if near left/right edge, while allowing free placement anywhere along edges/corners!
        const centerX = x + w / 2;
        if (x < 72) x = MARGIN;
        else if (window.innerWidth - (x + w) < 72) x = maxX;
        else if (Math.abs(centerX - window.innerWidth / 2) > window.innerWidth * 0.16) {
          x = centerX < window.innerWidth / 2 ? MARGIN : maxX;
        }
      }
      return { x, y };
    },
    [],
  );

  useEffect(() => {
    const onResize = () => {
      setPos((prev) => clampAndSnap(prev.x, prev.y, false));
    };
    // Initial clamp after first paint once real width/height is known
    const raf = requestAnimationFrame(() => {
      setPos((prev) => clampAndSnap(prev.x, prev.y, false));
    });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [clampAndSnap]);

  const onPointerDown = (e) => {
    // Ignore drags starting directly on interactive controls (buttons, inputs, sliders) unless dragging handle
    if (
      e.button !== 0 ||
      (e.target.closest("button, input, select, a") && !e.target.closest("[data-pip-handle]"))
    ) {
      return;
    }
    const el = boxRef.current;
    if (!el) return;
    draggingRef.current = true;
    movedRef.current = false;
    startPtrRef.current = {
      x: e.clientX,
      y: e.clientY,
      origX: posRef.current.x,
      origY: posRef.current.y,
    };
    el.setPointerCapture?.(e.pointerId);

    const onMove = (ev) => {
      if (!draggingRef.current) return;
      const dx = ev.clientX - startPtrRef.current.x;
      const dy = ev.clientY - startPtrRef.current.y;
      if (!movedRef.current && Math.hypot(dx, dy) > 4) {
        movedRef.current = true;
        setDragging(true);
      }
      if (movedRef.current) {
        const next = clampAndSnap(startPtrRef.current.origX + dx, startPtrRef.current.origY + dy, false);
        setPos(next);
      }
    };

    const onUp = (ev) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (movedRef.current) {
        const dx = ev.clientX - startPtrRef.current.x;
        const dy = ev.clientY - startPtrRef.current.y;
        const snapped = clampAndSnap(startPtrRef.current.origX + dx, startPtrRef.current.origY + dy, true);
        setPos(snapped);
        try {
          localStorage.setItem(storageKey, JSON.stringify(snapped));
        } catch {}
        // Suppress accidental click right after dragging
        window.setTimeout(() => {
          movedRef.current = false;
        }, 60);
      }
      setDragging(false);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  const onClickCapture = (e) => {
    if (movedRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div
      ref={boxRef}
      dir="rtl"
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0) scale(${dragging ? 1.025 : 1})`,
        transition: dragging
          ? "box-shadow 0.2s ease"
          : "transform 0.44s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.25s ease",
        willChange: "transform",
        touchAction: "none",
      }}
      className={`fixed z-50 select-none ${dragging ? "cursor-grabbing shadow-[0_28px_70px_rgba(0,0,0,.85)] ring-2 ring-accent/60" : "cursor-grab"} ${className}`}
    >
      {children}
    </div>
  );
}
