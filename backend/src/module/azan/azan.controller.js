import { HttpError } from "../../utils/http/http.util.js";
import * as azanService from "./azan.service.js";

export const sounds = async (req, res) => res.json({ sounds: await azanService.listSounds() });

export const addSound = async (req, res) => {
  const form = await req.raw.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "فایل صوتی ارسال نشده است");
  res.status(201).json({ sound: await azanService.addSound(req.me, file) }, "صدای اذان اضافه شد");
};

export const removeSound = async (req, res) => {
  await azanService.removeSound(req.me, req.id("id"));
  res.json({ ok: true }, "صدای اذان حذف شد");
};

export const soundAudio = async (req, res) => {
  const { file, data } = await azanService.readSoundAudio(req.id("id"));
  res
    .set("Content-Length", String(data.length))
    .set("Cache-Control", "private, max-age=300")
    .set("X-Content-Type-Options", "nosniff")
    .set("Content-Security-Policy", "sandbox; default-src 'none'; media-src 'self'")
    .set("Content-Disposition", "inline")
    .send(new Uint8Array(data), file.mime);
};

export const getSettings = async (req, res) => res.json({ settings: await azanService.getSettings(req.me) });

export const saveSettings = async (req, res) => res.json({ settings: await azanService.saveSettings(req.me, req.input) }, "تنظیمات اذان ذخیره شد");
