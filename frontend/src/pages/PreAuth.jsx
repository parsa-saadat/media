import { useEffect, useState } from "react";
import { Icon } from "../components/common/Icon";
import { Button, Field, Input, Logo } from "../components/common/Ui";
import { apiFetch } from "../utils/client";
import { navigate } from "../utils/router";
import { useSession } from "../utils/session";
import { isValidPhone, normalizePhone } from "../utils/validators/phone.validator";
import { isValidUsername, normalizeUsername } from "../utils/validators/username.validator";

/** Sign-in and sign-up screen. `mode` comes from the URL (/login or /register). */
export default function PreAuth({ mode }) {
  const session = useSession();
  const isLogin = mode === "login";
  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [daily, setDaily] = useState(null);

  // the verse of the day is public — it greets guests too
  useEffect(() => {
    apiFetch("/api/content/daily")
      .then((d) => setDaily(d.daily))
      .catch(() => setDaily(null));
  }, []);

  useEffect(() => setError(""), [mode]);

  async function run(key, action) {
    if (busy) return;
    setError("");
    setBusy(key);
    try {
      await action();
    } catch (problem) {
      setError(problem instanceof Error && problem.message ? problem.message : "خطای ناشناخته؛ دوباره تلاش کنید.");
    } finally {
      setBusy("");
    }
  }

  function submit(event) {
    event.preventDefault();
    if (isLogin) {
      const raw = identifier.trim();
      if (!raw) return setError("شماره موبایل یا نام کاربری را وارد کنید");
      if (!password) return setError("رمز عبور را وارد کنید");
      const maybePhone = normalizePhone(raw);
      const maybeUsername = normalizeUsername(raw);
      if (!isValidPhone(maybePhone) && !isValidUsername(maybeUsername)) {
        return setError("شماره موبایل (مثال: 09123456789) یا نام کاربری معتبر وارد کنید");
      }
      void run("form", () => session.login({ identifier: raw, password }));
      return;
    }

    const normalized = normalizePhone(phone);
    if (!isValidPhone(normalized)) return setError("شماره موبایل معتبر نیست (مثال: 09123456789)");
    if (!isValidUsername(username)) {
      return setError("نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی، عدد یا _ باشد و با حرف شروع شود");
    }
    if (password.length < 6) return setError("رمز عبور باید حداقل ۶ کاراکتر باشد");
    void run("form", () =>
      session.register({ phone: normalized, username, displayName: displayName.trim(), password }),
    );
  }

  return (
    <div className="bg-aurora relative flex min-h-screen flex-col items-center justify-center overflow-y-auto p-4 py-8">
      {/* soft accent glows */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-accent/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-accent-2/20 blur-3xl" />

      <main className="relative z-10 w-full max-w-md">
        {/* daily verse */}
        {daily && (
          <figure className="anim-fade-up mb-4 rounded-xl border border-line bg-surface/60 p-4 text-center backdrop-blur-xl">
            <figcaption className="mb-1.5 flex items-center justify-center gap-1.5 text-[10px] font-black tracking-[0.25em] text-accent">
              <Icon name={daily.kind === "hadith" ? "quote" : "book"} size={12} /> {daily.label}
            </figcaption>
            <blockquote>
              <p className="text-[13px] font-bold leading-6 text-fg/90">{daily.fa}</p>
              {daily.ar && <p className="quran-text mt-2 text-lg leading-8 text-fg/60" dir="rtl">{daily.ar}</p>}
              <p className="mt-1.5 text-[10px] font-bold text-accent/80">{daily.source}</p>
            </blockquote>
          </figure>
        )}

        {/* the card */}
        <div className="anim-rise overflow-hidden rounded-xl border border-line bg-surface p-6 shadow-2xl sm:p-7">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <Logo size={40} />
            <div>
              <h1 className="text-xl font-black">{isLogin ? "ورود به inebuly" : "ساخت حساب در inebuly"}</h1>
              <p className="mt-1 text-xs text-muted">
                {isLogin ? "با شماره موبایل یا نام کاربری خود وارد شوید" : "چند ثانیه بیشتر وقت نمی‌گیرد"}
              </p>
            </div>
          </div>

          <form onSubmit={submit} noValidate className="space-y-4">
            {isLogin ? (
              <Field label="شماره موبایل یا نام کاربری">
                <Input
                  name="identifier"
                  dir="ltr"
                  autoComplete="username"
                  placeholder="09123456789 یا username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="text-left"
                />
              </Field>
            ) : (
              <>
                <Field label="شماره موبایل">
                  <Input
                    name="phone"
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="09123456789"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="text-left tracking-wider"
                  />
                </Field>
                <Field label="نام کاربری" hint="حروف انگلیسی، عدد و _ — دیگران با این نام شما را پیدا می‌کنند">
                  <div className="relative" dir="ltr">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-accent">@</span>
                    <Input
                      name="username"
                      dir="ltr"
                      placeholder="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                      maxLength={32}
                      className="pl-9 text-left"
                    />
                  </div>
                </Field>
                <Field label="نام نمایشی">
                  <Input
                    name="displayName"
                    placeholder="مثلاً: علی رضایی"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={48}
                  />
                </Field>
              </>
            )}

            <Field label="رمز عبور">
              <div className="relative">
                <Input
                  name="password"
                  dir="ltr"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-11 text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:text-fg"
                  aria-label={showPassword ? "پنهان کردن رمز" : "نمایش رمز"}
                >
                  <Icon name={showPassword ? "lock" : "key"} size={16} />
                </button>
              </div>
            </Field>

            {error && (
              <div
                role="alert"
                className="anim-pop flex items-start gap-2 rounded-lg bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300"
              >
                <Icon name="ban" size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" disabled={!!busy} className="w-full py-3 text-base">
              {busy === "form" ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  {isLogin ? "در حال ورود…" : "در حال ساخت حساب…"}
                </>
              ) : isLogin ? (
                "ورود"
              ) : (
                "ثبت‌نام"
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {isLogin ? "حساب ندارید؟ " : "قبلاً ثبت‌نام کرده‌اید؟ "}
            <button
              type="button"
              onClick={() => navigate(isLogin ? "/register" : "/login")}
              className="font-bold text-accent hover:underline"
            >
              {isLogin ? "ثبت‌نام کنید" : "وارد شوید"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
