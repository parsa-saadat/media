import { useCallback, useEffect, useState } from "react";

let deferredPromptGlobal = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPromptGlobal = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPromptGlobal = null;
    notify();
  });
}

function checkStandalone() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: window-controls-overlay)").matches ||
      window.navigator?.standalone === true
  );
}

function checkIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIos && !checkStandalone();
}

export function usePwaInstall() {
  const [, bump] = useState(0);

  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", fn);
    return () => {
      listeners.delete(fn);
      mq?.removeEventListener?.("change", fn);
    };
  }, []);

  const isInstalled = checkStandalone();
  const isIos = checkIosSafari();
  const canPrompt = Boolean(deferredPromptGlobal) && !isInstalled;

  const promptInstall = useCallback(async () => {
    if (!deferredPromptGlobal) return { outcome: isIos ? "ios-manual" : "unavailable" };
    const p = deferredPromptGlobal;
    deferredPromptGlobal = null;
    notify();
    try {
      await p.prompt();
      const choice = await p.userChoice;
      return { outcome: choice?.outcome || "dismissed" };
    } catch {
      return { outcome: "error" };
    }
  }, [isIos]);

  return {
    isInstalled,
    isIos,
    canInstall: !isInstalled && (canPrompt || isIos),
    canPrompt,
    promptInstall,
  };
}
