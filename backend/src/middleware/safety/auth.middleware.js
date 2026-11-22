import { readTokens } from "../../config/token.config.js";
import { resolveSession } from "../../module/auth/auth.service.js";
import { HttpError } from "../../utils/http/http.util.js";

/** Attaches the signed-in user (or null) and what reached the server. Never rejects. */
export const identify = async (req) => {
  const { tokens, received } = readTokens(req.headers, req.query);
  const { user, reason } = await resolveSession(tokens);
  req.user = user;
  req.session = { received, reason };
};

/** Rejects the request unless it carries a valid session (header, URL or cookie). */
export const authenticateToken = async (req) => {
  const { tokens, received } = readTokens(req.headers, req.query);
  const { user, reason } = await resolveSession(tokens);
  req.session = { received, reason };
  if (reason === "banned") throw new HttpError(403, "حساب کاربری شما مسدود شده است");
  if (!user) {
    throw new HttpError(
      401,
      reason === "no-token" ? "ابتدا وارد حساب کاربری شوید" : "نشست شما منقضی شده یا از بین رفته است؛ دوباره وارد شوید",
    );
  }
  req.user = user;
};

/** Role-based access: every listed permission must be granted by one of the user's roles. */
export const authorizePermissions = (...required) => (req) => {
  if (!required.every((permission) => req.me.permissions.includes(permission))) {
    throw new HttpError(403, "شما مجوز این عملیات را ندارید");
  }
};
