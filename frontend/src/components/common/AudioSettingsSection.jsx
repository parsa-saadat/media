import { useEffect, useRef, useState } from "react";
import { faNum, toast } from "../../utils/client";
import { subscribeMicLevel, getMicLevel } from "../../utils/micMeter";
import {
  buildMicConstraints,
  createMicAudioPipeline,
  readAudioPrefs,
  saveAudioPrefs,
  subscribeAudioPrefs,
} from "../../utils/audioPrefs";
import { playSound, setSoundsEnabled, soundsEnabled } from "../../utils/sounds";
import { Icon } from "./Icon";

function ToggleSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      dir="ltr"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
        checked ? "border-accent/60 bg-accent" : "border-line bg-surface-3"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/**
 * Reusable pro-grade Audio & Microphone settings panel.
 *
 * - In App Settings (`externalCall={null}`): includes a standalone Live Mic Test + Loopback
 *   ("تست زندهٔ میکروفون و شنیدن صدای خود") so users can see their real-time level against the
 *   Voice Gate threshold line and hear the Subtle Noise Suppressor before entering any call!
 * - Inside Meet / Voice (`externalCall` passed): binds directly to the live call's `prefs`,
 *   `devices`, `changeInput`, `changeOutput`, `updateAudioPrefs`, and live `subscribeMicLevel`
 *   meter so adjustments apply mid-call with zero interruption!
 */
