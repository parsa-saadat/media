import { positiveInt, text } from "../../utils/validators/input.validator.js";
import { normalizeUsername } from "../../utils/validators/username.validator.js";

/** A user referenced either by @username or by id. */
export const validateUsername = (req) => {
  req.input = { username: normalizeUsername(text(req.body.username, 64)) };
};

export const validateTarget = (req) => {
  req.input = {
    username: normalizeUsername(text(req.body.username, 64)),
    userId: positiveInt(req.body.userId),
  };
};

export const validateRespond = (req) => {
  req.input = { action: req.body.action === "accept" ? "accept" : "reject" };
};
