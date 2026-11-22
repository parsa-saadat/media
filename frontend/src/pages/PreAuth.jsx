import { useEffect, useState } from "react";
import { Icon } from "../components/common/Icon";
import { Button, Field, Input, Logo } from "../components/common/Ui";
import { apiFetch, faNum } from "../utils/client";
import { navigate } from "../utils/router";
import { useSession } from "../utils/session";
import { isValidPhone, normalizePhone, toEnglishDigits } from "../utils/validators/phone.validator";
import { isValidUsername, normalizeUsername } from "../utils/validators/username.validator";

const FEATURES = [
  { icon: "radio", title: "جلسه‌های صوتی و تصویری پایدار", desc: "ورود فوری با لینک، اشتراک صفحهٔ هم‌زمان و کمرا با کیفیت ۱۰۸۰p" },
  { icon: "bot", title: "ربات موسیقی هماهنگ", desc: "پخش مستقیم آهنگ‌های SoundCloud و فایل‌های صوتی برای همهٔ اعضای اتاق" },
  { icon: "gamepad", title: "بازی‌های گروهی زنده", desc: "منچ، مار و پله و دوز با امکان تماشای زنده برای سایر اعضا" },
  { icon: "shield", title: "سریع، امن و شخصی‌سازی‌شده", desc: "گروه‌های خصوصی، پیام صوتی، اوقات شرعی و تم‌های متنوع" },
];

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
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [daily, setDaily] = useState(null);

  useEffect(() => {
    apiFetch("/api/content/daily")
      .then((d) => setDaily(d.daily))
      .catch(() => setDaily(null));
  }, []);

  useEffect(() => {
    setError("");
    setShowPassword(false);
  }, [mode]);

  function switchMode(targetMode) {
    if (busy) return;
    setError("");
    // Carry over typed phone/username smoothly if switching tabs!
    if (targetMode === "register" && isLogin && identifier.trim()) {
      const p = normalizePhone(identifier);
      const u = normalizeUsername(identifier);
      if (isValidPhone(p) && !phone) setPhone(p);
      else if (u && !username) setUsername(u.replace(/[^a-z0-9_]/g, "").slice(0, 32));
    } else if (targetMode === "login" && !isLogin && !identifier.trim()) {
      if (username.trim()) setIdentifier(username.trim());
      else if (phone.trim()) setIdentifier(normalizePhone(phone));
    }
    navigate(targetMode === "register" ? "/register" : "/login");
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");

    // Read directly from form elements too so browser password-manager autofill never gets missed
    const fd = new FormData(event.currentTarget);

    if (isLogin) {
      const rawId = String(identifier || fd.get("identifier") || "").trim();
      const rawPass = String(password || fd.get("password") || "");
      if (!rawId) return setError("شماره موبایل یا نام کاربری خود را وارد کنید");
      if (!rawPass) return setError("رمز عبور خود را وارد کنید");
      const maybePhone = normalizePhone(rawId);
      const maybeUsername = normalizeUsername(rawId);
      if (!isValidPhone(maybePhone) && !isValidUsername(maybeUsername)) {
        return setError("شماره موبایل (مثال: 09123456789) یا نام کاربری معتبر وارد کنید");
      }
      const cleanId = isValidPhone(maybePhone) ? maybePhone : maybeUsername;
      setBusy(true);
      try {
        await session.login({ identifier: cleanId, password: rawPass });
      } catch (problem) {
        setError(problem instanceof Error && problem.message ? problem.message : "خطا در ورود؛ لطفاً دوباره تلاش کنید.");
      } finally {
        setBusy(false);
      }
      return;
    }

    const rawPhone = String(phone || fd.get("phone") || "");
    const rawUsername = String(username || fd.get("username") || "");
    const rawDisplay = String(displayName || fd.get("displayName") || "").trim();
    const rawPass = String(password || fd.get("password") || "");

    const normalizedPhone = normalizePhone(rawPhone);
    const normalizedUser = normalizeUsername(rawUsername);

    if (!isValidPhone(normalizedPhone)) {
      return setError("شماره موبایل معتبر نیست (مثال: 09123456789)");
    }
    if (!isValidUsername(normalizedUser)) {
      return setError("نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی، عدد یا _ باشد و با حرف انگلیسی شروع شود");
    }
    if (rawPass.length < 6) {
      return setError("رمز عبور باید حداقل ۶ کاراکتر باشد");
    }

    setBusy(true);
    try {
      await session.register({
        phone: normalizedPhone,
        username: normalizedUser,
        displayName: rawDisplay || normalizedUser,
        password: rawPass,
      });
    } catch (problem) {
      setError(problem instanceof Error && problem.message ? problem.message : "خطا در ثبت‌نام؛ دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  // Live hints for registration validation
  const phoneClean = normalizePhone(phone);
  const phoneOk = phoneClean.length > 0 && isValidPhone(phoneClean);
  const userClean = normalizeUsername(username);
  const userOk = userClean.length > 0 && isValidUsername(userClean);
  const passStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;

  return (
    <div className="bg-aurora relative flex min-h-[100dvh] flex-col justify-center overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
      {/* Ambient glows */}
      <div className="pointer-events-none fixed -left-28 -top-28 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-32 -right-24 h-96 w-96 rounded-full bg-accent-2/15 blur-3xl" />

      <div className="relative z-10 mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-6 lg:grid-cols-[1.08fr_1fr] lg:gap-10">
        {/* Right / Desktop showcase column */}
        <section className="order-2 flex flex-col gap-5 lg:order-1">
          <div className="hidden lg:flex lg:flex-col lg:gap-4">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-xs font-bold text-accent">
              <Icon name="sparkles" size={14} /> نسل تازهٔ گفتگو، تماس و دورهمی آنلاین
            </div>
            <h2 className="text-3xl font-black leading-[1.4] text-fg xl:text-4xl">
              همهٔ دوستان، گروه‌ها و جلسه‌های شما در <span className="text-accent">inebuly</span>
            </h2>
            <p className="text-sm leading-7 text-muted">
              بدون پیچیدگی با دوستانتان چت کنید، جلسهٔ صوتی و تصویری بسازید، صفحهٔ نمایش به اشتراک بگذارید، با ربات موسیقی آهنگ گوش دهید و هم‌زمان بازی کنید.
            </p>
            <div className="mt-1 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-xl border border-line bg-surface/75 p-3.5 shadow-sm">
                  <div className="mb-2 flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                      <Icon name={f.icon} size={18} />
                    </span>
                    <h3 className="text-xs font-black text-fg">{f.title}</h3>
                  </div>
                  <p className="text-[11px] leading-5 text-muted">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {daily && (
            <figure className="anim-fade-up rounded-2xl border border-line bg-surface/85 p-4 text-center shadow-lg lg:text-right">
              <figcaption className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-black tracking-[0.2em] text-accent lg:justify-start">
                <Icon name={daily.kind === "hadith" ? "quote" : "book"} size={13} /> {daily.label}
              </figcaption>
              <blockquote>
                <p className="text-xs font-bold leading-6 text-fg/90 sm:text-[13px]">{daily.fa}</p>
                {daily.ar && <p className="quran-text mt-2 text-base leading-8 text-fg/65 sm:text-lg" dir="rtl">{daily.ar}</p>}
                <p className="mt-1.5 text-[10px] font-bold text-accent/85">{daily.source}</p>
              </blockquote>
            </figure>
          )}
        </section>

        {/* Left / Auth Form Card */}
        <main className="order-1 w-full max-w-md justify-self-center lg:order-2">
          <div className="anim-rise overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-2xl sm:p-7">
            {/* Brand header */}
            <div className="mb-5 flex flex-col items-center gap-2.5 text-center">
              <Logo size={42} />
              <div>
                <h1 className="text-xl font-black text-fg sm:text-2xl">
                  {isLogin ? "خوش برگشتید" : "ساخت حساب کاربری"}
                </h1>
                <p className="mt-1 text-xs text-muted">
                  {isLogin
                    ? "با شماره موبایل یا نام کاربری وارد حساب خود شوید"
                    : "در چند ثانیه عضو خانوادهٔ inebuly شوید"}
                </p>
              </div>
            </div>

            {/* Segmented Mode Switcher */}
            <div className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => switchMode("login")}
                aria-pressed={isLogin}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-black transition ${
                  isLogin ? "grad-accent text-on-accent shadow-md" : "text-muted hover:text-fg"
                }`}
              >
                <Icon name="user" size={14} /> ورود به حساب
              </button>
              <button
                type="button"
                onClick={() => switchMode("register")}
                aria-pressed={!isLogin}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-black transition ${
                  !isLogin ? "grad-accent text-on-accent shadow-md" : "text-muted hover:text-fg"
                }`}
              >
                <Icon name="user-plus" size={14} /> ثبت‌نام جدید
              </button>
            </div>

            <form key={mode} onSubmit={submit} noValidate className="space-y-4">
              {isLogin ? (
                <Field label="شماره موبایل یا نام کاربری">
                  <div className="relative" dir="ltr">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                      <Icon name="user" size={16} />
                    </span>
                    <Input
                      name="identifier"
                      dir="ltr"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="09123456789 یا @username"
                      value={identifier}
                      onChange={(e) => {
                        setError("");
                        setIdentifier(toEnglishDigits(e.target.value));
                      }}
                      className="pl-10 pr-9 text-left"
                    />
                    {identifier && (
                      <button
                        type="button"
                        onClick={() => setIdentifier("")}
                        aria-label="پاک کردن"
                        className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg"
                      >
                        <Icon name="close" size={13} />
                      </button>
                    )}
                  </div>
                </Field>
              ) : (
                <>
                  <Field
                    label="شماره موبایل"
                    hint={phone ? (phoneOk ? "شماره معتبر است ✓" : "مثال: 09123456789") : undefined}
                  >
                    <div className="relative" dir="ltr">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                        <Icon name="phone" size={16} />
                      </span>
                      <Input
                        name="phone"
                        dir="ltr"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="09123456789"
                        value={phone}
                        onChange={(e) => {
                          setError("");
                          setPhone(toEnglishDigits(e.target.value).replace(/[^\d+\s()-]/g, ""));
                        }}
                        className="pl-10 pr-9 text-left tracking-wider"
                      />
                      {phoneOk && (
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">
                          <Icon name="check" size={15} />
                        </span>
                      )}
                    </div>
                  </Field>

                  <Field
                    label="نام کاربری"
                    hint="۳ تا ۳۲ کاراکتر (حروف انگلیسی، عدد و _) — با حرف شروع شود"
                  >
                    <div className="relative" dir="ltr">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-accent">
                        @
                      </span>
                      <Input
                        name="username"
                        dir="ltr"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="ali_rezaei"
                        value={username}
                        onChange={(e) => {
                          setError("");
                          setUsername(
                            toEnglishDigits(e.target.value)
                              .toLowerCase()
                              .replace(/^@+/, "")
                              .replace(/[^a-z0-9_]/g, ""),
                          );
                        }}
                        maxLength={32}
                        className="pl-9 pr-9 text-left"
                      />
                      {userOk && (
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">
                          <Icon name="check" size={15} />
                        </span>
                      )}
                    </div>
                  </Field>

                  <Field label="نام نمایشی" hint="نامی که دوستانتان در گفتگوها می‌بینند">
                    <Input
                      name="displayName"
                      autoComplete="name"
                      placeholder="مثلاً: علی رضایی"
                      value={displayName}
                      onChange={(e) => {
                        setError("");
                        setDisplayName(e.target.value);
                      }}
                      maxLength={48}
                    />
                  </Field>
                </>
              )}

              <Field
                label="رمز عبور"
                hint={!isLogin ? `حداقل ${faNum(6)} کاراکتر` : undefined}
              >
                <div className="relative" dir="ltr">
                  <Input
                    name="password"
                    dir="ltr"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setError("");
                      setPassword(e.target.value);
                    }}
                    onKeyUp={(e) => setCapsLock(Boolean(e.getModifierState?.("CapsLock")))}
                    className="pl-11 pr-3.5 text-left"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-fg"
                    aria-label={showPassword ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
                    title={showPassword ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
                  >
                    <Icon name={showPassword ? "eye-off" : "eye"} size={16} />
                  </button>
                </div>
                {capsLock && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                    <Icon name="info" size={12} /> کلید Caps Lock روشن است
                  </p>
                )}
                {!isLogin && password.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    {[1, 2, 3].map((lvl) => (
                      <span
                        key={lvl}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          passStrength >= lvl
                            ? passStrength === 1
                              ? "bg-rose-400"
                              : passStrength === 2
                                ? "bg-amber-400"
                                : "bg-emerald-400"
                            : "bg-surface-3"
                        }`}
                      />
                    ))}
                    <span className="text-[10px] font-bold text-muted">
                      {passStrength === 1 ? "کوتاه" : passStrength === 2 ? "مناسب" : "قوی"}
                    </span>
                  </div>
                )}
              </Field>

              {error && (
                <div
                  role="alert"
                  className="anim-pop flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold leading-6 text-rose-300"
                >
                  <Icon name="ban" size={16} className="mt-1 shrink-0 text-rose-400" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" disabled={busy} className="w-full py-3 text-sm font-black shadow-lg">
                {busy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    {isLogin ? "در حال ورود به حساب…" : "در حال ساخت حساب…"}
                  </>
                ) : isLogin ? (
                  <>
                    <Icon name="arrow-left" size={16} /> ورود به inebuly
                  </>
                ) : (
                  <>
                    <Icon name="check" size={16} /> تکمیل ثبت‌نام و ورود
                  </>
                )}
              </Button>
            </form>

            <div className="mt-5 border-t border-line pt-4 text-center text-xs text-muted">
              {isLogin ? "هنوز حساب کاربری ندارید؟ " : "قبلاً ثبت‌نام کرده‌اید؟ "}
              <button
                type="button"
                onClick={() => switchMode(isLogin ? "register" : "login")}
                className="font-black text-accent hover:underline"
              >
                {isLogin ? "همین حالا ثبت‌نام کنید" : "وارد شوید"}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
