import {
  addChatMember,
  deleteChats,
  findChats,
  findOneChat,
  insertChat,
  markChatRead,
  removeChatMember,
  setChatMemberRole,
  touchChat,
  updateOneChat,
} from "../../model/controller/chats/chats.controller.js";
import { pairKeyOf } from "../../model/controller/contacts/contacts.controller.js";
import {
  countMessagesByChat,
  countUnreadMessages,
  deleteMessages,
  findLastMessages,
  findMessageFileIds,
  insertMessage,
  markMessagesReadBy,
} from "../../model/controller/messages/messages.controller.js";
import { findOneUser, findUsers, findUsersByIds, toPublicUser } from "../../model/controller/users/users.controller.js";
import {
  deletePresences,
  deleteRestrictions,
  deleteSignals,
  voiceKey,
} from "../../model/controller/voice/voice.controller.js";
import { HttpError } from "../../utils/http/http.util.js";
import { escapeRegex } from "../../utils/validators/input.validator.js";
import { assertNotBlocked, blockedIdsOf } from "../contacts/contacts.service.js";
import { removeUnusedFiles, stopTracks } from "../storage/storage.service.js";

const ROLE_ORDER = { owner: 0, admin: 1, member: 2 };

const newMember = (userId, role) => ({
  userId,
  role,
  lastReadMessageId: 0,
  joinedAt: new Date(),
});

/** Loads a chat and proves the user belongs to it (and, for a private chat, that nobody blocked the other). */
export async function requireMember(chatId, me) {
  const chat = await findOneChat({ _id: chatId });
  if (!chat) throw new HttpError(404, "گفتگو پیدا نشد");
  const membership = chat.members.find((member) => member.userId === me.id);
  if (!membership) throw new HttpError(403, "شما عضو این گفتگو نیستید");
  if (chat.type === "direct") {
    const other = chat.members.find((member) => member.userId !== me.id);
    if (other) await assertNotBlocked(me.id, other.userId);
  }
  return { chat, membership };
}

export async function postSystemMessage(chatId, content) {
  await insertMessage({ conversationId: chatId, senderId: null, type: "system", content, fileId: null });
  await touchChat(chatId);
}

/** Removes a chat together with its messages, attachments and call state. */
async function deleteChatCascade(chatId) {
  const fileIds = await findMessageFileIds({ conversationId: chatId });
  await deleteMessages({ conversationId: chatId });
  await Promise.all([
    deletePresences({ conversationId: chatId }),
    deleteRestrictions({ conversationId: chatId }),
    deleteSignals({ conversationId: chatId }),
    stopTracks({ conversationId: chatId }),
  ]);
  await deleteChats({ _id: chatId });
  await removeUnusedFiles(fileIds);
}

async function leaveCall(chatId, userId) {
  await deletePresences({ _id: voiceKey(chatId, userId) });
  await stopTracks({ _id: voiceKey(chatId, userId) });
}

export async function listChats(me) {
  const chats = await findChats({ "members.userId": me.id }, { sort: { updatedAt: -1 } });
  if (!chats.length) return [];
  const mine = (chat) => chat.members.find((member) => member.userId === me.id);
  const peerIdOf = (chat) =>
    chat.type === "direct" ? chat.members.find((member) => member.userId !== me.id)?.userId : undefined;

  const ids = chats.map((chat) => chat._id);
  const [lastMessages, unread, blocked] = await Promise.all([
    findLastMessages(ids),
    countUnreadMessages(me.id, chats.map((chat) => ({ chatId: chat._id, lastRead: mine(chat).lastReadMessageId }))),
    blockedIdsOf(me.id),
  ]);
  const personIds = [
    ...chats.map(peerIdOf),
    ...[...lastMessages.values()].map((message) => message.senderId),
  ].filter((id) => typeof id === "number");
  const people = new Map((await findUsersByIds(personIds)).map((user) => [user._id, user]));

  return chats.flatMap((chat) => {
    const isSaved = chat.type === "saved" || (chat.type === "direct" && chat.members.length === 1 && chat.members[0]?.userId === me.id);
    const peerId = isSaved ? undefined : peerIdOf(chat);
    if (peerId && blocked.has(peerId)) return []; // a blocked private chat disappears from the list
    const peerDoc = peerId ? people.get(peerId) : undefined;
    const peer = peerDoc ? toPublicUser(peerDoc) : null;
    const last = lastMessages.get(chat._id);
    return [
      {
        id: chat._id,
        type: isSaved ? "saved" : chat.type,
        name: isSaved ? "پیام‌های ذخیره‌شده" : chat.type === "direct" ? peer?.displayName ?? "کاربر" : chat.name,
        description: isSaved ? "یادداشت‌ها، فایل‌ها و پیام‌های شخصی شما" : chat.description,
        emoji: isSaved ? "bookmark" : chat.emoji,
        myRole: mine(chat).role,
        peer,
        updatedAt: chat.updatedAt,
        unread: isSaved ? 0 : (unread.get(chat._id) ?? 0),
        lastMessage: last
          ? {
              id: last._id,
              type: last.type,
              content: last.content,
              fileIds: Array.isArray(last.fileIds) ? last.fileIds : last.fileId ? [last.fileId] : [],
              createdAt: last.createdAt,
              senderName: last.senderId ? people.get(last.senderId)?.displayName ?? null : null,
            }
          : null,
      },
    ];
  });
}

