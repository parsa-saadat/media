import { useEffect, useState } from "react";

export const WALLPAPER_EVENT = "inebuly-wallpaper-change";
const STORAGE_KEY = "inebuly-chat-wallpaper";
const CUSTOM_IMG_KEY = "inebuly-chat-wallpaper-custom";
const OPACITY_KEY = "inebuly-chat-wallpaper-opacity";

/**
 * Rich static & animated chat wallpapers.
 * Uses `currentColor` / theme CSS variables so both light ("lavender") and dark themes look crisp and bug-free!
 */
export const CHAT_WALLPAPERS = [
  {
    id: "aurora-live",
    name: "شفق زنده",
    badge: "متحرک",
    kind: "animated-aurora",
  },
  {
    id: "nebula-orbs",
    name: "گوی‌های معلق",
    badge: "متحرک",
    kind: "animated-orbs",
  },
  {
    id: "starlight-drift",
    name: "کهکشان پویا",
    badge: "متحرک",
    kind: "animated-stars",
  },
  {
    id: "silk-waves",
    name: "موج‌های ابریشمی",
    badge: "متحرک",
    kind: "animated-waves",
  },
  {
    id: "persian-girih",
    name: "گره‌چینی ایرانی",
    kind: "svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <g fill="none" stroke="#888888" stroke-opacity="0.28" stroke-width="1.2">
        <polygon points="60,6 76,38 110,44 84,68 91,104 60,86 29,104 36,68 10,44 44,38"/>
        <circle cx="60" cy="58" r="18" stroke-opacity="0.2"/>
        <path d="M0,0 L30,30 M120,0 L90,30 M0,120 L30,90 M120,120 L90,90" stroke-opacity="0.18"/>
      </g>
    </svg>`,
    size: "120px 120px",
  },
  {
    id: "chat-doodles",
    name: "نقوش پیام‌رسان",
    kind: "svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <g fill="none" stroke="#888888" stroke-opacity="0.26" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="18" y="22" width="32" height="22" rx="7"/>
        <path d="M26 44 l-5 7 l12 -7"/>
        <circle cx="118" cy="36" r="13"/>
        <path d="M113 36 l3 3 l7 -7"/>
        <path d="M36 112 c0-9 14-9 14 0 c0 9-14 16-14 16 s-14-7-14-16 c0-9 14-9 14 0z"/>
        <polygon points="116,102 120,112 131,113 123,120 125,131 116,125 107,131 109,120 101,113 112,112"/>
        <path d="M74 68 l16 -7 l-6 18 l-4 -6 z"/>
      </g>
    </svg>`,
    size: "160px 160px",
  },
  {
    id: "minimal-grid",
    name: "شبکهٔ مینیمال",
    kind: "svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <path d="M64 0 L0 0 0 64" fill="none" stroke="#888888" stroke-opacity="0.2" stroke-width="1"/>
      <circle cx="32" cy="32" r="1.6" fill="#888888" fill-opacity="0.32"/>
    </svg>`,
    size: "64px 64px",
  },
  {
    id: "none",
    name: "ساده (بدون طرح)",
    kind: "none",
  },
];

export function svgToDataUri(svg) {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export function getWallpaperSettings() {
  if (typeof window === "undefined") {
    return { id: "aurora-live", customDataUrl: "", intensity: 60 };
  }
  try {
    const rawId = localStorage.getItem(STORAGE_KEY) || "aurora-live";
    // Migrate legacy preset IDs cleanly
    const id = rawId === "aurora-silk" ? "aurora-live" : rawId === "cosmic-nebula" ? "starlight-drift" : rawId === "mountain-mist" ? "silk-waves" : rawId;
    const customDataUrl = localStorage.getItem(CUSTOM_IMG_KEY) || "";
    const rawInt = Number(localStorage.getItem(OPACITY_KEY));
    const intensity = Number.isFinite(rawInt) && rawInt >= 10 && rawInt <= 100 ? rawInt : 60;
    return { id, customDataUrl, intensity };
  } catch {
    return { id: "aurora-live", customDataUrl: "", intensity: 60 };
  }
}

export function saveWallpaperSettings(patch) {
  const cur = getWallpaperSettings();
  const next = { ...cur, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, next.id);
    if (patch.customDataUrl !== undefined) {
      if (next.customDataUrl) localStorage.setItem(CUSTOM_IMG_KEY, next.customDataUrl);
      else localStorage.removeItem(CUSTOM_IMG_KEY);
    }
    localStorage.setItem(OPACITY_KEY, String(next.intensity));
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WALLPAPER_EVENT, { detail: next }));
  }
  return next;
}

export function useChatWallpaper() {
  const [wp, setWp] = useState(getWallpaperSettings);
  useEffect(() => {
    const onChange = (e) => setWp(e.detail || getWallpaperSettings());
    window.addEventListener(WALLPAPER_EVENT, onChange);
    return () => window.removeEventListener(WALLPAPER_EVENT, onChange);
  }, []);
  return wp;
}
