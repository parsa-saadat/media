import { positiveInt } from "../../utils/validators/input.validator.js";
import * as messagesService from "./messages.service.js";

export const list = async (req, res) => {
  const range = { after: positiveInt(req.query.get("after")), before: positiveInt(req.query.get("before")) };
  res.json({ messages: await messagesService.listMessages(req.me, req.id(), range) });
};

export const send = async (req, res) => {
  res.status(201).json({ message: await messagesService.sendMessage(req.me, req.id(), req.input) });
};

export const remove = async (req, res) => {
  await messagesService.deleteMessage(req.me, req.id());
  res.json({ ok: true });
};

export const edit = async (req, res) => {
  res.json({ message: await messagesService.editMessage(req.me, req.id(), req.input.content) }, "پیام ویرایش شد");
};

export const bulkRemove = async (req, res) => {
  res.json(await messagesService.deleteMessages(req.me, req.input.ids), "پیام‌های انتخاب‌شده حذف شدند");
};

export const save = async (req, res) => {
  res.json(await messagesService.saveMessageToVault(req.me, req.id()), "در پیام‌های ذخیره‌شده قرار گرفت");
};

export const forward = async (req, res) => {
  res.json(await messagesService.forwardMessages(req.me, req.input), "پیام فوروارد شد");
};

