import { HttpError } from "../../utils/http/http.util.js";
import { AVATAR_COLORS } from "../../utils/validators/color.validator.js";
import { text } from "../../utils/validators/input.validator.js";
import { isValidPhone, normalizePhone } from "../../utils/validators/phone.validator.js";
import { isValidUsername, normalizeUsername } from "../../utils/validators/username.validator.js";

export const validateRegister = (req) => {
  const phone = normalizePhone(text(req.body.phone, 32));
  const username = normalizeUsername(text(req.body.username, 64));
  const displayName = text(req.body.displayName, 100).trim() || username;
  const password = text(req.body.password, 128);
  if (!isValidPhone(phone)) throw new HttpError(400, "شماره موبایل معتبر نیست (مثال: 09123456789)");
  if (!isValidUsername(username)) {
    throw new HttpError(400, "نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی، عدد یا _ باشد و با حرف شروع شود");
  }
  if (password.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد");
  if (displayName.length > 48) throw new HttpError(400, "نام نمایشی خیلی طولانی است");
  req.input = { phone, username, displayName, password };
};

export const validateLogin = (req) => {
  const rawIdentifier = text(req.body.identifier ?? req.body.phone ?? req.body.username, 64).trim();
  const password = text(req.body.password, 128);
  if (!rawIdentifier || !password) {
    throw new HttpError(400, "شماره موبایل یا نام کاربری و رمز عبور را وارد کنید");
  }
  const maybePhone = normalizePhone(rawIdentifier);
  if (isValidPhone(maybePhone)) {
    req.input = { phone: maybePhone, username: null, password };
    return;
  }
  const maybeUser = normalizeUsername(rawIdentifier);
  if (isValidUsername(maybeUser)) {
    req.input = { phone: null, username: maybeUser, password };
    return;
  }
  throw new HttpError(400, "شماره موبایل یا نام کاربری معتبر نیست");
};

export const validateProfile = (req) => {
  const input = {};
  if (typeof req.body.displayName === "string") {
    const displayName = req.body.displayName.trim();
    if (!displayName || displayName.length > 48) throw new HttpError(400, "نام نمایشی معتبر نیست");
    input.displayName = displayName;
  }
  if (typeof req.body.bio === "string") input.bio = req.body.bio.slice(0, 200);
  const newPassword = text(req.body.newPassword, 128);
  if (newPassword) {
    if (newPassword.length < 6) throw new HttpError(400, "رمز جدید باید حداقل ۶ کاراکتر باشد");
    input.newPassword = newPassword;
    input.currentPassword = text(req.body.currentPassword, 128);
  }
  req.input = input;
};
