import * as notificationsService from "./notifications.service.js";

export const list = async (req, res) => res.json(await notificationsService.listFor(req.me));
export const markRead = async (req, res) => res.json(await notificationsService.markRead(req.me, req.input.ids));
export const clear = async (req, res) => { await notificationsService.clear(req.me); res.json({ ok: true }); };
