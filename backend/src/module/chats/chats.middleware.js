import { HttpError } from "../../utils/http/http.util.js";
import { positiveInt, text } from "../../utils/validators/input.validator.js";
import { normalizeUsername } from "../../utils/validators/username.validator.js";

/** Chat icons are keys of the frontend icon set, e.g. "landmark" or "arrow-right". */
const ICON_KEY = /^[a-z][a-z-]{1,23}$/;

export const validateCreateChat = (req) => {
  const type = "group";
  const name = text(req.body.name, 100).trim();
  if (name.length < 2 || name.length > 48) throw new HttpError(400, "نام باید بین ۲ تا ۴۸ کاراکتر باشد");
  const emoji = text(req.body.emoji, 24);
  const rawMembers = Array.isArray(req.body.members) ? req.body.members.slice(0, 100) : [];
  req.input = {
    type,
    name,
    description: text(req.body.description, 200),
    emoji: ICON_KEY.test(emoji) ? emoji : "users",
    members: [...new Set(rawMembers.map((member) => normalizeUsername(text(member, 64))).filter(Boolean))],
  };
};

export const validateUpdateChat = (req) => {
  const input = {};
  const name = text(req.body.name, 100).trim();
  if (name.length >= 2) input.name = name.slice(0, 48);
  if (typeof req.body.description === "string") input.description = req.body.description.slice(0, 200);
  const emoji = text(req.body.emoji, 24);
  if (ICON_KEY.test(emoji)) input.emoji = emoji;
  req.input = input;
};

export const validateAddMember = (req) => {
  req.input = { username: normalizeUsername(text(req.body.username, 64)) };
};

export const validateMemberAction = (req) => {
  const userId = positiveInt(req.body.userId);
  const action = text(req.body.action, 16);
  if (!userId || (action !== "kick" && action !== "promote" && action !== "demote")) {
    throw new HttpError(400, "درخواست نامعتبر است");
  }
  req.input = { userId, action };
};

export const validateRead = (req) => {
  req.input = { messageId: positiveInt(req.body.messageId) };
};

export const validateDirect = (req) => {
  req.input = {
    username: normalizeUsername(text(req.body.username, 64)),
    userId: positiveInt(req.body.userId),
    saved: req.body.saved === true,
  };
};
