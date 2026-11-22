import { HttpError } from "../../utils/http/http.util.js";
import { positiveInt, text } from "../../utils/validators/input.validator.js";

const invalid = () => new HttpError(400, "درخواست نامعتبر است");
const unknownAction = () => new HttpError(400, "عملیات ناشناخته است");

export const validateVoiceAction = (req) => {
  const action = text(req.body.action, 20);
  const joinToken = text(req.body.joinToken, 100);
  let input;

  if (action === "join") {
    input = { action, joinToken, forceTakeover: req.body.forceTakeover === true };
  } else if (action === "leave" || action === "heartbeat") {
    input = { action, joinToken };
  } else if (action === "audio-chunk") {
    const data = text(req.body.data, 120_000);
    const mime = text(req.body.mime, 80);
    if (!data) throw invalid();
    input = { action, joinToken, data, mime };
  } else if (action === "mic") {
    input = { action, joinToken, on: req.body.on === true };
  } else if (action === "share") {
    input = { action, joinToken, on: req.body.on === true, quality: text(req.body.quality, 8) || "720p" };
  } else if (action === "signal") {
    const toUserId = positiveInt(req.body.toUserId);
    const kind = text(req.body.kind, 10);
    if (!toUserId) throw invalid();
    if (kind !== "offer" && kind !== "answer" && kind !== "ice") throw invalid();
    const payload = JSON.stringify(req.body.payload ?? {});
    if (payload.length > 45_000) throw new HttpError(413, "سیگنال بیش از حد بزرگ است");
    input = { action, joinToken, toUserId, kind, payload };
  } else if (action === "moderate") {
    const userId = positiveInt(req.body.userId);
    const field = text(req.body.field, 20);
    const enabled = req.body.enabled;
    if (!userId || typeof enabled !== "boolean") throw invalid();
    if (field !== "micMuted" && field !== "playBlocked" && field !== "shareBlocked") throw invalid();
    input = { action, userId, field, enabled };
  } else {
    throw unknownAction();
  }
  req.input = input;
};

export const validateTrackAction = (req) => {
  const action = text(req.body.action, 20);
  const joinToken = text(req.body.joinToken, 100);
  let input;

  if (action === "stop") {
    input = { action, userId: positiveInt(req.body.userId) };
  } else if (action === "pause" || action === "resume") {
    input = { action, joinToken };
  } else if (action === "start") {
    input = {
      action,
      joinToken,
      fileId: positiveInt(req.body.fileId),
      url: text(req.body.url, 1500),
      title: text(req.body.title, 100).trim(),
    };
  } else {
    throw unknownAction();
  }
  req.input = input;
};
