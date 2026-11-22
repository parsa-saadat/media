import { HttpError } from "../../utils/http/http.util.js";
import { isInlineSafe } from "../../utils/validators/file.validator.js";
import * as storageService from "./storage.service.js";

export const upload = async (req, res) => {
  const form = await req.raw.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "فایلی ارسال نشده است");
  res.status(201).json({ file: await storageService.uploadFile(req.me, file) });
};

export const download = async (req, res) => {
  const { file, data } = await storageService.readFileFor(req.me, req.id());
  const inline = isInlineSafe(file.mime) && req.query.get("download") !== "1";
  res
    .set("Content-Length", String(data.length))
    .set("Cache-Control", "private, max-age=300")
    // Uploaded content must never run as a page of this site.
    .set("X-Content-Type-Options", "nosniff")
    .set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'; media-src 'self'")
    .set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`)
    .send(new Uint8Array(data), file.mime);
};

export const quota = async (req, res) => res.json(await storageService.imageQuota(req.me));

export const uploadAvatar = async (req, res) => {
  const form = await req.raw.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "عکسی ارسال نشده است");
  res.status(201).json(await storageService.setAvatar(req.me, file), "عکس پروفایل ذخیره شد");
};

export const removeAvatar = async (req, res) => {
  await storageService.clearAvatar(req.me);
  res.json({ ok: true }, "عکس پروفایل حذف شد");
};

export const avatar = async (req, res) => {
  const { file, data } = await storageService.readAvatar(req.id("userId"));
  res
    .set("Content-Length", String(data.length))
    .set("Cache-Control", "private, max-age=600")
    .set("X-Content-Type-Options", "nosniff")
    .set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'")
    .set("Content-Disposition", "inline")
    .send(new Uint8Array(data), file.mime);
};
