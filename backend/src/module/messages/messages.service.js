import { findOneChat, touchChat } from "../../model/controller/chats/chats.controller.js";
import { findBlocks } from "../../model/controller/contacts/contacts.controller.js";
import {
  findMessages,
  findOneMessage,
  insertMessage,
  updateOneMessage,
} from "../../model/controller/messages/messages.controller.js";
import { findFiles, findOneFile } from "../../model/controller/storage/storage.controller.js";
import { findUsersByIds } from "../../model/controller/users/users.controller.js";
import { HttpError } from "../../utils/http/http.util.js";
import { getOrCreateSaved, requireMember } from "../chats/chats.service.js";
import { removeUnusedFiles } from "../storage/storage.service.js";

const PAGE_SIZE = 50;

/** Adds what the chat screen shows next to each message: who sent it and what is attached. */
async function present(messages) {
  const senderIds = messages.map((m) => m.senderId).filter((id) => typeof id === "number");
  const allFileIds = [];
  for (const m of messages) {
    if (typeof m.fileId === "number") allFileIds.push(m.fileId);
    if (Array.isArray(m.fileIds)) {
      for (const fid of m.fileIds) if (typeof fid === "number") allFileIds.push(fid);
    }
  }
  const users = new Map((await findUsersByIds(senderIds)).map((user) => [user._id, user]));
  const files = new Map((allFileIds.length ? await findFiles({ _id: { $in: [...new Set(allFileIds)] } }) : []).map((file) => [file._id, file]));

  return messages.map((message) => {
    const sender = message.senderId ? users.get(message.senderId) : undefined;
    const rawIds = Array.isArray(message.fileIds) && message.fileIds.length
      ? message.fileIds
      : typeof message.fileId === "number"
        ? [message.fileId]
        : [];
    const firstFile = rawIds[0] ? files.get(rawIds[0]) : undefined;
    const filesMeta = rawIds
      .map((fid) => files.get(fid))
      .filter(Boolean)
      .map((f) => ({ id: f._id, name: f.name, mime: f.mime, size: f.size }));

    return {
      id: message._id,
      conversationId: message.conversationId,
      type: message.type,
      content: message.content,
      createdAt: message.createdAt,
      fileId: rawIds[0] ?? null,
      fileIds: rawIds,
      files: filesMeta,
      forwardedFrom: message.forwardedFrom ?? null,
      editedAt: message.editedAt ?? null,
      readBy: (message.readBy ?? []).map((r) => ({ userId: r.userId, at: r.at })),
      fileName: firstFile?.name ?? null,
      fileMime: firstFile?.mime ?? null,
      fileSize: firstFile?.size ?? null,
      sender: sender
        ? { id: sender._id, username: sender.username, displayName: sender.displayName, avatarColor: sender.avatarColor, avatarFileId: sender.avatarFileId ?? null }
        : null,
    };
  });
}

/**
 * `after` = everything newer than that id (polling), `before` = one page of older history,
 * neither = the newest page. Always returned oldest → newest.
 */
export async function listMessages(me, chatId, range) {
  await requireMember(chatId, me);
  const filter = { conversationId: chatId };
  if (range.after) filter._id = { $gt: range.after };
  else if (range.before) filter._id = { $lt: range.before };
  // Messages written by people I blocked are hidden from me, also inside rooms and groups.
  const hidden = (await findBlocks({ blockerId: me.id })).map((block) => block.blockedId);
  if (hidden.length) filter.senderId = { $nin: hidden };

  const page = await findMessages(filter, { sort: { _id: range.after ? 1 : -1 }, limit: PAGE_SIZE });
  return present(range.after ? page : page.reverse());
}

export async function sendMessage(me, chatId, input) {
  if (!me.permissions.includes("messages.send")) throw new HttpError(403, "شما اجازه ارسال پیام ندارید");
  await requireMember(chatId, me);

  const ids = Array.isArray(input.fileIds) && input.fileIds.length
    ? input.fileIds
    : input.fileId
      ? [input.fileId]
      : [];

  let type = "text";
  if (ids.length > 1) {
    const found = await findFiles({ _id: { $in: ids } });
    const byId = new Map(found.map((f) => [f._id, f]));
    for (const id of ids) {
      const f = byId.get(id);
      if (!f || f.uploaderId !== me.id) throw new HttpError(400, "فایل نامعتبر است");
      if (!f.mime.startsWith("image/")) throw new HttpError(400, "چندفایلی یکجا فقط برای تصاویر مجاز است");
    }
    type = "image";
  } else if (ids.length === 1) {
    const file = await findOneFile({ _id: ids[0] });
    if (!file || file.uploaderId !== me.id) throw new HttpError(400, "فایل نامعتبر است");
    type = file.mime.startsWith("image/") ? "image" : file.mime.startsWith("audio/") ? "voice" : "file";
  } else if (!input.content) {
    throw new HttpError(400, "پیام خالی است");
  }

  const message = await insertMessage({
    conversationId: chatId,
    senderId: me.id,
    type,
    content: input.content,
    fileId: ids[0] || null,
    ...(ids.length > 0 ? { fileIds: ids } : {}),
  });
  await touchChat(chatId);
  return {
    id: message._id,
    conversationId: chatId,
    senderId: me.id,
    type,
    content: message.content,
    fileId: message.fileId,
    fileIds: ids,
    createdAt: message.createdAt,
  };
}

