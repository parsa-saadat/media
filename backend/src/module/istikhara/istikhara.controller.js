import * as istikharaService from "./istikhara.service.js";

export const draw = async (req, res) => {
  res.json(await istikharaService.draw(req.input.translation));
};

export const translations = async (_req, res) => {
  res.json({ translations: Object.entries(istikharaService.TRANSLATIONS).map(([id, name]) => ({ id, name })) });
};
