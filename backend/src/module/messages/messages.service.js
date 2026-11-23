import { findOneChat, touchChat } from "../../model/controller/chats/chats.controller.js";
import { findBlocks } from "../../model/controller/contacts/contacts.controller.js";
import {
  findMessages,
  findOneMessage,
  insertMessage,
  updateOneMessage,
} from "../../model/controller/messages/messages.controller.js";
import { insertNotification } from "../../model/controller/notifications/notifications.controller.js";
import { findFiles, findOneFile } from "../../model/controller/storage/storage.controller.js";
import { findUsersByIds } from "../../model/controller/users/users.controller.js";
import { HttpError } from "../../utils/http/http.util.js";
import { getOrCreateSaved, requireMember, setTypingState } from "../chats/chats.service.js";
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
      forwardedFromUserId: typeof message.forwardedFromUserId === "number" ? message.forwardedFromUserId : null,
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
  const { chat } = await requireMember(chatId, me);

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
  setTypingState(chatId, me, false);

  // Dispatch rich message notifications to all other chat members (who have not blocked sender)
  if (chat.type !== "saved") {
    const recipientIds = chat.members.map((m) => m.userId).filter((uid) => uid !== me.id);
    if (recipientIds.length > 0) {
      const blocks = await findBlocks({ blockerId: { $in: recipientIds }, blockedId: me.id });
      const blockers = new Set(blocks.map((b) => b.blockerId));
      const previewBody =
        type === "voice"
          ? "🎙 پیام صوتی"
          : type === "image"
            ? `🖼 تصویر${input.content ? ` · ${input.content.slice(0, 60)}` : ""}`
            : type === "file"
              ? `📎 فایل${input.content ? ` · ${input.content.slice(0, 60)}` : ""}`
              : (input.content || "").slice(0, 90);
      const notifTitle =
        chat.type === "direct"
          ? `پیام جدید از ${me.displayName}`
          : `${me.displayName} در «${chat.name}»`;
      await Promise.all(
        recipientIds
          .filter((uid) => !blockers.has(uid))
          .map((uid) =>
            insertNotification({
              userId: uid,
              kind: "message",
              title: notifTitle,
              body: previewBody,
              path: `/?chat=${chatId}`,
              actorName: me.displayName,
              conversationId: chatId,
              senderId: me.id,
            }).catch(() => {}),
          ),
      );
    }
  }

    return (await present([message]))[0];
}

/** Forwards one or several messages into one or several target conversations (preserving original sender attribution). */
export async function forwardMessages(me, input) {
  if (!me.permissions.includes("messages.send")) throw new HttpError(403, "شما اجازه ارسال پیام ندارید");
  const { messageIds, targetConversationIds } = input;

  // Verify membership in all destination conversations
  for (const targetId of targetConversationIds) {
    await requireMember(targetId, me);
  }

  // Load and verify source messages (preserve chronological order)
  const rawFound = await findMessages({ _id: { $in: messageIds } });
  const byId = new Map(rawFound.map((m) => [m._id, m]));
  const ordered = messageIds
    .map((id) => byId.get(id))
    .filter((m) => m && m.type !== "deleted" && m.type !== "system");
  if (!ordered.length) throw new HttpError(404, "پیام قابل فوروارد پیدا نشد");

  const srcConvIds = [...new Set(ordered.map((m) => m.conversationId))];
  for (const cid of srcConvIds) {
    await requireMember(cid, me);
  }

  const senderIds = [...new Set(ordered.map((m) => m.senderId).filter((id) => typeof id === "number"))];
  const senders = new Map((senderIds.length ? await findUsersByIds(senderIds) : []).map((u) => [u._id, u]));

  let count = 0;
  for (const targetId of targetConversationIds) {
    const targetChat = await findOneChat({ _id: targetId });
    for (const orig of ordered) {
      const ids = Array.isArray(orig.fileIds) && orig.fileIds.length
        ? orig.fileIds
        : orig.fileId
          ? [orig.fileId]
          : [];
      const fromName = orig.forwardedFrom || (orig.senderId ? senders.get(orig.senderId)?.displayName ?? null : null);
      const fromUserId =
        typeof orig.forwardedFromUserId === "number"
          ? orig.forwardedFromUserId
          : typeof orig.senderId === "number"
            ? orig.senderId
            : null;
      await insertMessage({
        conversationId: targetId,
        senderId: me.id,
        type: orig.type,
        content: orig.content,
        fileId: ids[0] || null,
        ...(ids.length > 0 ? { fileIds: ids } : {}),
        forwardedFrom: fromName,
        ...(fromUserId ? { forwardedFromUserId: fromUserId } : {}),
      });
      count++;
    }
    await touchChat(targetId);

    if (targetChat && targetChat.type !== "saved") {
      const recipientIds = targetChat.members.map((m) => m.userId).filter((uid) => uid !== me.id);
      if (recipientIds.length > 0) {
        const blocks = await findBlocks({ blockerId: { $in: recipientIds }, blockedId: me.id });
        const blockers = new Set(blocks.map((b) => b.blockerId));
        const notifTitle =
          targetChat.type === "direct"
            ? `پیام فورواردشده از ${me.displayName}`
            : `${me.displayName} در «${targetChat.name}»`;
        await Promise.all(
          recipientIds
            .filter((uid) => !blockers.has(uid))
            .map((uid) =>
              insertNotification({
                userId: uid,
                kind: "message",
                title: notifTitle,
                body: ordered.length > 1 ? `${ordered.length} پیام فوروارد شد` : (ordered[0]?.content || "پیام فورواردشده").slice(0, 80),
                path: `/?chat=${targetId}`,
                actorName: me.displayName,
                conversationId: targetId,
                senderId: me.id,
              }).catch(() => {}),
            ),
        );
      }
    }
  }

  return { forwarded: count, targets: targetConversationIds.length };
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
    forwardedFrom: original.forwardedFrom || (sender ? sender.displayName : null),
    ...(typeof original.forwardedFromUserId === "number"
      ? { forwardedFromUserId: original.forwardedFromUserId }
      : sender
        ? { forwardedFromUserId: sender._id }
        : {}),
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
