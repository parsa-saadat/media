import { useEffect, useState } from "react";
import { AZAN_EVENT, PRAYER_NAMES, prayerTimesFor } from "../../hooks/useAzan";
import { faNum, formatTime } from "../../utils/client";
import { Icon } from "./Icon";

/** Full-screen azan call with a moon-night backdrop and a stop button. */
export default function AzanOverlay({ onStop }) {
  const [ringing, setRinging] = useState(null);

  useEffect(() => {
    const onAzan = (e) => setRinging(e.detail?.prayer ? e.detail : null);
    window.addEventListener(AZAN_EVENT, onAzan);
    return () => window.removeEventListener(AZAN_EVENT, onAzan);
  }, []);

  if (!ringing) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="alertdialog" aria-label={PRAYER_NAMES[ringing.prayer]}>
      <div className="anim-fade-in absolute inset-0" style={{ background: "radial-gradient(900px 600px at 50% 0%, #14343f 0%, #050a12 55%, #020409 100%)" }} />
      <div className="anim-fade-in pointer-events-none absolute inset-0 opacity-40" style={{ background: "repeating-radial-gradient(circle at 50% 35%, transparent 0 90px, rgba(241,196,15,.05) 90px 92px)" }} />
      <div className="anim-rise relative w-full max-w-md rounded-xl bg-white/5 p-8 text-center text-white backdrop-blur-xl ring-1 ring-white/10">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300 shadow-[0_0_60px_rgba(251,191,36,.35)]">
          <Icon name="bell" size={32} />
        </span>
        <p className="mt-5 text-[11px] font-black tracking-[0.3em] text-amber-300/80">اَللّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَآلِ مُحَمَّد</p>
        <h2 className="mt-3 text-2xl font-black">{PRAYER_NAMES[ringing.prayer] ?? "اذان"}</h2>
        <p className="mt-2 text-sm leading-7 text-white/60">وقت {ringing.name} است؛ به یاد خدا باشید.</p>
        <button
          onClick={onStop}
          className="press mt-7 w-full rounded-lg bg-white/10 py-3 text-sm font-bold text-white hover:bg-white/20"
        >
          <span className="flex items-center justify-center gap-2"><Icon name="volume-off" size={16} /> توقف پخش اذان</span>
        </button>
        <p className="mt-3 text-[10px] text-white/35">مدیریت از: تنظیمات → اذان</p>
      </div>
    </div>
  );
}

/** A small strip listing today's prayer times — shown where the user is signed in. */
export function PrayerTimesStrip({ city }) {
  const times = prayerTimesFor(city);
  if (!times) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-muted">
      {Object.entries(times).map(([prayer, at]) => (
        <span key={prayer} className="flex items-center gap-1">
          <Icon name="clock" size={10} />
          {PRAYER_NAMES[prayer]}: <span className="tabular-nums">{at ? formatTime(at) : "—"}</span>
        </span>
      ))}
      <span className="sr-only">{faNum(1)}</span>
    </div>
  );
}
