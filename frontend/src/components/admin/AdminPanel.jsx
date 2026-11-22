import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, faNum, formatSize, isOnline, toast } from "../../utils/client";
import { playAzanAudio } from "../../hooks/useAzan";
import { navigate } from "../../utils/router";
import { Avatar, Button, Empty, Field, Input, Modal } from "../common/Ui";
import { useConfirm } from "../common/Confirm";
import { Icon } from "../common/Icon";

const ROLE_COLORS = ["#8b5cf6", "#d946ef", "#ec4899", "#f43f5e", "#f97316", "#f59e0b", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#64748b"];

export default function AdminPanel({ me }) {
  const [tab, setTab] = useState("dashboard");
  const can = (p) => me.permissions.includes(p);

  const tabs = [
    { id: "dashboard", label: "داشبورد", icon: "chart", show: true },
    { id: "users", label: "کاربران", icon: "users", show: can("users.view") },
    { id: "roles", label: "نقش‌ها و دسترسی‌ها", icon: "shield", show: true },
    { id: "rooms", label: "گروه‌ها و جلسه‌ها", icon: "landmark", show: true },
    { id: "content", label: "محتوا و اذان", icon: "book", show: can("content.manage") || can("azan.manage") },
  ];

  useEffect(() => {
    const active = tabs.find((t) => t.id === tab);
    document.title = active ? `${active.label} (مدیریت) — inebuly` : "پنل مدیریت — inebuly";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="bg-aurora flex h-[100dvh] flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 bg-surface/50 p-3 md:w-64 md:p-4">
          <div className="mb-4 hidden items-center gap-3 rounded-lg border border-line bg-surface-2/60 p-3 md:flex">
            <Avatar name={me.displayName} color={me.avatarColor} size={40} userId={me.id} avatarFileId={me.avatarFileId} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{me.displayName}</p>
              <p className="text-[11px] text-accent">پنل مدیریت</p>
            </div>
          </div>
          <nav className="scroll-thin flex gap-1 overflow-x-auto md:flex-col">
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition ${
                    tab === t.id ? "grad-accent text-on-accent glow" : "text-muted hover:bg-surface-2 hover:text-fg"
                  }`}
                >
                  <Icon name={t.icon} size={18} />
                  {t.label}
                </button>
              ))}
            <button type="button" onClick={() => navigate("/")} className="flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg md:mt-4">
              <Icon name="arrow-right" size={18} /> بازگشت به گفتگوها
            </button>
          </nav>
        </aside>
        <main className="scroll-thin min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            {tab === "dashboard" && <Dashboard />}
            {tab === "users" && <UsersTab me={me} />}
            {tab === "roles" && <RolesTab canManage={can("roles.manage")} />}
            {tab === "rooms" && <RoomsTab canManage={can("rooms.manage")} />}
            {tab === "content" && <ContentTab me={me} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function Title({ title, sub, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black md:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted">{sub}</p>
      </div>
      {action}
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [daily, setDaily] = useState([]);
  useEffect(() => {
    apiFetch("/api/admin/stats")
      .then((d) => {
        setStats(d.stats);
        setDaily(d.daily);
      })
      .catch((e) => toast(e.message, "error"));
  }, []);
  const cards = stats
    ? [
        { label: "کاربران", value: faNum(stats.users), icon: "users", sub: `${faNum(stats.online)} آنلاین` },
        { label: "گروه‌ها", value: faNum(stats.groups), icon: "landmark", sub: `${faNum(stats.meetings ?? 0)} جلسهٔ فعال` },
        { label: "پیام‌ها", value: faNum(stats.messages), icon: "chat", sub: `${faNum(stats.messages_today)} در ۲۴ ساعت اخیر` },
        { label: "گفتگوی خصوصی", value: faNum(stats.directs), icon: "lock", sub: "چت‌های یک به یک" },
        { label: "فایل‌ها", value: faNum(stats.files), icon: "file", sub: formatSize(Number(stats.storage)) },
        { label: "نقش‌ها", value: faNum(stats.roles), icon: "shield", sub: "سطوح دسترسی" },
      ]
    : [];
  const max = Math.max(1, ...daily.map((d) => d.count));
  return (
    <>
      <Title title="داشبورد" sub="نمای کلی وضعیت سامانه" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {stats === null
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-2" />)
          : cards.map((c, i) => (
              <div key={c.label} className="anim-fade-up relative overflow-hidden rounded-xl bg-surface/70 p-5" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-accent/15 blur-2xl" />
                <div className="relative flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted">{c.label}</p>
                    <p className="mt-2 text-3xl font-black">{c.value}</p>
                    <p className="mt-1 text-xs text-accent">{c.sub}</p>
                  </div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <Icon name={c.icon} size={22} />
                  </span>
                </div>
              </div>
            ))}
      </div>
      <div className="mt-6 rounded-xl bg-surface/70 p-6">
        <h3 className="font-bold">پیام‌های ۷ روز اخیر</h3>
        <div className="mt-6 flex h-48 items-end gap-3">
          {daily.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-xs font-bold text-accent">{faNum(d.count)}</span>
              <div className="grad-accent w-full max-w-14 rounded-t-2xl transition-all" style={{ height: `${Math.max(4, (d.count / max) * 140)}px` }} />
              <span className="text-[10px] text-muted">{new Date(d.day).toLocaleDateString("fa-IR", { weekday: "short" })}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function UsersTab({ me }) {
  const { confirm } = useConfirm();
  const [users, setUsers] = useState(null);
  const [pwTarget, setPwTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [roles, setRoles] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [roleSel, setRoleSel] = useState([]);

  const load = useCallback(async (query) => {
    try {
      const d = await apiFetch(`/api/admin/users?q=${encodeURIComponent(query)}`);
      setUsers(d.users);
    } catch (e) {
      toast(e.message, "error");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  useEffect(() => {
    apiFetch("/api/admin/roles").then((d) => setRoles(d.roles)).catch(() => {});
  }, []);

  async function resetPassword() {
    if (!pwTarget) return;
    if (newPassword.trim().length < 6) { toast("رمز جدید حداقل ۶ کاراکتر باشد", "error"); return; }
    const ok = await confirm({ title: "تغییر رمز عبور", message: `رمز جدید برای «${pwTarget.displayName}» (@${pwTarget.username}) ثبت شود؟`, confirmLabel: "تغییر رمز", variant: "danger", icon: "key" });
    if (!ok) return;
    setPwBusy(true);
    try {
      await apiFetch(`/api/admin/users/${pwTarget.id}/password`, { method: "POST", json: { password: newPassword } });
      toast("رمز عبور تغییر کرد و نشست‌های کاربر بسته شد", "success");
      setPwTarget(null);
      setNewPassword("");
    } catch (e) { toast(e.message, "error"); }
    finally { setPwBusy(false); }
  }

  async function patch(id, body, msg) {
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: "PATCH", json: body });
      toast(msg, "success");
      load(q);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <>
      <Title title="کاربران" sub="مدیریت کاربران، اختصاص نقش و مسدودسازی" />
      <Input placeholder="جستجو با نام، یوزرنیم یا شماره موبایل..." value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-md" />
      <div className="overflow-hidden rounded-xl bg-surface/70">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="p-4 text-right font-semibold">کاربر</th>
                <th className="p-4 text-right font-semibold">موبایل</th>
                <th className="p-4 text-right font-semibold">نقش‌ها</th>
                <th className="p-4 text-right font-semibold">وضعیت</th>
                <th className="p-4 text-right font-semibold">عضویت</th>
                <th className="p-4 text-left font-semibold">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} className="border-t border-line transition hover:bg-surface-2/50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.displayName} color={u.avatarColor} lastSeenAt={u.lastSeenAt} size={38} userId={u.id} avatarFileId={u.avatarFileId} />
                      <div>
                        <p className="font-bold">{u.displayName}</p>
                        <p className="text-xs text-muted" dir="ltr">@{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-mono text-xs text-muted" dir="ltr">{u.phone}</td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && <span className="text-xs text-muted">—</span>}
                      {u.roles.map((r) => (
                        <span key={r.id} className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: r.color + "26", color: r.color }}>
                          {r.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-4">
                    {u.isBanned ? (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-400">مسدود</span>
                    ) : isOnline(u.lastSeenAt) ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-400">آنلاین</span>
                    ) : (
                      <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-muted">آفلاین</span>
                    )}
                  </td>
                  <td className="p-4 text-xs text-muted">{new Date(u.createdAt).toLocaleDateString("fa-IR")}</td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      {me.permissions.includes("users.manage") && (
                        <Button
                          variant="soft"
                          className="!px-3 !py-1.5 text-xs"
                          onClick={() => { setPwTarget(u); setNewPassword(""); }}
                        >
                          <Icon name="key" size={13} /> رمز
                        </Button>
                      )}
                      {me.permissions.includes("users.manage") && (
                        <Button
                          variant="soft"
                          className="!px-3 !py-1.5 text-xs"
                          onClick={() => {
                            setEditing(u);
                            setRoleSel(u.roles.map((r) => r.id));
                          }}
                        >
                          <Icon name="shield" size={13} /> نقش‌ها
                        </Button>
                      )}
                      {me.permissions.includes("users.ban") && u.id !== me.id && (
                        <Button
                          variant={u.isBanned ? "ghost" : "danger"}
                          className="!px-3 !py-1.5 text-xs"
                          onClick={() => patch(u.id, { isBanned: !u.isBanned }, u.isBanned ? "کاربر رفع مسدودیت شد" : "کاربر مسدود شد")}
                        >
                          {u.isBanned ? "رفع مسدودی" : "مسدود"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users?.length === 0 && <Empty icon="search" title="کاربری پیدا نشد" />}
        {users === null && <p className="p-8 text-center text-sm text-muted">در حال بارگذاری...</p>}
      </div>

      <Modal open={!!pwTarget} onClose={() => setPwTarget(null)} title={`تغییر رمز ${pwTarget?.displayName || ""}`}>
        <div className="space-y-3">
          <Field label="رمز عبور جدید" hint="حداقل ۶ کاراکتر؛ بعد از ذخیره همهٔ نشست‌های این کاربر بسته می‌شود">
            <Input dir="ltr" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="مثال: V0xsy!2024" autoFocus />
          </Field>
          <Button variant="danger" className="w-full" disabled={pwBusy} onClick={() => void resetPassword()}>{pwBusy ? "در حال ذخیره…" : "ثبت رمز جدید"}</Button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`نقش‌های ${editing?.displayName || ""}`}>
        <div className="space-y-2">
          {roles.map((r) => {
            const on = roleSel.includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => setRoleSel((s) => (on ? s.filter((x) => x !== r.id) : [...s, r.id]))}
                className={`flex w-full items-center gap-3 rounded-lg bg-surface-2 p-3 text-right transition ${on ? "border-accent bg-accent/10" : "border-line hover:bg-surface-2"}`}
              >
                <span className="h-4 w-4 rounded-full" style={{ background: r.color }} />
                <div className="flex-1">
                  <p className="text-sm font-bold">{r.name}</p>
                  <p className="text-[11px] text-muted">{r.description || `${faNum(r.permissions.length)} دسترسی`}</p>
                </div>
                <span className={`flex h-6 w-6 items-center justify-center rounded-lg border ${on ? "border-accent bg-accent text-white" : "border-line"}`}>
                  {on && <Icon name="check" size={13} />}
                </span>
              </button>
            );
          })}
          <Button
            className="mt-3 w-full"
            onClick={async () => {
              if (!editing) return;
              await patch(editing.id, { roleIds: roleSel }, "نقش‌ها به‌روزرسانی شد");
              setEditing(null);
            }}
          >
            ذخیره
          </Button>
        </div>
      </Modal>
    </>
  );
}

function RolesTab({ canManage }) {
  const { confirm } = useConfirm();
  const [roles, setRoles] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch("/api/admin/roles");
      setRoles(d.roles);
      setCatalog(d.permissions);
    } catch (e) {
      toast(e.message, "error");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      const body = {
        name: editing.name,
        description: editing.description,
        color: editing.color,
        permissions: editing.permissions,
        isDefault: editing.isDefault,
        imageLimit: editing.imageLimit ?? 50,
        maxMeetingHours: editing.maxMeetingHours ?? 24,
      };
      if (editing.id) await apiFetch(`/api/admin/roles/${editing.id}`, { method: "PATCH", json: body });
      else await apiFetch("/api/admin/roles", { method: "POST", json: body });
      toast("نقش ذخیره شد", "success");
      setEditing(null);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r) {
    const ok = await confirm({ title: "حذف نقش", message: `نقش «${r.name}» حذف شود؟`, confirmLabel: "حذف نقش", variant: "danger", icon: "shield" });
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/roles/${r.id}`, { method: "DELETE" });
      toast("نقش حذف شد", "success");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  const groups = Array.from(new Set(catalog.map((p) => p.group)));

  return (
    <>
      <Title
        title="نقش‌ها و دسترسی‌ها"
        sub="نقش تعریف کنید، به آن مجوز بدهید و آن را به کاربران اختصاص دهید"
        action={
          canManage && (
            <Button onClick={() => setEditing({ name: "", description: "", color: "#8b5cf6", permissions: [], isDefault: false, imageLimit: 50, maxMeetingHours: 24 })}>
              + نقش جدید
            </Button>
          )
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles?.map((r, i) => (
          <div key={r.id} className="anim-fade-up flex flex-col rounded-xl bg-surface/70 p-5" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ background: r.color + "26", color: r.color }}>
                <Icon name="shield" size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-black" style={{ color: r.color }}>{r.name}</p>
                  {r.isSystem && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] text-muted">سیستمی</span>}
                  {r.isDefault && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-accent">پیش‌فرض</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted">{r.description || "بدون توضیح"}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted"><Icon name="image" size={12} /> سهمیهٔ تصویر: {r.imageLimit === 0 ? "نامحدود" : `${faNum(r.imageLimit)} عکس`}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted"><Icon name="clock" size={12} /> ماندگاری میت: {(r.maxMeetingHours ?? 24) === 0 ? "نامحدود" : `تا ${faNum(r.maxMeetingHours ?? 24)} ساعت`}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1">
              {r.permissions.slice(0, 6).map((p) => (
                <span key={p} className="rounded-lg bg-surface-2 px-2 py-1 text-[10px] text-muted">
                  {catalog.find((x) => x.key === p)?.label || p}
                </span>
              ))}
              {r.permissions.length > 6 && <span className="rounded-lg bg-surface-2 px-2 py-1 text-[10px] text-accent">+{faNum(r.permissions.length - 6)}</span>}
            </div>
            <div className="mt-auto flex items-center justify-between pt-4">
              <span className="flex items-center gap-1 text-xs text-muted">
                <Icon name="users" size={13} /> {faNum(r.userCount)} کاربر
              </span>
              {canManage && (
                <div className="flex gap-2">
                  <Button variant="soft" className="!px-3 !py-1.5 text-xs" onClick={() => setEditing({ ...r })}>
                    ویرایش
                  </Button>
                  {!r.isSystem && (
                    <Button variant="danger" className="!px-3 !py-1.5 text-xs" onClick={() => remove(r)}>
                      حذف
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "ویرایش نقش" : "نقش جدید"} wide>
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="نام نقش">
                <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={32} />
              </Field>
              <Field label="توضیحات">
                <Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} maxLength={120} />
              </Field>
            </div>
            <Field label="رنگ">
              <div className="flex flex-wrap gap-2">
                {ROLE_COLORS.map((c) => (
                  <button key={c} onClick={() => setEditing({ ...editing, color: c })} className={`h-8 w-8 rounded-xl ${editing.color === c ? "ring-2 ring-fg ring-offset-2 ring-offset-surface" : ""}`} style={{ background: c }} />
                ))}
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!editing.isDefault} onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              اختصاص خودکار به کاربران جدید
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="سهمیهٔ تصویر هر کاربر این نقش" hint="مجموع عکس‌های چت و پروفایل (۰ یعنی نامحدود).">
                <div className="flex items-center gap-3">
                  <Input type="number" min={0} max={100000} dir="ltr" className="max-w-36 text-left" value={editing.imageLimit ?? 50} onChange={(e) => setEditing({ ...editing, imageLimit: Math.max(0, Number(e.target.value) || 0) })} />
                  <span className="text-xs text-muted">{(editing.imageLimit ?? 50) === 0 ? "نامحدود" : `${faNum(editing.imageLimit ?? 50)} عکس`}</span>
                </div>
              </Field>
              <Field label="حداکثر زمان ماندگاری میت (ساعت)" hint="بعد از این مدت میت خودکار پایان می‌یابد (۰ یعنی نامحدود؛ پیش‌فرض کاربر عادی: ۲۴ ساعت).">
                <div className="flex items-center gap-3">
                  <Input type="number" min={0} max={8760} dir="ltr" className="max-w-36 text-left" value={editing.maxMeetingHours ?? 24} onChange={(e) => setEditing({ ...editing, maxMeetingHours: Math.min(8760, Math.max(0, Number(e.target.value) || 0)) })} />
                  <span className="text-xs text-muted">{(editing.maxMeetingHours ?? 24) === 0 ? "نامحدود" : `${faNum(editing.maxMeetingHours ?? 24)} ساعت`}</span>
                </div>
              </Field>
            </div>
            {groups.map((g) => {
              const perms = catalog.filter((p) => p.group === g);
              const all = perms.every((p) => editing.permissions?.includes(p.key));
              return (
                <div key={g} className="rounded-lg bg-surface-2 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-bold">دسترسی‌های {g}</p>
                    <button
                      className="text-xs text-accent"
                      onClick={() => {
                        const keys = perms.map((p) => p.key);
                        const cur = editing.permissions || [];
                        setEditing({ ...editing, permissions: all ? cur.filter((k) => !keys.includes(k)) : Array.from(new Set([...cur, ...keys])) });
                      }}
                    >
                      {all ? "حذف همه" : "انتخاب همه"}
                    </button>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {perms.map((p) => {
                      const on = editing.permissions?.includes(p.key);
                      return (
                        <button
                          key={p.key}
                          onClick={() => {
                            const cur = editing.permissions || [];
                            setEditing({ ...editing, permissions: on ? cur.filter((k) => k !== p.key) : [...cur, p.key] });
                          }}
                          className={`flex items-center gap-2 rounded-xl border p-2.5 text-right text-xs transition ${on ? "border-accent bg-accent/10" : "border-line hover:bg-surface-2"}`}
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? "border-accent bg-accent text-white" : "border-line"}`}>
                            {on && <Icon name="check" size={11} />}
                          </span>
                          <span className="flex-1">
                            <span className="block font-semibold">{p.label}</span>
                            <span className="block font-mono text-[10px] text-muted" dir="ltr">{p.key}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <Button onClick={save} disabled={busy || (editing.name || "").trim().length < 2} className="w-full py-3">
              ذخیره نقش
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}

function RoomsTab({ canManage }) {
  const { confirm } = useConfirm();
  const [rooms, setRooms] = useState(null);
  const load = useCallback(async () => {
    try {
      const d = await apiFetch("/api/admin/rooms");
      setRooms(d.rooms);
    } catch (e) {
      toast(e.message, "error");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function remove(r) {
    const ok = await confirm({ title: "حذف اتاق/گروه", message: `«${r.name}» با همه پیام‌هایش حذف شود؟`, confirmLabel: "حذف برای همه", variant: "danger", icon: "trash" });
    if (!ok) return;
    try {
      await apiFetch(`/api/conversations/${r.id}`, { method: "DELETE" });
      toast("حذف شد", "success");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <>
      <Title title="گروه‌ها و جلسه‌ها" sub="گروه‌های خصوصی (اتاق‌های عمومی جای خود را به جلسه‌ها داده‌اند)" />
      {rooms?.length === 0 && <Empty icon="landmark" title="هنوز اتاقی ساخته نشده" />}
      <div className="grid gap-3 md:grid-cols-2">
        {rooms?.map((r) => (
          <div key={r.id} className="flex items-center gap-4 rounded-xl bg-surface/70 p-4">
            <Avatar name={r.name} emoji={r.emoji} size={52} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-bold">{r.name}</p>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-accent">{r.type === "room" ? "اتاق قدیمی" : "خصوصی"}</span>
              </div>
              <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span className="flex items-center gap-1">
                  <Icon name="user" size={11} /> {faNum(r.members)}
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="chat" size={11} /> {faNum(r.messages)}
                </span>
                <span dir="ltr">@{r.ownerUsername || "—"}</span>
              </p>
            </div>
            {canManage && (
              <Button variant="danger" className="!px-3 !py-1.5 text-xs" onClick={() => remove(r)}>
                حذف
              </Button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── content & azan ───────────────────────── */

const CONTENT_KINDS = [
  { id: "verse", label: "آیه", icon: "book" },
  { id: "hadith", label: "حدیث", icon: "quote" },
];

function ContentTab({ me }) {
  const { confirm } = useConfirm();
  const canContent = me.permissions.includes("content.manage");
  const canAzan = me.permissions.includes("azan.manage");
  const [items, setItems] = useState(null);
  const [sounds, setSounds] = useState([]);
  const [kind, setKind] = useState("verse");
  const [filter, setFilter] = useState("all"); // all | verse | hadith
  const [fa, setFa] = useState("");
  const [ar, setAr] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(null);
  const previewRef = useRef(null);

  const load = useCallback(async () => {
    if (canContent) {
      try {
        const d = await apiFetch("/api/content");
        setItems(d.items);
      } catch (e) {
        toast(e.message, "error");
      }
    }
    if (canAzan) {
      try {
        const d = await apiFetch("/api/azan/sounds");
        setSounds(d.sounds);
      } catch {
        /* azan manage only */
      }
    }
  }, [canContent, canAzan]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => previewRef.current?.pause(), []);

  async function add() {
    if (fa.trim().length < 2) return;
    setBusy(true);
    try {
      await apiFetch("/api/content", { method: "POST", json: { kind, fa: fa.trim(), ar: ar.trim(), source: source.trim() } });
      toast(kind === "verse" ? "آیه اضافه شد" : "حدیث اضافه شد", "success");
      setFa("");
      setAr("");
      setSource("");
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item) {
    const ok = await confirm({ title: "حذف محتوا", message: `«${item.fa.slice(0, 40)}…» حذف شود؟`, confirmLabel: "حذف", variant: "danger", icon: "trash" });
    if (!ok) return;
    try {
      await apiFetch(`/api/content/${item.id}`, { method: "DELETE" });
      toast("حذف شد", "success");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function setDaily(item) {
    try {
      await apiFetch(`/api/content/${item.id}/daily`, { method: "POST" });
      toast("آیهٔ روز تعیین شد", "success");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function uploadSound(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      await apiFetch("/api/azan/sounds", { method: "POST", body: fd });
      toast("صدای اذان اضافه شد", "success");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function removeSound(sound) {
    const ok = await confirm({ title: "حذف صدای اذان", message: `«${sound.name}» حذف شود؟ کاربرانی که آن را انتخاب کرده‌اند باید صدای دیگری انتخاب کنند.`, confirmLabel: "حذف", variant: "danger", icon: "trash" });
    if (!ok) return;
    try {
      await apiFetch(`/api/azan/sounds/${sound.fileId}`, { method: "DELETE" });
      toast("حذف شد", "success");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function playSound(sound) {
    if (previewRef.current) {
      previewRef.current.pause();
      if (previewRef.current.__objectUrl) {
        URL.revokeObjectURL(previewRef.current.__objectUrl);
        previewRef.current.__objectUrl = null;
      }
      previewRef.current = null;
    }
    if (previewing === sound.fileId) {
      setPreviewing(null);
      return;
    }
    setPreviewing(sound.fileId);
    try {
      const audio = await playAzanAudio(sound.fileId, 85, previewRef);
      if (audio) audio.onended = () => setPreviewing(null);
    } catch {
      setPreviewing(null);
      toast("پخش ممکن نشد", "error");
    }
  }

  const dailyItem = items?.find((i) => i.isDaily);

  return (
    <>
      {canContent && (
        <>
          <Title title="آیات و احادیث" sub="بانک آیات و احادیث؛ از اینجا «آیهٔ روز» را تعیین می‌کنید" />
          <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-xl bg-surface/70 p-5">
              <p className="mb-3 font-bold">افزودن تازه</p>
              <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
                {CONTENT_KINDS.map((k) => (
                  <button key={k.id} onClick={() => setKind(k.id)} className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition ${kind === k.id ? "bg-surface-3 text-fg" : "text-muted"}`}>
                    <Icon name={k.icon} size={13} /> {k.label}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                <Field label="متن فارسی">
                  <textarea value={fa} onChange={(e) => setFa(e.target.value)} rows={2} maxLength={300} className="ring-glow w-full resize-none rounded-lg bg-surface-2 px-4 py-3 text-sm" />
                </Field>
                {kind === "verse" && (
                  <Field label="متن عربی">
                    <textarea value={ar} onChange={(e) => setAr(e.target.value)} rows={2} maxLength={500} dir="rtl" className="quran-text ring-glow w-full resize-none rounded-lg bg-surface-2 px-4 py-3 text-sm" />
                  </Field>
                )}
                <Field label="منبع (سوره و آیه / روایت‌کننده)">
                  <Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} />
                </Field>
                <Button onClick={() => void add()} disabled={busy || fa.trim().length < 2} className="w-full">افزودن</Button>
              </div>
            </div>

            <div className="rounded-xl bg-surface/70 p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-bold">فهرست ({items ? faNum(items.length) : "…"})</p>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
                  {[
                    ["all", "همه"],
                    ["verse", "آیه‌ها"],
                    ["hadith", "احادیث"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setFilter(id)}
                      aria-pressed={filter === id}
                      className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${filter === id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {dailyItem && (
                <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-amber-400/10 px-3 py-2 text-[11px] font-bold text-amber-300">
                  <Icon name="star" size={13} /> آیهٔ روز فعلی: {dailyItem.fa.slice(0, 50)}
                </p>
              )}
              <div className="scroll-thin max-h-[26rem] space-y-2 overflow-y-auto pe-1">
                {items === null ? (
                  <p className="p-4 text-center text-xs text-muted">در حال بارگذاری…</p>
                ) : items.length === 0 ? (
                  <Empty icon="book" title="چیزی ثبت نشده" />
                ) : items.filter((i) => filter === "all" || i.kind === filter).length === 0 ? (
                  <Empty icon={filter === "hadith" ? "quote" : "book"} title={filter === "hadith" ? "حدیثی ثبت نشده" : "آیه‌ای ثبت نشده"} />
                ) : (
                  items.filter((i) => filter === "all" || i.kind === filter).map((item) => (
                    <div key={item.id} className={`rounded-lg p-3 ${item.isDaily ? "bg-amber-400/10 ring-1 ring-amber-400/30" : "bg-surface-2"}`}>
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold ${item.kind === "verse" ? "bg-accent/15 text-accent" : "bg-accent-2/15 text-accent-2"}`}>
                          {item.kind === "verse" ? "آیه" : "حدیث"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold leading-6">{item.fa}</p>
                          {item.ar && <p className="quran-text mt-1 text-[13px] leading-7 text-fg/70">{item.ar}</p>}
                          {item.source && <p className="mt-1 text-[10px] text-muted">{item.source}</p>}
                        </div>
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        {!item.isDaily && (
                          <Button variant="soft" className="!px-3 !py-1.5 text-[11px]" onClick={() => void setDaily(item)}>
                            <Icon name="star" size={12} /> {item.kind === "verse" ? "آیهٔ روز" : "حدیث روز"}
                          </Button>
                        )}
                        {item.isDaily && (
                          <span className="flex items-center gap-1 rounded-xl bg-amber-400/15 px-3 py-1.5 text-[11px] font-bold text-amber-300">
                            <Icon name="star" size={12} /> {item.kind === "verse" ? "آیهٔ روز" : "حدیث روز"}
                          </span>
                        )}
                        <Button variant="danger" className="!px-3 !py-1.5 text-[11px]" onClick={() => void remove(item)}>
                          <Icon name="trash" size={12} /> حذف
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {canAzan && (
        <>
          <Title title="صداهای اذان" sub="فایل‌های صوتی اذان؛ کاربران از تنظیمات یکی را برای پخش انتخاب می‌کنند" />
          <div className="rounded-xl bg-surface/70 p-5">
            <label className="press mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg bg-accent/10 py-8 text-accent transition hover:bg-accent/15">
              <Icon name="upload" size={26} />
              <span className="text-sm font-bold">افزودن فایل صوتی اذان</span>
              <span className="text-[11px] text-muted">MP3، OGG، WAV یا AAC — حداکثر ۱۵ مگابایت</span>
              <input type="file" accept="audio/*" hidden onChange={(e) => { void uploadSound(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <div className="space-y-2">
              {sounds.length === 0 ? (
                <p className="rounded-lg bg-surface-2 p-6 text-center text-sm text-muted">هنوز صدای اذانی اضافه نشده است</p>
              ) : (
                sounds.map((s) => (
                  <div key={s.fileId} className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
                    <button onClick={() => playSound(s)} aria-label="پیش‌نمایش" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent hover:bg-accent/25">
                      <Icon name={previewing === s.fileId ? "pause" : "play"} size={16} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{s.name}</p>
                      <p className="text-[11px] text-muted">{formatSize(s.size || 0)}</p>
                    </div>
                    <Button variant="danger" className="!px-3 !py-1.5 text-xs" onClick={() => void removeSound(s)}>
                      <Icon name="trash" size={13} /> حذف
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
