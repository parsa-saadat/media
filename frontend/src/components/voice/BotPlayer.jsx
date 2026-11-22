import { useEffect, useRef, useState } from "react";
import { fetchAuthedBlob, faNum, toast } from "../../utils/client";
import { Avatar } from "../common/Ui";
import { Icon } from "../common/Icon";

function time(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "۰:۰۰";
  return faNum(`${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`);
}

const ORIGIN_LABEL = {
  soundcloud: "استریم مستقیم سرور از SoundCloud",
  url: "استریم مستقیم سرور از لینک صوتی",
  upload: "فایل آپلودشده در سرور",
};

/**
 * Synchronized room music bot player.
 * Every track (SoundCloud, direct audio link, or uploaded file) is fetched & stored by our backend
 * and streamed directly from `/api/files/:fileId` into native `<audio>` — never an external iframe!
 */
export default function BotPlayer({
  track,
  mine,
  canStop = false,
  volume,
  outputId,
  serverTimeDelta,
  onPause,
  onResume,
  onStop,
}) {
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsClick, setNeedsClick] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  const expectedTime = () =>
    track.position +
    (track.playing ? Math.max(0, (Date.now() + serverTimeDelta - new Date(track.startedAt).getTime()) / 1000) : 0);

  useEffect(() => {
    if (!track.fileId) {
      setSrc(track.url || "");
      return;
    }
    let objectUrl = "";
    let alive = true;
    setLoading(true);
    fetchAuthedBlob(`/api/files/${track.fileId}`)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (alive) toast("دریافت صدای ربات از سرور ممکن نشد", "error");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [track.fileId, track.url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    audio.volume = Math.max(0, Math.min(1, volume / 100));
    if (outputId && typeof audio.setSinkId === "function" && audio.sinkId !== outputId) {
      void audio.setSinkId(outputId).catch(() => {});
    }
  }, [outputId, volume, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    const sync = () => {
      const expected = expectedTime();
      const pos = Number.isFinite(audio.duration) ? Math.min(expected, Math.max(0, audio.duration - 0.15)) : expected;
      if (Math.abs(audio.currentTime - pos) > 2) {
        try {
          audio.currentTime = pos;
        } catch {
          /* ignore */
        }
      }
      if (track.playing) {
        void audio
          .play()
          .then(() => setNeedsClick(false))
          .catch(() => setNeedsClick(true));
      } else {
        audio.pause();
        setNeedsClick(false);
      }
    };
    if (audio.readyState >= 1) sync();
    else audio.addEventListener("loadedmetadata", sync, { once: true });
    return () => audio.removeEventListener("loadedmetadata", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, track.updatedAt, track.playing]);

  const originLabel = ORIGIN_LABEL[track.originKind || track.kind] || "استریم صوتی سرور";

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#232329] text-[#e8eaed] shadow-xl">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar name={track.ownerName} color={track.ownerColor} size={34} userId={track.userId} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-white" dir="auto">
            {track.title}
          </p>
          <p className="truncate text-[10px] text-white/55">
            ربات {track.ownerName} · {originLabel}
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-white/65">
          {loading ? "بارگذاری…" : `${time(current)}${duration ? ` / ${time(duration)}` : ""}`}
        </span>
      </div>

      <audio
        ref={audioRef}
        src={src || undefined}
        preload="auto"
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => {
          if (mine && track.playing) onStop();
        }}
        className="hidden"
      />

      <div className="h-1 bg-white/10">
        <div
          className="grad-accent h-full transition-all"
          style={{ width: `${duration ? Math.min(100, (current / duration) * 100) : 0}%` }}
        />
      </div>

      {needsClick && track.playing && (
        <button
          onClick={() => {
            const a = audioRef.current;
            if (a) {
              a.currentTime = expectedTime();
              void a
                .play()
                .then(() => setNeedsClick(false))
                .catch(() => toast("مرورگر پخش خودکار صدا را مسدود کرده است", "error"));
            }
          }}
          className="flex w-full items-center justify-center gap-2 bg-accent/20 p-2 text-xs font-bold text-[#8ab4f8] hover:bg-accent/30"
        >
          <Icon name="music" size={14} /> برای شنیدن صدای ربات، اینجا کلیک کنید
        </button>
      )}

      <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-white/65">
        <span className="flex items-center gap-1.5">
          <Icon name="music" size={12} className={track.playing ? "text-emerald-400" : "text-amber-400"} />
          {loading ? "در حال دریافت از سرور…" : track.playing ? "در حال پخش هماهنگ در اتاق" : "مکث شده"}
        </span>
        {(mine || canStop) && (
          <div className="flex items-center gap-1.5">
            {mine && (
              <button
                onClick={track.playing ? onPause : onResume}
                className="rounded-lg bg-white/10 px-2.5 py-1 font-bold text-white hover:bg-white/20"
              >
                {track.playing ? "مکث" : "ادامه"}
              </button>
            )}
            <button
              onClick={onStop}
              className="rounded-lg bg-rose-500/20 px-2.5 py-1 font-bold text-rose-300 hover:bg-rose-500/35"
            >
              توقف
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
