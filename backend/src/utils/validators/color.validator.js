export const AVATAR_COLORS = [
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1",
];

export const isHexColor = (value) => /^#[0-9a-f]{6}$/i.test(value);

export const randomAvatarColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
