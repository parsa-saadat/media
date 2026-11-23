import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, faNum, shortTime, toast } from "../../utils/client";
import { Avatar, Button, Empty, Field, Input } from "../common/Ui";
import { Icon } from "../common/Icon";
import { ContextMenu, useContextMenu } from "../common/ContextMenu";
import { StatusDot } from "../common/StatusDot";
import { useConfirm } from "../common/Confirm";

function PanelHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 px-3.5 pb-2.5 pt-3">
      <h2 className="text-base font-black tracking-tight text-fg">{title}</h2>
      {action}
    </div>
  );
}

function preview(c) {
  if (Array.isArray(c.typingUsers) && c.typingUsers.length > 0) {
    if (c.type === "direct") return "در حال نوشتن…";
    if (c.typingUsers.length === 1) return `${c.typingUsers[0].displayName} در حال نوشتن…`;
    return `${c.typingUsers[0].displayName} و ${faNum(c.typingUsers.length - 1)} نفر در حال نوشتن…`;
  }
  const l = c.lastMessage;
  if (!l) return c.description || "بدون پیام";
  if (l.type === "system") return l.content;
  if (l.type === "deleted") return "پیام حذف شد";
  if (l.type === "meeting") return "📞 دعوت به جلسه";
  if (l.type === "voice") return "🎙 پیام صوتی";
  const imgCount = Array.isArray(l.fileIds) ? l.fileIds.length : 0;
  const imgLabel = imgCount > 1 ? `🖼 ${faNum(imgCount)} تصویر` : "🖼 تصویر";
  const body =
    l.type === "image" ? imgLabel + (l.content ? ` · ${l.content}` : "") : l.type === "file" ? "📎 فایل" + (l.content ? ` · ${l.content}` : "") : l.content;
  if (c.type !== "direct" && c.type !== "saved" && l.senderName) return `${l.senderName}: ${body}`;
  return body;
}

const FILTERS = [
  { id: "all", label: "همه" },
  { id: "direct", label: "خصوصی" },
  { id: "group", label: "گروه‌ها" },
  { id: "saved", label: "ذخیره‌شده‌ها" },
];

