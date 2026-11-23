import { getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

const users = () => getCollection("users");

/**
 * A user whose client hasn't made any authenticated request in over 75s (heartbeats/polls run every 3–15s)
 * is considered disconnected (`offline`) automatically!
 * When actively connected (`!disconnected`):
 * - `"invisible"` always reads as `"offline"` publicly.
 * - `"idle"` and `"dnd"` are explicit manual choices set by the user and stay active while connected.
 * - `"online"` (default) shows `"online"` while connected.
 */
export const OFFLINE_AFTER_MS = 75_000;

export const effectivePresence = (user) => {
  const chosen = user.status ?? "online";
  if (chosen === "invisible") return "offline";
  const lastMs = user.lastSeenAt instanceof Date ? user.lastSeenAt.getTime() : new Date(user.lastSeenAt || 0).getTime();
  if (!lastMs || Date.now() - lastMs > OFFLINE_AFTER_MS) return "offline";
  if (chosen === "idle" || chosen === "dnd") return chosen;
  return "online";
};

export const toPublicUser = (user) => {
  const status = effectivePresence(user);
  return {
    id: user._id,
    username: user.username,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    avatarFileId: user.avatarFileId ?? null,
    bannerFileId: user.bannerFileId ?? null,
    bio: user.bio,
    lastSeenAt: user.lastSeenAt,
    status,
    statusText: user.statusText ?? "",
    statusEmoji: user.statusEmoji ?? "",
  };
};

// insert

export const insertUser = async (data) => {
  const now = new Date();
  const doc = { ...data, _id: await nextId("users"), lastSeenAt: now, createdAt: now };
  await (await users()).insertOne(doc);
  return doc;
};

// find

export const findOneUser = async (field) => (await users()).findOne(field);

export const findUsers = async (field = {}, options = {}) =>
  (await users()).find(field, options).toArray();

export const findUsersByIds = async (ids) =>
  ids.length ? findUsers({ _id: { $in: [...new Set(ids)] } }) : [];

export const countUsers = async (field = {}) => (await users()).countDocuments(field);

// update

export const updateOneUser = async (field, data) =>
  (await users()).updateOne(field, { $set: data });

export const removeRoleFromUsers = async (roleId) =>
  (await users()).updateMany({ roleIds: roleId }, { $pull: { roleIds: roleId } });
