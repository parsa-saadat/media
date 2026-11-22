/**
 * Request bodies are untrusted JSON. These helpers only ever return primitives, so a value such as
 * { "$ne": null } can never reach a MongoDB filter (NoSQL injection).
 */
export const text = (value, max = 4000) =>
  (typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "").slice(0, max);

export const positiveInt = (value) => {
  const n =
    typeof value === "number" ? value : typeof value === "string" && /^\d{1,15}$/.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};

/** Makes user text safe to use inside a RegExp search. */
export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