export default function AudioSettingsSection({
  externalCall = null,
  compact = false,
  showAppSounds = true,
}) {
  const [localPrefs, setLocalPrefs] = useState(() => readAudioPrefs());
  const [localDevices, setLocalDevices] = useState([]);
  const [appSoundsOn, setAppSoundsOn] = useState(() => soundsEnabled());

  // Standalone mic test state (used when not inside an active call, or when testing loopback)
  const [testingMic, setTestingMic] = useState(false);
  const [loopbackOn, setLoopbackOn] = useState(false);
  const [testLevel, setTestLevel] = useState(0);
  const [testGateOpen, setTestGateOpen] = useState(true);
  const [liveCallLevel, setLiveCallLevel] = useState(() => getMicLevel());

  const testStreamRef = useRef(null);
  const testPipelineRef = useRef(null);
  const loopbackAudioRef = useRef(null);

  const prefs = externalCall?.prefs ? { ...localPrefs, ...externalCall.prefs } : localPrefs;
  const devices = externalCall?.devices?.length ? externalCall.devices : localDevices;

  // Keep synced with global audioPrefs changes
  useEffect(() => {
    return subscribeAudioPrefs((next) => {
      setLocalPrefs(next);
      testPipelineRef.current?.updatePrefs(next);
    });
  }, []);

  // Enumerate devices when standalone
  useEffect(() => {
    if (externalCall?.devices?.length) return;
    let alive = true;
    const load = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (alive) setLocalDevices(list);
      } catch {
        /* ignore */
      }
    };
    void load();
    navigator.mediaDevices?.addEventListener?.("devicechange", load);
    return () => {
      alive = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", load);
    };
  }, [externalCall?.devices?.length]);

  // Subscribe to active call mic meter when externalCall is provided
  useEffect(() => {
    if (!externalCall) return;
    return subscribeMicLevel((lvl) => setLiveCallLevel(lvl));
  }, [externalCall]);

  // Clean up standalone mic test on unmount
  useEffect(() => {
    return () => {
      stopMicTest();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopMicTest() {
    if (loopbackAudioRef.current) {
      loopbackAudioRef.current.pause();
      loopbackAudioRef.current.srcObject = null;
      loopbackAudioRef.current = null;
    }
    testPipelineRef.current?.close();
    testPipelineRef.current = null;
    testStreamRef.current?.getTracks().forEach((t) => t.stop());
    testStreamRef.current = null;
    setTestingMic(false);
    setLoopbackOn(false);
    setTestLevel(0);
  }

  async function startMicTest(withLoopback = false, customInputId) {
    stopMicTest();
    if (!navigator.mediaDevices?.getUserMedia) {
      toast("مرورگر شما اجازهٔ دسترسی به میکروفون ندارد", "error");
      return;
    }
    try {
      const current = readAudioPrefs();
      const raw = await navigator.mediaDevices.getUserMedia({
        audio: buildMicConstraints(current, customInputId ?? current.inputId),
      });
      testStreamRef.current = raw;
      const pipe = createMicAudioPipeline(raw, current, {
        onLevel: (lvl, open) => {
          setTestLevel(lvl);
          setTestGateOpen(open);
        },
      });
      testPipelineRef.current = pipe;
      setTestingMic(true);

      if (withLoopback && pipe.outputStream) {
        const el = new Audio();
        el.autoplay = true;
        el.srcObject = pipe.outputStream;
        el.volume = Math.min(1, Math.max(0, (current.master ?? 100) / 100));
        if (current.outputId && typeof el.setSinkId === "function") {
          void el.setSinkId(current.outputId).catch(() => {});
        }
        void el.play().catch(() => {});
        loopbackAudioRef.current = el;
        setLoopbackOn(true);
      }

      if (navigator.mediaDevices?.enumerateDevices) {
        const list = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (list.length) setLocalDevices(list);
      }
    } catch {
      toast("دسترسی به میکروفون داده نشد", "error");
    }
  }

  function toggleLoopback() {
    if (!testingMic) {
      void startMicTest(true);
      return;
    }
    if (loopbackOn) {
      if (loopbackAudioRef.current) {
        loopbackAudioRef.current.pause();
        loopbackAudioRef.current.srcObject = null;
        loopbackAudioRef.current = null;
      }
      setLoopbackOn(false);
    } else if (testPipelineRef.current?.outputStream) {
      const el = new Audio();
      el.autoplay = true;
      el.srcObject = testPipelineRef.current.outputStream;
      el.volume = Math.min(1, Math.max(0, (prefs.master ?? 100) / 100));
      if (prefs.outputId && typeof el.setSinkId === "function") {
        void el.setSinkId(prefs.outputId).catch(() => {});
      }
      void el.play().catch(() => {});
      loopbackAudioRef.current = el;
      setLoopbackOn(true);
    }
  }

  function patchPrefs(patch) {
    if (externalCall?.updateAudioPrefs) {
      externalCall.updateAudioPrefs(patch);
    } else {
      const next = saveAudioPrefs(patch);
      setLocalPrefs(next);
      testPipelineRef.current?.updatePrefs(next);
      if (patch.master !== undefined && loopbackAudioRef.current) {
        loopbackAudioRef.current.volume = Math.min(1, Math.max(0, patch.master / 100));
      }
    }
  }

  async function handleInputChange(id) {
    if (externalCall?.changeInput) {
      await externalCall.changeInput(id);
    } else {
      patchPrefs({ inputId: id });
      if (testingMic) await startMicTest(loopbackOn, id);
    }
  }

  async function handleOutputChange(id) {
    if (externalCall?.changeOutput) {
      await externalCall.changeOutput(id);
    } else {
      const probe = document.createElement("audio");
      if (id && typeof probe.setSinkId !== "function") {
        toast("این مرورگر انتخاب خروجی صدا را پشتیبانی نمی‌کند", "error");
        return;
      }
      patchPrefs({ outputId: id });
      if (loopbackAudioRef.current && typeof loopbackAudioRef.current.setSinkId === "function") {
        void loopbackAudioRef.current.setSinkId(id).catch(() => {});
      }
    }
  }

  const effectiveLevel = externalCall ? liveCallLevel : testLevel;
  const threshold = prefs.vadThreshold ?? 18;
  const gatePasses = !prefs.vadEnabled || (externalCall ? effectiveLevel >= threshold : testGateOpen);
  const meterActive = externalCall ? Boolean(externalCall.micActive) : testingMic;

  const inputs = devices.filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default");
  const outputs = devices.filter((d) => d.kind === "audiooutput" && d.deviceId && d.deviceId !== "default");

  return (
    <div className={compact ? "space-y-3.5 text-xs" : "space-y-4 text-xs"}>
      {/* Device Pickers */}
      <div className={`grid gap-3 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        <label className="block rounded-xl border border-line bg-surface-2/75 p-3">
          <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black text-fg">
            <Icon name="mic" size={14} className="text-accent" /> میکروفون ورودی
          </span>
          <select
            value={prefs.inputId || ""}
            onChange={(e) => void handleInputChange(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-fg outline-none focus:border-accent"
          >
            <option value="">پیش‌فرض سیستم</option>
            {inputs.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `میکروفون ${faNum(i + 1)}`}
              </option>
            ))}
          </select>
        </label>

        <label className="block rounded-xl border border-line bg-surface-2/75 p-3">
          <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black text-fg">
            <Icon name="headphones" size={14} className="text-accent" /> بلندگو / هدفون خروجی
          </span>
          <select
            value={prefs.outputId || ""}
            onChange={(e) => void handleOutputChange(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-fg outline-none focus:border-accent"
          >
            <option value="">پیش‌فرض سیستم</option>
            {outputs.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `خروجی صدا ${faNum(i + 1)}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Voice Gate Threshold + Live Meter Card */}
      <div className="rounded-2xl border border-line bg-surface-2/80 p-3.5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Icon name="radio" size={15} className="text-accent" />
              <span className="text-xs font-black text-fg">آستانهٔ تشخیص و ارسال صدا (Noise Gate)</span>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                  prefs.vadEnabled
                    ? gatePasses && meterActive
                      ? "bg-emerald-500/18 text-emerald-500"
                      : "bg-amber-500/16 text-amber-500"
                    : "bg-surface-3 text-muted"
                }`}
              >
                {prefs.vadEnabled
                  ? meterActive
                    ? gatePasses
                      ? "در حال عبور صدا"
                      : "بی‌صدا (زیر حد آستانه)"
                    : `فعال · حد ${faNum(threshold)}٪`
                  : "ارسال پیوسته (خاموش)"}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              وقتی روشن باشد، صدای محیط اطراف شما فیلتر می‌شود و <strong>فقط زمانی که بلندی صدای شما از خط آستانه رد شود</strong> برای بقیه ارسال می‌گردد.
            </p>
          </div>
          <ToggleSwitch
            checked={Boolean(prefs.vadEnabled)}
            onChange={(on) => patchPrefs({ vadEnabled: on })}
            label="فعال‌سازی آستانه ارسال صدا"
          />
        </div>

        {/* Live Meter Bar with Visual Threshold Marker */}
        <div className="mt-3.5 space-y-2">
          <div className="relative h-4 w-full overflow-hidden rounded-full border border-line bg-bg/85" dir="ltr">
            {/* Segmented background guide */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-75"
              style={{
                width: `${meterActive ? Math.min(100, effectiveLevel) : 0}%`,
                background:
                  prefs.vadEnabled && !gatePasses
                    ? "linear-gradient(90deg, rgba(251,191,36,0.45), rgba(245,158,11,0.7))"
                    : "linear-gradient(90deg, #10b981, #34d399, var(--accent))",
              }}
            />
            {/* Visual Threshold Line */}
            {prefs.vadEnabled && (
              <div
                title={`خط آستانه: ${faNum(threshold)}٪`}
                className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.95)]"
                style={{ left: `${threshold}%` }}
              />
            )}
          </div>

          {prefs.vadEnabled && (
            <div className="pt-1">
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="font-bold text-fg/85">تنظیم حد عبور صدا برای بقیه</span>
                <span className="font-black tabular-nums text-accent">{faNum(threshold)}٪</span>
              </div>
              <input
                type="range"
                dir="ltr"
                min={2}
                max={80}
                value={threshold}
                onChange={(e) => patchPrefs({ vadThreshold: Number(e.target.value) })}
                aria-label="آستانه ارسال صدا"
                className="h-1.5 w-full cursor-pointer accent-[var(--accent)]"
              />
              <div className="mt-0.5 flex justify-between text-[10px] text-muted">
                <span>حساس‌تر (حتی پچ‌پچ آرام)</span>
                <span>فیلتر قوی‌تر شلوغی اطراف</span>
              </div>
            </div>
          )}

          {/* Standalone Mic Test Controls when in App Settings */}
          {!externalCall && (
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              <button
                type="button"
                onClick={() => (testingMic ? stopMicTest() : void startMicTest(false))}
                className={`press flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition ${
                  testingMic
                    ? "border-rose-400/45 bg-rose-500/18 text-rose-500"
                    : "border-accent/45 bg-accent/16 text-accent hover:bg-accent/26"
                }`}
              >
                <Icon name={testingMic ? "close" : "mic"} size={13} />
                {testingMic ? "توقف تست میکروفون" : "تست زندهٔ میکروفون"}
              </button>
              <button
                type="button"
                onClick={toggleLoopback}
                className={`press flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition ${
                  loopbackOn
                    ? "border-emerald-400/50 bg-emerald-500/18 text-emerald-500"
                    : "border-line bg-surface px-3 py-1.5 text-muted hover:text-fg"
                }`}
              >
                <Icon name="headphones" size={13} />
                {loopbackOn ? "در حال پخش صدای شما (قطع)" : "شنیدن صدای خودم (با اعمال فیلترها)"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Subtle Noise Suppressor & Voice Processing Toggles */}
      <div className="space-y-2 rounded-2xl border border-line bg-surface-2/75 p-3.5">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-black text-fg">
          <Icon name="sparkles" size={14} className="text-accent" /> پردازش هوشمند صدا و حذف نویز
        </p>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-surface/65 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-fg">نویزگیر ملایم</span>
              <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9.5px] font-black text-accent">پیشنهادی</span>
            </div>
            <p className="mt-0.5 text-[10.5px] leading-4 text-muted">
              حذف نرم صدای فن و خش‌خش محیط بدون تغییر لحن صدای شما
            </p>
          </div>
          <ToggleSwitch
            checked={Boolean(prefs.noiseSuppressor)}
            onChange={(on) => patchPrefs({ noiseSuppressor: on })}
            label="نویزگیر ملایم"
          />
        </div>

        <div className={`grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
          <div className="flex items-center justify-between gap-2.5 rounded-xl border border-line/70 bg-surface/65 px-3 py-2">
            <div className="min-w-0">
              <span className="block font-bold text-fg">حذف پژواک و اکو</span>
              <span className="block text-[10px] text-muted">جلوگیری از برگشت صدای بلندگو</span>
            </div>
            <ToggleSwitch
              checked={Boolean(prefs.echoCancellation)}
              onChange={(on) => patchPrefs({ echoCancellation: on })}
              label="حذف پژواک و اکو"
            />
          </div>

          <div className="flex items-center justify-between gap-2.5 rounded-xl border border-line/70 bg-surface/65 px-3 py-2">
            <div className="min-w-0">
              <span className="block font-bold text-fg">تنظیم خودکار بلندی صدا</span>
              <span className="block text-[10px] text-muted">یکدست‌سازی صدای کم و زیاد (AGC)</span>
            </div>
            <ToggleSwitch
              checked={Boolean(prefs.autoGainControl)}
              onChange={(on) => patchPrefs({ autoGainControl: on })}
              label="تنظیم خودکار بلندی صدا"
            />
          </div>
        </div>
      </div>

      {/* Volume & Boost Sliders */}
      <div className={`grid gap-3 rounded-2xl border border-line bg-surface-2/75 p-3.5 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold text-fg">
              <Icon name="mic" size={14} className="text-accent" /> تقویت صدای ارسالی میکروفون
            </span>
            <span className="font-black tabular-nums text-accent">{faNum(prefs.micGain ?? 100)}٪</span>
          </div>
          <input
            type="range"
            dir="ltr"
            min={0}
            max={200}
            value={prefs.micGain ?? 100}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (externalCall?.setMicGain) externalCall.setMicGain(v);
              else patchPrefs({ micGain: v });
            }}
            aria-label="تقویت میکروفون"
            className="h-1.5 w-full cursor-pointer accent-[var(--accent)]"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold text-fg">
              <Icon name={(prefs.master ?? 100) === 0 ? "volume-off" : "volume"} size={14} className="text-accent" /> بلندی صدای دریافتی کل
            </span>
            <span className="font-black tabular-nums text-accent">{faNum(prefs.master ?? 100)}٪</span>
          </div>
          <input
            type="range"
            dir="ltr"
            min={0}
            max={100}
            value={prefs.master ?? 100}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (externalCall?.setMaster) externalCall.setMaster(v);
              else patchPrefs({ master: v });
            }}
            aria-label="بلندی صدای دریافتی"
            className="h-1.5 w-full cursor-pointer accent-[var(--accent)]"
          />
        </div>
      </div>

      {/* App Notification Sounds Toggle */}
      {showAppSounds && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2/75 px-3.5 py-3">
          <div className="min-w-0">
            <span className="block font-bold text-fg">افکت‌های صوتی اعلان و پیام‌ها</span>
            <span className="mt-0.5 block text-[10.5px] text-muted">
              پخش صدای ملایم هنگام دریافت پیام جدید، ورود به جلسه یا زنگ تماس
            </span>
          </div>
          <ToggleSwitch
            checked={appSoundsOn}
            onChange={(on) => {
              setSoundsEnabled(on);
              setAppSoundsOn(on);
              if (on) playSound("connect");
            }}
            label="افکت‌های صوتی برنامه"
          />
        </div>
      )}
    </div>
  );
}