export async function createChat(me, input) {
  // Public rooms were replaced by stand-alone meetings: only private groups can be created now.
  if (input.type !== "group") throw new HttpError(400, "اتاق عمومی حذف شده است؛ برای گفتگوی عمومی یک جلسه (میت) بسازید");
  if (!me.permissions.includes("groups.create")) throw new HttpError(403, "شما مجوز ساخت گروه را ندارید");

  const invited = input.members.length ? await findUsers({ username: { $in: input.members } }) : [];
  const blocked = await blockedIdsOf(me.id);
  const chat = await insertChat({
    type: input.type,
    name: input.name,
    description: input.description,
    emoji: input.emoji,
    createdBy: me.id,
    members: [
      newMember(me.id, "owner"),
      ...invited.filter((user) => user._id !== me.id && !blocked.has(user._id)).map((user) => newMember(user._id, "member")),
    ],
  });
  await postSystemMessage(chat._id, `${me.displayName} گروه «${input.name}» را ساخت`);
  return { id: chat._id, type: chat.type, name: chat.name, description: chat.description, emoji: chat.emoji, createdAt: chat.createdAt };
}

export async function getChatDetail(me, chatId) {
  const { chat, membership } = await requireMember(chatId, me);
  const isSaved = chat.type === "saved" || (chat.type === "direct" && chat.members.length === 1 && chat.members[0]?.userId === me.id);
  const users = new Map((await findUsersByIds(chat.members.map((member) => member.userId))).map((user) => [user._id, user]));
  const members = chat.members
    .flatMap((member) => {
      const user = users.get(member.userId);
      return user ? [{ ...toPublicUser(user), role: member.role }] : [];
    })
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.displayName.localeCompare(b.displayName, "fa"));
  const peer = !isSaved && chat.type === "direct" ? members.find((member) => member.id !== me.id) ?? null : null;
  return {
    conversation: {
      id: chat._id,
      type: isSaved ? "saved" : chat.type,
      name: isSaved ? "پیام‌های ذخیره‌شده" : chat.type === "direct" ? peer?.displayName ?? "کاربر" : chat.name,
      description: isSaved ? "فضای شخصی برای ذخیرهٔ پیام‌ها، تصاویر، ویس‌ها و یادداشت‌های شما" : chat.type === "direct" ? peer?.bio ?? "" : chat.description,
      emoji: isSaved ? "bookmark" : chat.emoji,
      createdAt: chat.createdAt,
      myRole: membership.role,
      peer,
    },
    members,
  };
}

export async function updateChat(me, chatId, input) {
  const { chat, membership } = await requireMember(chatId, me);
  if (chat.type === "direct" || chat.type === "saved") throw new HttpError(400, "این گفتگو قابل ویرایش نیست");
  if (membership.role === "member" && !me.permissions.includes("rooms.manage")) {
    throw new HttpError(403, "فقط مدیر گفتگو می‌تواند ویرایش کند");
  }
  if (Object.keys(input).length) await updateOneChat({ _id: chatId }, input);
}

export async function deleteChat(me, chatId) {
  const chat = await findOneChat({ _id: chatId });
  if (!chat) throw new HttpError(404, "گفتگو پیدا نشد");
  if (chat.type === "direct" || chat.type === "saved") throw new HttpError(400, "این گفتگو قابل حذف نیست");
  const isOwner = chat.members.some((member) => member.userId === me.id && member.role === "owner");
  if (!isOwner && !me.permissions.includes("rooms.manage")) throw new HttpError(403, "اجازه حذف ندارید");
  await deleteChatCascade(chatId);
}

/** Groups are private: nobody can self-join, they must be added by a member with rights. */
export async function joinRoom(_me, _chatId) {
  throw new HttpError(403, "گروه‌ها خصوصی هستند؛ برای پیوستن باید توسط یکی از اعضا اضافه شوید");
}

