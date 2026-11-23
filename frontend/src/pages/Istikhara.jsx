import { useEffect, useState } from "react";
import { navigate } from "../utils/router";
import { apiFetch, faNum, toast } from "../utils/client";
import { Icon } from "../components/common/Icon";

const VERDICT = {
  good: { label: "خوب", sub: "آیهٔ رحمت یا امر به خیر", tone: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300", icon: "check" },
  middle: { label: "میانه", sub: "آیه دوپهلو است؛ با تأمل و مشورت تصمیم بگیرید", tone: "border-sky-400/30 bg-sky-400/10 text-sky-300", icon: "info" },
  caution: { label: "خوب نیست", sub: "آیهٔ عذاب، نهی یا هشدار", tone: "border-rose-400/30 bg-rose-500/10 text-rose-300", icon: "ban" },
};

const STEPS = [
  { n: "۱", t: "با نیت صادقانه وضو بگیرید و رو به قبله بنشینید." },
  { n: "۲", t: "سه بار سورهٔ توحید (قل هو الله احد) را بخوانید." },
  { n: "۳", t: "سه بار صلوات بر محمد و آل محمد بفرستید." },
  { n: "۴", t: "دعای زیر را بخوانید و سپس روی «گشودن قرآن» بزنید." },
];

const DUA = { ar: "اللّٰهُمَّ تَفَأَّلْتُ بِكِتابِكَ وَتَوَكَّلْتُ عَلَيْكَ، فَأَرِنِي مِنْ كِتابِكَ ما هُوَ مَكْتُومٌ مِنْ سِرِّكَ الْمَكْنُونِ فِي غَيْبِكَ", fa: "خدایا، به کتاب تو تفأل می‌زنم و بر تو توکل می‌کنم؛ پس از کتابت آنچه را در نهانِ غیبت پوشیده است به من بنمایان." };

export default function Istikhara() {
  const [question, setQuestion] = useState("");
  const [translations, setTranslations] = useState([]);
  const [translation, setTranslation] = useState("fa.makarem");
  const [result, setResult] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [showSteps, setShowSteps] = useState(true);

  useEffect(() => {
    apiFetch("/api/istikhara/translations").then((d) => setTranslations(d.translations)).catch(() => {});
  }, []);

  async function draw() {
    if (phase === "opening") return;
    setPhase("opening");
    setResult(null);
    const started = Date.now();
    try {
      const r = await apiFetch(`/api/istikhara/draw?translation=${encodeURIComponent(translation)}`);
      const wait = Math.max(0, 1100 - (Date.now() - started));
      window.setTimeout(() => { setResult(r); setPhase("done"); }, wait);
    } catch (err) {
      toast(err.message, "error");
      setPhase("idle");
    }
  }

  const v = result ? VERDICT[result.verdict] : null;

  return (
    <div className="bg-aurora flex h-[100dvh] flex-col overflow-hidden">
      <main className="scroll-thin scroll-smooth-y flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <div className="anim-rise flex flex-wrap items-center gap-3">
            <button onClick={() => navigate("/")} aria-label="بازگشت" className="press flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface-2/80 text-muted backdrop-blur-md hover:bg-surface-3 hover:text-fg">
              <Icon name="arrow-right" size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black">استخاره با قرآن</h1>
              <p className="text-[11px] text-muted">به روش سنتی: نخستین آیهٔ صفحهٔ سمت راستِ مصحف — متن از Al Quran Cloud</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/dhikr")}
              className="press flex items-center gap-1.5 rounded-xl border border-accent/35 bg-accent/14 px-3.5 py-2 text-xs font-bold text-accent backdrop-blur-md hover:bg-accent/24"
            >
              <Icon name="sparkles" size={15} />
              <span>ذکر و زیارت روز</span>
            </button>
          </div>

          {/* preparation */}
          <section className="anim-rise rounded-2xl border border-line bg-surface/75 backdrop-blur-xl" style={{ animationDelay: "40ms" }}>
            <button onClick={() => setShowSteps((s) => !s)} className="flex w-full items-center justify-between px-5 py-4 text-right" aria-expanded={showSteps}>
              <span className="flex items-center gap-2 text-sm font-bold"><Icon name="book" size={17} className="text-accent" /> آداب استخاره (پیش از گشودن)</span>
              <Icon name="chevron-down" size={16} className={`text-muted transition-transform duration-300 ${showSteps ? "rotate-180" : ""}`} />
            </button>
            {showSteps && (
              <div className="anim-fade-in space-y-4 border-t border-line px-5 pb-5 pt-4">
                <ol className="stagger grid gap-2 sm:grid-cols-2">
                  {STEPS.map((s, i) => (
                    <li key={s.n} style={{ ["--i"]: i }} className="flex items-start gap-3 rounded-lg border border-line bg-surface-2/60 p-3 text-xs leading-6">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/15 text-[11px] font-black text-accent">{s.n}</span>
                      <span className="text-fg/90">{s.t}</span>
                    </li>
                  ))}
                </ol>
                <blockquote className="rounded-lg border border-accent/25 bg-accent/5 p-4">
                  <p className="naskh-text text-lg leading-9 text-fg">{DUA.ar}</p>
                  <p className="mt-2 text-xs leading-6 text-muted">{DUA.fa}</p>
                  <p className="mt-2 text-[10px] text-muted/80">منقول از رسول خدا (ص) دربارهٔ استخاره با قرآن — <a href="https://hawzah.net/fa/Article/View/4516" target="_blank" rel="noreferrer" className="text-accent hover:underline">پایگاه حوزه</a></p>
                </blockquote>
              </div>
            )}
          </section>

          {/* intention + options */}
          <section className="anim-rise rounded-2xl border border-line bg-surface/75 p-5 backdrop-blur-xl" style={{ animationDelay: "80ms" }}>
            <label className="block text-xs font-bold text-muted" htmlFor="istikhara-question">نیّت شما (اختیاری — فقط برای خودتان؛ جایی ذخیره نمی‌شود)</label>
            <textarea
              id="istikhara-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              placeholder="مثلاً: آیا این سفر را بروم؟"
              className="ring-glow mt-2 w-full resize-none rounded-xl border border-line bg-surface-2/80 px-4 py-3 text-sm backdrop-blur-md outline-none"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                <span>ترجمه</span>
                <select value={translation} onChange={(e) => setTranslation(e.target.value)} className="rounded-xl border border-line bg-surface-2/85 px-3 py-2 text-xs text-fg backdrop-blur-md outline-none">
                  {(translations.length ? translations : [{ id: "fa.makarem", name: "مکارم شیرازی" }]).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <button
                onClick={() => void draw()}
                disabled={phase === "opening"}
                className="press ms-auto flex items-center gap-2 rounded-xl border border-accent/50 bg-accent/22 px-6 py-2.5 text-sm font-black text-accent shadow-[0_8px_28px_rgb(var(--glow)/0.22)] backdrop-blur-xl transition hover:border-accent hover:bg-accent/32 disabled:opacity-55"
              >
                {phase === "opening" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/35 border-t-accent" /> : <Icon name="book" size={17} />}
                {phase === "opening" ? "در حال گشودن قرآن…" : result ? "گشودن دوباره" : "گشودن قرآن"}
              </button>
            </div>
          </section>

          {/* result */}
          {phase === "opening" && (
            <section className="anim-rise flex items-center justify-center gap-3 rounded-xl border border-dashed border-line p-10 text-sm text-muted">
              <span className="typing-dot h-2 w-2 rounded-full bg-accent" /><span className="typing-dot h-2 w-2 rounded-full bg-accent" /><span className="typing-dot h-2 w-2 rounded-full bg-accent" />
              <span>قرآن گشوده می‌شود…</span>
            </section>
          )}

          {result && v && phase === "done" && (
            <section key={`${result.page}-${result.ayah}`} className="anim-rise overflow-hidden rounded-2xl border border-line bg-surface/85 shadow-2xl backdrop-blur-2xl">
              <div className="grad-accent h-1.5 w-full" />
              <div className="p-6">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-md bg-accent/15 px-2.5 py-1 font-bold text-accent">{result.surah.name}</span>
                  <span className="rounded-md bg-surface-2 px-2.5 py-1 text-muted">آیهٔ {faNum(result.ayah)}</span>
                  <span className="rounded-md bg-surface-2 px-2.5 py-1 text-muted">صفحهٔ {faNum(result.page)} مصحف</span>
                  <a href={result.source.url} target="_blank" rel="noreferrer" className="ms-auto flex items-center gap-1 text-accent hover:underline"><Icon name="link" size={12} /> مشاهده در منبع</a>
                </div>
                <p className="quran-text mt-5 text-2xl leading-[2.3] text-fg sm:text-3xl" dir="rtl">{result.arabic}</p>
                <p className="mt-5 text-base font-semibold leading-8 text-fg/95">{result.translation}</p>
                <p className="mt-1 text-[11px] text-muted">ترجمهٔ {result.translator}</p>

                <div className={`mt-5 flex items-start gap-3 rounded-lg border p-4 ${v.tone}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/20"><Icon name={v.icon} size={20} /></span>
                  <div className="min-w-0">
                    <p className="text-base font-black">{v.label}</p>
                    <p className="text-xs opacity-90">{v.sub}</p>
                    {result.cues.length > 0 && (
                      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] opacity-90">
                        <span>نشانه‌ها در متن:</span>
                        {result.cues.map((c) => <span key={c} className="rounded-md bg-black/20 px-1.5 py-px">{c}</span>)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-line bg-surface-2/60 p-3 text-[11px] leading-6 text-muted">
                  <p><strong className="text-fg/80">روش:</strong> {result.source.method} — <a href={result.source.methodUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">منبع روش</a></p>
                  <p><strong className="text-fg/80">متن:</strong> {result.source.text}</p>
                  <p className="mt-1">برداشت «خوب / میانه / خوب نیست» بر پایهٔ واژگان ترجمه و فقط یک راهنمای اولیه است. برای تصمیم‌های مهم، با عالمان دین مشورت کنید؛ استخاره جایگزین مشورت و تدبیر نیست.</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => void draw()} className="press flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/16 px-4 py-2 text-xs font-bold text-accent backdrop-blur-md hover:bg-accent/26"><Icon name="refresh" size={14} /> گشودن دوباره</button>
                  <button onClick={() => { void navigator.clipboard?.writeText(`${result.arabic}\n${result.translation}\n(${result.surah.name}، آیهٔ ${result.ayah})`).then(() => toast("آیه کپی شد", "success")).catch(() => toast("کپی انجام نشد", "error")); }} className="press flex items-center gap-1.5 rounded-xl border border-line bg-surface-2/80 px-4 py-2 text-xs font-bold text-fg backdrop-blur-md hover:bg-surface-3"><Icon name="copy" size={14} /> کپی آیه</button>
                  <button onClick={() => navigate("/")} className="press flex items-center gap-1.5 rounded-xl border border-line bg-surface-2/80 px-4 py-2 text-xs font-bold text-muted backdrop-blur-md hover:text-fg"><Icon name="arrow-right" size={14} /> بازگشت به گفتگوها</button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
