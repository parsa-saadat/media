import { useEffect, useRef, useState } from "react";
import { fetchAuthedBlob, faNum, toast } from "../../utils/client";
import { Avatar } from "../common/Ui";
import { Icon } from "../common/Icon";

function time(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "۰:۰۰";
  return faNum(`${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`);
}

export default function BotPlayer({
  track, mine, volume, outputId, serverTimeDelta, onPause, onResume, onStop,
}) {
  const [src, setSrc] = useState("");
  const [needsClick, setNeedsClick] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);
  const native = track.kind === "url" || track.kind === "upload";
  const expectedTime = () => track.position + (track.playing ? Math.max(0, (Date.now() + serverTimeDelta - new Date(track.startedAt).getTime()) / 1000) : 0);

  useEffect(() => {
    if (track.kind !== "upload" || !track.fileId) { setSrc(track.url || ""); return; }
    let objectUrl = "";
    let alive = true;
    fetchAuthedBlob(`/api/files/${track.fileId}`).then((blob) => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => toast("دریافت فایل صوتی ممکن نیست", "error"));
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [track.kind, track.fileId, track.url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src || !native) return;
    audio.volume = Math.max(0, Math.min(1, volume / 100));
    if (outputId && typeof audio.setSinkId === "function" && audio.sinkId !== outputId) {
      void audio.setSinkId(outputId).catch(() => {});
    }
  }, [outputId, volume, src, native]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src || !native) return;
    const sync = () => {
      const expected = expectedTime();
      const pos = Number.isFinite(audio.duration) ? Math.min(expected, Math.max(0, audio.duration - 0.15)) : expected;
      if (Math.abs(audio.currentTime - pos) > 2) try { audio.currentTime = pos; } catch {}
      if (track.playing) void audio.play().then(() => setNeedsClick(false)).catch(() => setNeedsClick(true));
      else { audio.pause(); setNeedsClick(false); }
    };
    if (audio.readyState >= 1) sync();
    else audio.addEventListener("loadedmetadata", sync, { once: true });
    return () => audio.removeEventListener("loadedmetadata", sync);
    // only re-sync after a track action or source change, not every poll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, track.updatedAt, track.playing, native]);

  const embed = (() => {
    if (!track.url) return "";
    if (track.kind === "spotify") {
      try { const u = new URL(track.url); return u.hostname === "open.spotify.com" ? `https://open.spotify.com/embed${u.pathname}?theme=0` : ""; } catch { return ""; }
    }
    if (track.kind === "soundcloud") return `https://w.soundcloud.com/player/?url=${encodeURIComponent(track.url)}&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false`;
    return "";
  })();

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface-2/70">
      <div className="flex items-center gap-2.5 px-3 py-3">
        <Avatar name={track.ownerName} color={track.ownerColor} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold" dir="auto">{track.title}</p>
          <p className="truncate text-[10px] text-muted">ربات {track.ownerName} · {track.kind === "spotify" ? "Spotify" : track.kind === "soundcloud" ? "SoundCloud" : track.kind === "upload" ? "فایل آپلودی" : "لینک مستقیم"}</p>
        </div>
        {native && <span className="text-[10px] text-muted">{time(current)}{duration ? ` / ${time(duration)}` : ""}</span>}
      </div>
      {native ? <>
        <audio
          ref={audioRef}
          src={src || undefined}
          preload="auto"
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => { if (mine && track.playing) onStop(); }}
          className="hidden"
        />
        <div className="h-1 bg-line"><div className="grad-accent h-full transition-all" style={{ width: `${duration ? Math.min(100, (current / duration) * 100) : 0}%` }} /></div>
        {needsClick && track.playing && <button onClick={() => { const a = audioRef.current; if (a) { a.currentTime = expectedTime(); void a.play().then(() => setNeedsClick(false)).catch(() => toast("مرورگر پخش خودکار صدا را مسدود کرده است", "error")); } }} className="flex w-full items-center justify-center gap-2 bg-accent/15 p-2 text-xs font-bold text-accent"><Icon name="music" size={15} /> برای شنیدن، اینجا کلیک کنید</button>}
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1"><Icon name="music" size={12} />{track.playing ? "در حال پخش در اتاق" : "مکث شده"}</span>
          {mine && <div className="flex gap-1">
            <button onClick={track.playing ? onPause : onResume} className="rounded-lg bg-accent/15 px-2 py-1 text-accent">{track.playing ? "مکث" : "ادامه"}</button>
            <button onClick={onStop} className="rounded-lg bg-rose-500/15 px-2 py-1 text-rose-400">توقف</button>
          </div>}
        </div>
      </> : <>
        {embed && <iframe title={`${track.kind} ${track.title}`} src={embed} width="100%" height={track.kind === "spotify" ? 152 : 120} loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" referrerPolicy="no-referrer" className="block w-full border-0" />}
        <p className="px-3 py-2 text-[10px] leading-5 text-muted">پلیر رسمی: هر شنونده خودش پخش و حجم صدا را در پلیر کنترل می‌کند. صدای دارای حق نشر به تماس منتقل نمی‌شود.</p>
        {mine && <button onClick={onStop} className="mx-3 mb-2 rounded-lg bg-rose-500/15 px-2 py-1 text-[11px] text-rose-400">حذف از اتاق</button>}
      </>}
    </div>
  );
}
