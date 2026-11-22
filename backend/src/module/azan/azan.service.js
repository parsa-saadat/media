import { env } from "../../config/env.config.js";
import { deleteFiles, findOneFile, insertFile, readFileData } from "../../model/controller/storage/storage.controller.js";
import { deleteSounds, findSounds, findOneSound, insertSound } from "../../model/controller/azan/azan.controller.js";
import { findOneUser, updateOneUser } from "../../model/controller/users/users.controller.js";
import { HttpError } from "../../utils/http/http.util.js";
import { resolveMime } from "../../utils/validators/file.validator.js";

export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
export const PRAYER_LABELS = { fajr: "اذان صبح", dhuhr: "اذان ظهر", asr: "اذان عصر", maghrib: "اذان مغرب", isha: "اذان عشاء" };

const AUDIO_MIMES = new Set(["audio/mpeg", "audio/mp3", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/webm"]);
const AUDIO_MAX = 15 * 1024 * 1024;

export const DEFAULT_SETTINGS = {
  enabled: false,
  prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  soundFileId: null,
  volume: 80,
  city: { name: "تهران", lat: 35.6892, lng: 51.389 },
};

/** Generates a gentle melodious WAV clip so Azan always has a default audio file out of the box. */
function buildDefaultAzanWav() {
  const rate = 22050;
  // Gentle Hijaz-inspired chime notes (frequency Hz, duration sec)
  const notes = [
    [293.66, 0.7], // D4
    [311.13, 0.55], // Eb4
    [369.99, 0.85], // F#4
    [392.0, 0.9], // G4
    [440.0, 0.7], // A4
    [392.0, 0.65], // G4
    [369.99, 0.8], // F#4
    [311.13, 0.6], // Eb4
    [293.66, 1.3], // D4
  ];
  const samples = [];
  for (const [hz, sec] of notes) {
    const count = Math.floor(rate * sec);
    for (let i = 0; i < count; i++) {
      const t = i / rate;
      const attack = Math.min(1, i / (rate * 0.04));
      const release = Math.min(1, (count - i) / (rate * 0.18));
      const envVal = attack * release;
      const wave =
        0.55 * Math.sin(2 * Math.PI * hz * t) +
        0.25 * Math.sin(2 * Math.PI * 2 * hz * t) +
        0.1 * Math.sin(2 * Math.PI * 3 * hz * t);
      samples.push(Math.max(-1, Math.min(1, 0.28 * envVal * wave)));
    }
  }
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
  }
  return buffer;
}

/** Seeds a default Azan sound once so users can test and receive audio calls immediately. */
export async function ensureAzanSeed() {
  const existing = await findSounds();
  if (existing.length > 0) return;
  const wav = buildDefaultAzanWav();
  const stored = await insertFile(
    { name: "azan-default.wav", mime: "audio/wav", size: wav.length, uploaderId: 0, purpose: "azan" },
    wav,
  );
  await insertSound({ fileId: stored._id, name: "نوای ملکوتی اذان (پیش‌فرض)", uploaderId: 0, size: wav.length });
}

/** The sound library every signed-in user can pick from. */
export const listSounds = () => findSounds();

/** Resolves a sound by either its fileId or its own _id so client calls never mismatch. */
async function resolveSound(idOrFileId) {
  return (await findOneSound({ fileId: idOrFileId })) ?? (await findOneSound({ _id: idOrFileId }));
}

export async function addSound(me, file) {
  if (!me.permissions.includes("azan.manage")) throw new HttpError(403, "فقط مدیر می‌تواند صدای اذان اضافه کند");
  if (file.size === 0) throw new HttpError(400, "فایل صوتی خالی است");
  if (file.size > AUDIO_MAX) throw new HttpError(413, "حداکثر حجم فایل صوتی ۱۵ مگابایت است");
  const mime = resolveMime(file.name, file.type);
  if (!AUDIO_MIMES.has(mime)) throw new HttpError(400, "فرمت فایل باید MP3، OGG، WAV یا AAC باشد");
  const stored = await insertFile(
    { name: `azan-${file.name.slice(0, 120) || "clip"}`, mime, size: file.size, uploaderId: me.id, purpose: "azan" },
    Buffer.from(await file.arrayBuffer()),
  );
  const name = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "اذان";
  return insertSound({ fileId: stored._id, name, uploaderId: me.id, size: file.size });
}

export async function removeSound(me, id) {
  if (!me.permissions.includes("azan.manage")) throw new HttpError(403, "فقط مدیر می‌تواند صدای اذان را حذف کند");
  const sound = await resolveSound(id);
  if (!sound) throw new HttpError(404, "این صدا پیدا نشد");
  await deleteSounds({ _id: sound._id });
  // anybody who had this clip selected falls back to silence until they pick another one
  await updateOneUser({ "azan.soundFileId": sound.fileId }, { "azan.soundFileId": null });
  await deleteFiles([sound.fileId]);
  return { ok: true };
}

export async function readSoundAudio(idOrFileId) {
  const sound = await resolveSound(idOrFileId);
  if (!sound) throw new HttpError(404, "این صدا پیدا نشد");
  const file = await findOneFile({ _id: sound.fileId });
  if (!file) throw new HttpError(404, "فایل صوتی پیدا نشد");
  return { file, data: await readFileData(file) };
}

function mergeSettings(raw, sounds) {
  const mergedPrayers = { ...DEFAULT_SETTINGS.prayers, ...(raw?.prayers ?? {}) };
  for (const p of PRAYERS) mergedPrayers[p] = mergedPrayers[p] !== false;
  let soundFileId = raw?.soundFileId ?? null;
  if (soundFileId && !sounds.some((s) => s.fileId === soundFileId)) {
    soundFileId = sounds[0]?.fileId ?? null;
  } else if (soundFileId === null && raw?.soundFileId === undefined && sounds.length > 0) {
    soundFileId = sounds[0].fileId;
  }
  return {
    enabled: Boolean(raw?.enabled ?? DEFAULT_SETTINGS.enabled),
    prayers: mergedPrayers,
    soundFileId,
    volume: typeof raw?.volume === "number" ? raw.volume : DEFAULT_SETTINGS.volume,
    city: raw?.city && Number.isFinite(raw.city.lat) && Number.isFinite(raw.city.lng) ? raw.city : DEFAULT_SETTINGS.city,
    sounds,
  };
}

export async function getSettings(me) {
  const user = await findOneUser({ _id: me.id });
  if (!user) throw new HttpError(404, "کاربر پیدا نشد");
  const sounds = await listSounds();
  return mergeSettings(user.azan, sounds);
}

export async function saveSettings(me, input) {
  const current = await findOneUser({ _id: me.id });
  if (!current) throw new HttpError(404, "کاربر پیدا نشد");
  const sounds = await listSounds();
  const existingAzan = current.azan ?? {};
  const defaultSoundId = existingAzan.soundFileId !== undefined ? existingAzan.soundFileId : (sounds[0]?.fileId ?? null);
  const next = {
    enabled: typeof existingAzan.enabled === "boolean" ? existingAzan.enabled : DEFAULT_SETTINGS.enabled,
    prayers: { ...DEFAULT_SETTINGS.prayers, ...(existingAzan.prayers ?? {}) },
    soundFileId: defaultSoundId,
    volume: typeof existingAzan.volume === "number" ? existingAzan.volume : DEFAULT_SETTINGS.volume,
    city: existingAzan.city ?? DEFAULT_SETTINGS.city,
  };

  if (typeof input.enabled === "boolean") next.enabled = input.enabled;
  if (input.prayers && typeof input.prayers === "object") {
    const prayers = { ...next.prayers };
    for (const prayer of PRAYERS) {
      if (prayer in input.prayers) prayers[prayer] = input.prayers[prayer] !== false;
    }
    next.prayers = prayers;
  }
  if (input.soundFileId !== undefined) {
    if (input.soundFileId === null) next.soundFileId = null;
    else {
      const sound = await resolveSound(input.soundFileId);
      if (!sound) throw new HttpError(404, "این صدای اذان وجود ندارد");
      next.soundFileId = sound.fileId;
    }
  }
  if (input.volume !== undefined) {
    const volume = Math.trunc(Number(input.volume));
    if (Number.isFinite(volume)) next.volume = Math.min(100, Math.max(0, volume));
  }
  if (input.city !== undefined) {
    if (input.city === null) next.city = DEFAULT_SETTINGS.city;
    else if (input.city && Number.isFinite(Number(input.city.lat)) && Number.isFinite(Number(input.city.lng))) {
      next.city = { name: String(input.city.name ?? "").slice(0, 60), lat: Number(input.city.lat), lng: Number(input.city.lng) };
    }
  }

  await updateOneUser({ _id: me.id }, { azan: next });
  return mergeSettings(next, sounds);
}
