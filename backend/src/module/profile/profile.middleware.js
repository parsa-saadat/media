import { HttpError } from "../../utils/http/http.util.js";
import { positiveInt, text } from "../../utils/validators/input.validator.js";

export const STATUSES = ["online", "idle", "dnd", "invisible"];

export const validateStatus = (req) => {
  const status = text(req.body.status, 12);
  if (!STATUSES.includes(status)) throw new HttpError(400, "وضعیت نامعتبر است");
  req.input = {
    status,
    statusText: text(req.body.statusText, 80).trim().slice(0, 60),
    statusEmoji: text(req.body.statusEmoji, 8).slice(0, 4),
  };
};

export const validatePhotoId = (req) => {
  if (!positiveInt(req.params.fileId)) throw new HttpError(400, "شناسهٔ عکس نامعتبر است");
};
