import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, clearToken, getToken, setToken, setTokenInUrl, toast, UNAUTHORIZED_EVENT } from "./client";

/** The answer of GET /api/auth/me: the user, or why the server could not identify the request. */

const SessionContext = createContext(null);

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}

/**
 * Asks the server who the token belongs to. When it reports that no token arrived at all, something
 * between the browser and the server removed the header and the cookie (preview frames and some proxies
 * do this). Then the token is sent in the URL for this browser, and the question is asked again.
 */
async function probe() {
  let answer = await apiFetch("/api/auth/me");
  if (!answer.user && answer.reason === "no-token" && getToken()) {
    setTokenInUrl(true);
    answer = await apiFetch("/api/auth/me");
    if (!answer.user) setTokenInUrl(false);
  }
  return answer;
}

/** A Persian explanation of a failed session check, including which token channels arrived. */
function describe(answer) {
  if (answer.reason === "banned") return "حساب کاربری شما مسدود شده است.";
  const received = answer.received;
  const yes = (ok) => (ok ? "رسید" : "نرسید");
  const arrivals = received
    ? ` (هدر Authorization: ${yes(received.authorization)} · هدر x-voxsy-token: ${yes(received.xVoxsyToken)} · آدرس: ${yes(received.query)} · کوکی: ${yes(received.cookie)})`
    : "";
  if (answer.reason === "unknown-session") {
    return `ورود انجام شد، ولی سرور نشستِ این توکن را پیدا نکرد؛ دوباره وارد شوید.${arrivals}`;
  }
  return `ورود انجام شد، ولی توکن نشست به سرور نرسید. لطفاً دوباره تلاش کنید.${arrivals}`;
}

export function SessionProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);

  const forget = useCallback(() => {
    clearToken();
    setTokenInUrl(false);
    setUser(null);
    setStatus("guest");
  }, []);

  const refresh = useCallback(async () => {
    const before = getToken();
    const answer = await probe();
    // A sign-in that completed while this check was running owns the token now: leave it alone.
    if (getToken() !== before) return;
    if (answer.user) {
      setUser(answer.user);
      setStatus("authed");
    } else {
      if (before) clearToken();
      setTokenInUrl(false);
      setUser(null);
      setStatus("guest");
    }
  }, []);

  // First load: is this browser already signed in (saved token or cookie)?
  useEffect(() => {
    refresh().catch(() => setStatus("guest"));
  }, [refresh]);

  // Any API call answered with 401 means the session ended (expired, banned, signed out elsewhere).
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, forget);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, forget);
  }, [forget]);

  const enter = useCallback(async (endpoint, payload) => {
    const data = await apiFetch(`/api/auth/${endpoint}`, { method: "POST", json: payload });
    if (!data?.token) throw new Error("پاسخ سرور کامل نبود؛ دوباره تلاش کنید.");
    const savedForNextLoad = setToken(data.token);
    setTokenInUrl(false);

    // Prove that the session reaches the server before leaving the sign-in screen.
    const answer = await probe();
    if (!answer.user) {
      clearToken();
      setTokenInUrl(false);
      console.warn("[voxsy] the session did not reach the server:", answer);
      throw new Error(describe(answer));
    }
    // No navigation and no reload: the screen simply switches to the chat.
    setUser(answer.user);
    setStatus("authed");
    if (!savedForNextLoad) {
      toast("مرورگر ذخیره‌سازی این صفحه را بسته است؛ بعد از بارگذاری دوباره صفحه باید دوباره وارد شوید.", "info");
    }
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      refresh,
      login: (credentials) => enter("login", credentials),
      register: (registration) => enter("register", registration),
      logout: async () => {
        await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        forget();
      },
    }),
    [status, user, refresh, enter, forget],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
