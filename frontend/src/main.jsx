import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Vite entry point (npm run dev inside Front-End/app). The Next.js host mounts the same App.
createRoot(document.getElementById("root")).render(<App initialPath={window.location.pathname} />);
