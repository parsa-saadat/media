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

export function toast(message, kind = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("voxsy-toast", { detail: { message, kind } }));
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
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
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

export const THEMES = [
  { id: "violet", name: "بنفش شب", colors: ["#06040b", "#8b5cf6", "#d946ef"] },
  { id: "midnight", name: "نیمه‌شب", colors: ["#03060d", "#3b82f6", "#06b6d4"] },
  { id: "emerald", name: "زمرد", colors: ["#030907", "#10b981", "#a3e635"] },
  { id: "crimson", name: "یاقوت", colors: ["#0a0405", "#f43f5e", "#fb923c"] },
  { id: "gold", name: "طلایی", colors: ["#080604", "#f59e0b", "#fde047"] },
  { id: "lavender", name: "اسطوخودوس (روشن)", colors: ["#f4f1fd", "#7c3aed", "#c026d3"] },
];

export function applyTheme(id) {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  root.setAttribute("data-theme", id);
  window.setTimeout(() => root.classList.remove("theme-transition"), 400);
  try {
    localStorage.setItem("voxsy-theme", id);
  } catch {
    /* the theme simply is not remembered */
  }
}
