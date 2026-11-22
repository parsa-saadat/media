import { HttpError } from "../../utils/http/http.util.js";
import * as profileService from "./profile.service.js";

const fileOf = async (req) => {
  const form = await req.raw.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "عکسی ارسال نشده است");
  return { file, makeAvatar: form?.get("avatar") === "true" };
};

export const myProfile = async (req, res) => res.json(await profileService.myProfile(req.me));
export const publicProfile = async (req, res) => res.json({ profile: await profileService.publicProfile(req.me, req.id("userId")) });
export const addPhoto = async (req, res) => { const { file, makeAvatar } = await fileOf(req); res.status(201).json(await profileService.addPhoto(req.me, file, makeAvatar), "عکس اضافه شد"); };
export const removePhoto = async (req, res) => res.json(await profileService.removePhoto(req.me, req.id("fileId")), "عکس حذف شد");
export const setAvatar = async (req, res) => res.json(await profileService.setAvatar(req.me, req.id("fileId")), "عکس پروفایل اصلی تغییر کرد");
export const setStatus = async (req, res) => { await profileService.setStatus(req.me, req.input); res.json({ ok: true }, "وضعیت ذخیره شد"); };

export const addBanner = async (req, res) => {
  const form = await req.raw.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "تصویری ارسال نشده است");
  res.status(201).json(await profileService.setBanner(req.me, file), "بنر پروفایل ذخیره شد");
};

export const removeBanner = async (req, res) => {
  await profileService.removeBanner(req.me);
  res.json({ ok: true }, "بنر حذف شد");
};

export const banner = async (req, res) => {
  const { file, data } = await profileService.readBanner(req.id("userId"));
  res
    .set("Content-Length", String(data.length))
    .set("Cache-Control", "private, max-age=600")
    .set("X-Content-Type-Options", "nosniff")
    .set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'")
    .set("Content-Disposition", "inline")
    .send(new Uint8Array(data), file.mime);
};
