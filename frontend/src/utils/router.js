import { useSyncExternalStore } from "react";

const NAVIGATE_EVENT = "voxsy:navigate";

/** Client-side navigation: changes the address bar without ever reloading the page. */
export function navigate(path, replace = false) {
  if (typeof window === "undefined" || window.location.pathname === path) return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

function subscribe(onChange) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

/** The current pathname, re-rendering the caller whenever it changes. */
export function usePath(initialPath) {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => initialPath,
  );
}
