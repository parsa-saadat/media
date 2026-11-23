import { text } from "../../utils/validators/input.validator.js";
import * as chatsService from "./chats.service.js";

export const list = async (req, res) => res.json({ conversations: await chatsService.listChats(req.me) });

export const create = async (req, res) => {
  res.status(201).json({ conversation: await chatsService.createChat(req.me, req.input) });
};

export const detail = async (req, res) => res.json(await chatsService.getChatDetail(req.me, req.id()));

export const update = async (req, res) => {
  await chatsService.updateChat(req.me, req.id(), req.input);
  res.json({ ok: true });
};

export const remove = async (req, res) => {
  await chatsService.deleteChat(req.me, req.id());
  res.json({ ok: true });
};

export const join = async (req, res) => {
  await chatsService.joinRoom(req.me, req.id());
  res.json({ ok: true });
};

export const leave = async (req, res) => {
  await chatsService.leaveChat(req.me, req.id());
  res.json({ ok: true });
};

export const addMember = async (req, res) => {
  if (Array.isArray(req.input.usernames)) {
    const out = await chatsService.addMembersBatch(req.me, req.id(), req.input.usernames);
    res.json({ ok: true, ...out });
    return;
  }
  await chatsService.addMember(req.me, req.id(), req.input.username);
  res.json({ ok: true });
};

export const manageMember = async (req, res) => {
  await chatsService.manageMember(req.me, req.id(), req.input);
  res.json({ ok: true });
};

export const read = async (req, res) => {
  await chatsService.markRead(req.me, req.id(), req.input.messageId);
  res.json({ ok: true });
};

export const typing = async (req, res) => {
  res.json(await chatsService.setTyping(req.me, req.id(), req.body?.typing !== false));
};

export const typingList = async (req, res) => {
  res.json(await chatsService.getTyping(req.me, req.id()));
};

export const rooms = async (req, res) => {
  res.json({ rooms: await chatsService.exploreRooms(req.me, text(req.query.get("q"), 80).trim()) });
};

export const direct = async (req, res) => {
  res.json({ conversationId: await chatsService.openDirect(req.me, req.input) });
};
