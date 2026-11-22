import { getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

const users = () => getCollection("users");

const IDLE_AFTER_MS = 5 * 60_000;

/**
 * Effective presence. "invisible" always reads as offline; otherwise a stale lastSeen means idle.
 * Never exposes phone, password hash or the raw status choice.
 */
export const toPublicUser = (user) => {
  const chosen = user.status ?? "online";
  const stale = Date.now() - user.lastSeenAt.getTime() > IDLE_AFTER_MS;
  const status = chosen === "invisible" ? "offline" : chosen === "online" && stale ? "idle" : chosen;
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
