import { useEffect, useMemo, useState } from "react";
import { navigate } from "../utils/router";
import { faNum, toast } from "../utils/client";
import { Icon } from "../components/common/Icon";

/**
 * Authentic daily Dhikr & Ziyarat of the Masoomin (AS) according to Shia tradition (Mafatih al-Jinan).
 * JS `Date.getDay()`: 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
 */
export const SHIA_WEEKDAYS = [
  {
    dayIndex: 0,
    dayFa: "یکشنبه",
    masoom: "حضرت امیرالمؤمنین علی (ع) و حضرت فاطمه زهرا (س)",
    dhikrAr: "یَا ذَا الْجَلَالِ وَالْإِکْرَامِ",
    dhikrFa: "ای صاحب جلال و بزرگواری",
    target: 100,
    benefit: "موجب فتح و گشایش در کارها و عزت دنیا و آخرت (مفاتیح‌الجنان)",
    ziyaratAr:
      "السَّلَامُ عَلَیْکَ یَا وَلِیَّ اللَّهِ، السَّلَامُ عَلَیْکَ یَا حُجَّةَ اللَّهِ وَخَالِصَتَهُ... السَّلَامُ عَلَیْکِ یَا مُمْتَحَنَةُ امْتَحَنَکِ الَّذِی خَلَقَکِ فَوَجَدَکِ لِمَا امْتَحَنَکِ صَابِرَةً.",
    ziyaratFa:
      "سلام بر تو ای ولیّ خدا، سلام بر تو ای حجت خدا و بندهٔ برگزیدهٔ او... سلام بر تو ای بانوی آزموده‌شده که آفریدگارت تو را آزمود و در برابر آزمونش شکیبا یافت.",
    salawatNote: "اللّهُمَّ صَلِّ عَلی مُحَمَّدٍ وَ آلِ مُحَمَّدٍ وَ عَجِّلْ فَرَجَهُمْ",
  },
  {
    dayIndex: 1,
    dayFa: "دوشنبه",
    masoom: "امام حسن مجتبی (ع) و امام حسین سیدالشهدا (ع)",
    dhikrAr: "یَا قَاضِیَ الْحَاجَاتِ",
    dhikrFa: "ای برآورندهٔ حاجت‌ها",
    target: 100,
    benefit: "موجب بی‌نیازی از خلق، برآورده شدن حاجات و افزایش روزی",
    ziyaratAr:
      "السَّلَامُ عَلَیْکَ یَا بْنَ رَسُولِ رَبِّ الْعَالَمِینَ، السَّلَامُ عَلَیْکَ یَا بْنَ أَمِیرِ الْمُؤْمِنِینَ... السَّلَامُ عَلَیْکَ یَا أَبَا عَبْدِ اللَّهِ وَعَلَى الْأَرْوَاحِ الَّتِی حَلَّتْ بِفِنَائِکَ.",
    ziyaratFa:
      "سلام بر تو ای فرزند فرستادهٔ پروردگار جهانیان، سلام بر تو ای فرزند امیرمؤمنان... سلام بر تو ای اباعبدالله و بر جان‌های پاکی که در آستان تو فرود آمدند.",
    salawatNote: "اللّهُمَّ صَلِّ عَلی مُحَمَّدٍ وَ آلِ مُحَمَّدٍ وَ عَجِّلْ فَرَجَهُمْ",
  },
  {
    dayIndex: 2,
    dayFa: "سه‌شنبه",
    masoom: "امام سجاد (ع)، امام محمد باقر (ع) و امام جعفر صادق (ع)",
    dhikrAr: "یَا أَرْحَمَ الرَّاحِمِینَ",
    dhikrFa: "ای مهربان‌ترین مهربانان",
    target: 100,
    benefit: "موجب جلب رحمت الهی، روا شدن حاجات شرعی و آمرزش گناهان",
    ziyaratAr:
      "السَّلَامُ عَلَیْکُمْ یَا خُزَّانَ عِلْمِ اللَّهِ، السَّلَامُ عَلَیْکُمْ یَا تَرَاجِمَةَ وَحْیِ اللَّهِ، السَّلَامُ عَلَیْکُمْ یَا أَئِمَّةَ الْهُدَى وَأَعْلَامَ التُّقَى.",
    ziyaratFa:
      "سلام بر شما ای خزانه‌داران علم الهی، سلام بر شما ای مفسران وحی خدا، سلام بر شما ای پیشوایان هدایت و پرچم‌های پرهیزگاری.",
    salawatNote: "اللّهُمَّ صَلِّ عَلی مُحَمَّدٍ وَ آلِ مُحَمَّدٍ وَ عَجِّلْ فَرَجَهُمْ",
  },
  {
    dayIndex: 3,
    dayFa: "چهارشنبه",
    masoom: "امام موسی کاظم (ع)، امام رضا (ع)، امام جواد (ع) و امام هادی (ع)",
    dhikrAr: "یَا حَیُّ یَا قَیُّومُ",
    dhikrFa: "ای زندهٔ پاینده و برپادارندهٔ هستی",
    target: 100,
    benefit: "موجب عزت دائم، نورانیت قلب و گشایش در امور دشوار",
    ziyaratAr:
      "السَّلَامُ عَلَیْکُمْ یَا أَوْلِیَاءَ اللَّهِ، السَّلَامُ عَلَیْکُمْ یَا حُجَجَ اللَّهِ، السَّلَامُ عَلَیْکُمْ یَا نُورَ اللَّهِ فِی ظُلُمَاتِ الْأَرْضِ.",
    ziyaratFa:
      "سلام بر شما ای اولیای خدا، سلام بر شما ای حجت‌های خدا، سلام بر شما ای نور الهی در تاریکی‌های زمین.",
    salawatNote: "اللّهُمَّ صَلِّ عَلی مُحَمَّدٍ وَ آلِ مُحَمَّدٍ وَ عَجِّلْ فَرَجَهُمْ",
  },
  {
    dayIndex: 4,
    dayFa: "پنج‌شنبه",
    masoom: "امام حسن عسکری (ع)",
    dhikrAr: "لَا إِلٰهَ إِلَّا اللَّهُ الْمَلِکُ الْحَقُّ الْمُبِینُ",
    dhikrFa: "معبودی جز خداوندِ فرمانروای حق و آشکار نیست",
    target: 100,
    benefit: "موجب برکت رزق، ایمنی از فقر و انس در سرای آخرت",
    ziyaratAr:
      "السَّلَامُ عَلَیْکَ یَا وَلِیَّ اللَّهِ، السَّلَامُ عَلَیْکَ یَا حُجَّةَ اللَّهِ وَخَالِصَتَهُ، السَّلَامُ عَلَیْکَ یَا إِمَامَ الْمُؤْمِنِینَ وَوَارِثَ الْمُرْسَلِینَ.",
    ziyaratFa:
      "سلام بر تو ای ولیّ خدا، سلام بر تو ای حجت برگزیدهٔ خدا، سلام بر تو ای پیشوای مؤمنان و وارث پیامبران.",
    salawatNote: "اللّهُمَّ صَلِّ عَلی مُحَمَّدٍ وَ آلِ مُحَمَّدٍ وَ عَجِّلْ فَرَجَهُمْ",
  },
  {
    dayIndex: 5,
    dayFa: "جمعه",
    masoom: "حضرت ولی‌عصر امام مهدی موعود (عج)",
    dhikrAr: "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَآلِ مُحَمَّدٍ وَعَجِّلْ فَرَجَهُمْ",
    dhikrFa: "خدایا بر محمد و خاندان محمد درود فرست و در فرج ایشان تعجیل فرما",
    target: 100,
    benefit: "موجب تقرب به ساحت حضرت صاحب‌الزمان (عج)، برآورده شدن حاجات و شفاعت در قیامت",
    ziyaratAr:
      "السَّلَامُ عَلَیْکَ یَا حُجَّةَ اللَّهِ فِی أَرْضِهِ، السَّلَامُ عَلَیْکَ یَا عَیْنَ اللَّهِ فِی خَلْقِهِ، السَّلَامُ عَلَیْکَ یَا نُورَ اللَّهِ الَّذِی یَهْتَدِی بِهِ الْمُهْتَدُونَ... عَجَّلَ اللَّهُ لَکَ مَا وَعَدَکَ مِنَ النَّصْرِ وَظُهُورِ الْأَمْرِ.",
    ziyaratFa:
      "سلام بر تو ای حجت خدا در زمینش، سلام بر تو ای دیدهٔ بیدار الهی در میان آفریدگانش، سلام بر تو ای نور خدا که هدایت‌جویان به آن راه می‌یابند... خداوند وعدهٔ یاری و ظهور امر تو را نزدیک گرداند.",
    salawatNote: "السَّلامُ عَلَیْکَ یا صاحِبَ الزَّمانِ",
  },
  {
    dayIndex: 6,
    dayFa: "شنبه",
    masoom: "حضرت ختمی‌مرتبت پیامبر اکرم محمد مصطفی (ص)",
    dhikrAr: "یَا رَبَّ الْعَالَمِینَ",
    dhikrFa: "ای پروردگار جهانیان",
    target: 100,
    benefit: "موجب بی‌نیازی از مردم، آرامش دل و استجابت دعا",
    ziyaratAr:
      "السَّلَامُ عَلَیْکَ یَا رَسُولَ اللَّهِ وَرَحْمَةُ اللَّهِ وَبَرَکَاتُهُ، السَّلَامُ عَلَیْکَ یَا مُحَمَّدَ بْنَ عَبْدِ اللَّهِ، السَّلَامُ عَلَیْکَ یَا خِیَرَةَ اللَّهِ.",
    ziyaratFa:
      "سلام و رحمت و برکات خدا بر تو ای رسول خدا، سلام بر تو ای محمد بن عبدالله، سلام بر تو ای برگزیدهٔ خدا.",
    salawatNote: "اللّهُمَّ صَلِّ عَلی مُحَمَّدٍ وَ آلِ مُحَمَّدٍ وَ عَجِّلْ فَرَجَهُمْ",
  },
];

