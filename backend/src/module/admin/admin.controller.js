import { text } from "../../utils/validators/input.validator.js";
import * as adminService from "./admin.service.js";

export const stats = async (_req, res) => res.json(await adminService.getStats());

export const users = async (req, res) => {
  res.json({ users: await adminService.listUsers(text(req.query.get("q"), 64).trim()) });
};

export const setUserPassword = async (req, res) => {
  await adminService.setUserPassword(req.me, req.id(), req.input.password);
  res.json({ ok: true }, "رمز عبور تغییر کرد و نشست‌های کاربر بسته شد");
};

export const updateUser = async (req, res) => {
  await adminService.updateUser(req.me, req.id(), req.input);
  res.json({ ok: true });
};

export const roles = async (_req, res) => res.json(await adminService.listRoles());

export const createRole = async (req, res) => {
  res.status(201).json({ role: await adminService.createRole(req.input) });
};

export const updateRole = async (req, res) => {
  await adminService.updateRole(req.id(), req.input);
  res.json({ ok: true });
};

export const deleteRole = async (req, res) => {
  await adminService.deleteRole(req.id());
  res.json({ ok: true });
};

export const rooms = async (_req, res) => res.json({ rooms: await adminService.listRooms() });
