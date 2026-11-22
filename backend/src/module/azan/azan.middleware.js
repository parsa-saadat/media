import { positiveInt, text } from "../../utils/validators/input.validator.js";
import { HttpError } from "../../utils/http/http.util.js";

export const validateSoundId = (req) => {
  if (!positiveInt(req.params.id)) throw new HttpError(400, "شناسهٔ صدا نامعتبر است");
};

export const validateSettings = (req) => {
  const b = req.body ?? {};
  req.input = {
    enabled: typeof b.enabled === "boolean" ? b.enabled : undefined,
    prayers:
      b.prayers && typeof b.prayers === "object" && !Array.isArray(b.prayers)
        ? Object.fromEntries(Object.entries(b.prayers).map(([k, v]) => [String(k).slice(0, 10), v !== false]))
        : undefined,
    soundFileId:
      b.soundFileId === null
        ? null
        : positiveInt(b.soundFileId)
          ? positiveInt(b.soundFileId)
          : undefined,
    volume: b.volume === undefined ? undefined : Math.trunc(Number(b.volume)),
    city:
      b.city === null
        ? null
        : b.city && typeof b.city === "object" && Number.isFinite(Number(b.city.lat)) && Number.isFinite(Number(b.city.lng))
          ? { name: text(String(b.city.name ?? ""), 60), lat: Number(b.city.lat), lng: Number(b.city.lng) }
          : undefined,
  };
};
