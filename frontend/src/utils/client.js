import server from "../config/server.json";

const TOKEN_KEY = "voxsy-token";
export const UNAUTHORIZED_EVENT = "voxsy:unauthorized";

/**
 * The session token lives in this variable. Browser storage is only there so a reload keeps the user
 * signed in: inside a preview frame storage can be blocked too, and signing in must still work.
 */
let memoryToken = "";

/**
 * Turned on by session.tsx when the server reports that neither the headers nor the cookie arrive. The
 * token then also travels in the URL, which is the one channel such environments keep.
 */
let tokenInUrl = false;

const storages = [() => window.localStorage, () => window.sessionStorage];

export function getToken() {
  if (memoryToken || typeof window === "undefined") return memoryToken;
  for (const pick of storages) {
    try {
      const saved = pick().getItem(TOKEN_KEY);
      if (saved) {
        memoryToken = saved;
        break;
      }
    } catch {
      /* storage is blocked in this frame */
    }
  }
  return memoryToken;
}

/** Returns true when the token could also be kept for the next page load. */
export function setToken(token) {
  memoryToken = token;
  if (typeof window !== "undefined") window.__voxsyToken = token;
  for (const pick of storages) {
    try {
      pick().setItem(TOKEN_KEY, token);
      return true;
    } catch {
      /* try the next store */
    }
  }
  return false;
}

export function clearToken() {
  memoryToken = "";
  if (typeof window !== "undefined") window.__voxsyToken = "";
  for (const pick of storages) {
    try {
      pick().removeItem(TOKEN_KEY);
    } catch {
      /* nothing was stored */
    }
  }
}

export function setTokenInUrl(on) {
  tokenInUrl = on;
}

export class ApiError extends Error {
  constructor(message, status, body = null) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "ApiError";
  }
}

