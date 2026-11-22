import { HttpError } from "../http/http.util.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_REMOTE_AUDIO_BYTES = 45 * 1024 * 1024; // 45 MB hard ceiling for downloaded bot tracks
const FETCH_TIMEOUT_MS = 25_000;

let cachedScClientId = "";
let cachedScClientIdAt = 0;

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.startsWith("[") ||
    host === "0.0.0.0"
  ) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }
  return false;
}

async function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, ...(init.headers || {}) },
      redirect: "follow",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function resolveSoundCloudClientId(html) {
  if (cachedScClientId && Date.now() - cachedScClientIdAt < 3_600_000) {
    return cachedScClientId;
  }
  const scripts = [...html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(
    (m) => m[1],
  );
  for (let i = scripts.length - 1; i >= Math.max(0, scripts.length - 6); i--) {
    try {
      const jsRes = await fetchWithTimeout(scripts[i], {}, 12_000);
      if (!jsRes.ok) continue;
      const js = await jsRes.text();
      const match =
        js.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/) ||
        js.match(/client_id="([a-zA-Z0-9]{32})"/) ||
        js.match(/\?client_id=([a-zA-Z0-9]{32})/);
      if (match?.[1]) {
        cachedScClientId = match[1];
        cachedScClientIdAt = Date.now();
        return cachedScClientId;
      }
    } catch {
      /* try previous bundle */
    }
  }
  throw new HttpError(502, "دریافت کلید استریم از SoundCloud ممکن نشد؛ دوباره تلاش کنید");
}

async function downloadBufferCapped(res, maxBytes = MAX_REMOTE_AUDIO_BYTES) {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new HttpError(413, "حجم فایل صوتی بیش از حد مجاز است");
    return Buffer.from(ab);
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "حجم آهنگ بیش از حد مجاز (۴۵ مگابایت) است");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Resolves a SoundCloud track URL (including on.soundcloud.com shortlinks), downloads its
 * progressive stream or assembles its HLS fMP4/TS segments on the server, and returns `{ buffer, mime, title, ext }`.
 */
