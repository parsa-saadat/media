import { createRoot } from "react-dom/client";
import App from "./App";
import { applyThemeConfig, getThemeConfig } from "./utils/client";
import "./index.css";

// Restore user's exact 3-axis theme configuration (glass, dark/light, primary accent) immediately
if (typeof window !== "undefined") {
  applyThemeConfig(getThemeConfig());
}

// Register Service Worker for installable PWA support
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Vite entry point (npm run dev inside frontend).
createRoot(document.getElementById("root")).render(<App initialPath={window.location.pathname} />);
