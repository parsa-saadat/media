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

const HADITH = {
  ar: "خَيْرُ النَّاسِ أَنْفَعُهُمْ لِلنَّاسِ",
  fa: "بهترین مردم کسی است که بیشترین سود را به مردم برساند",
  by: "پیامبر اکرم (ص)",
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
    const auto = setTimeout(() => dismiss(), 11000);
    return () => clearTimeout(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    setClosing(true);
    setTimeout(() => setMounted(false), 420);
  }

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 transition-opacity duration-400 ${
        closing ? "opacity-0" : "opacity-100"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="خوش آمدید"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />
      <div
        className={`relative w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-2xl transition-all duration-400 ${
          closing ? "translate-y-4 scale-95 opacity-0" : "anim-pop translate-y-0 scale-100 opacity-100"
        }`}
      >
        <div className="grad-accent h-1.5 w-full" />
        <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-accent/25 blur-3xl" />
        <div className="absolute -bottom-20 -right-10 h-48 w-48 rounded-full bg-accent-2/20 blur-3xl" />

        <button
          onClick={dismiss}
          aria-label="بستن"
          className="absolute left-4 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <Icon name="close" size={18} />
        </button>

        <div className="relative px-6 pb-6 pt-8 text-center sm:px-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent glow">
            <Icon name="sparkles" size={28} />
          </div>
          <h2 className="text-2xl font-black">{greeting.title}</h2>
          <p className="mt-1 text-sm text-muted">به inebuly خوش آمدید · {greeting.sub}</p>

          <div className="mt-5 rounded-xl border border-accent/25 bg-accent/5 px-5 py-4">
            <p className="mb-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-accent">
              <Icon name="book" size={14} /> قرآن کریم
            </p>
            <p className="quran-text text-[22px] leading-9">{VERSE.ar}</p>
            <p className="mt-1 text-xs text-muted">{VERSE.fa}</p>
            <p className="mt-1 text-[10px] font-bold text-accent">{VERSE.ref}</p>
          </div>

          <div className="mt-3 rounded-xl border border-accent-2/25 bg-accent-2/5 px-5 py-4">
            <p className="mb-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-accent-2">
              <Icon name="quote" size={14} /> حدیث
            </p>
            <p className="naskh-text text-[19px] font-bold leading-8">{HADITH.ar}</p>
            <p className="mt-1 text-xs text-muted">{HADITH.fa}</p>
            <p className="mt-1 text-[10px] font-bold text-accent-2">{HADITH.by}</p>
          </div>

          <p className="mt-4 text-xs leading-6 text-muted">
            پیش از فرستادن هر پیام، یک لحظه فکر کنیم؛ گفتگو با مهربانی، بهترین شروع است. برای گفتگوی زنده، یک «جلسه» بساز و لینک آن را بفرست.
          </p>

          <button
            onClick={dismiss}
            className="grad-accent glow mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-on-accent"
          >
            <Icon name="chat" size={18} />
            شروع گفتگو
          </button>
          <p className="mt-3 text-[10px] text-muted/70">این پیام خودکار بسته می‌شود</p>
        </div>
      </div>
    </div>
  );
}
