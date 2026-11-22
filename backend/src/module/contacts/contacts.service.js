import { findOneChat } from "../../model/controller/chats/chats.controller.js";
import {
  blockKeyOf,
  deleteBlocks,
  deleteContacts,
  findBlocks,
  findContacts,
  findOneBlock,
  findOneContact,
  insertBlock,
  insertContact,
  pairKeyOf,
  updateOneContact,
} from "../../model/controller/contacts/contacts.controller.js";
import {
  findOneUser,
  findUsersByIds,
  toPublicUser,
} from "../../model/controller/users/users.controller.js";
import { deletePresences } from "../../model/controller/voice/voice.controller.js";
import { HttpError } from "../../utils/http/http.util.js";
import { notify } from "../notifications/notifications.service.js";
import { stopTracks } from "../storage/storage.service.js";

// ───────── blocks ─────────

export async function blockedEitherWay(a, b) {
  return !!(await findOneBlock({ _id: { $in: [blockKeyOf(a, b), blockKeyOf(b, a)] } }));
}

export async function assertNotBlocked(a, b) {
  if (await blockedEitherWay(a, b)) {
    throw new HttpError(403, "ارتباط با این کاربر به دلیل مسدودسازی امکان‌پذیر نیست");
  }
}

/** Everyone the user has blocked or has been blocked by. */
export async function blockedIdsOf(userId) {
  const rows = await findBlocks({ $or: [{ blockerId: userId }, { blockedId: userId }] });
  return new Set(rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId)));
}

export async function listBlocks(me) {
  const rows = await findBlocks({ blockerId: me.id });
  const users = new Map((await findUsersByIds(rows.map((row) => row.blockedId))).map((user) => [user._id, user]));
  return rows.flatMap((row) => {
    const user = users.get(row.blockedId);
    if (!user) return [];
    return [{ id: user._id, username: user.username, displayName: user.displayName, avatarColor: user.avatarColor, createdAt: row.createdAt }];
  });
}

async function findTarget(input) {
  if (input.username) return findOneUser({ username: input.username });
  if (input.userId) return findOneUser({ _id: input.userId });
  return null;
}

export async function blockUser(me, input) {
  const target = await findTarget(input);
  if (!target) throw new HttpError(404, "کاربری با این نام کاربری یافت نشد");
  if (target._id === me.id) throw new HttpError(400, "نمی‌توانید خودتان را مسدود کنید");
  const pairKey = pairKeyOf(me.id, target._id);
  await insertBlock(me.id, target._id);
  await notify(target._id, "blocked", "مسدود شدید", `${me.displayName} ارتباط با شما را بست`, undefined, me.displayName);
  await deleteContacts({ pairKey });
  // End a private call between the two, if one is running.
  const direct = await findOneChat({ directKey: pairKey });
  if (direct) {
    await deletePresences({ conversationId: direct._id });
    await stopTracks({ conversationId: direct._id });
  }
}

export async function unblockUser(me, userId) {
  await deleteBlocks({ _id: blockKeyOf(me.id, userId) });
}

// ───────── friends ─────────

export async function listFriends(me) {
  const rows = await findContacts({ $or: [{ requesterId: me.id }, { addresseeId: me.id }] });
  const otherId = (row) => (row.requesterId === me.id ? row.addresseeId : row.requesterId);
  const users = new Map((await findUsersByIds(rows.map(otherId))).map((user) => [user._id, user]));
  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const row of rows) {
    const user = users.get(otherId(row));
    if (!user) continue;
    const item = { id: row._id, createdAt: row.createdAt, user: toPublicUser(user) };
    if (row.status === "accepted") friends.push(item);
    else if (row.requesterId === me.id) outgoing.push(item);
    else incoming.push(item);
  }
  return { friends, incoming, outgoing };
}

export async function requestFriend(me, username) {
  if (!username) throw new HttpError(400, "نام کاربری را وارد کنید");
  const target = await findOneUser({ username });
  if (!target) throw new HttpError(404, `کاربری با نام کاربری @${username} پیدا نشد`);
  if (target._id === me.id) throw new HttpError(400, "نمی‌توانید به خودتان درخواست بدهید");
  await assertNotBlocked(me.id, target._id);

  const existing = await findOneContact({ pairKey: pairKeyOf(me.id, target._id) });
  if (existing) {
    if (existing.status === "accepted") throw new HttpError(409, "شما از قبل دوست هستید");
    if (existing.requesterId === me.id) throw new HttpError(409, "درخواست قبلاً ارسال شده است");
    // They had already asked me: asking back accepts their request.
    await updateOneContact({ _id: existing._id }, { status: "accepted" });
    await notify(target._id, "friend-accept", "درخواست دوستی پذیرفته شد", `${me.displayName} درخواست شما را پذیرفت`, undefined, me.displayName);
    return { accepted: true };
  }
  try {
    await insertContact({ requesterId: me.id, addresseeId: target._id, status: "pending" });
    await notify(target._id, "friend-request", "درخواست دوستی جدید", `${me.displayName} می‌خواهد دوست شما باشد`, undefined, me.displayName);
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, "درخواست قبلاً ثبت شده است");
    throw error;
  }
  return { accepted: false };
}

export async function respondFriend(me, id, action) {
  const contact = await findOneContact({ _id: id });
  if (!contact || contact.addresseeId !== me.id || contact.status !== "pending") {
    throw new HttpError(404, "درخواست پیدا نشد");
  }
  if (action === "accept") {
    await updateOneContact({ _id: id }, { status: "accepted" });
    await notify(contact.requesterId, "friend-accept", "دوست شدید", `${me.displayName} درخواست شما را پذیرفت`, undefined, me.displayName);
  } else {
    await deleteContacts({ _id: id });
  }
}

export async function removeFriend(me, id) {
  const contact = await findOneContact({ _id: id });
  if (!contact || (contact.requesterId !== me.id && contact.addresseeId !== me.id)) throw new HttpError(404, "پیدا نشد");
  await deleteContacts({ _id: id });
}