export async function leaveChat(me, chatId) {
  const { chat, membership } = await requireMember(chatId, me);
  if (chat.type === "direct" || chat.type === "saved") throw new HttpError(400, "از این گفتگو نمی‌توان خارج شد");
  await removeChatMember(chatId, me.id);
  await leaveCall(chatId, me.id);
  const remaining = chat.members.filter((member) => member.userId !== me.id);
  if (!remaining.length) return deleteChatCascade(chatId);
  if (membership.role === "owner") {
    // Ownership passes to a chat admin if there is one, otherwise to whoever has been here longest.
    const heir = [...remaining].sort(
      (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt.getTime() - b.joinedAt.getTime(),
    )[0];
    await setChatMemberRole(chatId, heir.userId, "owner");
  }
  await postSystemMessage(chatId, `${me.displayName} گفتگو را ترک کرد`);
}

export async function addMember(me, chatId, username) {
  const { chat, membership } = await requireMember(chatId, me);
  if (chat.type === "direct" || chat.type === "saved") throw new HttpError(400, "به این گفتگو نمی‌توان عضو اضافه کرد");
  if (chat.type === "group" && membership.role === "member") {
    throw new HttpError(403, "فقط مدیران گروه می‌توانند عضو اضافه کنند");
  }
  const user = username ? await findOneUser({ username }) : null;
  if (!user) throw new HttpError(404, "کاربری با این نام کاربری پیدا نشد");
  await assertNotBlocked(me.id, user._id);
  if (!(await addChatMember(chatId, newMember(user._id, "member")))) throw new HttpError(409, "این کاربر قبلاً عضو است");
  await postSystemMessage(chatId, `${me.displayName}، ${user.displayName} را اضافه کرد`);
}

export async function manageMember(me, chatId, input) {
  const { chat, membership } = await requireMember(chatId, me);
  if (chat.type === "direct" || chat.type === "saved") throw new HttpError(400, "درخواست نامعتبر است");
  const target = chat.members.find((member) => member.userId === input.userId);
  if (!target) throw new HttpError(404, "عضو پیدا نشد");
  const globalModerator = me.permissions.includes("rooms.manage");
  const mayManage =
    membership.role === "owner" || (membership.role === "admin" && target.role === "member") || globalModerator;
  if (!mayManage || target.role === "owner") throw new HttpError(403, "اجازه این کار را ندارید");
  const name = (await findOneUser({ _id: input.userId }))?.displayName ?? "کاربر";

  if (input.action === "kick") {
    await removeChatMember(chatId, input.userId);
    await leaveCall(chatId, input.userId);
    await postSystemMessage(chatId, `${name} توسط ${me.displayName} حذف شد`);
    return;
  }
  if (membership.role !== "owner" && !globalModerator) throw new HttpError(403, "فقط مالک می‌تواند نقش تعیین کند");
  await setChatMemberRole(chatId, input.userId, input.action === "promote" ? "admin" : "member");
  await postSystemMessage(chatId, input.action === "promote" ? `${name} مدیر شد` : `${name} از مدیریت برکنار شد`);
}

export async function markRead(me, chatId, messageId) {
  if (!messageId) return;
  // per-member cursor (drives the unread badge) and per-message receipts (drive the ticks)
  await Promise.all([markChatRead(chatId, me.id, messageId), markMessagesReadBy(chatId, me.id, messageId)]);
}

/**
 * Groups are only visible to their own members — there is no public directory any more.
 * This stays as a search over MY groups, for the group picker.
 */
export async function exploreRooms(me, query) {
  const filter = { type: "group", "members.userId": me.id };
  if (query) {
    const pattern = new RegExp(escapeRegex(query), "i");
    filter.$or = [{ name: pattern }, { description: pattern }];
  }
  const groups = await findChats(filter, { limit: 100 });
  const counts = await countMessagesByChat(groups.map((g) => g._id));
  return groups.map((g) => ({
    id: g._id,
    name: g.name,
    description: g.description,
    emoji: g.emoji,
    members: g.members.length,
    messages: counts.get(g._id) ?? 0,
    joined: true,
  }));
}

export async function getOrCreateDirect(a, b) {
  await assertNotBlocked(a, b);
  const directKey = pairKeyOf(a, b);
  const existing = await findOneChat({ directKey });
  if (existing) return existing;
  try {
    return await insertChat({
      type: "direct",
      name: "",
      description: "",
      emoji: "chat",
      createdBy: a,
      directKey,
      members: [newMember(a, "member"), newMember(b, "member")],
    });
  } catch (error) {
    // Both people opened the chat at the same moment: the unique directKey kept only one.
    const winner = error.code === 11000 ? await findOneChat({ directKey }) : null;
    if (winner) return winner;
    throw error;
  }
}

export async function getOrCreateSaved(userId) {
  const directKey = `saved:${userId}`;
  const existing = await findOneChat({ directKey });
  if (existing) return existing;
  try {
    return await insertChat({
      type: "saved",
      name: "پیام‌های ذخیره‌شده",
      description: "یادداشت‌ها، فایل‌ها و پیام‌های شخصی شما",
      emoji: "bookmark",
      createdBy: userId,
      directKey,
      members: [newMember(userId, "owner")],
    });
  } catch (error) {
    const winner = error.code === 11000 ? await findOneChat({ directKey }) : null;
    if (winner) return winner;
    throw error;
  }
}

export async function openDirect(me, input) {
  if (input.saved || input.userId === me.id || (input.username && input.username === me.username)) {
    return (await getOrCreateSaved(me.id))._id;
  }
  const user = input.username
    ? await findOneUser({ username: input.username })
    : input.userId
      ? await findOneUser({ _id: input.userId })
      : null;
  if (!user) throw new HttpError(404, "کاربر پیدا نشد");
  if (user._id === me.id) return (await getOrCreateSaved(me.id))._id;
  return (await getOrCreateDirect(me.id, user._id))._id;
}
