import { useEffect, useRef, useState } from "react";
import { HADITHS, VERSES } from "../../locales/fa/sacred";
import { Icon } from "../common/Icon";

function Deck({
  count,
  ms,
  offset,
  label,
  tint,
  icon,
  render,
}) {
  const ref = useRef(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef(null);

  const goTo = (i, smooth = true) => {
    const el = ref.current;
    const wrapped = ((i % count) + count) % count;
    setIndex(wrapped);
    if (el) el.scrollTo({ left: wrapped * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };

  // start at a random card, without animation
  useEffect(() => {
    const start = Math.floor(Math.random() * count);
    const el = ref.current;
    setIndex(start);
    if (el) el.scrollLeft = start * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // auto advance — paused while the pointer is over the deck
  useEffect(() => {
    if (paused) return;
    let timer = null;
    const start = setTimeout(() => {
      timer = setInterval(() => {
        const el = ref.current;
        if (!el) return;
        setIndex((prev) => {
          const next = (prev + 1) % count;
          el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
          return next;
        });
      }, ms);
    }, offset);
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [paused, count, ms, offset]);

  const pause = () => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  };
  const resume = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), 400);
  };

  const tone =
    tint === "accent"
      ? { text: "text-accent", bg: "bg-accent/10", border: "border-accent/25" }
      : { text: "text-accent-2", bg: "bg-accent-2/10", border: "border-accent-2/25" };

  return (
    <div
      className="group/deck relative min-w-0 flex-1"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      onTouchStart={pause}
      onTouchEnd={resume}
    >
      <div
        ref={ref}
        dir="ltr"
        onScroll={() => {
          const el = ref.current;
          if (!el) return;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== index) setIndex(i);
        }}
        onWheel={pause}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-lg border border-line bg-surface-2/50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} dir="rtl" className="h-[72px] w-full min-w-full shrink-0 snap-center px-2.5 py-1.5">
            <div className="flex h-full items-center gap-2">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${tone.border} ${tone.bg} ${tone.text}`}>
                <Icon name={icon} size={17} />
              </span>
              <div className="min-w-0 flex-1">{render(i)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div className="pointer-events-none absolute -top-1 left-1 flex items-center gap-1 opacity-0 transition group-hover/deck:pointer-events-auto group-hover/deck:opacity-100">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          aria-label="قبلی"
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-line bg-surface text-muted hover:text-fg"
        >
          <Icon name="chevron-right" size={13} />
        </button>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          aria-label="بعدی"
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-line bg-surface text-muted hover:text-fg"
        >
          <Icon name="chevron-left" size={13} />
        </button>
      </div>
      <span className={`pointer-events-none absolute -top-1 right-2 rounded-full ${tone.bg} px-1.5 text-[9px] font-bold ${tone.text}`}>
        {label}
      </span>
    </div>
  );
}

export default function SacredHeader({ compact = false }) {
  return (
    <header className="relative z-20 shrink-0 border-b border-line glass">
      <div className="shimmer-line absolute inset-x-0 bottom-0 h-px opacity-50" />
      <div className={`mx-auto flex max-w-[1700px] items-stretch gap-2 px-2 ${compact ? "py-1.5" : "py-2.5"} sm:px-4`}>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <Deck
            count={VERSES.length}
            ms={9000}
            offset={0}
            label="قرآن"
            tint="accent"
            icon="book"
            render={(i) => {
              const v = VERSES[i];
              return (
                <div key={i} className="anim-fade-in min-w-0">
                  <p className="truncate text-[14px] font-bold leading-6 text-fg sm:text-[15px]" title={v.fa}>
                    {v.fa}
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-[11px] leading-5 text-muted">
                    <span className="quran-text min-w-0 truncate text-[13px] text-fg/70" dir="rtl" title={v.ar}>{v.ar}</span>
                    <span className="shrink-0 rounded-md bg-accent/15 px-1.5 py-px text-[10px] font-bold text-accent">{v.ref}</span>
                  </p>
                </div>
              );
            }}
          />
          <Deck
            count={HADITHS.length}
            ms={9000}
            offset={4500}
            label="حدیث"
            tint="accent-2"
            icon="quote"
            render={(i) => {
              const h = HADITHS[i];
              return (
                <div key={i} className="anim-fade-in min-w-0">
                  <p className="truncate text-[14px] font-bold leading-6 text-fg sm:text-[15px]" title={h.fa}>
                    {h.fa}
                  </p>
                  <p className="flex min-w-0 items-center gap-2 text-[11px] leading-5 text-muted">
                    <span className="naskh-text min-w-0 truncate text-[13px] text-fg/70" dir="rtl" title={h.ar}>{h.ar}</span>
                    <span className="shrink-0 rounded-md bg-accent-2/15 px-1.5 py-px text-[10px] font-bold text-accent-2">{h.by}</span>
                  </p>
                </div>
              );
            }}
          />
        </div>
      </div>
    </header>
  );
}
