import { useEffect, useMemo, useRef, useState } from "react";
import { EMOJI_CATEGORIES, QUICK_EMOJIS, recentEmojis, rememberEmoji } from "../../locales/fa/emojis";
import { Icon } from "../common/Icon";

/**
 * Telegram-style picker: search, a "recently used" row, category tabs, and a grid that scrolls through
 * every category. Emojis are inserted at the caret so editing an existing message keeps working.
 */
export default function EmojiPicker({
  onPick,
  onClose,
  className = "",
}) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState([]);
  const [active, setActive] = useState(EMOJI_CATEGORIES[0].id);
  const gridRef = useRef(null);
  const sectionRefs = useRef(new Map());
  const scrollLock = useRef(false);

  useEffect(() => {
    setRecent(recentEmojis());
  }, []);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    // Search matches the emoji character itself; category labels are matched too, so typing «قلب»
    // narrows to the symbols category instead of returning nothing.
    const flat = EMOJI_CATEGORIES.flatMap((c) => c.items);
    const direct = [...new Set(flat.filter((e) => e.includes(q)))];
    const byCategory = EMOJI_CATEGORIES.filter((c) => c.label.includes(q)).flatMap((c) => c.items);
    return [...new Set([...direct, ...byCategory])].slice(0, 240);
  }, [query]);

  function pick(emoji) {
    rememberEmoji(emoji);
    setRecent(recentEmojis());
    onPick(emoji);
  }

  /** Keep the category tab in sync while the user scrolls the grid. */
  function onScroll() {
    if (scrollLock.current || results) return;
    const grid = gridRef.current;
    if (!grid) return;
    let current = EMOJI_CATEGORIES[0].id;
    for (const [id, el] of sectionRefs.current) {
      if (el.offsetTop - grid.scrollTop <= 60) current = id;
    }
    setActive(current);
  }

  function jumpTo(id) {
    const grid = gridRef.current;
    const el = sectionRefs.current.get(id);
    if (!grid || !el) return;
    scrollLock.current = true;
    setActive(id);
    grid.scrollTo({ top: el.offsetTop - 4, behavior: "smooth" });
    window.setTimeout(() => {
      scrollLock.current = false;
    }, 450);
  }

  const cell =
    "flex h-10 w-10 items-center justify-center rounded-xl text-[22px] leading-none transition hover:scale-110 hover:bg-surface-3 active:scale-95 sm:h-11 sm:w-11";

  return (
    <div
      className={`anim-rise flex h-[380px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl sm:h-[420px] ${className}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line p-2.5">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={15} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی ایموجی یا نام دسته…"
            aria-label="جستجوی ایموجی"
            className="ring-glow w-full rounded-xl border border-line bg-surface-2 py-2 pr-9 pl-3 text-xs outline-none"
          />
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="بستن" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {results ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted">ایموجی‌ای با این متن پیدا نشد</p>
          ) : (
            <div className="grid grid-cols-7 gap-0.5 sm:grid-cols-9">
              {results.map((e, i) => (
                <button key={`${e}-${i}`} type="button" onClick={() => pick(e)} className={cell} title={e}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div ref={gridRef} onScroll={onScroll} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pt-2">
            {recent.length > 0 && (
              <section className="mb-3">
                <p className="mb-1 px-1 text-[11px] font-bold text-muted">اخیراً استفاده‌شده</p>
                <div className="grid grid-cols-7 gap-0.5 sm:grid-cols-9">
                  {recent.map((e, i) => (
                    <button key={`r-${e}-${i}`} type="button" onClick={() => pick(e)} className={cell} title={e}>
                      {e}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {EMOJI_CATEGORIES.map((cat) => (
              <section
                key={cat.id}
                ref={(el) => {
                  if (el) sectionRefs.current.set(cat.id, el);
                  else sectionRefs.current.delete(cat.id);
                }}
                className="mb-3"
              >
                <p className="mb-1 px-1 text-[11px] font-bold text-muted">{cat.label}</p>
                <div className="grid grid-cols-7 gap-0.5 sm:grid-cols-9">
                  {cat.items.map((e, i) => (
                    <button key={`${cat.id}-${e}-${i}`} type="button" onClick={() => pick(e)} className={cell} title={e}>
                      {e}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-1 border-t border-line bg-surface-2/60 px-2 py-1.5">
            {EMOJI_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => jumpTo(cat.id)}
                title={cat.label}
                aria-label={cat.label}
                aria-pressed={active === cat.id}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition ${
                  active === cat.id ? "bg-accent/20 ring-1 ring-accent" : "opacity-60 hover:opacity-100"
                }`}
              >
                {cat.icon}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex shrink-0 items-center gap-1 border-t border-line px-2 py-1.5">
        <span className="px-1 text-[10px] text-muted">پرکاربرد</span>
        {QUICK_EMOJIS.map((e) => (
          <button key={`q-${e}`} type="button" onClick={() => pick(e)} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:scale-110 hover:bg-surface-3" title={e}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
