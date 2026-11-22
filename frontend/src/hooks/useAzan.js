import { useCallback, useEffect, useRef, useState } from "react";
import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";
import { apiFetch, fetchAuthedBlob } from "../utils/client";
import { DEFAULT_CITY } from "../config/cities";

const PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
export const PRAYER_NAMES = { fajr: "اذان صبح", dhuhr: "اذان ظهر", asr: "اذان عصر", maghrib: "اذان مغرب", isha: "اذان عشاء" };
export const AZAN_EVENT = "voxsy:azan";
export const AZAN_TEST_EVENT = "voxsy:azan-test";
/** Fired after the settings modal saves; every mounted scheduler picks the new values up. */
export const AZAN_SETTINGS_EVENT = "voxsy:azan-settings";

const dayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function readPlayed() {
  try {
    const raw = JSON.parse(localStorage.getItem("voxsy-azan-played") || "{}");
    return raw.day === dayKey() ? raw : { day: dayKey(), done: {} };
  } catch {
    return { day: dayKey(), done: {} };
  }
}

function markPlayed(prayer) {
  const state = readPlayed();
  state.done[prayer] = true;
  try {
    localStorage.setItem("voxsy-azan-played", JSON.stringify(state));
  } catch {
    /* storage blocked */
  }
}

/** Plays an Azan sound clip via authenticated blob fetch so token headers always reach the server. */
export async function playAzanAudio(soundIdOrFileId, volume = 80, audioRefObj) {
  if (!soundIdOrFileId) return null;
  const blob = await fetchAuthedBlob(`/api/azan/sounds/${soundIdOrFileId}/audio`);
  const objectUrl = URL.createObjectURL(blob);
  const audio = audioRefObj?.current ?? new Audio();
  if (audioRefObj) audioRefObj.current = audio;
  if (audio.__objectUrl) URL.revokeObjectURL(audio.__objectUrl);
  audio.__objectUrl = objectUrl;
  audio.src = objectUrl;
  audio.volume = Math.min(1, Math.max(0, (volume ?? 80) / 100));
  await audio.play();
  return audio;
}

/** Today's prayer times for a city, as Date objects keyed by prayer. */
export function prayerTimesFor(city) {
  if (!city) return null;
  try {
    const coords = new Coordinates(city.lat, city.lng);
    const params = CalculationMethod.Tehran();
    const times = new PrayerTimes(coords, new Date(), params);
    const out = {};
    for (const key of PRAYER_KEYS) out[key] = times.timeForPrayer(key) ?? null;
    return out;
  } catch {
    return null;
  }
}

/**
 * Azan scheduler: keeps the user's azan settings, and checks the city's prayer
 * times against the clock. When a prayer (that the user kept enabled) arrives, its chosen sound
 * plays and an overlay with a stop button is shown. Each prayer rings once per day.
 */
export function useAzan(me) {
  const [settings, setSettings] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const audioRef = useRef(null);
  const ringingRef = useRef(null);
  const settingsRef = useRef(null);
  settingsRef.current = settings;

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      if (audioRef.current.__objectUrl) {
        URL.revokeObjectURL(audioRef.current.__objectUrl);
        audioRef.current.__objectUrl = null;
      }
    }
    ringingRef.current = null;
    window.dispatchEvent(new CustomEvent(AZAN_EVENT, { detail: { prayer: null } }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch("/api/azan/settings");
      const next = { ...data.settings, city: data.settings.city ?? DEFAULT_CITY };
      setSettings(next);
      if (!next.enabled && ringingRef.current) stop();
      return true;
    } catch {
      return false;
    }
  }, [stop]);

  useEffect(() => {
    if (!me) return;
    void refresh();
  }, [me, refresh]);

  // the settings modal broadcasts its saves so the scheduler stays in sync
  useEffect(() => {
    if (!me) return;
    const onSaved = () => void refresh();
    window.addEventListener(AZAN_SETTINGS_EVENT, onSaved);
    return () => window.removeEventListener(AZAN_SETTINGS_EVENT, onSaved);
  }, [me, refresh]);

  // tick every 15s to check prayer arrival
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    setNow(new Date());
    return () => clearInterval(t);
  }, []);

  const play = useCallback(
    (prayer, soundFileId, volume, isTest = false) => {
      if (!isTest) markPlayed(prayer);
      ringingRef.current = prayer;
      window.dispatchEvent(new CustomEvent(AZAN_EVENT, { detail: { prayer, name: PRAYER_NAMES[prayer] ?? "اذان" } }));
      if (!soundFileId) return;
      playAzanAudio(soundFileId, volume, audioRef)
        .then((audio) => {
          if (audio) audio.onended = () => stop();
        })
        .catch(() => {
          /* autoplay may be blocked until the user interacts — the overlay still shows */
        });
    },
    [stop],
  );

  useEffect(() => {
    const onTest = (e) => {
      const s = settingsRef.current;
      const prayer = e.detail?.prayer || "dhuhr";
      const soundFileId = e.detail?.soundFileId ?? s?.soundFileId ?? s?.sounds?.[0]?.fileId ?? null;
      const volume = e.detail?.volume ?? s?.volume ?? 80;
      play(prayer, soundFileId, volume, true);
    };
    window.addEventListener(AZAN_TEST_EVENT, onTest);
    return () => window.removeEventListener(AZAN_TEST_EVENT, onTest);
  }, [play]);

  useEffect(() => {
    const s = settingsRef.current;
    if (!s || !s.enabled || !s.city) return;
    if (ringingRef.current) return; // one azan at a time
    const played = readPlayed();
    const times = prayerTimesFor(s.city);
    if (!times) return;
    const remaining = Object.entries(times)
      .filter(([prayer, at]) => at && s.prayers?.[prayer] !== false && !played.done[prayer])
      .sort((a, b) => a[1] - b[1]);
    for (const [prayer, at] of remaining) {
      const diff = now - at;
      if (diff >= 0 && diff < 120_000) {
        const chosenSound = s.soundFileId ?? s.sounds?.[0]?.fileId ?? null;
        play(prayer, chosenSound, s.volume, false);
        break;
      }
    }
  }, [now, settings, play]);

  const save = useCallback(async (patch) => {
    const data = await apiFetch("/api/azan/settings", { method: "PATCH", json: patch });
    setSettings(data.settings);
    window.dispatchEvent(new CustomEvent(AZAN_SETTINGS_EVENT));
    return data.settings;
  }, []);

  return { settings, refresh, save, stop, now };
}