export function ConversationList({
  convs,
  activeId,
  onOpen,
  onOpenSaved,
  onOpenProfile,
  onCreate,
  me,
}) {
  const { confirm } = useConfirm();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [plusOpen, setPlusOpen] = useState(false);
  const plusRef = useRef(null);

  useEffect(() => {
    if (!plusOpen) return;
    const onDown = (e) => {
      if (!plusRef.current?.contains(e.target)) setPlusOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setPlusOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [plusOpen]);

  const list = (convs || []).filter(
    (c) => (filter === "all" || c.type === filter) && (!q || c.name.toLowerCase().includes(q.toLowerCase()))
  );
  const counts = (t) => (convs || []).filter((c) => (t === "all" || c.type === t) && c.unread > 0).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="گفتگوها"
        action={
          <div className="relative" ref={plusRef}>
            <button
              onClick={() => setPlusOpen((v) => !v)}
              aria-expanded={plusOpen}
              aria-haspopup="menu"
              className="press flex h-9 w-9 items-center justify-center rounded-xl border border-accent/35 bg-accent/15 text-accent transition hover:bg-accent/25"
              aria-label="گفتگوی جدید"
            >
              <Icon name="plus" size={19} />
            </button>
            {plusOpen && (
              <div role="menu" className="popover-blur anim-surface-in absolute left-0 top-11 z-50 w-52 overflow-hidden rounded-xl border border-line p-1 shadow-2xl">
                {onOpenSaved && (
                  <button onClick={() => { setPlusOpen(false); onOpenSaved(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-3">
                    <Icon name="bookmark" size={16} className="text-accent" /> پیام‌های ذخیره‌شده
                  </button>
                )}
                {me.permissions.includes("groups.create") && (
                  <button onClick={() => { setPlusOpen(false); onCreate("group"); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-3">
                    <Icon name="users" size={17} className="text-accent-2" /> گروه خصوصی جدید
                  </button>
                )}
                {!me.permissions.includes("groups.create") && !onOpenSaved && (
                  <p className="px-3 py-2.5 text-xs text-muted">مجوز ساخت گروه ندارید</p>
                )}
              </div>
            )}
          </div>
        }
      />
      <div className="px-3 pt-2.5">
        <div className="relative">
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={15} />
          </span>
          <Input placeholder="جستجو در گفتگوها..." value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pr-9 text-xs" />
        </div>
        <div className="scroll-thin mt-2 flex gap-1 overflow-x-auto pb-1">
          {FILTERS.map((f) => {
            const n = counts(f.id);
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                  filter === f.id
                    ? "border-accent/45 bg-accent/16 text-accent shadow-sm"
                    : "border-transparent bg-surface-2/80 text-muted hover:bg-surface-2 hover:text-fg"
                }`}
              >
                {f.label}
                {n > 0 && <span className={`rounded px-1 text-[9.5px] ${filter === f.id ? "bg-accent/25 text-accent" : "bg-accent/20 text-accent"}`}>{faNum(n)}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="scroll-thin stagger mt-1.5 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {convs === null ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl p-2.5">
              <div className="shimmer-track h-11 w-11 shrink-0 rounded-xl border border-line/60 bg-surface-2/80" />
              <div className="flex-1 space-y-2">
                <div className="shimmer-track h-3 w-1/2 rounded-md bg-surface-2/80" />
                <div className="shimmer-track h-2.5 w-3/4 rounded-md bg-surface-2/65" />
              </div>
            </div>
          ))
        ) : list.length === 0 ? (
          <Empty
            icon="chat"
            title="هنوز گفتگویی باز نشده"
            text="یک گروه خصوصی بسازید یا از بخش دوستان گفتگوی جدیدی را آغاز کنید."
            action={
              me.permissions.includes("groups.create") && (
                <Button variant="soft" onClick={() => onCreate("group")} className="!px-3.5 !py-1.5 text-xs">
                  <Icon name="plus" size={14} /> ساخت گروه جدید
                </Button>
              )
            }
          />
        ) : (
          list.map((c, i) => (
            <button
              key={c.id}
              style={{ ["--i"]: Math.min(i, 12) }}
              onClick={() => onOpen(c.id)}
              onContextMenu={(event) => {
                const roleLabel = c.type === "saved" ? "فضای شخصی شما" : c.type === "direct" ? "گفتگوی خصوصی" : c.myRole === "owner" ? "شما مالک هستید" : c.myRole === "admin" ? "شما مدیر هستید" : c.type === "room" ? "اتاق عمومی" : "گروه خصوصی";
                const items = [
                  { type: "label", label: `${c.name} · ${roleLabel}` },
                  { type: "item", key: "open", label: "باز کردن گفتگو", icon: "chat", onClick: () => onOpen(c.id) },
                  ...(c.type === "direct" && c.peer && onOpenProfile
                    ? [{ type: "item", key: "profile", label: "مشاهده پروفایل", icon: "user", onClick: () => onOpenProfile(c.peer.id) }]
                    : []),
                  { type: "item", key: "copy", label: "کپی نام", icon: "copy", onClick: () => { void navigator.clipboard?.writeText(c.name).then(() => toast("نام کپی شد", "success")).catch(() => toast("کپی انجام نشد", "error")); } },
                ];
                if (c.type === "room" || c.type === "group") {
                  const place = c.type === "room" ? "اتاق" : "گروه";
                  items.push({ type: "divider" });
                  items.push({ type: "item", key: "leave", label: `ترک ${place}`, icon: "door", danger: true, onClick: () => void (async () => {
                    const ok = await confirm({ title: `ترک ${place}`, message: `«${c.name}» را ترک کنید؟`, confirmLabel: "ترک کن", variant: "danger", icon: "door" });
                    if (ok) await apiFetch(`/api/conversations/${c.id}/leave`, { method: "POST" }).then(() => toast("گفتگو را ترک کردید", "success")).catch((e) => toast(e.message, "error"));
                  })() });
                  if (c.myRole === "owner" || me.permissions.includes("rooms.manage")) {
                    items.push({ type: "divider" });
                    items.push({ type: "label", label: "اقدامات مدیر" });
                    items.push({ type: "item", key: "delete", label: `حذف ${place} برای همه`, icon: "trash", danger: true, onClick: () => void (async () => {
                      const ok = await confirm({ title: `حذف ${place} برای همه`, message: `«${c.name}» با همهٔ پیام‌هایش برای همهٔ اعضا حذف می‌شود. این کار برگشت‌پذیر نیست.`, confirmLabel: "حذف برای همه", variant: "danger", icon: "trash" });
                      if (ok) await apiFetch(`/api/conversations/${c.id}`, { method: "DELETE" }).then(() => toast(`${place} حذف شد`, "success")).catch((e) => toast(e.message, "error"));
                    })() });
                  }
                }
                openMenu(event, items);
              }}
              className={`no-glass-btn group press relative flex w-full items-center gap-2.5 rounded-xl border p-2 text-right transition ${
                activeId === c.id
                  ? "border-accent/35 bg-accent/14 shadow-sm"
                  : "border-transparent hover:border-line/70 hover:bg-surface-2/85"
              }`}
            >
              {activeId === c.id && <span className="grad-accent absolute right-0 top-2 bottom-2 w-1 rounded-full" />}
              {c.type === "saved" ? (
                <span className="grad-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-accent shadow-sm">
                  <Icon name="bookmark" size={18} />
                </span>
              ) : c.type === "direct" ? (
                <Avatar name={c.name} color={c.peer?.avatarColor} status={c.peer?.status} lastSeenAt={c.peer?.lastSeenAt} size={40} userId={c.peer?.id} avatarFileId={c.peer?.avatarFileId} />
              ) : (
                <Avatar name={c.name} emoji={c.emoji} size={40} />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1 text-[13px] font-bold text-fg">
                  {c.type === "saved" && <Icon name="bookmark" size={12} className="shrink-0 text-accent" />}
                  {c.type === "room" && <Icon name="hash" size={12} className="shrink-0 text-accent" />}
                  {c.type === "group" && <Icon name="lock" size={11} className="shrink-0 text-muted" />}
                  <span className="truncate">{c.name}</span>
                </p>
                <p
                  className={`mt-0.5 truncate text-[11.5px] ${
                    Array.isArray(c.typingUsers) && c.typingUsers.length > 0
                      ? "font-bold text-accent"
                      : "text-muted"
                  }`}
                  dir="auto"
                >
                  {preview(c)}
                </p>
              </div>
              <div className="flex w-11 shrink-0 flex-col items-end justify-between self-stretch py-0.5">
                <span className={`text-[9.5px] tabular-nums ${c.unread ? "font-bold text-accent" : "text-muted"}`}>
                  {c.lastMessage ? shortTime(c.lastMessage.createdAt) : ""}
                </span>
                <span
                  key={c.unread > 0 ? `b-${c.unread}` : "b-0"}
                  className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9.5px] font-black transition-opacity ${
                    c.unread > 0 ? "grad-accent anim-badge text-on-accent opacity-100" : "opacity-0"
                  }`}
                  aria-hidden={c.unread === 0}
                >
                  {c.unread > 0 ? faNum(c.unread > 99 ? 99 : c.unread) : "0"}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
      <ContextMenu state={menu} onClose={closeMenu} />
    </div>
  );
}

/* ───────────────────────── meetings ───────────────────────── */

export function MeetingsPanel({ me, onOpenMeeting }) {
  const { confirm } = useConfirm();
  const [items, setItems] = useState(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const roleHours = typeof me.maxMeetingHours === "number" ? me.maxMeetingHours : 24;
  const [lobby, setLobby] = useState(false);
  const [busy, setBusy] = useState(false);
  const canCreate = me.permissions.includes("meetings.create");
  const defaultMeetingTitle = `جلسهٔ ${me.displayName}`;

  const load = useCallback(async () => {
    try {
      const d = await apiFetch("/api/meetings");
      setItems(d.meetings);
    } catch (e) {
      toast(e.message, "error");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const d = await apiFetch("/api/meetings", {
        method: "POST",
        json: {
          title: title.trim(),
          lobby,
          allowNames: true,
        },
      });
      toast("جلسه ساخته شد — لینک را کپی کنید", "success");
      setTitle("");
      setCreating(false);
      await load();
      onOpenMeeting(d.meeting.token);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(token) {
    const url = `${window.location.origin}/meet/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("لینک جلسه کپی شد", "success");
    } catch {
      toast(url, "info");
    }
  }

  async function remove(item) {
    const ok = await confirm({ title: "پایان جلسه؟", message: `«${item.title}» برای همه پایان می‌یابد و لینک آن غیرفعال می‌شود.`, confirmLabel: "پایان جلسه", variant: "danger", icon: "phone-off" });
    if (!ok) return;
    try {
      await apiFetch(`/api/meetings/${item.token}/end`, { method: "POST" });
      toast("جلسه پایان یافت", "success");
      await load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="جلسه‌ها (میت)"
        action={canCreate && (
          <Button variant="soft" onClick={() => setCreating((v) => !v)} className="!px-3 !py-2 text-xs">
            <Icon name={creating ? "close" : "plus"} size={14} /> جلسهٔ جدید
          </Button>
        )}
      />

      {creating && (
        <div className="anim-rise mx-3 mt-2 mb-2 space-y-2.5 rounded-2xl border border-accent/30 bg-surface/75 p-3.5 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between text-[11px] font-bold text-muted">
            <span className="flex items-center gap-1.5 text-fg">
              <Icon name="radio" size={14} className="text-accent" />
              ساخت اتاق میت
            </span>
            <span className="rounded-md border border-line bg-surface-2/80 px-2 py-0.5 text-[10px] text-accent">
              {roleHours === 0 ? "نامحدود" : `${faNum(roleHours)} ساعت`}
            </span>
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            placeholder={`عنوان جلسه (${defaultMeetingTitle})`}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) void create(); }}
            className="h-9 text-xs"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-2/70 px-2.5 py-2 text-xs font-bold text-fg transition hover:border-accent/40">
              <input type="checkbox" checked={lobby} onChange={(e) => setLobby(e.target.checked)} />
              <span>لابی تأیید میزبان</span>
            </label>
            <Button onClick={() => void create()} disabled={busy} className="flex-1 !py-2 text-xs">
              <Icon name="video" size={15} />
              {busy ? "در حال ساخت…" : "ساخت و ورود"}
            </Button>
          </div>
        </div>
      )}

      <div className="scroll-thin stagger mt-2.5 min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {items === null ? (
          <p className="p-6 text-center text-sm text-muted">در حال بارگذاری…</p>
        ) : items.length === 0 ? (
          <Empty
            icon="radio"
            title="هیچ میت فعالی ندارید"
            text="یک اتاق جلسه بسازید و لینک آن را برای هر کسی بفرستید — حتی بدون ثبت‌نام."
            action={
              canCreate && !creating && (
                <Button variant="soft" onClick={() => setCreating(true)} className="!px-3.5 !py-1.5 text-xs">
                  <Icon name="plus" size={14} /> ساخت اولین جلسه
                </Button>
              )
            }
          />
        ) : (
          items.map((m, i) => (
            <div key={m.id} style={{ ["--i"]: Math.min(i, 10) }} className="lift rounded-2xl border border-line bg-surface/72 p-3.5 backdrop-blur-xl hover:bg-surface-2/85">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent"><Icon name="radio" size={19} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{m.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    <span className="flex items-center gap-1"><Icon name="users" size={11} /> {faNum(m.inside)} آنلاین</span>
                    {m.lobby && <span className="flex items-center gap-1 text-amber-400"><Icon name="clock" size={11} /> لابی</span>}
                    <span className="rounded-md bg-surface-3/80 px-1.5 py-0.5 text-[10px]">
                      {m.expiresAt ? `${faNum(Math.max(1, Math.ceil((new Date(m.expiresAt).getTime() - Date.now()) / 3_600_000)))} ساعت` : "نامحدود"}
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenMeeting(m.token)}
                  className="press flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-accent/45 bg-accent/20 py-2 text-xs font-black text-accent backdrop-blur-md transition hover:border-accent hover:bg-accent/30"
                >
                  <Icon name="video" size={14} /> ورود به میت
                </button>
                <button
                  type="button"
                  onClick={() => void copyLink(m.token)}
                  title="کپی لینک دعوت"
                  className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2/80 text-muted backdrop-blur-md transition hover:border-accent/40 hover:text-accent"
                >
                  <Icon name="link" size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(m)}
                  title="پایان میت برای همه"
                  className="press flex items-center gap-1 rounded-xl border border-rose-400/35 bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-300 backdrop-blur-md transition hover:border-rose-400 hover:bg-rose-500/25"
                >
                  <Icon name="phone-off" size={14} /> پایان
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── my groups (private) ───────────────────────── */

export function GroupsPanel({ me, onOpen, onCreate }) {
  const [groups, setGroups] = useState(null);
  const [q, setQ] = useState("");

  const load = useCallback(async (query) => {
    try {
      const d = await apiFetch(`/api/rooms?q=${encodeURIComponent(query)}`);
      setGroups(d.rooms);
    } catch (e) {
      toast(e.message, "error");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="گروه‌های من"
        action={me.permissions.includes("groups.create") && (
          <Button variant="soft" onClick={onCreate} className="!px-3 !py-2 text-xs"><Icon name="plus" size={14} /> گروه جدید</Button>
        )}
      />
      <div className="px-3 pt-2.5">
        <div className="relative">
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={16} />
          </span>
          <Input placeholder="جستجو در گروه‌های خودم…" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 pr-10 text-xs" />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><Icon name="lock" size={12} /> گروه‌ها خصوصی‌اند؛ فقط اعضای هر گروه آن را می‌بینند.</p>
      </div>
      <div className="scroll-thin stagger mt-2 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {groups === null ? (
          <p className="p-6 text-center text-sm text-muted">در حال بارگذاری…</p>
        ) : groups.length === 0 ? (
          <Empty
            icon="users"
            title={q ? "گروهی با این نام پیدا نشد" : "هنوز عضو گروهی نیستید"}
            text={q ? "عبارت دیگری را امتحان کنید." : "اولین گروه خصوصی خود را بسازید و دوستانتان را اضافه کنید."}
            action={
              !q && me.permissions.includes("groups.create") && (
                <Button variant="soft" onClick={onCreate} className="!px-3.5 !py-1.5 text-xs">
                  <Icon name="plus" size={14} /> ساخت گروه خصوصی
                </Button>
              )
            }
          />
        ) : (
          groups.map((g, i) => (
            <button key={g.id} style={{ ["--i"]: Math.min(i, 10) }} onClick={() => onOpen(g.id)} className="press flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-3.5 text-right hover:bg-surface-2">
              <Avatar name={g.name} emoji={g.emoji} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{g.name}</span>
                <span className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="flex items-center gap-1"><Icon name="user" size={11} /> {faNum(g.members)}</span>
                  <span className="flex items-center gap-1"><Icon name="chat" size={11} /> {faNum(g.messages)}</span>
                </span>
                {g.description && <span className="mt-0.5 block truncate text-[11px] text-muted">{g.description}</span>}
              </span>
              <Icon name="arrow-left" size={15} className="shrink-0 text-muted" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── friends ───────────────────────── */

export function FriendsPanel({ data, reload, onMessage, onProfile, me }) {
  const { confirm } = useConfirm();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const [tab, setTab] = useState("all");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const canRequest = me.permissions.includes("friends.request");

  // live search by @username while typing
  useEffect(() => {
    const q = username.trim().replace(/^@/, "");
    if (q.length < 2) { setResults(null); return; }
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.users))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [username]);

  async function send(to) {
    const target = (to ?? username).trim().replace(/^@/, "");
    if (!target) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/friends", { method: "POST", json: { username: target } });
      toast(r.accepted ? "درخواست متقابل پذیرفته شد؛ اکنون دوست هستید" : "درخواست دوستی ارسال شد", "success");
      setUsername("");
      setResults(null);
      reload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function respond(id, action) {
    try {
      await apiFetch(`/api/friends/${id}`, { method: "PATCH", json: { action } });
      toast(action === "accept" ? "درخواست پذیرفته شد" : "درخواست رد شد", action === "accept" ? "success" : "info");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function remove(id, name) {
    const ok = await confirm({ title: `حذف ${name} از دوستان؟`, message: "این کار قابل بازگشت نیست؛ برای دوستی دوباره باید درخواست جدید بفرستید.", confirmLabel: "حذف کن", variant: "danger", icon: "trash" });
    if (!ok) return;
    try {
      await apiFetch(`/api/friends/${id}`, { method: "DELETE" });
      toast(`${name} از دوستان حذف شد`, "info");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function blockFriend(userId, name) {
    const ok = await confirm({ title: `مسدود کردن ${name}؟`, message: "پیام، تماس خصوصی و دوستی با این کاربر قطع می‌شود.", confirmLabel: "مسدود کن", variant: "danger", icon: "ban" });
    if (!ok) return;
    try {
      await apiFetch("/api/blocks", { method: "POST", json: { userId } });
      toast("کاربر مسدود شد", "success");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function cancel(id) {
    try {
      await apiFetch(`/api/friends/${id}`, { method: "DELETE" });
      toast("درخواست لغو شد", "info");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  function copyMyUsername() {
    void navigator.clipboard
      ?.writeText(`@${me.username}`)
      .then(() => toast("نام کاربری شما کپی شد", "success"))
      .catch(() => toast(`@${me.username}`, "info"));
  }

  const friends = data?.friends ?? [];
  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];
  const tabs = [
    { id: "all", label: "دوستان", count: friends.length },
    { id: "requests", label: "درخواست‌ها", count: incoming.length },
    { id: "sent", label: "ارسال‌شده", count: outgoing.length },
  ];

  const menuFor = (f) => [
    { type: "label", label: `${f.user.displayName} (@${f.user.username})` },
    { type: "item", key: "msg", label: "ارسال پیام خصوصی", icon: "chat", onClick: () => onMessage(f.user.id) },
    { type: "item", key: "profile", label: "مشاهده پروفایل", icon: "user", onClick: () => onProfile(f.user.id) },
    { type: "item", key: "copy", label: "کپی نام کاربری", icon: "copy", onClick: () => { void navigator.clipboard?.writeText(`@${f.user.username}`).then(() => toast("کپی شد", "success")).catch(() => toast("کپی انجام نشد", "error")); } },
    { type: "divider" },
    { type: "item", key: "remove", label: "حذف از فهرست دوستان", icon: "trash", danger: true, onClick: () => void remove(f.id, f.user.displayName) },
    { type: "item", key: "block", label: "مسدود کردن کاربر", icon: "ban", danger: true, onClick: () => void blockFriend(f.user.id, f.user.displayName) },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="دوستان" />

      {/* Redesigned Add Friend Card — harmonious with inebuly theme & left-pointing arrow */}
      <div className="px-3 pt-2.5">
        <div className="relative overflow-hidden rounded-xl border border-line bg-gradient-to-br from-accent/12 via-surface-2/80 to-surface-2 p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Icon name="users" size={16} />
              </span>
              <div>
                <p className="text-xs font-black text-fg">افزودن دوست جدید</p>
                <p className="text-[10px] text-muted">با وارد کردن نام کاربری درخواست بدهید</p>
              </div>
            </div>
            <button
              type="button"
              onClick={copyMyUsername}
              title="کپی نام کاربری من"
              className="press flex items-center gap-1 rounded-md border border-line bg-surface/70 px-2 py-1 text-[10px] font-bold text-accent hover:bg-surface"
            >
              <span dir="ltr">@{me.username}</span>
              <Icon name="copy" size={11} />
            </button>
          </div>

          <div className="mt-3 flex items-stretch gap-2">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-accent">@</span>
              <input
                dir="ltr"
                placeholder="username"
                value={username}
                disabled={!canRequest}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (results?.length === 1) void send(results[0].username);
                    else if (username.trim()) void send(username);
                  }
                }}
                className="ring-glow h-10 w-full rounded-lg border border-line bg-surface/90 pl-7 pr-8 text-left text-xs font-semibold text-fg"
              />
              {username && (
                <button
                  type="button"
                  onClick={() => { setUsername(""); setResults(null); }}
                  aria-label="پاک کردن"
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-fg"
                >
                  <Icon name="close" size={13} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !canRequest || !username.trim()}
              title="ارسال درخواست دوستی"
              className="press flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-accent/50 bg-accent/22 px-3.5 text-xs font-black text-accent backdrop-blur-md transition hover:border-accent hover:bg-accent/32 disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-3/85 disabled:text-muted disabled:opacity-75"
            >
              <span>افزودن</span>
              {busy ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/40 border-t-accent" />
              ) : (
                <Icon name="user-plus" size={15} />
              )}
            </button>
          </div>

          {username.trim().length >= 2 && (
            <div className="mt-2.5 space-y-1.5 border-t border-line/70 pt-2.5">
              {searching ? (
                <p className="flex items-center gap-2 px-1 text-[11px] text-muted">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                  در حال جستجوی کاربران…
                </p>
              ) : !results?.length ? (
                <p className="px-1 text-[11px] text-muted">کاربری با این نام کاربری پیدا نشد.</p>
              ) : (
                results.map((u) => {
                  const isAlreadyFriend = friends.some((f) => f.user.id === u.id);
                  const isPendingOut = outgoing.some((f) => f.user.id === u.id);
                  return (
                    <div key={u.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface/85 p-2 transition hover:bg-surface">
                      <button type="button" onClick={() => onProfile(u.id)} aria-label={`پروفایل ${u.displayName}`} className="shrink-0">
                        <Avatar name={u.displayName} color={u.avatarColor} size={34} userId={u.id} avatarFileId={u.avatarFileId} />
                      </button>
                      <button type="button" onClick={() => onProfile(u.id)} className="min-w-0 flex-1 text-right">
                        <span className="block truncate text-xs font-bold text-fg">{u.displayName}</span>
                        <span className="block truncate text-[10px] text-muted" dir="ltr">@{u.username}</span>
                      </button>
                      {isAlreadyFriend ? (
                        <button
                          type="button"
                          onClick={() => onMessage(u.id)}
                          className="press flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-bold text-emerald-400"
                        >
                          گفتگو <Icon name="arrow-left" size={12} />
                        </button>
                      ) : isPendingOut ? (
                        <span className="rounded-md bg-surface-3 px-2.5 py-1.5 text-[10px] font-semibold text-muted">ارسال‌شده</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void send(u.username)}
                          disabled={busy || !canRequest}
                          className="press flex items-center gap-1 rounded-xl border border-accent/40 bg-accent/16 px-2.5 py-1.5 text-[11px] font-bold text-accent backdrop-blur-md hover:bg-accent/26 disabled:opacity-50"
                        >
                          <Icon name="user-plus" size={13} /> درخواست
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2/80 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`no-glass-btn relative flex min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition ${
                tab === t.id ? "border-accent/40 bg-accent/15 text-accent" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              <span className="truncate">{t.label}</span>
              {t.count > 0 && <span className={`shrink-0 rounded-md px-1 text-[9.5px] ${tab === t.id ? "bg-accent/25 text-accent" : "bg-surface-3 text-muted"}`}>{faNum(t.count)}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-thin stagger mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {tab === "all" && (friends.length === 0 ? (
          <Empty icon="users" title="هنوز دوستی ندارید" text="با نام کاربری دوستانتان را پیدا کنید و درخواست بفرستید." />
        ) : (
          friends.map((f, i) => (
            <div
              key={f.id}
              style={{ ["--i"]: Math.min(i, 12) }}
              onContextMenu={(e) => openMenu(e, menuFor(f))}
              className="group relative flex items-center gap-3 rounded-xl border border-transparent p-2.5 transition hover:border-line hover:bg-surface-2"
            >
              <button type="button" onClick={() => onProfile(f.user.id)} aria-label={`پروفایل ${f.user.displayName}`} className="shrink-0">
                <Avatar name={f.user.displayName} color={f.user.avatarColor} size={44} userId={f.user.id} avatarFileId={f.user.avatarFileId} status={f.user.status} />
              </button>
              <button
                type="button"
                onClick={() => onMessage(f.user.id)}
                className="min-w-0 flex-1 text-right focus:outline-none"
              >
                <span className="flex items-center gap-1.5 truncate text-sm font-bold text-fg">
                  <span className="truncate">{f.user.displayName}</span>
                  <StatusDot status={f.user.status} size={8} />
                </span>
                {f.user.statusText ? (
                  <span className="block truncate text-[11px] text-muted">{f.user.statusEmoji} {f.user.statusText}</span>
                ) : (
                  <span className="block truncate text-[11px] text-muted" dir="ltr">@{f.user.username}</span>
                )}
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onMessage(f.user.id); }}
                  aria-label="پیام خصوصی"
                  title="پیام خصوصی"
                  className="press flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent hover:bg-accent/25"
                >
                  <Icon name="chat" size={15} />
                </button>
                <button
                  type="button"
                  onClick={(e) => openMenu(e, menuFor(f))}
                  aria-label="گزینه‌های دوست"
                  title="گزینه‌ها"
                  className="press flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-fg"
                >
                  <Icon name="more-horizontal" size={16} />
                </button>
              </div>
            </div>
          ))
        ))}

        {tab === "requests" && (incoming.length === 0 ? (
          <Empty icon="bell" title="درخواستی ندارید" text="وقتی کسی با نام کاربری شما را پیدا کند، درخواستش اینجا می‌آید." />
        ) : (
          incoming.map((f, i) => (
            <div key={f.id} style={{ ["--i"]: Math.min(i, 12) }} className="anim-rise rounded-xl border border-accent/25 bg-accent/8 p-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => onProfile(f.user.id)} aria-label={`پروفایل ${f.user.displayName}`}><Avatar name={f.user.displayName} color={f.user.avatarColor} size={44} userId={f.user.id} avatarFileId={f.user.avatarFileId} /></button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{f.user.displayName}</p>
                  <p className="truncate text-[11px] text-muted" dir="ltr">@{f.user.username}</p>
                  <p className="truncate text-[10px] text-muted/80">{shortTime(f.createdAt)}</p>
                </div>
              </div>
              {f.user.bio && <p className="mt-2 line-clamp-2 rounded-lg bg-surface-2/60 p-2 text-[11px] leading-5 text-muted">{f.user.bio}</p>}
              <div className="mt-2.5 flex gap-2">
                <Button onClick={() => void respond(f.id, "accept")} className="flex-1 !py-2 text-xs"><Icon name="check" size={14} /> پذیرفتن</Button>
                <Button variant="ghost" onClick={() => void respond(f.id, "reject")} className="flex-1 !py-2 text-xs"><Icon name="close" size={14} /> رد کردن</Button>
              </div>
            </div>
          ))
        ))}

        {tab === "sent" && (outgoing.length === 0 ? (
          <Empty icon="send" title="درخواست در انتظاری ندارید" text="درخواست‌های ارسال‌شده تا پاسخ گرفتن اینجا می‌مانند." />
        ) : (
          outgoing.map((f, i) => (
            <div key={f.id} style={{ ["--i"]: Math.min(i, 12) }} className="flex items-center gap-3 rounded-xl border border-transparent p-2.5 hover:border-line hover:bg-surface-2">
              <button type="button" onClick={() => onProfile(f.user.id)} className="shrink-0">
                <Avatar name={f.user.displayName} color={f.user.avatarColor} size={42} userId={f.user.id} avatarFileId={f.user.avatarFileId} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{f.user.displayName}</p>
                <p className="flex items-center gap-1 truncate text-[11px] text-muted"><Icon name="clock" size={11} /> در انتظار پاسخ · {shortTime(f.createdAt)}</p>
              </div>
              <button type="button" onClick={() => void cancel(f.id)} className="press rounded-lg bg-surface-3 px-3 py-1.5 text-[11px] font-semibold text-muted hover:text-rose-400">لغو</button>
            </div>
          ))
        ))}
      </div>
      <ContextMenu state={menu} onClose={closeMenu} />
    </div>
  );
}
