import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, faNum, toast } from "../utils/client";
import { navigate } from "../utils/router";
import { useSession } from "../utils/session";
import ChatView from "../components/chat/ChatView";
import ChatWallpaperBackdrop from "../components/chat/ChatWallpaperBackdrop";
import { ConversationList, FriendsPanel, GroupsPanel, MeetingsPanel } from "../components/chat/Panels";
import Notifications from "../components/common/Notifications";
import UserProfileModal from "../components/profile/UserProfileModal";
import { CreateModal, SettingsModal } from "../components/common/Modals";
import { Avatar } from "../components/common/Ui";
import ProfileModal from "../components/profile/ProfileModal";
import { toPresence } from "../components/common/StatusDot";
import { Icon } from "../components/common/Icon";
import WelcomePopup from "../components/common/WelcomePopup";
import { ContextMenu, useContextMenu } from "../components/common/ContextMenu";
import { useConfirm } from "../components/common/Confirm";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { playSound } from "../utils/sounds";

function useRailTooltip(label) {
  const btnRef = useRef(null);
  const [tip, setTip] = useState(null);

  const show = useCallback(() => {
    const el = btnRef.current;
    if (!el || typeof window === "undefined" || window.innerWidth < 768) return;
    const rect = el.getBoundingClientRect();
    setTip({
      right: Math.max(8, window.innerWidth - rect.left + 10),
      top: rect.top + rect.height / 2,
    });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  useEffect(() => {
    if (!tip) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [tip, hide]);

  const portal =
    tip && typeof document !== "undefined"
      ? createPortal(
          <span
            dir="rtl"
            style={{ right: tip.right, top: tip.top }}
            className="popover-blur pointer-events-none fixed z-[150] -translate-y-1/2 whitespace-nowrap rounded-xl border border-line px-3 py-1.5 text-[11.5px] font-extrabold text-fg shadow-2xl"
          >
            {label}
          </span>,
          document.body,
        )
      : null;

  return { btnRef, show, hide, portal };
}

function RailButton({
  active,
  onClick,
  label,
  badge,
  children,
}) {
  const { btnRef, show, hide, portal } = useRailTooltip(label);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          hide();
          onClick?.();
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label={label}
        className={`press relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${
          active
            ? "border-accent/45 bg-accent/18 text-accent shadow-[0_4px_16px_rgb(var(--glow)/0.18)]"
            : "border-transparent text-muted hover:bg-surface-2 hover:text-fg"
        }`}
      >
        {children}
        {!!badge && (
          <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9.5px] font-black text-white ring-2 ring-surface">
            {faNum(badge > 99 ? 99 : badge)}
          </span>
        )}
      </button>
      {portal}
    </>
  );
}

function RailProfileButton({ me, onClick, onContextMenu }) {
  const { btnRef, show, hide, portal } = useRailTooltip("پروفایل من");
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          hide();
          onClick();
        }}
        onContextMenu={(e) => {
          hide();
          onContextMenu(e);
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label="پروفایل من"
        className="press relative mt-1"
      >
        <Avatar name={me.displayName} color={me.avatarColor} size={42} userId={me.id} avatarFileId={me.avatarFileId} status={toPresence(me.status)} />
      </button>
      {portal}
    </>
  );
}

