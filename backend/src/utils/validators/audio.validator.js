import { HttpError } from "../http/http.util.js";

const AUDIO_EXTENSION = /\.(mp3|m4a|aac|ogg|oga|opus|wav|wave|flac|webm|mp4)$/i;

/**
 * A music-bot link is only ever one of three things: a Spotify page, a SoundCloud page (both shown
 * in the provider's official player) or a direct https link to an audio file. Nothing else is stored.
 */
export function parseAudioSource(raw) {
  const input = raw.trim();
  if (!input || input.length > 1500) throw new HttpError(400, "لینک صوتی معتبر نیست");
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, "لینک را همراه با https:// وارد کنید");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new HttpError(400, "لینک باید HTTPS و عمومی باشد");
  if (url.port && url.port !== "443") throw new HttpError(400, "پورت لینک نامعتبر است");
  const host = url.hostname.toLowerCase();

  if (host === "open.spotify.com") {
    const match = url.pathname.match(/^\/(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{15,40})\/?$/);
    if (!match) throw new HttpError(400, "لینک Spotify باید مربوط به آهنگ، آلبوم یا پلی‌لیست باشد");
    return { kind: "spotify", url: `https://open.spotify.com/${match[1]}/${match[2]}`, suggestedTitle: "محتوا از Spotify" };
  }
  if (host === "soundcloud.com" || host === "m.soundcloud.com") {
    if (url.pathname.length < 3) throw new HttpError(400, "لینک SoundCloud معتبر نیست");
    return { kind: "soundcloud", url: `https://soundcloud.com${url.pathname}`, suggestedTitle: "محتوا از SoundCloud" };
  }

  const privateHost =
    host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host);
  if (privateHost) throw new HttpError(400, "لینک باید یک آدرس عمومی باشد");
  if (!AUDIO_EXTENSION.test(url.pathname)) {
    throw new HttpError(400, "لینک مستقیم باید به فایل صوتی mp3، ogg، wav، m4a، aac، flac، webm یا mp4 ختم شود");
  }
  let filename = url.pathname.split("/").pop() || "موسیقی";
  try {
    filename = decodeURIComponent(filename);
  } catch {
    /* keep the raw name */
  }
  return { kind: "url", url: url.toString(), suggestedTitle: filename.slice(0, 100) };
}
