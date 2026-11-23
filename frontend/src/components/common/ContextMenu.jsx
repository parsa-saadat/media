import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { faNum } from "../../utils/client";
import { Icon } from "./Icon";

/** Only one context menu may be open across the whole app. */
const CLOSE_ALL = "voxsy:context-menu-close-all";
let seq = 0;

export function useContextMenu() {
  const [menu, setMenu] = useState(null);
  const myId = useRef(0);

  const close = useCallback(() => setMenu(null), []);

  const openAt = useCallback((clientX, clientY, items) => {
    const id = ++seq;
    myId.current = id;
    window.dispatchEvent(new CustomEvent(CLOSE_ALL, { detail: id }));
    setMenu({ id, x: clientX, y: clientY, items });
  }, []);

  const open = useCallback(
    (event, items) => {
      event.preventDefault();
      event.stopPropagation();
      let x = event.clientX;
      let y = event.clientY;
      if (event.type === "click" && event.currentTarget?.getBoundingClientRect) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (!x && !y) {
          x = rect.left + rect.width / 2;
          y = rect.bottom + 4;
        } else {
          x = rect.left;
          y = rect.bottom + 4;
        }
      }
      openAt(x, y, items);
    },
    [openAt],
  );

  useEffect(() => {
    const handler = (e) => {
      const except = e.detail;
      if (except !== myId.current) setMenu(null);
    };
    window.addEventListener(CLOSE_ALL, handler);
    return () => window.removeEventListener(CLOSE_ALL, handler);
  }, []);

  return { menu, open, openAt, close };
}

function MenuSliderItem({ item }) {
  const [val, setVal] = useState(item.value ?? 100);
  useEffect(() => {
    setVal(item.value ?? 100);
  }, [item.value]);

  const update = (next) => {
    const clamped = Math.min(item.max ?? 100, Math.max(item.min ?? 0, next));
    setVal(clamped);
    item.onChange?.(clamped);
  };

  return (
    <div
      className="space-y-1.5 rounded-lg bg-surface-2/70 px-3 py-2"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-fg">
          <button
            type="button"
            onClick={() => update(val === 0 ? 100 : 0)}
            className="text-accent hover:opacity-80"
            title={val === 0 ? "وصل کردن صدا" : "قطع صدا"}
          >
            <Icon name={val === 0 ? "volume-off" : "volume"} size={15} />
          </button>
          <span>{item.label ?? "بلندی صدا"}</span>
        </span>
        <span className="tabular-nums text-[11px] font-bold text-accent" dir="ltr">
          {faNum(val)}٪
        </span>
      </div>
      <input
        type="range"
        min={item.min ?? 0}
        max={item.max ?? 100}
        value={val}
        onChange={(e) => update(Number(e.target.value))}
        aria-label={item.label ?? "بلندی صدا"}
        className="h-1.5 w-full cursor-pointer accent-[var(--accent)]"
      />
    </div>
  );
}

export function ContextMenu({ state, onClose }) {
  const rootRef = useRef(null);
  const [pos, setPos] = useState(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const menuId = state?.id ?? 0;
  const x = state?.x ?? 0;
  const y = state?.y ?? 0;

  useLayoutEffect(() => {
    if (!menuId) {
      setPos(null);
      return;
    }
    const el = rootRef.current;
    const pad = 8;
    if (!el) {
      setPos({ x, y });
      return;
    }
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.min(Math.max(pad, x), Math.max(pad, window.innerWidth - rect.width - pad)),
      y: Math.min(Math.max(pad, y), Math.max(pad, window.innerHeight - rect.height - pad)),
    });
  }, [menuId, x, y]);

  useEffect(() => {
    if (!menuId) return;
    const onKey = (e) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    let lastUserScrollIntent = 0;
    const markIntent = () => {
      lastUserScrollIntent = Date.now();
    };
    const onScroll = (e) => {
      const target = e.target;
      if (target && rootRef.current?.contains(target)) return;
      if (Date.now() - lastUserScrollIntent < 400) onCloseRef.current();
    };
    const onResize = () => onCloseRef.current();
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", markIntent, { passive: true, capture: true });
    window.addEventListener("touchmove", markIntent, { passive: true, capture: true });
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", markIntent, { capture: true });
      window.removeEventListener("touchmove", markIntent, { capture: true });
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [menuId]);

  if (!state || typeof document === "undefined") return null;

  const content = (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[90] cursor-default bg-transparent"
        aria-label="بستن منو"
        onMouseDown={(e) => {
          e.preventDefault();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={rootRef}
        dir="rtl"
        role="menu"
        className="popover-blur context-glass anim-pop fixed z-[95] min-w-60 max-w-xs space-y-0.5 overflow-hidden rounded-2xl border border-line p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.6)] ring-1 ring-white/10"
        style={{
          left: (pos ?? { x, y }).x,
          top: (pos ?? { x, y }).y,
          visibility: pos ? "visible" : "hidden",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {state.items.map((item, i) => {
          if (item.type === "divider") return <div key={item.key ?? `d-${i}`} className="my-1 h-px bg-line/70" />;
          if (item.type === "slider") return <MenuSliderItem key={item.key ?? `s-${i}`} item={item} />;
          if (item.type === "label") {
            const isAdmin = item.label === "اقدامات مدیر" || item.label === "اقدامات میزبان";
            return (
              <p key={item.key ?? `l-${i}`} className={`flex items-center gap-2 px-3 pb-1 pt-1.5 text-[11px] font-bold ${isAdmin ? "text-amber-300" : "text-muted"}`}>
                {isAdmin && <Icon name="shield" size={12} />}
                <span className="truncate">{item.label}</span>
              </p>
            );
          }
          return (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                onClose();
                item.onClick();
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition disabled:opacity-40 focus:outline-none focus-visible:bg-surface-2 ${
                item.danger ? "text-rose-400 hover:bg-rose-500/15" : "text-fg hover:bg-surface-2"
              }`}
            >
              {item.icon && <Icon name={item.icon} size={16} className={item.danger ? "text-rose-400" : "text-accent"} />}
              <span className="flex-1 text-right">{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );

  return createPortal(content, document.body);
}
