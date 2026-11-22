import { HttpError } from "../../utils/http/http.util.js";
import * as contentService from "./content.service.js";

export const list = async (req, res) => res.json(await contentService.listContent(req.me));

export const daily = async (req, res) => res.json({ daily: await contentService.dailyContent() });

export const create = async (req, res) => {
  res.status(201).json({ item: await contentService.createContent(req.me, req.input) }, "محتوا اضافه شد");
};

export const update = async (req, res) => {
  await contentService.updateContent(req.me, req.id("id"), req.input);
  res.json({ ok: true }, "محتوا به‌روزرسانی شد");
};

export const remove = async (req, res) => {
  await contentService.deleteContent(req.me, req.id("id"));
  res.json({ ok: true }, "حذف شد");
};

export const setDaily = async (req, res) => {
  await contentService.setDaily(req.me, req.id("id"));
  res.json({ ok: true }, "آیهٔ روز تعیین شد");
};
