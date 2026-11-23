const P = {
  "more-vertical": <><circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/></>,
  "more-horizontal": <><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/></>,
  screen: <><rect x="2.5" y="4.5" width="19" height="12" rx="2.5"/><path d="M9 20.5h6M12 16.5v4M10 11l2 2.2 3-3.7"/></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V5.5a2 2 0 0 1 2-2H15"/></>,
  captions: <><rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="M7 10.2h.01M17 10.2h.01M7 14.5h10"/></>,
  mic: <><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4M8 21h8"/></>,
  "mic-off": <><path d="M9 5.5V5a3 3 0 0 1 5.7-1.3M15 9v2.5a3 3 0 0 1-.4 1.5M9 9v2.5a3 3 0 0 0 4.2 2.7M5.5 10.5a6.5 6.5 0 0 0 11 4.7M12 17v4M8 21h8M3 3l18 18"/></>,
  headphones: <><path d="M3.5 13v-2a8.5 8.5 0 0 1 17 0v2M3.5 13h3.5v7H5a1.5 1.5 0 0 1-1.5-1.5zM20.5 13H17v7h2a1.5 1.5 0 0 0 1.5-1.5z"/></>,
  volume: <><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18 5a9 9 0 0 1 0 14"/></>,
  "volume-off": <><path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6"/></>,
  phone: <path d="M6 3h3l1.5 4-2 1.8a14 14 0 0 0 6.7 6.7l1.8-2L21 15v3a3 3 0 0 1-3 3C9 21 3 15 3 6a3 3 0 0 1 3-3z"/>,
  "phone-off": <><path d="M9 3H6a3 3 0 0 0-3 3c0 9 6 15 15 15a3 3 0 0 0 3-3v-3l-4-1.5-1.8 2a14 14 0 0 1-6.7-6.7l2-1.8L9 3zM3 3l18 18"/></>,
  play: <path d="M8 4.5a1 1 0 0 1 1.5-.85l10 7.5a1 1 0 0 1 0 1.7l-10 7.5A1 1 0 0 1 8 19.5z"/>,
  pause: <><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></>,
  radio: <><circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.5 4.5a10.6 10.6 0 0 0 0 15M19.5 4.5a10.6 10.6 0 0 1 0 15"/></>,
  sliders: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--surface)"/><circle cx="16" cy="12" r="2" fill="var(--surface)"/><circle cx="11" cy="18" r="2" fill="var(--surface)"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5M5.5 9a7 7 0 0 1 12-3L20 12M4 12l2.5 6a7 7 0 0 0 12-3"/></>,
  bot: <><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M9 3h6M8.5 12h.01M15.5 12h.01M8.5 16a6 6 0 0 0 7 0"/></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.5l7.5 3.2v6.1c0 4.8-3.3 8.1-7.5 9.7-4.2-1.6-7.5-4.9-7.5-9.7V5.7z" />
      <path d="M8.8 12l2.2 2.2 4.2-4.4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="1.8" />
      <path d="M21 15l-5-5L5 21" />
    </>
  ),
  paperclip: <path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />,
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  send: (
    <>
      <path d="M21 3 10 14" />
      <path d="m21 3-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1L21 3Z" />
    </>
  ),
  "alert-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4.5M12 16h.01" />
    </>
  ),
  "app-install": (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <path d="M12 7.5v6M9.5 11L12 13.5 14.5 11M9 18h6" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </>
  ),
  "arrow-right": <path d="M4 12h16M14 6l6 6-6 6" />,
  "arrow-left": <path d="M20 12H4M10 18L4 12l6-6" />,
  "chevron-right": <path d="M9 5l7 7-7 7" />,
  "chevron-left": <path d="M15 5l-7 7 7 7" />,
  "chevron-down": <path d="M5 9l7 7 7-7" />,
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l9 9M17 17l2-2M14 14l2-2" />
    </>
  ),
  moon: <path d="M21 13.5A8.5 8.5 0 1 1 10.5 3a7 7 0 0 0 10.5 10.5z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </>
  ),
  palette: (
    <>
      <path d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3-3.5 3H16a2 2 0 0 0-1.4 3.4c.5.6.2 2.6-2.6 2.6z" />
      <path d="M7.5 10h.01M10.5 7h.01M14.5 7.5h.01" />
    </>
  ),
  crown: <path d="M3 8l4 3 5-6 5 6 4-3-2 11H5z" />,
  star: <path d="M12 3l2.6 5.4 5.9.8-4.2 4.1 1 5.9-5.3-2.8-5.3 2.8 1-5.9L3.5 9.2l5.9-.8z" />,
  door: (
    <>
      <path d="M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16" />
      <path d="M3 21h18M13 12h.01" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </>
  ),
  download: <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />,
  upload: <path d="M12 16V4M7 8l5-5 5 5M4 20h16" />,
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="M15.5 10l6-3.5v11L15.5 14z" />
    </>
  ),
  music: (
    <>
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="15" r="3" />
      <path d="M9 18V6l11-2v11" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v12h14V8M10 12h4" />
    </>
  ),
  check: <path d="M4 12.5l5 5L20 6.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3z" />
      <path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" />
      <path d="M12 6.5v13" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  hash: <path d="M9 3L7 21M17 3l-2 18M4 9h17M3 15h17" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 3 2.5 15 0 18-2.5-3-2.5-15 0-18z" />
    </>
  ),
  landmark: (
    <>
      <path d="M3 21h18M4 10h16M5 10V21M9.5 10V21M14.5 10V21M19 10V21M12 3l8 6H4z" />
    </>
  ),
  gamepad: (
    <>
      <path d="M7 8h10a4 4 0 0 1 3.9 4.9l-.8 4A3 3 0 0 1 15 18l-1.3-1.5h-3.4L9 18a3 3 0 0 1-5.1-1.1l-.8-4A4 4 0 0 1 7 8z" />
      <path d="M8 12h.01M15 12h3M16.5 10.5v3" />
    </>
  ),
  coffee: (
    <>
      <path d="M3 8h13v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" />
      <path d="M16 9h2.5a2.5 2.5 0 0 1 0 5H16M6 4v1M10 3v2M13 4v1" />
    </>
  ),
  rocket: (
    <>
      <path d="M5 15c0-4 2-8 7-11 5 3 7 7 7 11l-3.5 3.5h-7z" />
      <circle cx="12" cy="9.5" r="1.8" />
      <path d="M9 18l-2 3M15 18l2 3" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 4c0 9-5 14-12 14H5v-3C5 8 11 4 20 4z" />
      <path d="M4 21c2-5 6-9 12-11" />
    </>
  ),
  graduation: (
    <>
      <path d="M2 9l10-5 10 5-10 5z" />
      <path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l4 3-1.5 4.5h-5L8 10z" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 15h18M8 4v16M16 4v16" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  edit: <path d="M4 20h4l11-11-4-4L4 16zM14 5l4 4" />,
  link: <path d="M9 15l6-6M7.5 11.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M16.5 12.5l2-2a3.5 3.5 0 0 0-5-5l-2 2" />,
  heart: <path d="M12 20s-8-4.5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 10-8 10z" />,
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.5 5.5l13 13" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
  quote: <path d="M9 6c-3 1.5-4.5 4-4.5 7.5 0 2.5 1.3 4 3.3 4 1.8 0 3-1.2 3-3 0-1.7-1.1-2.9-2.7-2.9-.3 0-.6 0-.8.1.3-1.6 1.3-2.9 2.9-3.8zM20 6c-3 1.5-4.5 4-4.5 7.5 0 2.5 1.3 4 3.3 4 1.8 0 3-1.2 3-3 0-1.7-1.1-2.9-2.7-2.9-.3 0-.6 0-.8.1.3-1.6 1.3-2.9 2.9-3.8z" />,
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  camera: (
    <>
      <path d="M3 8.5h3.5L8 6h8l1.5 2.5H21v11H3z" />
      <circle cx="12" cy="14" r="3.2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />,
  "user-plus": (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M19 8v6M16 11h6" />
    </>
  ),
  maximize: <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />,
  minimize: <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />,
  pip: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <rect x="11.5" y="11" width="8" height="6.5" rx="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M10.6 5.2A10.7 10.7 0 0 1 12 5.5C18.5 5.5 22 12 22 12a17.6 17.6 0 0 1-3.1 3.9M6.2 6.3C3.6 8.1 2 12 2 12s3.5 6.5 10 6.5a10.4 10.4 0 0 0 4.2-.9M3 3l18 18" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  devices: (
    <>
      <rect x="2.5" y="4.5" width="14" height="10.5" rx="2" />
      <path d="M6.5 18.5h6M9.5 15v3.5" />
      <rect x="15" y="9.5" width="6.5" height="10.5" rx="1.5" />
    </>
  ),
  forward: (
    <>
      <path d="M14 5l6 6-6 6" />
      <path d="M4 19v-2a6 6 0 0 1 6-6h10" />
    </>
  ),
  move: (
    <>
      <path d="M12 2v20M2 12h20" />
      <path d="M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3" />
    </>
  ),
};

export const ROOM_ICONS = [
  "hash",
  "globe",
  "landmark",
  "users",
  "gamepad",
  "music",
  "book",
  "chart",
  "film",
  "ball",
  "coffee",
  "sparkles",
  "heart",
  "moon",
  "leaf",
  "rocket",
  "camera",
  "graduation",
];

const LEGACY = {
  "🏛️": "landmark",
  "💬": "chat",
  "🎮": "gamepad",
  "🎵": "music",
  "📚": "book",
  "💻": "database",
  "⚽": "ball",
  "🎬": "film",
  "🌙": "moon",
  "🕌": "landmark",
  "☕": "coffee",
  "🎨": "palette",
  "🚀": "rocket",
  "🌿": "leaf",
  "📷": "camera",
  "🧠": "sparkles",
  "👥": "users",
};

export function Icon({
  name,
  size = 18,
  className = "",
  strokeWidth = 1.9,
  ...rest
}) {
  return (
    <svg
      {...rest}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  );
}

/** Renders an icon from a stored key, with legacy emoji support. */
export function Glyph({
  value,
  size = 20,
  className = "",
  strokeWidth = 1.8,
}) {
  const name = value && value in P ? value : LEGACY[value || ""] || "hash";
  return <Icon name={name} size={size} className={className} strokeWidth={strokeWidth} />;
}