async function extractSoundCloudTrack(rawUrl) {
  let pageRes;
  try {
    pageRes = await fetchWithTimeout(rawUrl, {
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
  } catch {
    throw new HttpError(502, "سرور نتوانست به SoundCloud متصل شود");
  }
  if (!pageRes.ok) {
    throw new HttpError(404, "آهنگ مورد نظر در SoundCloud پیدا نشد یا خصوصی است");
  }
  const html = await pageRes.text();
  const hydMatch = html.match(/window\.__sc_hydration\s*=\s*(\[.*?\]);<\/script>/s);
  if (!hydMatch) {
    throw new HttpError(400, "این لینک SoundCloud قابل پخش نیست؛ لینک مستقیم یک ترک (آهنگ) را وارد کنید");
  }
  let hydration;
  try {
    hydration = JSON.parse(hydMatch[1]);
  } catch {
    throw new HttpError(502, "اطلاعات آهنگ در SoundCloud قابل خواندن نبود");
  }

  let sound = hydration.find((item) => item?.hydratable === "sound")?.data;
  // Support playlist/set links by picking the first playable track in the set
  if (!sound) {
    const playlist = hydration.find((item) => item?.hydratable === "playlist")?.data;
    if (playlist?.tracks?.length) {
      sound = playlist.tracks.find((t) => t?.media?.transcodings?.length) || null;
    }
  }
  if (!sound || !sound.media?.transcodings?.length) {
    throw new HttpError(400, "هیچ استریم صوتی فعالی در این لینک SoundCloud یافت نشد");
  }

  let clientId = await resolveSoundCloudClientId(html);
  const transcodings = sound.media.transcodings;

  // Prefer progressive MP3/M4A first if available, then HLS audio/mp4 (fMP4 AAC), then HLS audio/mpeg
  const chosen =
    transcodings.find((t) => t.format?.protocol === "progressive" && !t.snipped) ||
    transcodings.find((t) => t.format?.protocol === "hls" && t.format?.mime_type?.startsWith("audio/mp4") && !t.snipped) ||
    transcodings.find((t) => t.format?.protocol === "hls" && t.format?.mime_type?.startsWith("audio/mpeg") && !t.snipped) ||
    transcodings[0];

  if (!chosen?.url) {
    throw new HttpError(400, "استریم صوتی این آهنگ توسط صاحب اثر مسدود شده است");
  }

  const sep = chosen.url.includes("?") ? "&" : "?";
  let streamMetaRes = await fetchWithTimeout(`${chosen.url}${sep}client_id=${encodeURIComponent(clientId)}`);
  if (streamMetaRes.status === 401 || streamMetaRes.status === 403) {
    // Refresh cached client_id once if expired
    cachedScClientId = "";
    clientId = await resolveSoundCloudClientId(html);
    streamMetaRes = await fetchWithTimeout(`${chosen.url}${sep}client_id=${encodeURIComponent(clientId)}`);
  }
  if (!streamMetaRes.ok) {
    throw new HttpError(502, "دریافت آدرس استریم صوتی از SoundCloud ناموفق بود");
  }
  const streamMeta = await streamMetaRes.json().catch(() => null);
  if (!streamMeta?.url) {
    throw new HttpError(502, "آدرس پخش صوتی از SoundCloud دریافت نشد");
  }

  const artist = sound.user?.username ? `${sound.user.username} — ` : "";
  const cleanTitle = `${artist}${sound.title || "آهنگ SoundCloud"}`.slice(0, 100);

  if (chosen.format?.protocol === "progressive") {
    const audioRes = await fetchWithTimeout(streamMeta.url, {}, 30_000);
    if (!audioRes.ok) throw new HttpError(502, "دانلود استریم صوتی از SoundCloud ناموفق بود");
    const buffer = await downloadBufferCapped(audioRes);
    const isMp4 = chosen.format?.mime_type?.includes("mp4");
    return {
      buffer,
      mime: isMp4 ? "audio/mp4" : "audio/mpeg",
      ext: isMp4 ? "m4a" : "mp3",
      title: cleanTitle,
      sourceKind: "soundcloud",
    };
  }

  // HLS playlist: fetch m3u8, download init map + segments in parallel batches, and concatenate!
  const m3u8Res = await fetchWithTimeout(streamMeta.url, {}, 15_000);
  if (!m3u8Res.ok) throw new HttpError(502, "فهرست پخش صوتی از SoundCloud دریافت نشد");
  const m3u8 = await m3u8Res.text();

  const mapMatch = m3u8.match(/#EXT-X-MAP:URI="([^"]+)"/);
  const segmentUrls = m3u8
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((u) => new URL(u, streamMeta.url).toString());

  if (!segmentUrls.length) {
    throw new HttpError(502, "قطعات صوتی آهنگ در SoundCloud خالی بود");
  }

  const allUrls = [...(mapMatch?.[1] ? [new URL(mapMatch[1], streamMeta.url).toString()] : []), ...segmentUrls];
  const parts = [];
  let totalBytes = 0;
  const BATCH_SIZE = 8;

  for (let i = 0; i < allUrls.length; i += BATCH_SIZE) {
    const batch = allUrls.slice(i, i + BATCH_SIZE);
    const buffers = await Promise.all(
      batch.map(async (segUrl) => {
        const segRes = await fetchWithTimeout(segUrl, {}, 20_000);
        if (!segRes.ok) throw new HttpError(502, "خطا در دریافت قطعات صوتی آهنگ از سرور مبدأ");
        return Buffer.from(await segRes.arrayBuffer());
      }),
    );
    for (const b of buffers) {
      totalBytes += b.byteLength;
      if (totalBytes > MAX_REMOTE_AUDIO_BYTES) {
        throw new HttpError(413, "این آهنگ طولانی‌تر از سقف مجاز (۴۵ مگابایت) است");
      }
      parts.push(b);
    }
  }

  const isMp4 = Boolean(mapMatch) || chosen.format?.mime_type?.includes("mp4");
  return {
    buffer: Buffer.concat(parts),
    mime: isMp4 ? "audio/mp4" : "audio/mpeg",
    ext: isMp4 ? "m4a" : "mp3",
    title: cleanTitle,
    sourceKind: "soundcloud",
  };
}

/**
 * Fetches a direct HTTPS audio URL on the server side so clients never connect to external hosts
 * or embed iframes; validates content-type/magic bytes and returns `{ buffer, mime, title, ext }`.
 */
async function extractDirectAudioUrl(parsedUrl, suggestedTitle) {
  if (isPrivateHostname(parsedUrl.hostname)) {
    throw new HttpError(400, "لینک باید یک آدرس عمومی و معتبر اینترنتی باشد");
  }
  let res;
  try {
    res = await fetchWithTimeout(parsedUrl.toString(), {
      headers: { Accept: "audio/*,*/*;q=0.8" },
    }, 30_000);
  } catch {
    throw new HttpError(502, "سرور نتوانست فایل صوتی را از این لینک دریافت کند");
  }
  if (!res.ok) {
    throw new HttpError(400, `سرور مقصد اجازهٔ دریافت آهنگ را نداد (کد ${res.status})`);
  }
  const finalHost = (() => {
    try {
      return new URL(res.url || parsedUrl.toString()).hostname;
    } catch {
      return parsedUrl.hostname;
    }
  })();
  if (isPrivateHostname(finalHost)) {
    throw new HttpError(400, "تغییر مسیر لینک به آدرس داخلی مجاز نیست");
  }

  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const buffer = await downloadBufferCapped(res);
  if (buffer.byteLength < 128) {
    throw new HttpError(400, "فایل دریافت‌شده خالی یا خراب است");
  }

  // Detect audio container from Content-Type or magic bytes
  let mime = "audio/mpeg";
  let ext = "mp3";
  if (contentType.startsWith("audio/") || contentType === "application/ogg" || contentType === "video/mp4") {
    mime = contentType === "video/mp4" ? "audio/mp4" : contentType;
    if (mime.includes("mp4") || mime.includes("m4a")) ext = "m4a";
    else if (mime.includes("ogg") || mime.includes("opus")) ext = "ogg";
    else if (mime.includes("wav")) ext = "wav";
    else if (mime.includes("flac")) ext = "flac";
    else if (mime.includes("webm")) ext = "webm";
    else if (mime.includes("aac")) ext = "aac";
  } else {
    // Check binary signatures (ID3 / MP3 sync, ftyp M4A/MP4, OggS, RIFF WAVE, fLaC, EBML WebM)
    const head4 = buffer.subarray(0, 4).toString("ascii");
    const box4 = buffer.subarray(4, 8).toString("ascii");
    if (head4.startsWith("ID3") || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
      mime = "audio/mpeg";
      ext = "mp3";
    } else if (box4 === "ftyp") {
      mime = "audio/mp4";
      ext = "m4a";
    } else if (head4 === "OggS") {
      mime = "audio/ogg";
      ext = "ogg";
    } else if (head4 === "RIFF") {
      mime = "audio/wav";
      ext = "wav";
    } else if (head4 === "fLaC") {
      mime = "audio/flac";
      ext = "flac";
    } else if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      mime = "audio/webm";
      ext = "webm";
    } else {
      throw new HttpError(
        400,
        "این لینک یک فایل صوتی مستقیم یا لینک SoundCloud نیست؛ لطفاً لینک آهنگ SoundCloud یا لینک مستقیم فایل صوتی بدهید",
      );
    }
  }

  return {
    buffer,
    mime,
    ext,
    title: suggestedTitle || "موسیقی",
    sourceKind: "url",
  };
}

/**
 * Main entry point: takes any user-provided music link (SoundCloud or direct HTTPS audio stream),
 * fetches/extracts the actual audio bytes on the backend, and returns `{ buffer, mime, ext, title, sourceKind }`.
 * External iframe embeds are never used.
 */
export async function resolveAndDownloadBotAudio(rawInput) {
  const input = String(rawInput || "").trim();
  if (!input || input.length > 1500) throw new HttpError(400, "لینک صوتی معتبر نیست");

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, "لینک را کامل و همراه با https:// وارد کنید");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new HttpError(400, "لینک باید عمومی و با پروتکل HTTPS باشد");
  }
  const host = url.hostname.toLowerCase();

  if (host === "open.spotify.com" || host.endsWith(".spotify.com")) {
    throw new HttpError(
      400,
      "اسپاتیفای به دلیل قفل DRM امکان استخراج مستقیم صوت توسط سرور را نمی‌دهد؛ لطفاً لینک SoundCloud یا لینک مستقیم فایل صوتی وارد کنید و یا فایل آهنگ را آپلود نمایید.",
    );
  }

  if (
    host === "soundcloud.com" ||
    host === "www.soundcloud.com" ||
    host === "m.soundcloud.com" ||
    host === "on.soundcloud.com"
  ) {
    return extractSoundCloudTrack(url.toString());
  }

  let filename = url.pathname.split("/").filter(Boolean).pop() || "موسیقی";
  try {
    filename = decodeURIComponent(filename);
  } catch {
    /* keep raw */
  }
  filename = filename.replace(/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm|mp4)$/i, "").slice(0, 100) || "موسیقی";

  return extractDirectAudioUrl(url, filename);
}
