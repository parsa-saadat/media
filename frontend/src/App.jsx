import { useEffect, useState } from "react";
import Toaster from "./components/common/Toaster";
import { Logo } from "./components/common/Ui";
import Admin from "./pages/Admin";
import Chat from "./pages/Chat";
import Meet from "./pages/Meet";
import Istikhara from "./pages/Istikhara";
import Dhikr from "./pages/Dhikr";
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
    <div className="bg-aurora flex min-h-[100dvh] flex-col items-center justify-center gap-4">
      <Logo size={46} />
      <div className="flex items-center gap-2.5 rounded-full border border-accent/25 bg-surface/80 px-4 py-1.5 text-xs font-semibold text-muted shadow-sm backdrop-blur">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
        <span>در حال آماده‌سازی…</span>
      </div>
    </div>
  );
}

function Screens({ initialPath }) {
  const path = usePath(initialPath);
  const { status } = useSession();
  const [activeMeetToken, setActiveMeetToken] = useState(() => {
    const p = typeof window !== "undefined" ? window.location.pathname : initialPath;
    return PUBLIC_PATHS.test(p) ? p.slice("/meet/".length) : "";
  });

  // Keep the address bar in step with the session, by changing the URL — never by loading a page.
  const isMeet = PUBLIC_PATHS.test(path);
  const urlMeetToken = isMeet ? path.slice("/meet/".length) : "";

  useEffect(() => {
    if (urlMeetToken && urlMeetToken !== activeMeetToken) {
      setActiveMeetToken(urlMeetToken);
    }
  }, [activeMeetToken, urlMeetToken]);

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
    if (path === "/dhikr") {
      document.title = "ذکر و زیارت روز — inebuly";
      return;
    }
    if (path !== "/" && !AUTH_PATHS.includes(path)) {
      document.title = "صفحه پیدا نشد — inebuly";
    }
  }, [isMeet, path, status]);

  let mainScreen = null;
  if (!isMeet) {
    if (status === "loading") mainScreen = <Splash />;
    else if (status === "guest") mainScreen = <PreAuth mode={path === "/register" ? "register" : "login"} />;
    else if (path === "/admin") mainScreen = <Admin />;
    else if (path === "/istikhara") mainScreen = <Istikhara />;
    else if (path === "/dhikr") mainScreen = <Dhikr />;
    else if (path === "/" || AUTH_PATHS.includes(path)) mainScreen = <Chat />;
    else mainScreen = <NotFound />;
  }

  const showMeetToken = urlMeetToken || activeMeetToken;

  return (
    <>
      {mainScreen}
      {showMeetToken && (
        <Meet
          key={showMeetToken}
          token={showMeetToken}
          minimized={!isMeet}
          onMinimize={() => navigate(status === "authed" ? "/" : "/login")}
          onExpand={() => navigate(`/meet/${showMeetToken}`)}
          onTerminated={() => setActiveMeetToken("")}
        />
      )}
    </>
  );
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
