import { text } from "../../utils/validators/input.validator.js";
import { TRANSLATIONS } from "./istikhara.service.js";

/** Only a known translation identifier may reach the upstream API. */
export const validateDraw = (req) => {
  const requested = text(req.query.get("translation"), 32);
  req.input = { translation: requested in TRANSLATIONS ? requested : "fa.makarem" };
};
