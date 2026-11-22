import { findUsers, toPublicUser } from "../../model/controller/users/users.controller.js";
import { escapeRegex } from "../../utils/validators/input.validator.js";

/** Finds people by @username or display name. Only public profile fields are returned. */
export async function searchUsers(me, rawQuery) {
  const query = rawQuery.trim().replace(/^@/, "");
  if (query.length < 2) return [];
  const pattern = new RegExp(escapeRegex(query), "i");
  const users = await findUsers({ _id: { $ne: me.id }, $or: [{ username: pattern }, { displayName: pattern }] }, { limit: 10 });
  return users.map(toPublicUser);
}
