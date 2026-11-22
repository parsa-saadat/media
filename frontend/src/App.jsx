import { useEffect } from "react";
import Toaster from "./components/common/Toaster";
import { Logo } from "./components/common/Ui";
import Admin from "./pages/Admin";
import Chat from "./pages/Chat";
import Meet from "./pages/Meet";
import Istikhara from "./pages/Istikhara";
import NotFound from "./pages/NotFound";
import PreAuth from "./pages/PreAuth";
import { ConfirmProvider } from "./components/common/Confirm";
import AzanOverlay from "./components/common/AzanOverlay";
import { navigate, usePath } from "./utils/router";
import { SessionProvider, useSession } from "./utils/session";
import { useAzan } from "./hooks/useAzan";

const AUTH_PATHS = ["/login", "/register"];
/** Meeting links work for guests too: they must never be pushed to the sign-in screen. */
const PUBLIC_PATHS = /^\/meet\/[A-Za-z0-9_-]{6,64}$/;

function Splash() {
  return (
    <div className="bg-aurora flex min-h-screen flex-col items-center justify-center gap-5">
      <div className="animate-pulse">
        <Logo size={48} />
      </div>
      <p className="text-sm text-muted">در حال آماده‌سازی…</p>
    </div>
  );
}

function Screens({ initialPath }) {
  const path = usePath(initialPath);
  const { status } = useSession();

  // Keep the address bar in step with the session, by changing the URL — never by loading a page.
  const isMeet = PUBLIC_PATHS.test(path);

  useEffect(() => {
    if (isMeet) return; // guests are welcome on meeting links
    if (status === "authed" && AUTH_PATHS.includes(path)) navigate("/", true);
    if (status === "guest" && !AUTH_PATHS.includes(path)) navigate("/login", true);
  }, [isMeet, path, status]);

  useEffect(() => {
    if (isMeet) return; // Meet.jsx sets its own dynamic title
    if (status === "loading") {
      document.title = "inebuly";
      return;
    }
    if (status === "guest") {
      document.title = path === "/register" ? "ثبت‌نام — inebuly" : "ورود — inebuly";
      return;
    }
    if (path === "/admin") {
      document.title = "پنل مدیریت — inebuly";
      return;
    }
    if (path === "/istikhara") {
      document.title = "استخاره با قرآن — inebuly";
      return;
    }
    if (path !== "/" && !AUTH_PATHS.includes(path)) {
      document.title = "صفحه پیدا نشد — inebuly";
    }
  }, [isMeet, path, status]);

  if (isMeet) return <Meet token={path.slice("/meet/".length)} />;
  if (status === "loading") return <Splash />;
  if (status === "guest") return <PreAuth mode={path === "/register" ? "register" : "login"} />;
  if (path === "/admin") return <Admin />;
  if (path === "/istikhara") return <Istikhara />;
  if (path === "/" || AUTH_PATHS.includes(path)) return <Chat />;
  return <NotFound />;
}

/** The whole frontend: one React tree, switched by the session and by the pathname. */
export default function App({ initialPath = "/" }) {
  return (
    <SessionProvider>
      <ConfirmProvider>
        <AzanScheduler />
        <Screens initialPath={initialPath} />
        <Toaster />
      </ConfirmProvider>
    </SessionProvider>
  );
}

/** Runs the azan clock for every signed-in screen and renders the full-screen call overlay. */
function AzanScheduler() {
  const { status, user } = useSession();
  const azan = useAzan(status === "authed" ? user : null);
  return <AzanOverlay onStop={azan.stop} />;
}
