import { positiveInt } from "../../utils/validators/input.validator.js";

export const validateMarkRead = (req) => {
  const raw = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 200) : [];
  req.input = { ids: [...new Set(raw.map(positiveInt).filter(Boolean))] };
};
