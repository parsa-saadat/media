import { envelope, HttpError } from "../../utils/http/http.util.js";

/** Turns anything thrown by a middleware, controller or service into the JSON envelope. */
export function errorHandler(error) {
  const known = error;
  if (error instanceof HttpError || (known?.name === "HttpError" && typeof known.status === "number")) {
    return envelope(known.status, known.data ?? null, known.message || "خطا");
  }
  console.error("[voxsy-api]", error);
  return envelope(500, null, "خطای داخلی سرور");
}
