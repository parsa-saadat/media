import { positiveInt } from "../../utils/validators/input.validator.js";
import { HttpError } from "../../utils/http/http.util.js";
import { sanitizeInput } from "./content.service.js";

export const validateContentId = (req) => {
  if (!positiveInt(req.params.id)) throw new HttpError(400, "شناسهٔ نامعتبر است");
};

export const validateCreateContent = (req) => {
  req.input = sanitizeInput(req.body ?? {});
};

export const validateUpdateContent = (req) => {
  req.input = sanitizeInput(req.body ?? {});
};