const TASBIHAT_FATIMA = [
  { key: "akbar", ar: "اللَّهُ أَکْبَرُ", fa: "خداوند بزرگ‌تر از هر وصف است", max: 34 },
  { key: "hamd", ar: "الْحَمْدُ لِلَّهِ", fa: "ستایش مخصوص خداوند است", max: 33 },
  { key: "subhan", ar: "سُبْحَانَ اللَّهِ", fa: "پاک و منزه است خداوند", max: 33 },
];

const DUA_FARAJ = {
  title: "دعای سلامتی امام زمان (عج)",
  ar: "اللَّهُمَّ کُنْ لِوَلِیِّکَ الْحُجَّةِ بْنِ الْحَسَنِ، صَلَوَاتُکَ عَلَیْهِ وَعَلَىٰ آبَائِهِ، فِی هٰذِهِ السَّاعَةِ وَفِی کُلِّ سَاعَةٍ، وَلِیًّا وَحَافِظًا، وَقَائِدًا وَنَاصِرًا، وَدَلِیلًا وَعَیْنًا، حَتَّىٰ تُسْکِنَهُ أَرْضَکَ طَوْعًا، وَتُمَتِّعَهُ فِیهَا طَوِیلًا.",
  fa: "خدایا، برای ولیّت حجت بن الحسن که درودهایت بر او و پدرانش باد، در این ساعت و در هر ساعت، سرپرست و نگاهبان، و پیشوا و یاور، و راهنما و دیده‌بان باش، تا او را به رغبت مردم در زمینت سکونت دهی و زمان درازی او را از آن بهره‌مند سازی.",
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default function Dhikr() {
  const todayIdx = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(todayIdx);
  const [mode, setMode] = useState("daily"); // "daily" | "fatima" | "duas"

  // Daily dhikr counter persisted per calendar date + day tab
  const storageKey = `inebuly-dhikr:${todayKey()}:${selectedDay}`;
  const [count, setCount] = useState(0);

  // Tasbihat Hazrat Zahra (SA) state: total 0..100
  const [fatimaCount, setFatimaCount] = useState(0);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey) || 0);
      setCount(Number.isFinite(saved) && saved >= 0 ? saved : 0);
    } catch {
      setCount(0);
    }
  }, [storageKey]);

  const current = useMemo(
    () => SHIA_WEEKDAYS.find((d) => d.dayIndex === selectedDay) ?? SHIA_WEEKDAYS[todayIdx],
    [selectedDay, todayIdx],
  );

  const shamsiDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("fa-IR", { dateStyle: "full" }).format(new Date());
    } catch {
      return "";
    }
  }, []);

  const hijriDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("fa-IR-u-ca-islamic-umalqura", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date());
    } catch {
      return "";
    }
  }, []);

  function incrementDaily() {
    setCount((prev) => {
      const next = prev + 1;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {}
      if (next === current.target) {
        toast("تقبل‌الله! ذکر صدگانهٔ امروز به پایان رسید", "success");
      }
      return next;
    });
  }

  function resetDaily() {
    setCount(0);
    try {
      localStorage.setItem(storageKey, "0");
    } catch {}
  }

  // Compute current stage in Tasbihat Hazrat Zahra (SA)
  const fatimaStage = useMemo(() => {
    if (fatimaCount < 34) {
      return { ...TASBIHAT_FATIMA[0], stepCount: fatimaCount, done: false };
    }
    if (fatimaCount < 67) {
      return { ...TASBIHAT_FATIMA[1], stepCount: fatimaCount - 34, done: false };
    }
    if (fatimaCount < 100) {
      return { ...TASBIHAT_FATIMA[2], stepCount: fatimaCount - 67, done: false };
    }
    return { ...TASBIHAT_FATIMA[2], stepCount: 33, done: true };
  }, [fatimaCount]);

  const progressPct = Math.min(100, Math.round((count / current.target) * 100));

  // Order week starting from Saturday (6, 0, 1, 2, 3, 4, 5)
  const orderedDays = [6, 0, 1, 2, 3, 4, 5].map(
    (idx) => SHIA_WEEKDAYS.find((x) => x.dayIndex === idx),
  );

  return (
    <div className="bg-aurora flex h-[100dvh] flex-col overflow-hidden">
      <main className="scroll-thin flex-1 overflow-y-auto p-4 sm:p-7">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {/* Top Bar */}
          <div className="anim-rise flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              aria-label="بازگشت"
              className="press flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface-2/80 text-muted backdrop-blur-md hover:bg-surface-3 hover:text-fg"
            >
              <Icon name="arrow-right" size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-black text-fg sm:text-xl">اذکار، تسبیحات و زیارت روز</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                {shamsiDate && <span>{shamsiDate}</span>}
                {hijriDate && (
                  <>
                    <span className="text-accent">•</span>
                    <span>{hijriDate} قمری</span>
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/istikhara")}
              className="press flex items-center gap-1.5 rounded-xl border border-accent/35 bg-accent/14 px-3.5 py-2 text-xs font-bold text-accent backdrop-blur-md hover:bg-accent/24"
            >
              <Icon name="book" size={15} />
              <span>استخاره با قرآن</span>
            </button>
          </div>

          {/* Mode Tabs — concise responsive labels so they never truncate awkwardly on mobile */}
          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface/75 p-1 backdrop-blur-xl sm:gap-1.5 sm:p-1.5">
            {[
              { id: "daily", label: "ذکر و زیارت ایام هفته", short: "ذکر هفته", icon: "sparkles" },
              { id: "fatima", label: "تسبیحات حضرت زهرا (س)", short: "تسبیحات زهرا (س)", icon: "star" },
              { id: "duas", label: "دعای فرج و صلوات", short: "فرج و صلوات", icon: "moon" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id)}
                className={`no-glass-btn press flex min-w-0 items-center justify-center gap-1 rounded-xl border px-1.5 py-2.5 text-[11px] font-bold transition sm:gap-1.5 sm:px-3 sm:text-xs ${
                  mode === t.id
                    ? "border-accent/45 bg-accent/18 text-accent shadow-sm"
                    : "border-transparent text-muted hover:bg-surface-2/70 hover:text-fg"
                }`}
              >
                <Icon name={t.icon} size={14} className="shrink-0" />
                <span className="whitespace-nowrap sm:hidden">{t.short}</span>
                <span className="hidden truncate sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          {mode === "daily" && (
            <>
              {/* Weekday Selector (Saturday -> Friday) */}
              <div className="scroll-thin flex gap-1.5 overflow-x-auto pb-1">
                {orderedDays.map((d) => {
                  const isToday = d.dayIndex === todayIdx;
                  const active = d.dayIndex === selectedDay;
                  return (
                    <button
                      key={d.dayIndex}
                      type="button"
                      onClick={() => setSelectedDay(d.dayIndex)}
                      className={`press flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold backdrop-blur-md transition ${
                        active
                          ? "border-accent/55 bg-accent/20 text-accent shadow-sm"
                          : "border-line bg-surface/70 text-muted hover:bg-surface-2 hover:text-fg"
                      }`}
                    >
                      <span>{d.dayFa}</span>
                      {isToday && (
                        <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9.5px] font-black text-emerald-300">
                          امروز
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Main Dhikr Card + Interactive Counter */}
              <section className="anim-rise relative overflow-hidden rounded-3xl border border-line bg-surface/80 p-6 text-center shadow-xl backdrop-blur-2xl sm:p-8">
                <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-accent/15 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-accent-2/12 blur-3xl" />

                <div className="relative z-10 flex flex-col items-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/12 px-3.5 py-1 text-[11px] font-bold text-accent">
                    <Icon name="sparkles" size={13} />
                    <span>منسوب به: {current.masoom}</span>
                  </span>

                  <p className="quran-text mt-5 text-3xl leading-[2] text-fg sm:text-4xl" dir="rtl">
                    {current.dhikrAr}
                  </p>
                  <p className="mt-2 text-sm font-bold text-fg/85">{current.dhikrFa}</p>
                  <p className="mt-1.5 max-w-md text-[11px] leading-6 text-muted">
                    فضیلت ({faNum(current.target)} مرتبه): {current.benefit}
                  </p>

                  {/* Interactive Tasbih Ring Button */}
                  <div className="mt-6 flex flex-col items-center gap-3">
                    <button
                      type="button"
                      onClick={incrementDaily}
                      aria-label="ثبت ذکر"
                      className="press group relative flex h-32 w-32 flex-col items-center justify-center rounded-full border-2 border-accent/45 bg-accent/15 shadow-[0_12px_40px_rgb(var(--glow)/0.25)] backdrop-blur-xl transition hover:scale-[1.03] hover:border-accent hover:bg-accent/22"
                    >
                      <span className="text-3xl font-black tabular-nums text-fg">{faNum(count)}</span>
                      <span className="mt-0.5 text-[11px] font-bold text-accent">
                        از {faNum(current.target)}
                      </span>
                      <span className="mt-1 text-[9.5px] text-muted group-hover:text-fg">ضربه برای شمارش</span>
                    </button>

                    {/* Progress bar */}
                    <div className="h-1.5 w-52 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-200"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={resetDaily}
                        className="press flex items-center gap-1 rounded-xl border border-line bg-surface-2/80 px-3 py-1.5 text-[11px] font-bold text-muted hover:bg-surface-3 hover:text-fg"
                      >
                        <Icon name="refresh" size={13} /> بازنشانی شمارنده
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(`${current.dhikrAr}\n${current.dhikrFa}\n(ذکر روز ${current.dayFa})`)
                            .then(() => toast("ذکر روز کپی شد", "success"));
                        }}
                        className="press flex items-center gap-1 rounded-xl border border-line bg-surface-2/80 px-3 py-1.5 text-[11px] font-bold text-muted hover:bg-surface-3 hover:text-fg"
                      >
                        <Icon name="copy" size={13} /> کپی ذکر
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Daily Ziyarat of the Masoomin (AS) */}
              <section className="anim-rise rounded-2xl border border-line bg-surface/75 p-5 backdrop-blur-xl sm:p-6">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-black text-accent">
                    <Icon name="book" size={15} />
                    <span>زیارت روز {current.dayFa}</span>
                  </span>
                  <span className="rounded-lg border border-line bg-surface-2/80 px-2.5 py-0.5 text-[10px] font-bold text-muted">
                    مفاتیح‌الجنان
                  </span>
                </div>
                <p className="naskh-text text-lg leading-10 text-fg" dir="rtl">
                  {current.ziyaratAr}
                </p>
                <p className="mt-3 border-t border-line/70 pt-3 text-xs leading-7 text-muted">
                  {current.ziyaratFa}
                </p>
              </section>
            </>
          )}

          {mode === "fatima" && (
            <section className="anim-rise rounded-3xl border border-line bg-surface/80 p-6 text-center shadow-xl backdrop-blur-2xl sm:p-8">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/12 px-3.5 py-1 text-[11px] font-bold text-accent">
                <Icon name="star" size={13} />
                <span>تسبیحات حضرت فاطمه زهرا (سلام‌الله‌علیها)</span>
              </span>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {TASBIHAT_FATIMA.map((st, idx) => {
                  const doneCount =
                    idx === 0
                      ? Math.min(34, fatimaCount)
                      : idx === 1
                        ? Math.max(0, Math.min(33, fatimaCount - 34))
                        : Math.max(0, Math.min(33, fatimaCount - 67));
                  const isCurrent =
                    (idx === 0 && fatimaCount < 34) ||
                    (idx === 1 && fatimaCount >= 34 && fatimaCount < 67) ||
                    (idx === 2 && fatimaCount >= 67 && fatimaCount < 100);
                  return (
                    <div
                      key={st.key}
                      className={`rounded-2xl border p-3 transition ${
                        isCurrent
                          ? "border-accent/55 bg-accent/16 shadow-sm"
                          : doneCount === st.max
                            ? "border-emerald-400/35 bg-emerald-500/12"
                            : "border-line bg-surface-2/60"
                      }`}
                    >
                      <p className="naskh-text text-base font-bold text-fg">{st.ar}</p>
                      <p className="mt-1 text-xs font-black tabular-nums text-accent">
                        {faNum(doneCount)} / {faNum(st.max)}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-7 flex flex-col items-center gap-3">
                <p className="quran-text text-3xl text-fg">{fatimaStage.ar}</p>
                <p className="text-xs text-muted">{fatimaStage.fa}</p>

                <button
                  type="button"
                  onClick={() => {
                    if (fatimaCount >= 100) {
                      setFatimaCount(0);
                      return;
                    }
                    const next = fatimaCount + 1;
                    setFatimaCount(next);
                    if (next === 100) toast("تسبیحات حضرت زهرا (س) کامل شد — تقبل‌الله", "success");
                  }}
                  className="press mt-2 flex h-32 w-32 flex-col items-center justify-center rounded-full border-2 border-accent/50 bg-accent/18 shadow-[0_12px_40px_rgb(var(--glow)/0.25)] backdrop-blur-xl transition hover:scale-[1.03] hover:bg-accent/26"
                >
                  {fatimaStage.done ? (
                    <>
                      <Icon name="check" size={28} className="text-emerald-400" />
                      <span className="mt-1 text-xs font-black text-emerald-300">کامل شد (۱۰۰)</span>
                      <span className="text-[10px] text-muted">شروع مجدد</span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl font-black tabular-nums text-fg">
                        {faNum(fatimaStage.stepCount)}
                      </span>
                      <span className="text-[11px] font-bold text-accent">
                        از {faNum(fatimaStage.max)}
                      </span>
                      <span className="mt-1 text-[9.5px] text-muted">کل: {faNum(fatimaCount)}/۱۰۰</span>
                    </>
                  )}
                </button>

                {fatimaCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFatimaCount(0)}
                    className="press mt-1 flex items-center gap-1 rounded-xl border border-line bg-surface-2/80 px-3 py-1.5 text-[11px] font-bold text-muted hover:text-fg"
                  >
                    <Icon name="refresh" size={13} /> شروع از ابتدا
                  </button>
                )}
              </div>
            </section>
          )}

          {mode === "duas" && (
            <div className="space-y-4">
              <section className="anim-rise rounded-3xl border border-line bg-surface/80 p-6 backdrop-blur-2xl sm:p-7">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-black text-accent">
                    <Icon name="sparkles" size={16} />
                    <span>{DUA_FARAJ.title}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard
                        ?.writeText(`${DUA_FARAJ.ar}\n${DUA_FARAJ.fa}`)
                        .then(() => toast("دعای فرج کپی شد", "success"))
                    }
                    className="press flex items-center gap-1 rounded-xl border border-line bg-surface-2/80 px-2.5 py-1 text-[11px] font-bold text-muted hover:text-fg"
                  >
                    <Icon name="copy" size={12} /> کپی
                  </button>
                </div>
                <p className="quran-text text-xl leading-[2.2] text-fg sm:text-2xl" dir="rtl">
                  {DUA_FARAJ.ar}
                </p>
                <p className="mt-4 border-t border-line/70 pt-3 text-xs leading-7 text-muted">
                  {DUA_FARAJ.fa}
                </p>
              </section>

              <section className="anim-rise rounded-2xl border border-accent/30 bg-accent/10 p-5 text-center backdrop-blur-xl">
                <p className="text-xs font-bold text-accent">صلوات خاصه با تعجیل فرج</p>
                <p className="quran-text mt-2 text-2xl text-fg">
                  اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَآلِ مُحَمَّدٍ وَعَجِّلْ فَرَجَهُمْ
                </p>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
