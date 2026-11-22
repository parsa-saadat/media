import * as contactsService from "./contacts.service.js";

export const friends = async (req, res) => res.json(await contactsService.listFriends(req.me));

export const requestFriend = async (req, res) => {
  const { accepted } = await contactsService.requestFriend(req.me, req.input.username);
  res.json({ ok: true, ...(accepted ? { accepted: true } : {}) }, accepted ? "اکنون دوست هستید" : "درخواست دوستی ارسال شد");
};

export const respondFriend = async (req, res) => {
  await contactsService.respondFriend(req.me, req.id(), req.input.action);
  res.json({ ok: true });
};

export const removeFriend = async (req, res) => {
  await contactsService.removeFriend(req.me, req.id());
  res.json({ ok: true });
};

export const blocks = async (req, res) => res.json({ blocked: await contactsService.listBlocks(req.me) });

export const block = async (req, res) => {
  await contactsService.blockUser(req.me, req.input);
  res.json({ ok: true }, "کاربر مسدود شد");
};

export const unblock = async (req, res) => {
  await contactsService.unblockUser(req.me, req.id());
  res.json({ ok: true }, "مسدودیت برداشته شد");
};
