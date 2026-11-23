import { useEffect, useState } from "react";
import { Icon } from "./Icon";

const GREETINGS = [
  { title: "سلام و درود", sub: "خوش آمدید" },
  { title: "درود بر تو", sub: "اینجا جای گفتن و شنیدن است" },
  { title: "سلام رفیق", sub: "گفتگو را با مهربانی آغاز کن" },
];

const VERSE = {
  ar: "وَقُولُوا لِلنَّاسِ حُسْنًا",
  fa: "و با مردم به نیکی سخن بگویید",
  ref: "سوره بقره، آیه ۸۳",
};

const STORAGE_KEY = "voxsy-welcome-seen";

export default function WelcomePopup() {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setMounted(true);
    const auto = setTimeout(() => dismiss(), 9000);
    return () => clearTimeout(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    setClosing(true);
    setTimeout(() => setMounted(false), 380);
  }

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 transition-opacity duration-300 ${
        closing ? "opacity-0" : "opacity-100"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="خوش آمدید"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface/92 shadow-2xl backdrop-blur-2xl transition-all duration-300 ${
          closing ? "translate-y-4 scale-95 opacity-0" : "anim-pop translate-y-0 scale-100 opacity-100"
        }`}
      >
        <div className="shimmer-line h-1 w-full" />
        <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-10 h-44 w-44 rounded-full bg-accent-2/15 blur-3xl" />

        <button
          onClick={dismiss}
          aria-label="بستن"
          className="absolute left-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-xl border border-line/70 bg-surface-2/80 text-muted transition hover:bg-surface-3 hover:text-fg"
        >
          <Icon name="close" size={16} />
        </button>

        <div className="relative px-6 pb-6 pt-7 text-center sm:px-7">
          <div className="mx-auto mb-3.5 flex h-13 w-13 items-center justify-center rounded-2xl border border-accent/35 bg-accent/15 text-accent">
            <Icon name="sparkles" size={26} />
          </div>
          <h2 className="text-xl font-black text-fg">{greeting.title}</h2>
          <p className="mt-1 text-xs text-muted">به inebuly خوش آمدید · {greeting.sub}</p>

          <div className="mt-5 rounded-2xl border border-accent/30 bg-accent/10 px-5 py-4 backdrop-blur-md">
            <p className="mb-1.5 flex items-center justify-center gap-1.5 text-[11px] font-bold text-accent">
              <Icon name="book" size={14} /> آیهٔ قرآن کریم
            </p>
            <p className="quran-text text-[22px] leading-10 text-fg">{VERSE.ar}</p>
            <p className="mt-1.5 text-xs font-semibold text-fg/85">{VERSE.fa}</p>
            <p className="mt-1.5 text-[10px] font-bold text-accent">{VERSE.ref}</p>
          </div>

          <button
            onClick={dismiss}
            className="press mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-accent/45 bg-accent/20 py-2.5 text-sm font-black text-accent backdrop-blur-md transition hover:bg-accent/30"
          >
            <Icon name="chat" size={17} />
            شروع گفتگو
          </button>
        </div>
      </div>
    </div>
  );
}
