import { useEffect, useState } from "react";
import { authFetch } from "./client";

/**
 * Profile photos are shown many times on one screen (every message of a sender, member lists, calls).
 * One in-memory cache per browser session fetches each user's photo once and shares the object URL.
 * `version` lets the uploader bust their own entry after changing the picture.
 */
const cache = new Map();
const listeners = new Set();
let versionCounter = 1;

function notify() {
  for (const l of listeners) l();
}

export function invalidateAvatar(userId) {
  const prev = cache.get(userId);
  if (prev?.url) URL.revokeObjectURL(prev.url);
  cache.delete(userId);
  versionCounter += 1;
  notify();
}

async function load(userId, hasPhoto) {
  const existing = cache.get(userId);
  if (existing && !existing.promise) return existing.url;
  if (existing?.promise) return existing.promise;
  if (!hasPhoto) {
    cache.set(userId, { url: null, version: versionCounter });
    return null;
  }
  const promise = (async () => {
    try {
      const res = await authFetch(`/api/avatars/${userId}`);
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  })();
  cache.set(userId, { url: null, version: versionCounter, promise });
  const url = await promise;
  cache.set(userId, { url, version: versionCounter });
  notify();
  return url;
}

/** Returns the photo URL for a user (null while loading or when there is no photo). */
export function useAvatarUrl(userId, avatarFileId) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((v) => v + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (!userId) return;
    void load(userId, !!avatarFileId);
  }, [userId, avatarFileId]);
  if (!userId || !avatarFileId) return null;
  return cache.get(userId)?.url ?? null;
}
