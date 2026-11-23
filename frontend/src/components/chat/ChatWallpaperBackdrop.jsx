import { CHAT_WALLPAPERS, svgToDataUri, useChatWallpaper } from "../../config/wallpapers";

/**
 * Full-bleed (`absolute inset-0`) zero-border wallpaper backdrop that never interferes with scrollbars
 * or flexbox sizing, and dynamically shifts its tint & animated glow to match the active theme!
 */
export default function ChatWallpaperBackdrop() {
  const wallpaper = useChatWallpaper();
  const preset = CHAT_WALLPAPERS.find((w) => w.id === wallpaper.id);
  const ratio = Math.min(1, Math.max(0.15, (wallpaper.intensity || 60) / 100));

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none border-0 outline-none">
      {/* Base theme ambient wash — always smooth, zero border */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(95% 80% at 15% 12%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 60%), radial-gradient(90% 80% at 88% 90%, color-mix(in srgb, var(--accent-2) 12%, transparent) 0%, transparent 60%), var(--bg)",
        }}
      />

      {wallpaper.id === "custom" && wallpaper.customDataUrl ? (
        <>
          {/* Full-bleed edge-to-edge custom photo (scaled 1.02 slightly so no subpixel edge seam ever shows) */}
          <div
            className="absolute -inset-0.5 bg-cover bg-center bg-no-repeat transition-opacity duration-300"
            style={{
              backgroundImage: `url("${wallpaper.customDataUrl}")`,
              opacity: ratio * 0.78,
            }}
          />
          {/* Theme-reactive color tint without dark border vignette */}
          <div
            className="absolute inset-0 transition-colors duration-300"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 34%, transparent), color-mix(in srgb, var(--accent-2) 28%, transparent))",
              mixBlendMode: "soft-light",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: "color-mix(in srgb, var(--bg) 35%, transparent)",
            }}
          />
        </>
      ) : preset?.kind === "animated-aurora" ? (
        <div className="absolute inset-0 overflow-hidden" style={{ opacity: ratio }}>
          <div
            className="wp-aurora-1 absolute -top-1/4 -right-1/4 h-[85%] w-[85%] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 36%, transparent) 0%, transparent 68%)" }}
          />
          <div
            className="wp-aurora-2 absolute -bottom-1/4 -left-1/4 h-[85%] w-[85%] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent-2) 32%, transparent) 0%, transparent 68%)" }}
          />
          <div
            className="wp-aurora-3 absolute left-1/4 top-1/3 h-[55%] w-[55%] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, var(--accent-2) 22%) 0%, transparent 70%)" }}
          />
        </div>
      ) : preset?.kind === "animated-orbs" ? (
        <div className="absolute inset-0 overflow-hidden" style={{ opacity: ratio }}>
          <span
            className="wp-orb-1 absolute right-[12%] top-[18%] h-44 w-44 rounded-full blur-2xl sm:h-64 sm:w-64"
            style={{ background: "color-mix(in srgb, var(--accent) 28%, transparent)" }}
          />
          <span
            className="wp-orb-2 absolute bottom-[14%] left-[14%] h-48 w-48 rounded-full blur-2xl sm:h-72 sm:w-72"
            style={{ background: "color-mix(in srgb, var(--accent-2) 26%, transparent)" }}
          />
          <span
            className="wp-orb-3 absolute left-[45%] top-[42%] h-36 w-36 rounded-full blur-2xl sm:h-52 sm:w-52"
            style={{ background: "color-mix(in srgb, var(--accent) 20%, transparent)" }}
          />
        </div>
      ) : preset?.kind === "animated-stars" ? (
        <div className="absolute inset-0 overflow-hidden" style={{ opacity: ratio }}>
          <div
            className="wp-stars-drift absolute -inset-[120px]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 24px 32px, color-mix(in srgb, var(--accent) 65%, var(--fg)) 1.4px, transparent 2px), radial-gradient(circle at 110px 86px, color-mix(in srgb, var(--accent-2) 65%, var(--fg)) 1.8px, transparent 2.4px), radial-gradient(circle at 178px 28px, color-mix(in srgb, var(--fg) 40%, transparent) 1.1px, transparent 1.8px), radial-gradient(circle at 64px 154px, color-mix(in srgb, var(--accent) 55%, transparent) 1.5px, transparent 2.2px)",
              backgroundSize: "210px 210px",
            }}
          />
          <div
            className="wp-aurora-2 absolute left-1/3 top-1/4 h-80 w-80 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%)" }}
          />
        </div>
      ) : preset?.kind === "animated-waves" ? (
        <div className="absolute inset-0 overflow-hidden" style={{ opacity: ratio }}>
          <svg className="wp-wave-float absolute bottom-0 left-0 h-[55%] w-[140%] max-w-none" viewBox="0 0 1200 400" preserveAspectRatio="none">
            <path
              d="M0,192 C300,90 600,290 900,180 C1050,125 1150,160 1200,192 L1200,400 L0,400 Z"
              fill="color-mix(in srgb, var(--accent) 14%, transparent)"
            />
            <path
              d="M0,256 C280,330 620,150 920,250 C1080,300 1160,270 1200,245 L1200,400 L0,400 Z"
              fill="color-mix(in srgb, var(--accent-2) 13%, transparent)"
            />
          </svg>
        </div>
      ) : preset?.svg ? (
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{
            backgroundImage: svgToDataUri(preset.svg),
            backgroundSize: preset.size || "160px 160px",
            opacity: ratio * 0.85,
          }}
        />
      ) : null}
    </div>
  );
}
