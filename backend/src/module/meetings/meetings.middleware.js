import { HttpError } from "../../utils/http/http.util.js";
import { escapeRegex, text } from "../../utils/validators/input.validator.js";
import { GAME_TYPES } from "../games/games.service.js";

export const SHARE_QUALITIES = ["480p", "720p", "1080p"];
export const SHARE_FPS = [30, 60];

const defaultQuality = (raw) => (SHARE_QUALITIES.includes(raw) ? raw : "720p");
const defaultFps = (raw) => (SHARE_FPS.includes(raw) ? raw : 30);

/** A display name for a joiner: their own choice, or sequential "عزیز ۱", "عزیز ۲", ... when blank. */
export function guestName(raw, allowNames, usedNames) {
  const own = text(raw, 40).trim();
  if (allowNames !== false && own.length >= 1) return own.slice(0, 32);
  let n = 1;
  let name = `عزیز ${n}`;
  while (usedNames.includes(name)) {
    n++;
    name = `عزیز ${n}`;
  }
  return name;
}

export const validateCreateMeeting = (req) => {
  const rawTitle = text(req.body.title, 80).trim();
  if (rawTitle.length > 60) throw new HttpError(400, "عنوان جلسه حداکثر ۶۰ کاراکتر می‌تواند باشد");
  req.input = {
    title: rawTitle ? (escapeRegex(rawTitle).length > 200 ? rawTitle.slice(0, 60) : rawTitle) : "",
    lobby: req.body.lobby !== false,
    allowNames: true,
  };
};

export const validateJoinMeeting = (req) => {
  req.input = {
    name: text(req.body.name, 40),
    joinToken: text(req.body.joinToken, 100),
    browserId: text(req.body.browserId, 100).trim(),
    forceTakeover: req.body.forceTakeover === true,
  };
};

export const validateMeetingAction = (req) => {
  const action = text(req.body.action, 24);
  const joinToken = text(req.body.joinToken, 100);
  if (!joinToken) throw new HttpError(409, "ابتدا به جلسه بپیوندید");
  let input;
  if (["leave", "heartbeat"].includes(action)) {
    input = { action, joinToken };
  } else if (["admit", "kick", "mute", "unmute", "block-share", "allow-share"].includes(action)) {
    const target = text(req.body.target, 100);
    if (!target) throw new HttpError(400, "شرکت‌کنندهٔ هدف مشخص نیست");
    input = { action, joinToken, target };
  } else if (action === "mic") {
    input = { action: "mic", joinToken, on: req.body.on === true };
  } else if (action === "share") {
    const quality = text(req.body.quality, 8);
    input = {
      action: "share",
      joinToken,
      on: req.body.on === true,
      quality: defaultQuality(quality),
      fps: defaultFps(Math.trunc(Number(req.body.fps)) || 30),
    };
  } else if (action === "camera") {
    const quality = text(req.body.quality, 8);
    input = {
      action: "camera",
      joinToken,
      on: req.body.on === true,
      quality: defaultQuality(quality),
      fps: defaultFps(Math.trunc(Number(req.body.fps)) || 30),
    };
  } else if (action === "game-create") {
    input = { action, joinToken, game: text(req.body.game, 16) };
  } else if (["game-join", "game-start", "game-close"].includes(action)) {
    input = { action, joinToken };
  } else if (action === "game-move") {
    input = { action, joinToken, move: req.body.move ?? {} };
  } else if (action === "signal") {
    const to = text(req.body.to, 100);
    const kind = text(req.body.kind, 20);
    const payload = JSON.stringify(req.body.payload ?? {});
    if (!to) throw new HttpError(400, "گیرندهٔ سیگنال نامعتبر است");
    if (!["offer", "answer", "ice", "screen-offer", "screen-answer", "screen-ice", "stream-meta"].includes(kind)) throw new HttpError(400, "نوع سیگنال نامعتبر است");
    if (payload.length > 60_000) throw new HttpError(413, "سیگنال بیش از حد بزرگ است");
    input = { action: "signal", joinToken, to, kind, payload };
  } else {
    throw new HttpError(400, "عملیات ناشناخته است");
  }
  req.input = input;
};

/** The meeting is addressed by its public link token (base64url), not by a numeric id. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

export const validateMeetingToken = (req) => {
  const token = text(req.params.token, 80).trim();
  if (!TOKEN_PATTERN.test(token)) throw new HttpError(400, "لینک جلسه نامعتبر است");
};