export default function Chat() {
  const session = useSession();
  const me = session.user;
  const [tab, setTab] = useState("chats");
  const [convs, setConvs] = useState(null);
  const [friends, setFriends] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [createOpen, setCreateOpen] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [viewProfileId, setViewProfileId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { confirm } = useConfirm();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const { canInstall, isIos, promptInstall } = usePwaInstall();
  const [daily, setDaily] = useState(null);

  const handleInstallApp = useCallback(async () => {
    const res = await promptInstall();
    if (res.outcome === "accepted") {
      toast("نصب برنامه آغاز شد", "success");
    } else if (res.outcome === "ios-manual") {
      toast("در Safari روی دکمهٔ Share و سپس Add to Home Screen بزنید", "info");
    }
  }, [promptInstall]);
  // desktop: draggable sidebar width (raised min width so conversation/meeting/friend cards never crush text)
  const MIN_LIST = 296;
  const MAX_LIST = 540;
  const DEFAULT_LIST = 324;
  const [listWidth, setListWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_LIST;
    try { return Math.min(MAX_LIST, Math.max(MIN_LIST, Number(localStorage.getItem("voxsy-list-width")) || DEFAULT_LIST)); } catch { return DEFAULT_LIST; }
  });
  const dragRef = useRef(null);
  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia("(max-width: 767px)").matches);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const listWidthRef = useRef(listWidth);
  listWidthRef.current = listWidth;

  const clampList = (n) => Math.min(MAX_LIST, Math.max(MIN_LIST, Math.round(n)));
  const saveListWidth = (n) => {
    try { localStorage.setItem("voxsy-list-width", String(n)); } catch {}
  };

  const startResize = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = listWidthRef.current;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev) => {
      // The list sits on the RIGHT edge (RTL). Its left edge is the handle, so moving the pointer
      // LEFT makes the list wider and moving RIGHT makes it narrower.
      setListWidth(clampList(startW + (startX - ev.clientX)));
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      saveListWidth(listWidthRef.current);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }, []);

  /** Keyboard access for the separator: arrows resize in 20px steps, Home/End jump to the limits. */
  const keyResize = useCallback((e) => {
    const step = e.shiftKey ? 60 : 20;
    let next = null;
    if (e.key === "ArrowLeft") next = listWidthRef.current + step;   // left = wider (RTL)
    if (e.key === "ArrowRight") next = listWidthRef.current - step;  // right = narrower
    if (e.key === "Home") next = MIN_LIST;
    if (e.key === "End") next = MAX_LIST;
    if (next === null) return;
    e.preventDefault();
    const clamped = clampList(next);
    setListWidth(clamped);
    saveListWidth(clamped);
  }, []);

  const resetListWidth = useCallback(() => {
    setListWidth(DEFAULT_LIST);
    saveListWidth(DEFAULT_LIST);
  }, []);

  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const knownLastMsgRef = useRef(new Map());
  const convBootstrappedRef = useRef(false);

  const openConversation = useCallback((id) => {
    setActiveId(id);
    setTab("chats");
  }, []);

  // Support deep-linking via `/?chat=123` (e.g. from notification clicks)
  useEffect(() => {
    const syncFromUrl = () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const chatParam = Number(params.get("chat"));
      if (Number.isFinite(chatParam) && chatParam > 0) {
        setActiveId(chatParam);
        setTab("chats");
        window.history.replaceState({}, "", window.location.pathname);
      }
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const loadConvs = useCallback(async () => {
    try {
      const d = await apiFetch("/api/conversations");
      const list = d.conversations || [];

      if (convBootstrappedRef.current) {
        for (const c of list) {
          const lm = c.lastMessage;
          if (!lm?.id) continue;
          const prevId = knownLastMsgRef.current.get(c.id);
          if (prevId !== undefined && lm.id > prevId) {
            const isFromOther = lm.senderId && lm.senderId !== me.id;
            const isViewingNow =
              activeIdRef.current === c.id &&
              typeof document !== "undefined" &&
              document.visibilityState === "visible";
            if (isFromOther && !isViewingNow && c.type !== "saved") {
              playSound("message");
              const preview =
                lm.type === "voice"
                  ? "🎤 پیام صوتی"
                  : lm.type === "image"
                    ? "🖼️ تصویر"
                    : lm.type === "video"
                      ? "🎬 ویدیو"
                      : lm.type === "file"
                        ? "📎 فایل پیوست"
                        : lm.type === "album"
                          ? "🖼️ آلبوم رسانه"
                          : lm.content || "پیام جدید";
              const senderName = lm.senderName || c.peer?.displayName || c.name;
              const title = c.type === "group" ? `${senderName} در «${c.name}»` : senderName;
              toast({
                kind: "incoming-message",
                title,
                body: preview,
                senderId: lm.senderId || c.peer?.id,
                senderName,
                avatarColor: lm.senderColor || c.peer?.avatarColor || "#7c3aed",
                avatarFileId: lm.senderAvatarFileId || c.peer?.avatarFileId || null,
                onClick: () => {
                  setActiveId(c.id);
                  setTab("chats");
                },
              });
            }
          }
        }
      }
      for (const c of list) {
        knownLastMsgRef.current.set(c.id, c.lastMessage?.id ?? 0);
      }
      convBootstrappedRef.current = true;
      setConvs(list);
    } catch {
      /* an expired session is handled once, globally, by the session provider */
    }
  }, [me.id]);

  const loadFriends = useCallback(async () => {
    try {
      setFriends(await apiFetch("/api/friends"));
    } catch {}
  }, []);

  const reloadMe = session.refresh;

  // the daily verse/hadith the admin picked — shown on the empty-chat welcome
  useEffect(() => {
    apiFetch("/api/content/daily").then((d) => setDaily(d.daily)).catch(() => setDaily(null));
  }, []);

  useEffect(() => {
    loadConvs();
    loadFriends();
    const a = setInterval(loadConvs, 3000);
    const b = setInterval(loadFriends, 8000);
    const c = setInterval(() => reloadMe().catch(() => {}), 30000);
    return () => {
      clearInterval(a);
      clearInterval(b);
      clearInterval(c);
    };
  }, [loadConvs, loadFriends, reloadMe]);

  // update tab title with unread count and active section
  const totalUnread = (convs || []).reduce((s, c) => s + c.unread, 0);
  const activeConv = (convs || []).find((c) => c.id === activeId);
  useEffect(() => {
    const tabLabels = {
      chats: activeConv ? activeConv.name : "گفتگوها",
      groups: "گروه‌های من",
      meetings: "جلسه‌ها (میت)",
      friends: "دوستان",
    };
    const section = tabLabels[tab] || "گفتگوها";
    const prefix = totalUnread ? `(${totalUnread}) ` : "";
    document.title = `${prefix}${section} — inebuly`;
  }, [totalUnread, tab, activeConv]);

  const openConversationWithRefresh = useCallback(
    (id) => {
      openConversation(id);
      void loadConvs();
    },
    [openConversation, loadConvs]
  );

  const openMeeting = useCallback((token) => navigate(`/meet/${token}`), []);

  const openDirect = useCallback(
    async (opts) => {
      try {
        const d = await apiFetch("/api/direct", { method: "POST", json: opts });
        openConversationWithRefresh(d.conversationId);
      } catch (e) {
        toast(e.message, "error");
      }
    },
    [openConversationWithRefresh]
  );

  const logout = session.logout;

  const canAdmin = me.permissions.includes("admin.access");
  const incoming = friends?.incoming.length || 0;

  return (
    <div className="bg-aurora flex h-[100dvh] flex-col overflow-hidden">
      {/* Mobile Top Bar (shown whenever browsing lists on mobile < md) */}
      {!activeId && (
        <header className="flex shrink-0 items-center justify-between gap-2.5 border-b border-line bg-surface/85 px-3.5 py-2.5 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="منوی اصلی و تنظیمات"
            className="press flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/80 py-1 pl-3 pr-1.5 text-right transition hover:bg-surface-3"
          >
            <Avatar
              name={me.displayName}
              color={me.avatarColor}
              size={32}
              userId={me.id}
              avatarFileId={me.avatarFileId}
              status={toPresence(me.status)}
            />
            <div className="min-w-0">
              <p className="max-w-[115px] truncate text-xs font-black text-fg">{me.displayName}</p>
              <p className="text-[10px] font-semibold text-accent">منو و تنظیمات</p>
            </div>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void openDirect({ saved: true })}
              title="پیام‌های ذخیره‌شده"
              aria-label="پیام‌های ذخیره‌شده"
              className="press flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-muted transition hover:bg-surface-3 hover:text-accent"
            >
              <Icon name="bookmark" size={18} />
            </button>
            <button
              type="button"
              onClick={() => navigate("/dhikr")}
              title="ذکر و زیارت روز"
              aria-label="ذکر و زیارت روز"
              className="press flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-muted transition hover:bg-surface-3 hover:text-accent"
            >
              <Icon name="sparkles" size={18} />
            </button>
            <button
              type="button"
              onClick={() => navigate("/istikhara")}
              title="استخاره با قرآن"
              aria-label="استخاره با قرآن"
              className="press flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-muted transition hover:bg-surface-3 hover:text-accent"
            >
              <Icon name="book" size={18} />
            </button>
            <Notifications
              onOpenProfile={() => setProfileOpen(true)}
              onOpenConversation={openConversationWithRefresh}
            />
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="تنظیمات و تم"
              aria-label="تنظیمات و تم"
              className="press flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-muted transition hover:bg-surface-3 hover:text-fg"
            >
              <Icon name="settings" size={18} />
            </button>
          </div>
        </header>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Desktop nav rail (right side in RTL) */}
        <nav className="relative z-40 hidden w-[62px] shrink-0 flex-col items-center gap-1.5 border-l border-line bg-surface/80 py-3 backdrop-blur md:flex">
          <RailButton label="گفتگوها" active={tab === "chats"} onClick={() => setTab("chats")} badge={totalUnread}>
            <Icon name="chat" size={20} />
          </RailButton>
          <RailButton label="گروه‌های من" active={tab === "groups"} onClick={() => setTab("groups")}>
            <Icon name="users" size={20} />
          </RailButton>
          <RailButton label="جلسه‌ها (میت)" active={tab === "meetings"} onClick={() => setTab("meetings")}>
            <Icon name="radio" size={20} />
          </RailButton>
          <RailButton label="دوستان" active={tab === "friends"} onClick={() => setTab("friends")} badge={incoming}>
            <Icon name="user" size={20} />
          </RailButton>
          <RailButton label="ذکر و زیارت روز" onClick={() => navigate("/dhikr")}>
            <Icon name="sparkles" size={20} />
          </RailButton>
          <RailButton label="استخاره با قرآن" onClick={() => navigate("/istikhara")}>
            <Icon name="book" size={20} />
          </RailButton>
          <RailButton label="پیام‌های ذخیره‌شده" active={tab === "chats" && activeConv?.type === "saved"} onClick={() => void openDirect({ saved: true })}>
            <Icon name="bookmark" size={19} />
          </RailButton>
          {canAdmin && (
            <RailButton label="پنل مدیریت" onClick={() => navigate("/admin")}>
              <Icon name="shield" size={20} />
            </RailButton>
          )}
          <div className="flex-1" />
          {canInstall && (
            <RailButton label={isIos ? "نصب وب‌اپ (Add to Home Screen)" : "نصب برنامه (PWA)"} onClick={() => void handleInstallApp()}>
              <Icon name="app-install" size={20} />
            </RailButton>
          )}
          <Notifications
            onOpenProfile={() => setProfileOpen(true)}
            onOpenConversation={openConversationWithRefresh}
          />
          <RailButton label="تنظیمات و تم" onClick={() => setSettingsOpen(true)}>
            <Icon name="settings" size={20} />
          </RailButton>
          <RailProfileButton
            me={me}
            onClick={() => setProfileOpen(true)}
            onContextMenu={(event) => {
              const items = [
                { type: "label", label: me.displayName },
                { type: "item", key: "profile", label: "پروفایل من", icon: "user", onClick: () => setProfileOpen(true) },
                { type: "item", key: "saved", label: "پیام‌های ذخیره‌شده", icon: "bookmark", onClick: () => void openDirect({ saved: true }) },
                { type: "item", key: "settings", label: "تنظیمات", icon: "settings", onClick: () => setSettingsOpen(true) },
                { type: "item", key: "dhikr", label: "ذکر و زیارت روز", icon: "sparkles", onClick: () => navigate("/dhikr") },
                { type: "item", key: "istikhara", label: "استخاره با قرآن", icon: "book", onClick: () => navigate("/istikhara") },
                { type: "divider" },
                { type: "item", key: "logout", label: "خروج از حساب", icon: "logout", danger: true, onClick: () => void (async () => {
                  const ok = await confirm({ title: "خروج از حساب", message: "از حساب کاربری خود خارج می‌شوید؟", confirmLabel: "خروج", variant: "danger", icon: "logout" });
                  if (ok) await logout();
                })() },
              ];
              openMenu(event, items);
            }}
          />
        </nav>

        {/* List panel */}
        <aside
          className={`${
            activeId && isMobile ? "hidden" : "flex"
          } anim-slide-list w-full min-w-0 flex-col border-l border-line bg-surface/40 pb-[env(safe-area-inset-bottom)] md:w-[var(--list-w)] md:shrink-0 md:pb-0`}
          style={{ ["--list-w"]: `${listWidth}px` }}
          data-list-width={listWidth}
        >
          {tab === "chats" && (
            <ConversationList
              convs={convs}
              activeId={activeId}
              onOpen={openConversationWithRefresh}
              onOpenSaved={() => void openDirect({ saved: true })}
              onOpenProfile={(userId) => setViewProfileId(userId)}
              onCreate={(t) => setCreateOpen(t)}
              me={me}
            />
          )}
          {tab === "groups" && <GroupsPanel me={me} onOpen={openConversationWithRefresh} onCreate={() => setCreateOpen("group")} />}
          {tab === "meetings" && <MeetingsPanel me={me} onOpenMeeting={openMeeting} />}
          {tab === "friends" && (
            <FriendsPanel data={friends} reload={loadFriends} onMessage={(userId) => openDirect({ userId })} onProfile={(userId) => setViewProfileId(userId)} me={me} />
          )}
        </aside>
        {/* drag handle: resize the conversation list on desktop */}
        <div
          ref={dragRef}
          role="separator"
          aria-orientation="vertical"
          aria-label="تغییر عرض فهرست گفتگوها"
          title="بکشید: به چپ = پهن‌تر، به راست = باریک‌تر · دوبار کلیک = اندازهٔ پیش‌فرض"
          tabIndex={0}
          aria-valuemin={MIN_LIST}
          aria-valuemax={MAX_LIST}
          aria-valuenow={listWidth}
          onPointerDown={startResize}
          onDoubleClick={resetListWidth}
          onKeyDown={keyResize}
          className="group relative z-20 hidden w-2 shrink-0 cursor-col-resize touch-none outline-none md:block"
        >
          <span className="absolute inset-y-0 -left-2 -right-2" />
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line/70 transition group-hover:bg-accent group-focus-visible:bg-accent group-active:bg-accent" />
          <span className="absolute left-1/2 top-1/2 flex h-10 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface-2 opacity-0 shadow transition group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100">
            <span className="h-4 w-0.5 rounded-full bg-muted" />
          </span>
        </div>

        {/* Main */}
        <main className={`${activeId || !isMobile ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)] md:pb-0`}>
          {activeId ? (
            <ChatView
              key={activeId}
              conversationId={activeId}
              me={me}
              convs={convs || []}
              friends={friends?.friends || []}
              onBack={() => setActiveId(null)}
              onChanged={loadConvs}
              onClosed={() => {
                setActiveId(null);
                loadConvs();
              }}
              onOpenDirect={(userId) => openDirect({ userId })}
              onOpenProfile={(userId) => setViewProfileId(userId)}
            />
          ) : (
            <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-4 text-center sm:p-8">
              <ChatWallpaperBackdrop />

              <figure className="anim-fade-up relative z-10 flex w-full max-w-2xl flex-col items-center justify-center rounded-3xl border border-line/80 bg-surface/72 px-6 py-7 shadow-[0_20px_60px_rgba(0,0,0,.22)] backdrop-blur-xl sm:px-10 sm:py-9">
                <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3.5 py-1">
                  <Icon name={daily?.kind === "hadith" ? "quote" : "book"} size={14} className="text-accent" />
                  <span className="text-[11px] font-black tracking-[0.14em] text-accent">{daily?.label ?? "آیهٔ روز"}</span>
                </div>

                <blockquote key={daily?.id} className="anim-fade-in mt-5 w-full">
                  {daily ? (
                    <>
                      {daily.ar && (
                        <p className="quran-text line-clamp-3 text-xl leading-[2.05] text-fg/90 sm:text-2xl md:text-[26px]" dir="rtl">
                          {daily.ar}
                        </p>
                      )}
                      <p className="mx-auto mt-3.5 max-w-xl line-clamp-4 text-sm font-bold leading-7 text-fg/85 sm:text-base sm:leading-8">
                        {daily.fa}
                      </p>
                      {daily.source && (
                        <figcaption className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-surface-2/80 px-3 py-1 text-[11px] font-bold text-muted">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                          {daily.source}
                        </figcaption>
                      )}
                    </>
                  ) : (
                    <p className="py-4 text-xs text-muted">در حال دریافت آیهٔ روز…</p>
                  )}
                </blockquote>
              </figure>
            </div>
          )}
        </main>
      </div>

      {/* mobile bottom navigation */}
      {!activeId && (
        <nav className="flex shrink-0 items-stretch justify-around border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {([
            ["chats", "chat", "گفتگوها", totalUnread],
            ["groups", "users", "گروه‌ها", 0],
            ["meetings", "radio", "میت", 0],
            ["friends", "user", "دوستان", incoming],
          ]).map(([id, icon, label, badge]) => (
            <button
              key={id}
              onClick={() => { setTab(id); if (isMobile) setActiveId(null); }}
              aria-pressed={tab === id && !activeId}
              aria-label={badge > 0 ? `${label}، ${faNum(badge)} مورد خوانده‌نشده` : label}
              className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition ${tab === id && !activeId ? "text-accent" : "text-muted"}`}
            >
              {tab === id && !activeId && <span className="grad-accent absolute top-0 h-0.5 w-8 rounded-full" />}
              <span className="relative">
                <Icon name={icon} size={20} />
                {badge > 0 && <span className="anim-badge absolute -left-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{faNum(badge > 99 ? 99 : badge)}</span>}
              </span>
              {label}
            </button>
          ))}
          <button
            onClick={() => setMobileMenuOpen(true)}
            aria-label="منو و امکانات بیشتر"
            className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-bold text-muted hover:text-fg"
          >
            <Avatar name={me.displayName} color={me.avatarColor} size={21} userId={me.id} avatarFileId={me.avatarFileId} />
            امکانات
          </button>
        </nav>
      )}

      {/* Mobile Full Feature Sheet / Drawer */}
      {mobileMenuOpen && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/65 backdrop-blur-sm md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="anim-rise max-h-[86dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" />
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2/80 p-3">
              <Avatar
                name={me.displayName}
                color={me.avatarColor}
                size={52}
                userId={me.id}
                avatarFileId={me.avatarFileId}
                status={toPresence(me.status)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-black text-fg">{me.displayName}</p>
                <p className="truncate text-xs font-semibold text-accent" dir="ltr">@{me.username}</p>
                {me.bio && <p className="mt-0.5 truncate text-[11px] text-muted">{me.bio}</p>}
              </div>
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); setProfileOpen(true); }}
                className="grad-accent press shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold text-on-accent"
              >
                پروفایل من
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); setSettingsOpen(true); }}
                className="press flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-3 text-right hover:bg-surface-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Icon name="settings" size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-fg">تنظیمات و تم</p>
                  <p className="truncate text-[10px] text-muted">ظاهر، اذان، امنیت، بلاک</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); void openDirect({ saved: true }); }}
                className="press flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-3 text-right hover:bg-surface-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Icon name="bookmark" size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-fg">پیام‌های ذخیره‌شده</p>
                  <p className="truncate text-[10px] text-muted">فضای ابری شخصی</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); navigate("/dhikr"); }}
                className="press flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-3 text-right hover:bg-surface-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-400/15 text-teal-300">
                  <Icon name="sparkles" size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-fg">ذکر و زیارت روز</p>
                  <p className="truncate text-[10px] text-muted">اذکار هفته، تسبیحات و دعای فرج</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); navigate("/istikhara"); }}
                className="press flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-3 text-right hover:bg-surface-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-400">
                  <Icon name="book" size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-fg">استخاره با قرآن</p>
                  <p className="truncate text-[10px] text-muted">همراه با متن و تفسیر</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); setTab("friends"); setActiveId(null); }}
                className="press flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-3 text-right hover:bg-surface-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
                  <Icon name="users" size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-fg">مخاطبین و دوستان</p>
                  <p className="truncate text-[10px] text-muted">{incoming > 0 ? `${faNum(incoming)} درخواست جدید` : "افزودن با نام کاربری"}</p>
                </div>
              </button>

              {me.permissions.includes("groups.create") && (
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); setCreateOpen("group"); }}
                  className="press flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-3 text-right hover:bg-surface-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
                    <Icon name="plus" size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-fg">گروه خصوصی جدید</p>
                    <p className="truncate text-[10px] text-muted">ساخت گروه با دوستان</p>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); setTab("meetings"); setActiveId(null); }}
                className="press flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-3 text-right hover:bg-surface-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                  <Icon name="radio" size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-fg">جلسه و میت آنلاین</p>
                  <p className="truncate text-[10px] text-muted">تماس تصویری و بازی</p>
                </div>
              </button>

              {canInstall && (
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); void handleInstallApp(); }}
                  className="press flex items-center gap-2.5 rounded-xl border border-accent/30 bg-accent/12 p-3 text-right hover:bg-accent/20 min-[380px]:col-span-2"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/35 bg-accent/20 text-accent">
                    <Icon name="app-install" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-fg">نصب اپلیکیشن inebuly</p>
                    <p className="truncate text-[10px] text-muted">
                      {isIos ? "در Safari از گزینهٔ Share و Add to Home Screen استفاده کنید" : "نصب سریع روی صفحهٔ اصلی بدون نیاز به فروشگاه"}
                    </p>
                  </div>
                </button>
              )}

              {canAdmin && (
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); navigate("/admin"); }}
                  className="press flex items-center gap-2.5 rounded-xl border border-accent/30 bg-accent/10 p-3 text-right hover:bg-accent/20 min-[380px]:col-span-2"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent">
                    <Icon name="shield" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-fg">پنل مدیریت سامانه</p>
                    <p className="truncate text-[10px] text-muted">مدیریت کاربران، نقش‌ها، پیام‌ها و آمار</p>
                  </div>
                  <Icon name="arrow-left" size={15} className="text-accent" />
                </button>
              )}
            </div>

            <div className="mt-3 flex gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex-1 rounded-xl border border-line bg-surface-2 py-2.5 text-xs font-bold text-fg hover:bg-surface-3"
              >
                بستن
              </button>
              <button
                type="button"
                onClick={() => void (async () => {
                  setMobileMenuOpen(false);
                  const ok = await confirm({
                    title: "خروج از حساب کاربری",
                    message: "آیا می‌خواهید از حساب کاربری خود خارج شوید؟",
                    confirmLabel: "خروج از حساب",
                    variant: "danger",
                    icon: "logout",
                  });
                  if (ok) await logout();
                })()}
                className="press flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-500/15 py-2.5 text-xs font-black text-rose-400 ring-1 ring-rose-500/30 hover:bg-rose-500 hover:text-white"
              >
                <Icon name="logout" size={16} /> خروج از حساب
              </button>
            </div>
          </div>
        </div>
      )}

      <CreateModal
        type={createOpen}
        onClose={() => setCreateOpen(null)}
        friends={friends?.friends || []}
        onCreated={(id) => {
          setCreateOpen(null);
          openConversationWithRefresh(id);
        }}
      />
      <ProfileModal me={me} open={profileOpen} onClose={() => setProfileOpen(false)} onSaved={reloadMe} onMessage={(userId) => { setProfileOpen(false); void openDirect({ userId }); }} />
      {viewProfileId && <UserProfileModal userId={viewProfileId} me={me} onClose={() => setViewProfileId(null)} onMessage={(userId) => { setViewProfileId(null); void openDirect({ userId }); }} />}
      <ContextMenu state={menu} onClose={closeMenu} />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        me={me}
        onSaved={reloadMe}
        onLogout={logout}
      />
      <WelcomePopup />
    </div>
  );
}
