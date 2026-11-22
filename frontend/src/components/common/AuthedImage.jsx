import { useEffect, useRef, useState } from "react";
import { authFetch, faNum } from "../../utils/client";
import { Icon } from "./Icon";

/**
 * Shared in-memory blob cache so images in chat never re-fetch or flicker on re-render/lightbox,
 * while always carrying full auth credentials (`Authorization`, `x-voxsy-token`, URL token fallback, cookies).
 */
const blobCache = new Map();
const MAX_CACHED_IMAGES = 120;

function rememberBlob(fileId, blob) {
  if (blobCache.has(fileId)) blobCache.delete(fileId);
  blobCache.set(fileId, blob);
  if (blobCache.size > MAX_CACHED_IMAGES) {
    const oldest = blobCache.keys().next().value;
    if (oldest !== undefined) blobCache.delete(oldest);
  }
}

export default function AuthedImage({ fileId, alt, className = "", onLoad, onClick }) {
  const [src, setSrc] = useState("");
  const [progress, setProgress] = useState(0);
  const [decoded, setDecoded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    if (!fileId) return;
    let alive = true;
    let objectUrl = "";
    let autoRetryTimer = null;

    const cached = blobCache.get(fileId);
    if (cached && attempt === 0) {
      objectUrl = URL.createObjectURL(cached);
      setSrc(objectUrl);
      setProgress(100);
      setFailed(false);
      return () => {
        alive = false;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    setSrc("");
    setDecoded(false);
    setFailed(false);
    setProgress(8);

    void (async () => {
      try {
        const res = await authFetch(`/api/files/${fileId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const total = Number(res.headers.get("content-length")) || 0;
        let blob;
        if (res.body && typeof res.body.getReader === "function") {
          const reader = res.body.getReader();
          const chunks = [];
          let received = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!alive) {
              void reader.cancel().catch(() => {});
              return;
            }
            if (value) {
              chunks.push(value);
              received += value.byteLength;
              if (total > 0) {
                setProgress(Math.min(96, Math.max(12, Math.round((received / total) * 100))));
              } else {
                setProgress((p) => Math.min(90, p + 12));
              }
            }
          }
          const mime = res.headers.get("content-type") || "image/jpeg";
          blob = new Blob(chunks, { type: mime });
        } else {
          blob = await res.blob();
        }

        if (!alive) return;
        if (!blob || blob.size === 0) throw new Error("empty image");
        rememberBlob(fileId, blob);
        objectUrl = URL.createObjectURL(blob);
        setProgress(100);
        setSrc(objectUrl);
      } catch {
        if (!alive) return;
        // Automatic single silent retry for transient network hiccups before surfacing error
        if (attempt < 1) {
          autoRetryTimer = setTimeout(() => {
            if (alive) setAttempt((v) => v + 1);
          }, 600);
        } else {
          setFailed(true);
        }
      }
    })();

    return () => {
      alive = false;
      if (autoRetryTimer) clearTimeout(autoRetryTimer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, attempt]);

  if (failed) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setAttempt((v) => v + 1);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setAttempt((v) => v + 1);
          }
        }}
        className={`flex min-h-36 min-w-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-line/70 bg-surface-3/85 p-4 text-center text-muted backdrop-blur-md transition hover:bg-surface-3 hover:text-fg ${className}`}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
          <Icon name="image" size={20} />
        </span>
        <span className="text-[11px] font-semibold">بارگذاری تصویر ناموفق بود — برای تلاش دوباره بزنید</span>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden ${!src || !decoded ? "min-h-40 min-w-48" : ""} ${className}`}
    >
      {/* Frosted matte blur placeholder while downloading & decoding */}
      {(!src || !decoded) && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center overflow-hidden bg-surface-3/70 backdrop-blur-xl transition-opacity duration-300"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 25%, rgb(var(--glow) / 0.28), transparent 55%), radial-gradient(circle at 80% 80%, color-mix(in srgb, var(--accent-2) 24%, transparent), transparent 55%)",
          }}
        >
          <div className="shimmer-track absolute inset-0" />
          <div className="relative flex flex-col items-center gap-2 rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-white shadow-lg backdrop-blur-md">
            <span className="relative flex h-8 w-8 items-center justify-center">
              <span className="absolute inset-0 animate-spin rounded-full border-2 border-white/20 border-t-white/90" />
              <Icon name="image" size={15} className=" opacity-90" />
            </span>
            <span className="text-[10px] font-bold tabular-nums opacity-90" dir="ltr">
              {faNum(Math.min(100, Math.max(8, progress)))}٪
            </span>
          </div>
        </div>
      )}

      {src && (
        <img
          src={src}
          alt={alt || "تصویر"}
          decoding="async"
          onLoad={(e) => {
            setDecoded(true);
            onLoadRef.current?.(e);
          }}
          onError={() => {
            blobCache.delete(fileId);
            setFailed(true);
          }}
          className={`block h-full w-full object-inherit transition-[filter,transform,opacity] duration-500 ease-out ${
            decoded ? "scale-100 opacity-100 blur-0" : "scale-105 opacity-70 blur-xl"
          } ${className}`}
        />
      )}
    </div>
  );
}
