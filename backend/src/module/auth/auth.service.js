import bcrypt from "bcryptjs";
import {
  ADMIN_ROLE_NAME,
  DEFAULT_IMAGE_LIMIT,
  DEFAULT_MEETING_HOURS,
  SYSTEM_ROLES,
  UNLIMITED_IMAGES,
  UNLIMITED_MEETING_HOURS,
} from "../../config/permissions.config.js";
import { SESSION_DAYS } from "../../config/token.config.js";
import { findRoles, insertRole, updateOneRole } from "../../model/controller/roles/roles.controller.js";
import { deleteSessions, findOneSession, insertSession } from "../../model/controller/sessions/sessions.controller.js";
import {
  countUsers,
  findOneUser,
  findUsers,
  insertUser,
  updateOneUser,
} from "../../model/controller/users/users.controller.js";
import { generateSessionToken } from "../../utils/generators/token.generator.js";
import { HttpError } from "../../utils/http/http.util.js";
import { randomAvatarColor } from "../../utils/validators/color.validator.js";

/** The signed-in user as every controller and the frontend see it. */
const flags = globalThis;

/** 0 (unlimited) wins; otherwise the largest limit among the roles; a user with no roles gets the default. */
export function effectiveImageLimit(limits) {
  const known = limits.map((l) => (typeof l === "number" ? l : DEFAULT_IMAGE_LIMIT));
  if (!known.length) return DEFAULT_IMAGE_LIMIT;
  if (known.includes(UNLIMITED_IMAGES)) return UNLIMITED_IMAGES;
  return Math.max(...known);
}

/** 0 (unlimited) wins; otherwise the largest meeting hour cap among the user's roles (default 24h). */
export function effectiveMeetingHours(limits) {
  const known = limits.map((l) => (typeof l === "number" ? l : DEFAULT_MEETING_HOURS));
  if (!known.length) return DEFAULT_MEETING_HOURS;
  if (known.includes(UNLIMITED_MEETING_HOURS)) return UNLIMITED_MEETING_HOURS;
  return Math.max(...known);
}

/** Creates the three built-in roles (مدیر کل، ناظر، کاربر) the first time the database is used. */
export function ensureSystemRoles() {
  if (!flags.__voxsyRolesReady) {
    flags.__voxsyRolesReady = (async () => {
      const current = await findRoles();
      const byName = new Map(current.map((role) => [role.name, role]));
      for (const role of SYSTEM_ROLES) {
        const found = byName.get(role.name);
        if (!found) {
          await insertRole({ ...role, permissions: [...role.permissions], isSystem: true });
          continue;
        }
        // Upgrade path for databases created before these fields existed. Each batch is applied once
        // and guarded by its own marker permission, so permissions an admin removed later stay removed.
        const patch = {};
        if (found.imageLimit === undefined) patch.imageLimit = role.imageLimit;
        if (found.maxMeetingHours === undefined) patch.maxMeetingHours = role.maxMeetingHours;
        if (found.isSystem) {
          const added = ["avatar.upload", "meetings.create", "screen.share", "content.manage", "azan.manage"].filter(
            (key) => role.permissions.includes(key) && !found.permissions.includes(key),
          );
          if (added.length) patch.permissions = [...found.permissions, ...added];
        }
        if (Object.keys(patch).length) await updateOneRole({ _id: found._id }, patch);
      }
    })().catch((error) => {
      flags.__voxsyRolesReady = undefined;
      throw error;
    });
  }
  return flags.__voxsyRolesReady;
}

export async function toAuthUser(user) {
  const roles = user.roleIds.length ? await findRoles({ _id: { $in: user.roleIds } }) : [];
  const singlePhoto = user.avatarFileId ? [user.avatarFileId] : (user.photos ?? []).slice(0, 1);
  return {
    id: user._id,
    phone: user.phone,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarColor: user.avatarColor,
    avatarFileId: singlePhoto[0] ?? null,
    bannerFileId: user.bannerFileId ?? null,
    photos: singlePhoto,
    status: user.status ?? "online",
    statusText: user.statusText ?? "",
    statusEmoji: user.statusEmoji ?? "",
    isBanned: user.isBanned,
    isMock: !!user.isMock,
    permissions: [...new Set(roles.flatMap((role) => role.permissions))],
    imageLimit: effectiveImageLimit(roles.map((role) => role.imageLimit)),
    maxMeetingHours: effectiveMeetingHours(roles.map((role) => role.maxMeetingHours)),
    roles: roles.map((role) => ({ id: role._id, name: role.name, color: role.color })),
  };
}

