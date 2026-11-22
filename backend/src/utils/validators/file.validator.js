const AUDIO_BY_EXTENSION = {
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg",
  opus: "audio/ogg", wav: "audio/wav", flac: "audio/flac", webm: "audio/webm",
};

const INLINE_IMAGES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp"]);

/** Browsers often send FLAC/M4A uploads without a type, so fall back to the file extension. */
export function resolveMime(name, declared) {
  const clean = declared.split(";")[0].trim().toLowerCase();
  if (clean && clean !== "application/octet-stream" && /^[\w.+-]+\/[\w.+-]+$/.test(clean)) return clean;
  return AUDIO_BY_EXTENSION[name.split(".").pop()?.toLowerCase() || ""] || "application/octet-stream";
}

export const isAudioMime = (mime) => mime.startsWith("audio/") || mime === "application/ogg";

/** Only raster images and audio may be displayed in place; everything else (SVG, HTML, …) downloads. */
export const isInlineSafe = (mime) => INLINE_IMAGES.has(mime) || isAudioMime(mime);
