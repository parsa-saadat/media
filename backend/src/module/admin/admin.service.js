import { ADMIN_ROLE_NAME, ALL_PERMISSION_KEYS, DEFAULT_IMAGE_LIMIT, DEFAULT_MEETING_HOURS, PERMISSIONS } from "../../config/permissions.config.js";
import { countChats, findChats } from "../../model/controller/chats/chats.controller.js";
import { countMessages, countMessagesByChat, countMessagesPerDay } from "../../model/controller/messages/messages.controller.js";
import {
  countRoles,
  deleteRoles,
  findOneRole,
  findRoles,
  insertRole,
  updateOneRole,
} from "../../model/controller/roles/roles.controller.js";
import bcrypt from "bcryptjs";
import { deleteSessions } from "../../model/controller/sessions/sessions.controller.js";
import { countMeetings } from "../../model/controller/meetings/meetings.controller.js";
import { countFiles, sumFileSizes } from "../../model/controller/storage/storage.controller.js";
import {
  countUsers,
  findOneUser,
  findUsers,
  findUsersByIds,
  removeRoleFromUsers,
  updateOneUser,
} from "../../model/controller/users/users.controller.js";
import { deletePresences, updatePresences } from "../../model/controller/voice/voice.controller.js";
import { HttpError } from "../../utils/http/http.util.js";
import { escapeRegex } from "../../utils/validators/input.validator.js";
import { notify } from "../notifications/notifications.service.js";
import { stopTracks } from "../storage/storage.service.js";

const DAY_MS = 86_400_000;
const duplicateKey = (error) => error.code === 11000;

export async function getStats() {
  const now = Date.now();
  const days = Array.from({ length: 7 }, (_, i) => new Date(now - (6 - i) * DAY_MS).toISOString().slice(0, 10));
  const [users, online, rooms, groups, directs, messages, messagesToday, files, storage, roles, perDay, meetings] = await Promise.all([
    countUsers(),
    countUsers({ lastSeenAt: { $gt: new Date(now - 5 * 60_000) } }),
    countChats({ type: "room" }),
    countChats({ type: "group" }),
    countChats({ type: "direct" }),
    countMessages(),
    countMessages({ createdAt: { $gt: new Date(now - DAY_MS) } }),
    countFiles(),
    sumFileSizes(),
    countRoles(),
    countMessagesPerDay(new Date(`${days[0]}T00:00:00.000Z`)),
    countMeetings({ active: true }),
  ]);
  return {
    stats: { users, online, rooms, groups, directs, messages, messages_today: messagesToday, files, storage, roles, meetings },
    daily: days.map((day) => ({ day, count: perDay.get(day) ?? 0 })),
  };
}

export async function listUsers(query) {
  const filter = {};
  if (query) {
    const pattern = new RegExp(escapeRegex(query), "i");
    filter.$or = [{ username: pattern }, { displayName: pattern }, { phone: pattern }];
  }
  const users = await findUsers(filter, { sort: { createdAt: -1 }, limit: 200 });
  const roles = new Map((await findRoles()).map((role) => [role._id, role]));
  return users.map((user) => ({
    id: user._id,
    phone: user.phone,
    username: user.username,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    avatarFileId: user.avatarFileId ?? null,
    isBanned: user.isBanned,
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
    roles: user.roleIds.flatMap((id) => {
      const role = roles.get(id);
      return role ? [{ id: role._id, name: role.name, color: role.color }] : [];
    }),
  }));
}

export async function setUserPassword(me, userId, password) {
  if (!me.permissions.includes("users.manage")) throw new HttpError(403, "مجوز مدیریت کاربران را ندارید");
  const target = await findOneUser({ _id: userId });
  if (!target) throw new HttpError(404, "کاربر پیدا نشد");
  const passwordHash = await bcrypt.hash(password, 10);
  await updateOneUser({ _id: userId }, { passwordHash });
  await deleteSessions({ userId });
  await notify(
    userId,
    "password-changed",
    "رمز عبور شما تغییر کرد",
    "یک مدیر رمز عبور حساب شما را تغییر داد و همهٔ نشست‌ها بسته شد. اگر این کار شما نبود، با مدیر تماس بگیرید.",
    undefined,
    me.displayName,
  );
}

