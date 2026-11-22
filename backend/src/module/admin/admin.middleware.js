import { ALL_PERMISSION_KEYS } from "../../config/permissions.config.js";
import { HttpError } from "../../utils/http/http.util.js";
import { isHexColor } from "../../utils/validators/color.validator.js";
import { positiveInt, text } from "../../utils/validators/input.validator.js";

export const validateUserPatch = (req) => {
  const input = {};
  if (Array.isArray(req.body.roleIds)) {
    const ids = req.body.roleIds.slice(0, 50);
    input.roleIds = [...new Set(ids.map(positiveInt).filter(Boolean))];
  }
  if (typeof req.body.isBanned === "boolean") input.isBanned = req.body.isBanned;
  req.input = input;
};

export const validatePassword = (req) => {
  const password = text(req.body.password, 128);
  if (password.length < 6) throw new HttpError(400, "رمز جدید باید حداقل ۶ کاراکتر باشد");
  req.input = { password };
};

export const validateRole = (req) => {
  const input = {};
  const name = text(req.body.name, 64).trim();
  if (name) {
    if (name.length < 2 || name.length > 32) throw new HttpError(400, "نام نقش باید بین ۲ تا ۳۲ کاراکتر باشد");
    input.name = name;
  }
  if (typeof req.body.description === "string") input.description = req.body.description.slice(0, 120);
  const color = text(req.body.color, 7);
  if (isHexColor(color)) input.color = color;
  if (typeof req.body.isDefault === "boolean") input.isDefault = req.body.isDefault;
  if (req.body.imageLimit !== undefined) {
    const n = Number(req.body.imageLimit);
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw new HttpError(400, "سهمیهٔ تصویر باید عددی بین ۰ (نامحدود) تا ۱۰۰٬۰۰۰ باشد");
    input.imageLimit = n;
  }
  if (req.body.maxMeetingHours !== undefined) {
    const h = Number(req.body.maxMeetingHours);
    if (!Number.isInteger(h) || h < 0 || h > 8760) throw new HttpError(400, "حداکثر زمان جلسه باید عددی بین ۰ (نامحدود) تا ۸۷۶۰ ساعت باشد");
    input.maxMeetingHours = h;
  }
  if (Array.isArray(req.body.permissions)) {
    const known = new Set(ALL_PERMISSION_KEYS);
    const requested = req.body.permissions;
    input.permissions = [
      ...new Set(requested.filter((p) => typeof p === "string" && known.has(p))),
    ];
  }
  req.input = input;
};