/** Saves (bookmarks/forwards) an existing message from any chat the user belongs to into their Saved Messages. */
export async function saveMessageToVault(me, messageId) {
  const original = await findOneMessage({ _id: messageId });
  if (!original || original.type === "deleted" || original.type === "system") {
    throw new HttpError(404, "پیام قابل ذخیره پیدا نشد");
  }
  await requireMember(original.conversationId, me);
  const savedChat = await getOrCreateSaved(me.id);
  const sender = original.senderId ? (await findUsersByIds([original.senderId]))[0] : null;
  const ids = Array.isArray(original.fileIds) && original.fileIds.length
    ? original.fileIds
    : original.fileId
      ? [original.fileId]
      : [];

  const copy = await insertMessage({
    conversationId: savedChat._id,
    senderId: me.id,
    type: original.type,
    content: original.content,
    fileId: ids[0] || null,
    ...(ids.length > 0 ? { fileIds: ids } : {}),
    forwardedFrom: sender ? sender.displayName : null,
  });
  await touchChat(savedChat._id);
  return { id: copy._id, savedConversationId: savedChat._id };
}

/** Only the author may edit, and only a plain text message (or caption). */
export async function editMessage(me, messageId, content) {
  const message = await findOneMessage({ _id: messageId });
  if (!message) throw new HttpError(404, "پیام پیدا نشد");
  if (message.senderId !== me.id) throw new HttpError(403, "فقط نویسنده می‌تواند پیام را ویرایش کند");
  if (message.type !== "text") throw new HttpError(400, "فقط پیام متنی قابل ویرایش است");
  if (message.content === content) return { id: messageId, content, editedAt: message.editedAt ?? new Date() };
  const editedAt = new Date();
  await updateOneMessage({ _id: messageId }, { content, editedAt });
  return { id: messageId, content, editedAt };
}

/**
 * Deletes several messages at once (multi-select). Every id is checked with the same rules as a
 * single delete, so one forbidden id aborts the whole request instead of silently skipping it.
 */
export async function deleteMessages(me, ids) {
  const found = await findMessages({ _id: { $in: ids } });
  if (!found.length) throw new HttpError(404, "پیامی پیدا نشد");
  const chatIds = [...new Set(found.map((m) => m.conversationId))];
  const chats = await Promise.all(chatIds.map((id) => findOneChat({ _id: id })));
  const roleIn = new Map(chats.filter(Boolean).map((c) => [c._id, c.members.find((m) => m.userId === me.id)?.role]));
  for (const message of found) {
    const role = roleIn.get(message.conversationId);
    const allowed =
      message.senderId === me.id ||
      me.permissions.includes("messages.delete_any") ||
      role === "owner" ||
      role === "admin";
    if (!allowed) throw new HttpError(403, "اجازهٔ حذف بعضی از پیام‌های انتخاب‌شده را ندارید");
  }
  const fileIds = [];
  for (const m of found) {
    if (typeof m.fileId === "number") fileIds.push(m.fileId);
    if (Array.isArray(m.fileIds)) for (const fid of m.fileIds) if (typeof fid === "number") fileIds.push(fid);
  }
  await Promise.all(found.map((m) => updateOneMessage({ _id: m._id }, { type: "deleted", content: "", fileId: null, fileIds: [], editedAt: null })));
  if (fileIds.length) await removeUnusedFiles([...new Set(fileIds)]);
  return { deleted: found.length };
}

/** The author, a chat owner/admin, or a global moderator may delete a message. */
export async function deleteMessage(me, messageId) {
  const message = await findOneMessage({ _id: messageId });
  if (!message) throw new HttpError(404, "پیام پیدا نشد");
  const chat = await findOneChat({ _id: message.conversationId });
  const role = chat?.members.find((member) => member.userId === me.id)?.role;
  const allowed =
    message.senderId === me.id ||
    me.permissions.includes("messages.delete_any") ||
    role === "owner" ||
    role === "admin";
  if (!allowed) throw new HttpError(403, "اجازه حذف این پیام را ندارید");
  const fileIds = [];
  if (typeof message.fileId === "number") fileIds.push(message.fileId);
  if (Array.isArray(message.fileIds)) for (const fid of message.fileIds) if (typeof fid === "number") fileIds.push(fid);
  await updateOneMessage({ _id: messageId }, { type: "deleted", content: "", fileId: null, fileIds: [] });
  if (fileIds.length) await removeUnusedFiles([...new Set(fileIds)]);
}