/** The first token that maps to a live session wins (header tokens come before the cookie). */
/**
 * Looks the request's tokens up in the sessions collection. The first live session wins, in the order
 * of readTokens(). `reason` says why nobody was found, so the client can tell the cases apart.
 */
export async function resolveSession(tokens) {
  if (!tokens.length) return { user: null, reason: "no-token" };
  for (const token of tokens) {
    const session = await findOneSession({ _id: token, expiresAt: { $gt: new Date() } });
    if (!session) continue;
    const doc = await findOneUser({ _id: session.userId });
    if (!doc) continue;
    if (doc.isBanned) return { user: null, reason: "banned" };
    const now = new Date();
    if (now.getTime() - doc.lastSeenAt.getTime() > 15_000) {
      await updateOneUser({ _id: doc._id }, { lastSeenAt: now });
      doc.lastSeenAt = now;
    }
    return { user: await toAuthUser(doc), reason: "ok" };
  }
  return { user: null, reason: "unknown-session" };
}

async function openSession(user) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await insertSession({ _id: token, userId: user._id, expiresAt });
  return { token, expiresAt, user: await toAuthUser(user) };
}

export async function registerUser(input) {
  await ensureSystemRoles();
  const taken = await findUsers({ $or: [{ phone: input.phone }, { username: input.username }] });
  if (taken.some((user) => user.phone === input.phone)) throw new HttpError(409, "این شماره موبایل قبلاً ثبت شده است");
  if (taken.length) throw new HttpError(409, "این نام کاربری گرفته شده است");

  // The first real (non-mock) account becomes the administrator.
  const isFirstRealUser = (await countUsers({ isMock: { $ne: true } })) === 0;
  const roleIds = (await findRoles())
    .filter((role) => role.isDefault || (isFirstRealUser && role.name === ADMIN_ROLE_NAME))
    .map((role) => role._id);

  try {
    const user = await insertUser({
      phone: input.phone,
      username: input.username,
      displayName: input.displayName,
      passwordHash: await bcrypt.hash(input.password, 10),
      bio: "",
      avatarColor: randomAvatarColor(),
      photos: [],
      status: "online",
      isBanned: false,
      roleIds,
    });
    return await openSession(user);
  } catch (error) {
    // Two registrations raced for the same phone/username: the unique index refused the second.
    if (error.code === 11000) {
      throw new HttpError(409, "این شماره موبایل یا نام کاربری قبلاً ثبت شده است");
    }
    throw error;
  }
}

export async function loginUser(input) {
  const query = input.phone ? { phone: input.phone } : { username: input.username };
  const user = await findOneUser(query);
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "نام کاربری / شماره موبایل یا رمز عبور اشتباه است");
  }
  if (user.isBanned) throw new HttpError(403, "حساب کاربری شما مسدود شده است");
  return openSession(user);
}

export async function logout(tokens) {
  if (tokens.length) await deleteSessions({ _id: { $in: tokens } });
}

export async function updateProfile(me, input) {
  const patch = {};
  if (input.displayName) patch.displayName = input.displayName;
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.avatarColor) patch.avatarColor = input.avatarColor;
  if (input.newPassword) {
    const user = await findOneUser({ _id: me.id });
    if (!user || !(await bcrypt.compare(input.currentPassword || "", user.passwordHash))) {
      throw new HttpError(400, "رمز عبور فعلی اشتباه است");
    }
    patch.passwordHash = await bcrypt.hash(input.newPassword, 10);
  }
  if (Object.keys(patch).length) await updateOneUser({ _id: me.id }, patch);
}

export async function listMockAccounts() {
  return [];
}