/** fetch() with the session token attached: as a header, and in the URL when the client was told so. */
export async function authFetch(url, init = {}) {
  const headers = new Headers(init.headers);
  let target = url;
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    headers.set(server.tokenHeader, token);
    if (tokenInUrl) target += `${target.includes("?") ? "&" : "?"}${server.tokenQuery}=${encodeURIComponent(token)}`;
  }
  try {
    return await fetch(server.baseUrl + target, { ...init, headers, cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new ApiError("ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.", 0);
  }
}

export async function apiFetch(url, init = {}) {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  const res = await authFetch(url, { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && !url.startsWith("/api/auth/") && typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!res.ok || !data || data.success === false) {
    throw new ApiError(data?.message || `پاسخ نامعتبر از سرور (کد ${res.status})`, res.status, data?.body ?? null);
  }
  return data.body;
}

const BROWSER_ID_KEY = "inebuly-browser-id";

export function getBrowserId() {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(BROWSER_ID_KEY);
    if (!id || id.length < 12) {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      window.localStorage.setItem(BROWSER_ID_KEY, id);
    }
    return id;
  } catch {
    if (!window.__inebulyMemBrowserId) {
      window.__inebulyMemBrowserId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    return window.__inebulyMemBrowserId;
  }
}

export async function fetchAuthedBlob(url) {
  const res = await authFetch(url);
  if (!res.ok) throw new ApiError("امکان دریافت فایل وجود ندارد", res.status);
  return res.blob();
}

export async function downloadAuthed(url, filename) {
  const blob = await fetchAuthedBlob(url);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

export function toast(message, kind = "info", extra = null) {
  if (typeof window === "undefined") return;
  const detail =
    message && typeof message === "object"
      ? { kind: "info", ...message }
      : { message, kind, ...(extra || {}) };
  window.dispatchEvent(new CustomEvent("voxsy-toast", { detail }));
}

export function faNum(n) {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function formatTime(d) {
  return new Date(d).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDay(d) {
  const date = new Date(d);
  const now = new Date();
  const diff = Math.floor((new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86400000);
  if (diff === 0) return "امروز";
  if (diff === 1) return "دیروز";
  return date.toLocaleDateString("fa-IR", { weekday: "long", day: "numeric", month: "long" });
}

export function shortTime(d) {
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return formatTime(date);
  return date.toLocaleDateString("fa-IR", { month: "short", day: "numeric" });
}

export function formatSize(bytes) {
  if (bytes < 1024) return faNum(bytes) + " بایت";
  if (bytes < 1024 * 1024) return faNum((bytes / 1024).toFixed(1)) + " کیلوبایت";
  return faNum((bytes / 1024 / 1024).toFixed(1)) + " مگابایت";
}

export function isOnline(lastSeen) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 75 * 1000;
}

export function lastSeenText(lastSeen) {
  if (!lastSeen) return "";
  if (isOnline(lastSeen)) return "آنلاین";
  const mins = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000);
  if (mins < 60) return `آخرین بازدید ${faNum(mins)} دقیقه پیش`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `آخرین بازدید ${faNum(hrs)} ساعت پیش`;
  return `آخرین بازدید ${new Date(lastSeen).toLocaleDateString("fa-IR")}`;
}

export const THEME_ACCENTS = [
  { id: "violet", name: "بنفش", dark: ["#8b5cf6", "#d946ef", "#ffffff"], light: ["#7c3aed", "#c026d3", "#ffffff"], glow: "139 92 246" },
  { id: "lavender", name: "اسطوخودوس", dark: ["#a78bfa", "#e879f9", "#140b29"], light: ["#7c3aed", "#c026d3", "#ffffff"], glow: "167 139 250" },
  { id: "sky", name: "آسمانی", dark: ["#38bdf8", "#818cf8", "#041322"], light: ["#0284c7", "#4f46e5", "#ffffff"], glow: "56 189 248" },
  { id: "blue", name: "نیمه‌شب", dark: ["#3b82f6", "#06b6d4", "#ffffff"], light: ["#2563eb", "#0891b2", "#ffffff"], glow: "59 130 246" },
  { id: "emerald", name: "زمردی", dark: ["#10b981", "#a3e635", "#02130c"], light: ["#059669", "#0d9488", "#ffffff"], glow: "16 185 129" },
  { id: "crimson", name: "یاقوتی", dark: ["#f43f5e", "#fb923c", "#ffffff"], light: ["#e11d48", "#ea580c", "#ffffff"], glow: "244 63 94" },
  { id: "gold", name: "طلایی", dark: ["#f59e0b", "#fde047", "#1a1203"], light: ["#d97706", "#ca8a04", "#ffffff"], glow: "245 158 11" },
  { id: "teal", name: "فیروزه‌ای", dark: ["#14b8a6", "#38bdf8", "#031b18"], light: ["#0d9488", "#0284c7", "#ffffff"], glow: "20 184 166" },
];

export const THEMES = [
  { id: "violet", name: "بنفش شب", mode: "dark", glass: false, accentId: "violet", colors: ["#06040b", "#8b5cf6", "#d946ef"] },
  { id: "glass", name: "شیشه‌ای (کریستال)", mode: "dark", glass: true, accentId: "sky", colors: ["#050814", "#38bdf8", "#818cf8"] },
  { id: "lavender-dark", name: "اسطوخودوس (مشکی)", mode: "dark", glass: false, accentId: "lavender", colors: ["#07050f", "#a78bfa", "#e879f9"] },
  { id: "midnight", name: "نیمه‌شب", mode: "dark", glass: false, accentId: "blue", colors: ["#03060d", "#3b82f6", "#06b6d4"] },
  { id: "emerald", name: "زمرد", mode: "dark", glass: false, accentId: "emerald", colors: ["#030907", "#10b981", "#a3e635"] },
  { id: "crimson", name: "یاقوت", mode: "dark", glass: false, accentId: "crimson", colors: ["#0a0405", "#f43f5e", "#fb923c"] },
  { id: "gold", name: "طلایی", mode: "dark", glass: false, accentId: "gold", colors: ["#080604", "#f59e0b", "#fde047"] },
  { id: "lavender", name: "اسطوخودوس (سفید)", mode: "light", glass: false, accentId: "lavender", colors: ["#f4f1fd", "#7c3aed", "#c026d3"] },
  { id: "sky-light", name: "آسمان بلورین (سفید)", mode: "light", glass: true, accentId: "sky", colors: ["#f0f6ff", "#0284c7", "#4f46e5"] },
  { id: "emerald-light", name: "زمرد روشن (سفید)", mode: "light", glass: false, accentId: "emerald", colors: ["#f0fbf7", "#059669", "#0d9488"] },
];

const THEME_CFG_KEY = "voxsy-theme-config";

function hexToRgbTriplet(hex) {
  const clean = String(hex || "").replace("#", "").trim();
  if (clean.length !== 6) return "139 92 246";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "139 92 246";
  return `${r} ${g} ${b}`;
}

export function getThemeConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(THEME_CFG_KEY) || "null");
    if (raw && (raw.mode === "dark" || raw.mode === "light")) {
      return {
        presetId: raw.presetId || null,
        mode: raw.mode,
        glass: Boolean(raw.glass),
        accentId: raw.accentId || "violet",
        customColor: raw.customColor || "",
      };
    }
  } catch {}
  const savedId = (typeof localStorage !== "undefined" && localStorage.getItem("voxsy-theme")) || "violet";
  const found = THEMES.find((t) => t.id === savedId) || THEMES[0];
  return {
    presetId: found.id,
    mode: found.mode || "dark",
    glass: Boolean(found.glass),
    accentId: found.accentId || "violet",
    customColor: "",
  };
}

export function applyThemeConfig(cfg) {
  if (typeof document === "undefined") return cfg;
  const next = { ...getThemeConfig(), ...cfg };
  const root = document.documentElement;
  root.classList.add("theme-transition");

  const pal = THEME_ACCENTS.find((a) => a.id === next.accentId) || THEME_ACCENTS[0];
  const isLight = next.mode === "light";
  const isGlass = Boolean(next.glass);
  root.style.colorScheme = isLight ? "light" : "dark";

  let accent = isLight ? pal.light[0] : pal.dark[0];
  let accent2 = isLight ? pal.light[1] : pal.dark[1];
  let onAccent = isLight ? pal.light[2] : pal.dark[2];
  let glow = pal.glow;

  if (next.accentId === "custom" && /^#[0-9a-fA-F]{6}$/.test(next.customColor || "")) {
    accent = next.customColor;
    accent2 = next.customColor;
    onAccent = "#ffffff";
    glow = hexToRgbTriplet(next.customColor);
  }

  // If using an exact built-in preset without overriding glass/mode/accent, keep its native data-theme too
  const matchedPreset = next.presetId ? THEMES.find((t) => t.id === next.presetId) : null;
  const baseAttr = matchedPreset ? matchedPreset.id : isLight ? "lavender" : "violet";
  root.setAttribute("data-theme", baseAttr);
  root.setAttribute("data-mode", isLight ? "light" : "dark");
  root.setAttribute("data-glass", isGlass ? "true" : "false");

  // Compute harmonious surfaces dynamically from (mode + glass + primary color)
  const bg = matchedPreset
    ? matchedPreset.colors[0]
    : isLight
      ? `color-mix(in srgb, ${accent} 5%, #f6f7fb)`
      : `color-mix(in srgb, ${accent} 6%, #05060d)`;

  const surfaceSolid = isLight
    ? "#ffffff"
    : `color-mix(in srgb, ${accent} 9%, #0d0f1b)`;

  const surface = isLight
    ? isGlass
      ? "rgba(255, 255, 255, 0.72)"
      : "#ffffff"
    : isGlass
      ? "rgba(15, 21, 38, 0.56)"
      : surfaceSolid;

  const surface2 = isLight
    ? isGlass
      ? `color-mix(in srgb, ${accent} 8%, rgba(244, 246, 252, 0.76))`
      : `color-mix(in srgb, ${accent} 7%, #f1f3f9)`
    : isGlass
      ? `color-mix(in srgb, ${accent} 11%, rgba(26, 35, 58, 0.56))`
      : `color-mix(in srgb, ${accent} 12%, #131524)`;

  const surface3 = isLight
    ? isGlass
      ? `color-mix(in srgb, ${accent} 14%, rgba(232, 236, 248, 0.82))`
      : `color-mix(in srgb, ${accent} 13%, #e6eaf4)`
    : isGlass
      ? `color-mix(in srgb, ${accent} 17%, rgba(42, 54, 86, 0.62))`
      : `color-mix(in srgb, ${accent} 18%, #1c1f33)`;

  const line = isLight
    ? isGlass
      ? `color-mix(in srgb, ${accent} 24%, rgba(15, 23, 42, 0.14))`
      : `color-mix(in srgb, ${accent} 16%, #dfe3ef)`
    : isGlass
      ? `color-mix(in srgb, ${accent} 28%, rgba(255, 255, 255, 0.16))`
      : `color-mix(in srgb, ${accent} 18%, #21243a)`;

  const fg = isLight ? "#141826" : "#f3f5ff";
  const muted = isLight ? "#525b75" : "#a0aac7";
  const placeholder = isLight ? "#64708c" : "#9aa6c8";

  root.style.setProperty("--bg", bg);
  root.style.setProperty("--surface-solid", surfaceSolid);
  root.style.setProperty("--surface", surface);
  root.style.setProperty("--surface-2", surface2);
  root.style.setProperty("--surface-3", surface3);
  root.style.setProperty("--line", line);
  root.style.setProperty("--fg", fg);
  root.style.setProperty("--muted", muted);
  root.style.setProperty("--placeholder", placeholder);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-2", accent2);
  root.style.setProperty("--on-accent", onAccent);
  root.style.setProperty("--glow", glow);

  const meta = document.getElementById("meta-theme-color");
  if (meta) meta.setAttribute("content", isLight ? "#f6f7fb" : "#06070f");

  window.setTimeout(() => root.classList.remove("theme-transition"), 400);
  try {
    localStorage.setItem("voxsy-theme", baseAttr);
    localStorage.setItem(THEME_CFG_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function applyTheme(id) {
  const found = THEMES.find((t) => t.id === id) || THEMES[0];
  applyThemeConfig({
    presetId: found.id,
    mode: found.mode || "dark",
    glass: Boolean(found.glass),
    accentId: found.accentId || "violet",
  });
}