export async function updateUser(me, userId, input) {
  if (!(await findOneUser({ _id: userId }))) throw new HttpError(404, "کاربر پیدا نشد");

  if (input.roleIds) {
    if (!me.permissions.includes("users.manage")) throw new HttpError(403, "مجوز مدیریت نقش کاربران را ندارید");
    const roles = input.roleIds.length ? await findRoles({ _id: { $in: input.roleIds } }) : [];
    const permissions = new Set(roles.flatMap((role) => role.permissions));
    if (userId === me.id && !permissions.has("admin.access")) {
      throw new HttpError(400, "نمی‌توانید دسترسی مدیریت خودتان را بردارید");
    }
    await updateOneUser({ _id: userId }, { roleIds: roles.map((role) => role._id) });
    // Losing a voice permission takes effect inside a running call immediately.
    if (!permissions.has("voice.speak")) await updatePresences({ userId }, { micOn: false });
    if (!permissions.has("voice.play")) await stopTracks({ userId });
    if (!permissions.has("voice.join")) await deletePresences({ userId });
  }

  if (input.isBanned !== undefined) {
    if (!me.permissions.includes("users.ban")) throw new HttpError(403, "مجوز مسدودسازی ندارید");
    if (userId === me.id) throw new HttpError(400, "نمی‌توانید خودتان را مسدود کنید");
    await updateOneUser({ _id: userId }, { isBanned: input.isBanned });
    if (input.isBanned) {
      await notify(userId, "system", "حساب شما مسدود شد", "برای بررسی، با مدیر سامانه تماس بگیرید.", undefined, me.displayName);
      await deleteSessions({ userId });
      await deletePresences({ userId });
      await stopTracks({ userId });
    }
  }
}

export async function listRoles() {
  const roles = await findRoles();
  const userCounts = await Promise.all(roles.map((role) => countUsers({ roleIds: role._id })));
  return {
    roles: roles.map((role, i) => ({
      id: role._id,
      name: role.name,
      description: role.description,
      color: role.color,
      isSystem: role.isSystem,
      isDefault: role.isDefault,
      userCount: userCounts[i],
      permissions: role.permissions,
      imageLimit: role.imageLimit ?? DEFAULT_IMAGE_LIMIT,
      maxMeetingHours: role.maxMeetingHours ?? DEFAULT_MEETING_HOURS,
    })),
    // The catalogue the role editor renders: every permission with its Persian label and group.
    permissions: PERMISSIONS,
  };
}

export async function createRole(input) {
  if (!input.name) throw new HttpError(400, "نام نقش باید بین ۲ تا ۳۲ کاراکتر باشد");
  try {
    const role = await insertRole({
      name: input.name,
      description: input.description ?? "",
      color: input.color ?? "#8b5cf6",
      isSystem: false,
      isDefault: input.isDefault ?? false,
      permissions: input.permissions ?? [],
      imageLimit: input.imageLimit ?? DEFAULT_IMAGE_LIMIT,
      maxMeetingHours: input.maxMeetingHours ?? DEFAULT_MEETING_HOURS,
    });
    return { id: role._id, name: role.name };
  } catch (error) {
    if (duplicateKey(error)) throw new HttpError(409, "نقشی با این نام وجود دارد");
    throw error;
  }
}

export async function updateRole(roleId, input) {
  const role = await findOneRole({ _id: roleId });
  if (!role) throw new HttpError(404, "نقش پیدا نشد");
  // The administrator role must always keep every permission, otherwise nobody could manage the app.
  const locked = role.isSystem && role.name === ADMIN_ROLE_NAME;
  const patch = {};
  if (input.name && !locked) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.color) patch.color = input.color;
  if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
  if (input.permissions) patch.permissions = locked ? [...ALL_PERMISSION_KEYS] : input.permissions;
  if (input.imageLimit !== undefined) patch.imageLimit = input.imageLimit;
  if (input.maxMeetingHours !== undefined) patch.maxMeetingHours = input.maxMeetingHours;
  if (!Object.keys(patch).length) return;
  try {
    await updateOneRole({ _id: roleId }, patch);
  } catch (error) {
    if (duplicateKey(error)) throw new HttpError(409, "نقشی با این نام وجود دارد");
    throw error;
  }
}

export async function deleteRole(roleId) {
  const role = await findOneRole({ _id: roleId });
  if (!role) throw new HttpError(404, "نقش پیدا نشد");
  if (role.isSystem) throw new HttpError(400, "نقش‌های سیستمی قابل حذف نیستند");
  await deleteRoles({ _id: roleId });
  await removeRoleFromUsers(roleId);
}

export async function listRooms() {
  const chats = await findChats({ type: { $in: ["room", "group"] } }, { sort: { createdAt: -1 }, limit: 300 });
  const ownerIds = chats.map((chat) => chat.createdBy).filter((id) => typeof id === "number");
  const owners = new Map((await findUsersByIds(ownerIds)).map((user) => [user._id, user]));
  const counts = await countMessagesByChat(chats.map((chat) => chat._id));
  return chats.map((chat) => {
    const owner = chat.createdBy ? owners.get(chat.createdBy) : undefined;
    return {
      id: chat._id,
      type: chat.type,
      name: chat.name,
      emoji: chat.emoji,
      description: chat.description,
      createdAt: chat.createdAt,
      ownerUsername: owner?.username ?? null,
      ownerName: owner?.displayName ?? null,
      members: chat.members.length,
      messages: counts.get(chat._id) ?? 0,
    };
  });
}
