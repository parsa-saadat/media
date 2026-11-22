import { clearSessionCookies, readTokens, serializeSessionCookie } from "../../config/token.config.js";
import * as authService from "./auth.service.js";

// The token is returned in the body and also set as a cookie. The client keeps the token and sends it
// back as a header or in the URL; the cookie is only an extra where the browser allows it.

export const register = async (req, res) => {
  const session = await authService.registerUser(req.input);
  res
    .status(201)
    .cookie(serializeSessionCookie(session.token, session.expiresAt, req.secure))
    .json({ ok: true, token: session.token, user: session.user }, "حساب کاربری ساخته شد");
};

export const login = async (req, res) => {
  const session = await authService.loginUser(req.input);
  res
    .cookie(serializeSessionCookie(session.token, session.expiresAt, req.secure))
    .json({ ok: true, token: session.token, user: session.user }, "خوش آمدید");
};

export const logout = async (req, res) => {
  await authService.logout(readTokens(req.headers, req.query).tokens);
  res.cookie(...clearSessionCookies(req.secure)).json({ ok: true }, "از حساب خارج شدید");
};

/**
 * Who am I? When the answer is "nobody", it says why and which token channels reached the server,
 * so the client can switch to a channel that does arrive.
 */
export const me = (req, res) => {
  const session = req.session;
  const received = session?.received ?? null;
  if (req.user) {
    res.json({ user: req.user, received });
    return;
  }
  // A cookie that matches no session was left over from an earlier login: remove it.
  if (session?.received.cookie && session.reason === "unknown-session") {
    res.cookie(...clearSessionCookies(req.secure));
  }
  res.json({ user: null, reason: session?.reason ?? "no-token", received });
};

export const updateMe = async (req, res) => {
  await authService.updateProfile(req.me, req.input);
  res.json({ ok: true }, "ذخیره شد");
};

export const mockAccounts = async (_req, res) => res.json({ accounts: await authService.listMockAccounts() });
