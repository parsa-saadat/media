import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  apiFetch,
  authFetch,
  downloadAuthed,
  faNum,
  formatDay,
  formatSize,
  formatTime,
  isOnline,
  lastSeenText,
  toast,
} from "../../utils/client";
import { Avatar, Button, Input, Modal } from "../common/Ui";
import { Icon } from "../common/Icon";
import VoicePanel from "../voice/VoicePanel";
import AuthedImage from "../common/AuthedImage";
import EmojiPicker from "./EmojiPicker";
import { StatusLine } from "../common/StatusDot";
import { playSound } from "../../utils/sounds";
import { navigate } from "../../utils/router";
import { ContextMenu, useContextMenu } from "../common/ContextMenu";
import { useConfirm } from "../common/Confirm";

const ROLE_LABEL = { owner: "مالک", admin: "مدیر", member: "عضو" };

function fileIcon(mime, name) {
  const n = (name || "").toLowerCase();
  if (mime?.includes("pdf") || n.endsWith(".pdf")) return "doc";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("audio/")) return "music";
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return "archive";
  if (/\.(xlsx?|csv)$/.test(n)) return "chart";
  if (/\.(pptx?)$/.test(n)) return "layers";
  if (/\.(docx?|odt|rtf|txt|md)$/.test(n)) return "doc";
  return "file";
}

export default function ChatView({
  conversationId,
  me,
  friends,
  onBack,
  onChanged,
  onClosed,
  onOpenDirect,
  onOpenProfile,
}) {
  const [detail, setDetail] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [addUser, setAddUser] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [pickedMembers, setPickedMembers] = useState([]);
  const [addingBatch, setAddingBatch] = useState(false);
  /** multi-select mode: pick several messages and delete them together */
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  /** attachments queued for the next send: { file, url } — url is a preview for images only */
  const [pending, setPending] = useState([]);
  /** voice recording: true while MediaRecorder is capturing */
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recBars, setRecBars] = useState(() => Array.from({ length: 24 }, () => 18));
  const { confirm } = useConfirm();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const scrollRef = useRef(null);
  const stickBottom = useRef(true);
  const lastIdRef = useRef(0);
  const lastReadSent = useRef(0);
  const imgInput = useRef(null);
  const fileInput = useRef(null);
  const taRef = useRef(null);
  const recRef = useRef(null);
  const recChunks = useRef([]);
  const recStream = useRef(null);
  const recTimer = useRef(null);
  const recAnimRef = useRef(null);
  const recAudioCtxRef = useRef(null);
  const recSecondsRef = useRef(0);
  const sendAfterRec = useRef(false);

  useEffect(() => {
    setSelectMode(false);
    setSelected(new Set());
    setEditing(null);
  }, [conversationId]);

  // a voice recording must not outlive the chat view
  useEffect(() => () => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    recStream.current?.getTracks().forEach((t) => t.stop());
    clearInterval(recTimer.current);
    if (recAnimRef.current) cancelAnimationFrame(recAnimRef.current);
    void recAudioCtxRef.current?.close().catch(() => {});
  }, []);

  const cbRef = useRef({ onChanged, onClosed });
  useEffect(() => {
    cbRef.current = { onChanged, onClosed };
  });

  const loadDetail = useCallback(async () => {
    try {
      const d = await apiFetch(`/api/conversations/${conversationId}`);
      setDetail(d.conversation);
      setMembers(d.members);
    } catch (e) {
      toast(e.message, "error");
      cbRef.current.onClosed();
    }
  }, [conversationId]);

  const markRead = useCallback(
    (id) => {
      if (id > lastReadSent.current) {
        lastReadSent.current = id;
        apiFetch(`/api/conversations/${conversationId}/read`, { method: "POST", json: { messageId: id } })
          .then(() => cbRef.current.onChanged())
          .catch(() => {});
      }
    },
    [conversationId]
  );

  // initial load
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadDetail();
      try {
        const d = await apiFetch(`/api/conversations/${conversationId}/messages`);
        if (!alive) return;
        setMessages(d.messages);
        setHasMore(d.messages.length >= 50);
        lastIdRef.current = d.messages.at(-1)?.id || 0;
        if (lastIdRef.current) markRead(lastIdRef.current);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [conversationId, loadDetail, markRead]);

  // polling for new messages
  useEffect(() => {
    let tick = 0;
    const t = setInterval(async () => {
      tick++;
      try {
        if (tick % 12 === 0) {
          // full resync of latest page to catch deletions
          const d = await apiFetch(`/api/conversations/${conversationId}/messages`);
          setMessages((prev) => {
            const map = new Map(prev.map((m) => [m.id, m]));
            d.messages.forEach((m) => map.set(m.id, m));
            return Array.from(map.values()).sort((a, b) => a.id - b.id);
          });
          loadDetail();
        }
        const d = await apiFetch(
          `/api/conversations/${conversationId}/messages?after=${lastIdRef.current}`
        );
        if (d.messages.length) {
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            return [...prev, ...d.messages.filter((m) => !ids.has(m.id))];
          });
          lastIdRef.current = d.messages.at(-1).id;
          if (document.visibilityState === "visible") markRead(lastIdRef.current);
          if (d.messages.some((m) => m.type === "system")) loadDetail();
          // a message from somebody else arrived while this chat is open
          if (d.messages.some((m) => m.sender?.id && m.sender.id !== me.id)) playSound("message");
        }
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [conversationId, loadDetail, markRead]);

  // auto scroll
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    const el = scrollRef.current;
    const prevH = el?.scrollHeight || 0;
    const d = await apiFetch(`/api/conversations/${conversationId}/messages?before=${first.id}`);
    setHasMore(d.messages.length >= 50);
    stickBottom.current = false;
    setMessages((prev) => [...d.messages, ...prev]);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevH;
    });
  }

  useEffect(() => {
    if (!selectMode && !editing) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (editing) { setEditing(null); setText(""); }
      else exitSelect();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode, editing]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 40 && hasMore && !loading) {
      setHasMore(false);
      loadOlder().catch(() => {});
    }
  }

  /** Queues several attachments at once; images get a local preview URL. */
  function pickFiles(list) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const allowed = [];
    for (const f of files) {
      if (f.size > 15 * 1024 * 1024) { toast(`«${f.name}» بزرگ‌تر از ۱۵ مگابایت است`, "error"); continue; }
      const isImg = f.type.startsWith("image/");
      const isAudio = f.type.startsWith("audio/");
      if (isImg && !me.permissions.includes("images.upload")) { toast("شما مجوز ارسال تصویر ندارید", "error"); continue; }
      if (!isImg && !me.permissions.includes("files.upload")) { toast("شما مجوز ارسال فایل ندارید", "error"); continue; }
      allowed.push({ file: f, url: isImg && !isAudio ? URL.createObjectURL(f) : null, voice: isAudio });
    }
    if (allowed.length) setPending((prev) => [...prev, ...allowed].slice(0, 10));
    taRef.current?.focus();
  }

  function removePending(index) {
    setPending((prev) => {
      const item = prev[index];
      if (item?.url) URL.revokeObjectURL(item.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function clearPending() {
    for (const p of pending) if (p.url) URL.revokeObjectURL(p.url);
    setPending([]);
  }

  /* ── voice notes ── */
  async function startRecording() {
    if (recRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return toast("این مرورگر از ضبط صدا پشتیبانی نمی‌کند", "error");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStream.current = stream;
      const recorder = new MediaRecorder(stream);
      recChunks.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) recChunks.current.push(e.data); };
      recorder.onstop = () => finishRecording();
      recRef.current = recorder;
      recorder.start();
      recSecondsRef.current = 0;
      setRecSeconds(0);
      setRecording(true);
      // Live WebAudio frequency equalizer during recording
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        try {
          const ctx = new Ctx();
          recAudioCtxRef.current = ctx;
          const srcNode = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.72;
          srcNode.connect(analyser);
          const bins = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(bins);
            const next = Array.from({ length: 24 }, (_, idx) => {
              const v = bins[idx % bins.length] || 0;
              return Math.max(14, Math.min(100, Math.round((v / 255) * 100)));
            });
            setRecBars(next);
            recAnimRef.current = requestAnimationFrame(tick);
          };
          recAnimRef.current = requestAnimationFrame(tick);
        } catch {
          /* ignore WebAudio errors */
        }
      }
      recTimer.current = setInterval(() => {
        recSecondsRef.current += 1;
        setRecSeconds(recSecondsRef.current);
        if (recSecondsRef.current >= 120) stopRecording(true); // hard cap: 2 minutes
      }, 1000);
    } catch {
      toast("دسترسی به میکروفون داده نشد", "error");
    }
  }

  function stopRecording(send) {
    sendAfterRec.current = send;
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    else finishRecording();
  }

  function finishRecording() {
    clearInterval(recTimer.current);
    recTimer.current = null;
    if (recAnimRef.current) {
      cancelAnimationFrame(recAnimRef.current);
      recAnimRef.current = null;
    }
    if (recAudioCtxRef.current) {
      void recAudioCtxRef.current.close().catch(() => {});
      recAudioCtxRef.current = null;
    }
    recStream.current?.getTracks().forEach((t) => t.stop());
    recStream.current = null;
    const seconds = recSecondsRef.current;
    const mimeType = recRef.current?.mimeType || "audio/webm";
    const blob = new Blob(recChunks.current, { type: mimeType });
    recChunks.current = [];
    recRef.current = null;
    setRecording(false);
    setRecSeconds(0);
    recSecondsRef.current = 0;
    if (sendAfterRec.current && blob.size) void sendVoice(blob, seconds);
    sendAfterRec.current = false;
  }

  async function sendVoice(blob, seconds) {
    if (blob.size > 15 * 1024 * 1024) return toast("پیام صوتی بیش از حد بزرگ است", "error");
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await apiFetch("/api/files", { method: "POST", body: fd });
      await apiFetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        json: { content: String(seconds), fileId: up.file.id },
      });
      playSound("send");
      stickBottom.current = true;
      const d = await apiFetch(`/api/conversations/${conversationId}/messages?after=${lastIdRef.current}`);
      if (d.messages.length) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          return [...prev, ...d.messages.filter((m) => !ids.has(m.id))];
        });
        lastIdRef.current = d.messages.at(-1).id;
        markRead(lastIdRef.current);
      }
      onChanged();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSending(false);
    }
  }

  async function send() {
    if (sending) return;
    if (editing) return saveEdit();
    if (recording) return; // the recording bar owns the send button while capturing
    const content = text.trim();
    if (!content && !pending.length) return;
    setSending(true);
    try {
      const imageFileIds = [];
      const otherFileIds = [];
      for (const p of pending) {
        const fd = new FormData();
        fd.append("file", p.file);
        const up = await apiFetch("/api/files", { method: "POST", body: fd });
        if (p.file.type?.startsWith("image/")) imageFileIds.push(up.file.id);
        else otherFileIds.push(up.file.id);
      }
      let captionUsed = false;
      if (imageFileIds.length > 0) {
        await apiFetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          json: {
            content,
            fileId: imageFileIds[0],
            fileIds: imageFileIds,
          },
        });
        captionUsed = true;
      }
      for (let i = 0; i < otherFileIds.length; i++) {
        await apiFetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          json: { content: !captionUsed && i === 0 ? content : "", fileId: otherFileIds[i] },
        });
      }
      if (!imageFileIds.length && !otherFileIds.length) {
        await apiFetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          json: { content, fileId: undefined },
        });
      }
      playSound("send");
      setText("");
      clearPending();
      setShowEmoji(false);
      stickBottom.current = true;
      const d = await apiFetch(
        `/api/conversations/${conversationId}/messages?after=${lastIdRef.current}`
      );
      if (d.messages.length) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          return [...prev, ...d.messages.filter((m) => !ids.has(m.id))];
        });
        lastIdRef.current = d.messages.at(-1).id;
        markRead(lastIdRef.current);
      }
      onChanged();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function deleteSelected() {
    if (!selected.size) return;
    const ok = await confirm({
      title: `حذف ${faNum(selected.size)} پیام؟`,
      message: "پیام‌های انتخاب‌شده برای همه حذف می‌شوند. این کار قابل بازگشت نیست.",
      confirmLabel: "حذف کن",
      variant: "danger",
      icon: "trash",
    });
    if (!ok) return;
    try {
      await apiFetch("/api/messages/bulk-delete", { method: "POST", json: { ids: [...selected] } });
      const ids = new Set(selected);
      setMessages((prev) => prev.map((m) => (ids.has(m.id) ? { ...m, type: "deleted", content: "", fileId: null } : m)));
      toast(`${faNum(ids.size)} پیام حذف شد`, "success");
      exitSelect();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  function startEdit(m) {
    setEditing(m);
    setText(m.content);
    exitSelect();
    window.requestAnimationFrame(() => taRef.current?.focus());
  }

  async function saveEdit() {
    if (!editing) return;
    const content = text.trim();
    if (!content) return toast("متن پیام نمی‌تواند خالی باشد", "error");
    setSending(true);
    try {
      await apiFetch(`/api/messages/${editing.id}`, { method: "PATCH", json: { content } });
      const at = new Date().toISOString();
      setMessages((prev) => prev.map((m) => (m.id === editing.id ? { ...m, content, editedAt: at } : m)));
      setEditing(null);
      setText("");
      toast("پیام ویرایش شد", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSending(false);
    }
  }

  /** Inserts an emoji at the caret so editing an existing draft keeps working. */
  function insertEmoji(emoji) {
    const el = taRef.current;
    setText((prev) => {
      if (!el) return prev + emoji;
      const start = el.selectionStart ?? prev.length;
      const end = el.selectionEnd ?? prev.length;
      const next = prev.slice(0, start) + emoji + prev.slice(end);
      window.requestAnimationFrame(() => {
        el.focus();
        const caret = start + emoji.length;
        el.setSelectionRange(caret, caret);
      });
      return next;
    });
    playSound("send");
  }

  /**
   * Read receipts. One tick = delivered, two = seen. In a group we also know WHO has seen it,
   * so the label can be tapped for the full list.
   */
  function receiptOf(m) {
    const readers = (m.readBy ?? []).filter((r) => r.userId !== me.id);
    const seen = readers.length > 0;
    if (detail?.type === "direct") {
      return { seen, label: seen ? "دیده شد" : "ارسال شد", readers };
    }
    const others = members.filter((x) => x.id !== me.id).length;
    if (!seen) return { seen: false, label: "ارسال شد", readers };
    if (others <= 1) return { seen: true, label: "دیده شد", readers };
    return { seen: true, label: `دیده‌شده توسط ${faNum(readers.length)} نفر`, readers };
  }

  function readerNames(m) {
    return (m.readBy ?? [])
      .filter((r) => r.userId !== me.id)
      .map((r) => {
        const member = members.find((x) => x.id === r.userId);
        return `${member?.displayName ?? "کاربر"} · ${formatTime(r.at)}`;
      });
  }

  /** Builds the message menu; used by both the row and the bubble so right-click works anywhere. */
  function openMessageMenuFor(event, m, mine) {
    const items = [
      { type: "label", label: mine ? "پیام شما" : (m.sender?.displayName ?? "پیام") },
    ];
    if (m.content && m.type !== "deleted") items.push({ type: "item", key: "copy", label: "کپی متن پیام", icon: "copy", onClick: () => { void navigator.clipboard?.writeText(m.content || "").then(() => toast("متن پیام کپی شد", "success")).catch(() => toast("کپی انجام نشد", "error")); } });
    if (m.fileId && m.type === "image") items.push({ type: "item", key: "view", label: "نمایش تصویر", icon: "image", onClick: () => setLightbox(m.fileId) });
    if (m.fileId) items.push({ type: "item", key: "dl", label: "دانلود فایل", icon: "download", onClick: () => void downloadAuthed(`/api/files/${m.fileId}?download=1`, m.fileName || "file").catch((e) => toast(e.message, "error")) });
    if (m.sender && onOpenProfile) items.push({ type: "item", key: "profile", label: "مشاهده پروفایل", icon: "user", onClick: () => m.sender && onOpenProfile(m.sender.id) });
    if (!mine && m.sender) items.push({ type: "item", key: "pm", label: `پیام خصوصی به ${m.sender.displayName}`, icon: "chat", onClick: () => m.sender && onOpenDirect(m.sender.id) });
    items.push({ type: "divider" });
    items.push({
      type: "item",
      key: "select",
      label: selectMode ? "خروج از حالت انتخاب" : "انتخاب پیام‌ها",
      icon: "check",
      onClick: () => {
        if (selectMode) exitSelect();
        else { setSelectMode(true); setSelected(new Set([m.id])); }
      },
    });
    if (m.type === "text" && mine) items.push({ type: "item", key: "edit", label: "ویرایش پیام", icon: "edit", onClick: () => startEdit(m) });
    if (m.type !== "deleted" && (mine || canDeleteAny)) {
      items.push({ type: "item", key: "del", label: mine ? "حذف پیام من" : "حذف پیام", icon: "trash", danger: true, onClick: () => void deleteMessage(m.id) });
    }
    if (!mine && m.sender) {
      const sender = m.sender;
      if (canDeleteAny || isMod) {
        const senderMember = members.find((x) => x.id === sender.id);
        items.push({ type: "divider" });
        items.push({ type: "label", label: "اقدامات مدیر" });
        if (detail?.type !== "direct" && isMod && senderMember && senderMember.role !== "owner") {
          items.push({ type: "item", key: "kick", label: `حذف ${sender.displayName} از ${detail?.type === "room" ? "اتاق" : "گروه"}`, icon: "door", danger: true, onClick: () => void kickMember(senderMember) });
        }
      }
      items.push({ type: "divider" });
      items.push({ type: "item", key: "block", label: "مسدود کردن فرستنده", icon: "ban", danger: true, onClick: () => void blockUser(sender.id, sender.displayName) });
    }
    openMenu(event, items);
  }

  function openMessageMenu(event) {
    const row = event.currentTarget.closest("[data-message-id]");
    const id = Number(row?.getAttribute("data-message-id"));
    const m = messages.find((x) => x.id === id);
    if (!m) return;
    openMessageMenuFor(event, m, m.sender?.id === me.id);
  }

  async function deleteMessage(id) {
    try {
      await apiFetch(`/api/messages/${id}`, { method: "DELETE" });
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, type: "deleted", content: "", fileId: null } : m)));
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function leave() {
    const ok = await confirm({ title: "ترک گفتگو", message: "آیا از ترک این گفتگو مطمئن هستید؟", confirmLabel: "ترک کن", variant: "danger", icon: "door" });
    if (!ok) return;
    try {
      await apiFetch(`/api/conversations/${conversationId}/leave`, { method: "POST" });
      toast("گفتگو را ترک کردید", "success");
      onClosed();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function remove() {
    const ok = await confirm({ title: "حذف گفتگو برای همه", message: "این گفتگو برای همه حذف می‌شود. ادامه می‌دهید؟", confirmLabel: "حذف برای همه", variant: "danger", icon: "trash" });
    if (!ok) return;
    try {
      await apiFetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
      toast("حذف شد", "success");
      onClosed();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function addMember(username) {
    if (!username.trim()) return;
    try {
      await apiFetch(`/api/conversations/${conversationId}/members`, { method: "POST", json: { username } });
      setAddUser("");
      toast("عضو جدید اضافه شد", "success");
      loadDetail();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function addMembersBatch() {
    const manual = addUser.trim().replace(/^@/, "");
    const usernames = [...new Set([...pickedMembers, ...(manual ? [manual] : [])])];
    if (!usernames.length) return;
    setAddingBatch(true);
    try {
      const r = await apiFetch(`/api/conversations/${conversationId}/members`, {
        method: "POST",
        json: { usernames },
      });
      setPickedMembers([]);
      setAddUser("");
      setAddModalOpen(false);
      toast(`${faNum(r.added?.length ?? usernames.length)} عضو به گفتگو اضافه شدند`, "success");
      loadDetail();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setAddingBatch(false);
    }
  }

  async function manageMember(userId, action) {
    try {
      await apiFetch(`/api/conversations/${conversationId}/members`, { method: "PATCH", json: { userId, action } });
      loadDetail();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function kickMember(member) {
    const place = detail?.type === "room" ? "اتاق" : "گروه";
    const ok = await confirm({
      title: `حذف ${member.displayName} از ${place}`,
      message: "این فرد از فهرست اعضا حذف می‌شود و اگر در تماس باشد از تماس خارج می‌شود. بعداً می‌توان دوباره او را اضافه کرد.",
      confirmLabel: "حذف کن",
      variant: "danger",
      icon: "door",
    });
    if (!ok) return;
    await manageMember(member.id, "kick");
    toast(`${member.displayName} از ${place} حذف شد`, "success");
  }

  async function blockUser(userId, name) {
    const ok = await confirm({ title: "مسدود کردن کاربر", message: `«${name}» مسدود شود؟ پیام و تماس خصوصی و درخواست دوستی بین شما ممکن نخواهد بود.`, confirmLabel: "مسدود کن", variant: "danger", icon: "ban" });
    if (!ok) return;
    try {
      await apiFetch("/api/blocks", { method: "POST", json: { userId } });
      toast("کاربر مسدود شد؛ رفع مسدودیت در تنظیمات امکان‌پذیر است", "success");
      if (detail?.type === "direct") onClosed();
      else onChanged();
    } catch (err) { toast(err.message, "error"); }
  }

  async function saveToVault(messageId) {
    try {
      await apiFetch(`/api/messages/${messageId}/save`, { method: "POST", json: {} });
      toast("در پیام‌های ذخیره‌شده قرار گرفت", "success");
      onChanged();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  const myRole = detail?.myRole || "member";
  const isMod = myRole === "owner" || myRole === "admin";
  const canDeleteAny = isMod || me.permissions.includes("messages.delete_any");
  const onlineCount = members.filter((m) => isOnline(m.lastSeenAt)).length;
  const subtitle =
    detail?.type === "saved"
      ? "فضای شخصی شما · یادداشت‌ها و فایل‌ها"
      : detail?.type === "direct"
        ? lastSeenText(detail.peer?.lastSeenAt)
        : `${faNum(members.length)} عضو${onlineCount ? ` · ${faNum(onlineCount)} آنلاین` : ""}`;

  const memberIds = new Set(members.map((m) => m.id));
  const invitable = friends.filter((f) => !memberIds.has(f.user.id));

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFiles(e.dataTransfer.files);
        }}
      >
        {/* header */}
        <div
          className="flex items-center gap-3 border-b border-line bg-surface/50 px-4 py-3 backdrop-blur"
          onContextMenu={(event) => {
            if (!detail) return;
            const items = [
              { type: "label", label: detail.name },
              { type: "item", key: "info", label: showInfo ? "بستن اطلاعات گفتگو" : "اطلاعات گفتگو و اعضا", icon: "info", onClick: () => { setShowVoice(false); setShowInfo((v) => !v); } },
              ...(detail.type === "direct" && detail.peer && onOpenProfile
                ? [{ type: "item", key: "profile", label: "مشاهده پروفایل", icon: "user", onClick: () => onOpenProfile(detail.peer.id) }]
                : []),
              ...(detail.type !== "direct" && detail.type !== "saved" && (detail.type === "room" || isMod)
                ? [{ type: "item", key: "add-members", label: "افزودن عضو جدید…", icon: "user-plus", onClick: () => { setPickedMembers([]); setAddModalOpen(true); } }]
                : []),
              { type: "item", key: "copy", label: "کپی نام", icon: "copy", onClick: () => { void navigator.clipboard?.writeText(detail.name).then(() => toast("نام کپی شد", "success")).catch(() => toast("کپی انجام نشد", "error")); } },
            ];
            if (detail.type !== "saved" && me.permissions.includes("voice.join")) items.push({ type: "item", key: "voice", label: "شروع تماس صوتی", icon: "phone", onClick: () => { setShowInfo(false); setShowVoice(true); } });
            if (detail.type === "direct" && detail.peer) {
              items.push({ type: "divider" });
              items.push({ type: "item", key: "block", label: "مسدود کردن این کاربر", icon: "ban", danger: true, onClick: () => void blockUser(detail.peer.id, detail.name) });
            } else if (detail.type !== "direct" && detail.type !== "saved") {
              items.push({ type: "divider" });
              items.push({ type: "item", key: "leave", label: detail.type === "room" ? "ترک اتاق" : "ترک گروه", icon: "door", danger: true, onClick: () => void leave() });
              if (myRole === "owner" || me.permissions.includes("rooms.manage")) {
                items.push({ type: "divider" });
                items.push({ type: "label", label: "اقدامات مدیر" });
                items.push({ type: "item", key: "del", label: `حذف ${detail.type === "room" ? "اتاق" : "گروه"} برای همه`, icon: "trash", danger: true, onClick: () => void remove() });
              }
            }
            openMenu(event, items);
          }}
        >
          <button onClick={onBack} aria-label="بازگشت" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 md:hidden">
            <Icon name="arrow-right" size={18} />
          </button>
          {detail && (
            <button onClick={() => setShowInfo((s) => !s)} className="flex min-w-0 flex-1 items-center gap-3 text-right">
              {detail.type === "saved" ? (
                <span className="grad-accent flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg text-on-accent shadow-sm">
                  <Icon name="bookmark" size={20} />
                </span>
              ) : detail.type === "direct" ? (
                <Avatar name={detail.name} color={detail.peer?.avatarColor} lastSeenAt={detail.peer?.lastSeenAt} size={44} userId={detail.peer?.id} avatarFileId={detail.peer?.avatarFileId} />
              ) : (
                <Avatar name={detail.name} emoji={detail.emoji} size={44} />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-bold">{detail.name}</h2>
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                    {detail.type === "saved" ? "شخصی" : detail.type === "room" ? "اتاق عمومی" : detail.type === "group" ? "گروه خصوصی" : "خصوصی"}
                  </span>
                </div>
                {detail.type === "direct" && detail.peer ? (
                  <StatusLine status={detail.peer.status} text={detail.peer.statusText} emoji={detail.peer.statusEmoji} className="text-muted" />
                ) : (
                  <p className={`truncate text-xs ${subtitle === "آنلاین" ? "text-emerald-400" : "text-muted"}`}>{subtitle}</p>
                )}
              </div>
            </button>
          )}
          {detail && detail.type !== "direct" && detail.type !== "saved" && (detail.type === "room" || isMod) && (
            <button
              onClick={() => { setPickedMembers([]); setAddModalOpen(true); }}
              title="افزودن عضو"
              aria-label="افزودن عضو"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-accent"
            >
              <Icon name="user-plus" size={18} />
            </button>
          )}
          {detail && detail.type !== "saved" && me.permissions.includes("voice.join") && (
            <button
              onClick={() => { setShowInfo(false); setShowVoice(true); }}
              title="تماس صوتی"
              className={`flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${showVoice ? "grad-accent text-on-accent" : "bg-accent/15 text-accent hover:bg-accent/25"}`}
            >
              <Icon name="phone" size={17} /><span className="hidden sm:inline">تماس صوتی</span>
            </button>
          )}
          <button
            onClick={() => { setShowVoice(false); setShowInfo((s) => !s); }}
            title="اطلاعات"
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${showInfo ? "bg-accent/20 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
          >
            <Icon name="info" size={19} />
          </button>
        </div>

        {/* messages */}
        <div ref={scrollRef} onScroll={onScroll} className="scroll-thin scroll-smooth-y flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`flex ${i % 2 ? "justify-end" : ""}`}>
                  <div className="h-12 animate-pulse rounded-lg bg-surface-2" style={{ width: `${30 + ((i * 17) % 40)}%` }} />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Icon name="chat" size={30} />
              </div>
              <p className="font-semibold text-fg">هنوز پیامی نیست</p>
              <p className="text-sm">اولین پیام را شما بفرستید!</p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-1">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                const dayEl = newDay ? (
                  <div className="sticky top-0 z-10 flex justify-center py-3">
                    <span className="rounded-full bg-surface/90 px-3 py-1 text-[11px] text-muted shadow-sm backdrop-blur">
                      {formatDay(m.createdAt)}
                    </span>
                  </div>
                ) : null;
                if (m.type === "system") {
                  return (
                    <div key={m.id}>
                      {dayEl}
                      <div className="flex justify-center py-1.5">
                        <span className="rounded-full bg-accent/10 px-3 py-1 text-[11px] text-accent">{m.content}</span>
                      </div>
                    </div>
                  );
                }
                const mine = m.sender?.id === me.id;
                const grouped =
                  !newDay &&
                  prev &&
                  prev.type !== "system" &&
                  prev.sender?.id === m.sender?.id &&
                  new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
                  const showSender = !mine && detail?.type !== "direct" && detail?.type !== "saved" && !grouped;
                return (
                  <div key={m.id}>
                    {dayEl}
                    <div
                      className={`group anim-bubble flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3"} ${selectMode ? "cursor-pointer" : ""}`}
                      onClick={() => selectMode && toggleSelect(m.id)}
                      onContextMenu={openMessageMenu}
                      data-message-id={m.id}
                    >
                      {selectMode && (
                        <span
                          className={`mb-6 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                            selected.has(m.id) ? "border-accent bg-accent text-on-accent" : "border-line bg-surface-2"
                          }`}
                          aria-hidden="true"
                        >
                          {selected.has(m.id) && <Icon name="check" size={12} strokeWidth={3} />}
                        </span>
                      )}
                      {!mine && detail?.type !== "direct" && detail?.type !== "saved" && (
                        <div className="w-9 shrink-0">
                          {!grouped && m.sender && (
                            <button onClick={() => m.sender && (onOpenProfile ? onOpenProfile(m.sender.id) : onOpenDirect(m.sender.id))} title="پروفایل" aria-label={`پروفایل ${m.sender.displayName}`}>
                              <Avatar name={m.sender.displayName} color={m.sender.avatarColor} size={36} userId={m.sender.id} avatarFileId={m.sender.avatarFileId} />
                            </button>
                          )}
                        </div>
                      )}
                      <div className={`bubble-col flex max-w-[85%] flex-col sm:max-w-[65%] ${mine ? "items-end" : "items-start"}`}>
                        {showSender && m.sender && (
                          <button
                            onClick={() => m.sender && (onOpenProfile ? onOpenProfile(m.sender.id) : onOpenDirect(m.sender.id))}
                            className="mb-1 px-2 text-xs font-bold hover:underline"
                            style={{ color: m.sender.avatarColor }}
                          >
                            {m.sender.displayName}
                          </button>
                        )}
                        <div
                          onContextMenu={(event) => {
                            const imageIds = Array.isArray(m.fileIds) && m.fileIds.length ? m.fileIds : m.fileId ? [m.fileId] : [];
                            const items = [
                              { type: "label", label: mine ? "پیام شما" : (m.sender?.displayName ?? "پیام") },
                            ];
                            if (m.content) items.push({ type: "item", key: "copy", label: "کپی متن پیام", icon: "copy", onClick: () => { void navigator.clipboard?.writeText(m.content || "").then(() => toast("متن پیام کپی شد", "success")).catch(() => toast("کپی انجام نشد", "error")); } });
                            if (m.type !== "deleted" && detail?.type !== "saved") {
                              items.push({ type: "item", key: "save", label: "ذخیره در پیام‌های ذخیره‌شده", icon: "bookmark", onClick: () => void saveToVault(m.id) });
                            }
                            if (imageIds.length && m.type === "image") items.push({ type: "item", key: "view", label: imageIds.length > 1 ? `نمایش تصاویر (${faNum(imageIds.length)})` : "نمایش تصویر", icon: "image", onClick: () => setLightbox({ ids: imageIds, index: 0 }) });
                            if (m.fileId) items.push({ type: "item", key: "dl", label: "دانلود فایل", icon: "download", onClick: () => void downloadAuthed(`/api/files/${m.fileId}?download=1`, m.fileName || "file").catch((e) => toast(e.message, "error")) });
                            if (m.sender && onOpenProfile) items.push({ type: "item", key: "profile", label: "مشاهده پروفایل", icon: "user", onClick: () => m.sender && onOpenProfile(m.sender.id) });
                            if (!mine && m.sender) items.push({ type: "item", key: "pm", label: `پیام خصوصی به ${m.sender.displayName}`, icon: "chat", onClick: () => m.sender && onOpenDirect(m.sender.id) });
                            items.push({ type: "divider" });
                            items.push({ type: "item", key: "select", label: selectMode ? "خروج از حالت انتخاب" : "انتخاب پیام‌ها", icon: "check", onClick: () => {
                              if (selectMode) exitSelect();
                              else { setSelectMode(true); setSelected(new Set([m.id])); }
                            } });
                            if (m.type === "text" && mine) {
                              items.push({ type: "item", key: "edit", label: "ویرایش پیام", icon: "edit", onClick: () => startEdit(m) });
                            }
                            if (m.type !== "deleted" && (mine || canDeleteAny)) {
                              items.push({ type: "item", key: "del", label: mine ? "حذف پیام من" : "حذف پیام", icon: "trash", danger: true, onClick: () => void deleteMessage(m.id) });
                            }
                            if (!mine && m.sender && (canDeleteAny || isMod)) {
                              const sender = m.sender;
                              const senderMember = members.find((x) => x.id === sender.id);
                              items.push({ type: "divider" });
                              items.push({ type: "label", label: "اقدامات مدیر" });
                              if (m.type !== "deleted" && canDeleteAny) items.push({ type: "item", key: "moddel", label: "حذف این پیام", icon: "trash", danger: true, onClick: () => void deleteMessage(m.id) });
                              if (detail?.type !== "direct" && isMod && senderMember && senderMember.role !== "owner") items.push({ type: "item", key: "kick", label: `حذف ${sender.displayName} از ${detail?.type === "room" ? "اتاق" : "گروه"}`, icon: "door", danger: true, onClick: () => void kickMember(senderMember) });
                            }
                            if (!mine && m.sender) {
                              items.push({ type: "divider" });
                              items.push({ type: "item", key: "block", label: "مسدود کردن فرستنده", icon: "ban", danger: true, onClick: () => m.sender && void blockUser(m.sender.id, m.sender.displayName) });
                            }
                            openMenu(event, items);
                          }}
                          className={`relative overflow-hidden rounded-xl text-[14.5px] leading-7 shadow-sm ${
                            m.type === "deleted"
                              ? "border border-dashed border-line bg-transparent px-4 py-2 italic text-muted"
                              : mine
                              ? "grad-accent text-on-accent " + (grouped ? "rounded-bl-3xl" : "rounded-bl-lg")
                              : "bg-surface-2 text-fg " + (grouped ? "rounded-br-3xl" : "rounded-br-lg")
                          }`}
                        >
                          {m.type === "deleted" ? (
                            <span className="flex items-center gap-1.5">
                              <Icon name="ban" size={14} /> این پیام حذف شد
                            </span>
                          ) : (
                            <>
                              {m.forwardedFrom && (
                                <p className={`flex items-center gap-1.5 px-3.5 pt-2 text-[11px] font-semibold ${mine ? "text-white/80" : "text-accent"}`}>
                                  <Icon name="bookmark" size={12} /> ذخیره‌شده از {m.forwardedFrom}
                                </p>
                              )}
                              {m.type === "meeting" && <MeetingInviteCard payload={m.content} mine={mine} />}
                              {m.type === "voice" && m.fileId && (
                                <VoiceBubble fileId={m.fileId} duration={Number(m.content) || 0} mine={mine} />
                              )}
                              {m.type === "image" && (m.fileId || (Array.isArray(m.fileIds) && m.fileIds.length > 0)) && (() => {
                                const imgIds = Array.isArray(m.fileIds) && m.fileIds.length ? m.fileIds : [m.fileId];
                                if (imgIds.length === 1) {
                                  return (
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => setLightbox({ ids: imgIds, index: 0 })}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          setLightbox({ ids: imgIds, index: 0 });
                                        }
                                      }}
                                      className="block w-full cursor-pointer overflow-hidden"
                                    >
                                      <AuthedImage
                                        fileId={imgIds[0]}
                                        alt={m.fileName || "تصویر"}
                                        className="max-h-80 w-full max-w-sm object-cover transition hover:brightness-95"
                                        onLoad={() => {
                                          const el = scrollRef.current;
                                          if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
                                        }}
                                      />
                                    </div>
                                  );
                                }
                                const visibleIds = imgIds.slice(0, 4);
                                const extra = imgIds.length - 4;
                                return (
                                  <div className="w-[260px] p-1 sm:w-[330px]">
                                    <div className={`grid gap-1 overflow-hidden rounded-lg ${imgIds.length === 2 ? "grid-cols-2" : "grid-cols-2"}`}>
                                      {visibleIds.map((fid, idx) => {
                                        const spanFull = imgIds.length === 3 && idx === 0;
                                        const showOverlay = idx === 3 && extra > 0;
                                        return (
                                          <div
                                            key={`${fid}-${idx}`}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setLightbox({ ids: imgIds, index: idx })}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                setLightbox({ ids: imgIds, index: idx });
                                              }
                                            }}
                                            className={`group/img relative block cursor-pointer overflow-hidden bg-black/20 ${spanFull ? "col-span-2 aspect-[16/9]" : "aspect-square"}`}
                                          >
                                            <AuthedImage
                                              fileId={fid}
                                              alt={`تصویر ${idx + 1}`}
                                              className="h-full w-full object-cover transition duration-200 group-hover/img:scale-[1.03]"
                                              onLoad={() => {
                                                const el = scrollRef.current;
                                                if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
                                              }}
                                            />
                                            {showOverlay && (
                                              <span className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 text-lg font-black text-white backdrop-blur-[2px]">
                                                +{faNum(extra)}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                              {m.type === "file" && m.fileId && (
                                <button
                                  onClick={() => downloadAuthed(`/api/files/${m.fileId}?download=1`, m.fileName || "file").catch((e) => toast(e.message, "error"))}
                                  className={`flex items-center gap-3 text-right px-3 pt-3 ${m.content ? "" : "pb-3"}`}
                                >
                                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${mine ? "bg-white/20 text-white" : "bg-accent/15 text-accent"}`}>
                                    <Icon name={fileIcon(m.fileMime, m.fileName)} size={22} />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block max-w-[220px] truncate text-sm font-bold" dir="auto">
                                      {m.fileName}
                                    </span>
                                    <span className={`flex items-center gap-1 text-[11px] ${mine ? "text-white/75" : "text-muted"}`}>
                                      {formatSize(m.fileSize || 0)}
                                      <Icon name="download" size={11} />
                                    </span>
                                  </span>
                                </button>
                              )}
                              {/* meeting invites and voice notes render as cards; their raw
                                  payloads must never appear as text */}
                              {m.type !== "meeting" && m.type !== "voice" && m.content && (
                                <p className="whitespace-pre-wrap break-words px-4 pt-2 pb-0.5" dir="auto">
                                  {m.content}
                                </p>
                              )}
                              {/* time + delivery ticks inside the bubble; delete/edit live in the
                                  right-click menu or in selection mode, never on hover */}
                              <div className={`flex items-center gap-1.5 px-3.5 pb-1.5 pt-0.5 text-[10px] ${mine ? "justify-end text-white/70" : "justify-end text-muted"}`}>
                                {!!m.editedAt && <span className="opacity-80">ویرایش‌شده</span>}
                                <span dir="ltr" className="tabular-nums">{formatTime(m.createdAt)}</span>
                                {mine && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const names = readerNames(m);
                                      if (names.length) toast(names.join(" · "), "info");
                                    }}
                                    title={receiptOf(m).label}
                                    aria-label={receiptOf(m).label}
                                    className={`relative inline-flex h-3.5 w-4 shrink-0 items-center ${receiptOf(m).seen ? "text-sky-300" : "opacity-70"}`}
                                  >
                                    <Icon name="check" size={13} className="absolute start-0" strokeWidth={2.4} />
                                    {receiptOf(m).seen && <Icon name="check" size={13} className="absolute start-1.5" strokeWidth={2.4} />}
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* composer */}
        <div className="border-t border-line bg-surface/60 p-2 backdrop-blur sm:p-3">
          <div className="mx-auto max-w-3xl">
            {selectMode && (
              <div className="anim-rise mb-2 flex items-center gap-2 rounded-lg border border-accent/35 bg-accent/10 px-3 py-2">
                <span className="text-xs font-bold text-accent">{faNum(selected.size)} پیام انتخاب شده</span>
                <div className="ms-auto flex items-center gap-1.5">
                  {selected.size === 1 && (() => {
                    const only = messages.find((m) => m.id === [...selected][0]);
                    return only && only.type === "text" && only.sender?.id === me.id ? (
                      <button onClick={() => startEdit(only)} className="press flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-1.5 text-[11px] font-bold"><Icon name="edit" size={13} /> ویرایش</button>
                    ) : null;
                  })()}
                  <button onClick={() => void deleteSelected()} disabled={!selected.size} className="press flex items-center gap-1.5 rounded-xl bg-rose-500/15 px-3 py-1.5 text-[11px] font-bold text-rose-400 disabled:opacity-40"><Icon name="trash" size={13} /> حذف</button>
                  <button onClick={exitSelect} className="press flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-muted"><Icon name="close" size={13} /> لغو</button>
                </div>
              </div>
            )}
            {editing && (
              <div className="anim-rise mb-2 flex items-start gap-2 rounded-lg border border-accent/35 bg-accent/10 px-3 py-2">
                <Icon name="edit" size={15} className="mt-0.5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-accent">در حال ویرایش پیام</p>
                  <p className="truncate text-[11px] text-muted">{editing.content}</p>
                </div>
                <button onClick={() => { setEditing(null); setText(""); }} aria-label="لغو ویرایش" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><Icon name="close" size={14} /></button>
              </div>
            )}
            {!!pending.length && (
              <div className="scroll-thin anim-pop mb-2 flex gap-2 overflow-x-auto pb-1">
                {pending.map((p, i) => (
                  <div key={i} className="relative flex shrink-0 items-center gap-2 rounded-lg bg-surface-2 p-1.5 pe-3">
                    {p.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
                        <Icon name={p.voice ? "mic" : fileIcon(p.file.type, p.file.name)} size={22} />
                      </span>
                    )}
                    <span className="min-w-0 max-w-[130px]">
                      <span className="block truncate text-xs font-semibold" dir="auto">{p.voice ? "پیام صوتی" : p.file.name}</span>
                      <span className="block text-[10px] text-muted">{formatSize(p.file.size)}</span>
                    </span>
                    <button onClick={() => removePending(i)} aria-label="حذف پیوست" className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-muted shadow hover:text-rose-400">
                      <Icon name="close" size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {recording && (
              <div className="anim-rise mb-2 flex items-center gap-3 rounded-xl bg-rose-500/10 px-3 py-2.5 ring-1 ring-rose-500/40">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" />
                </span>
                <span className="text-sm font-black tabular-nums text-rose-400" dir="ltr">
                  {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, "0")}
                </span>
                <div className="flex h-7 min-w-0 flex-1 items-center justify-center gap-[3px] overflow-hidden px-2" dir="ltr" aria-hidden="true">
                  {recBars.map((h, idx) => (
                    <span
                      key={idx}
                      className="w-1 rounded-full bg-rose-400/85 transition-[height] duration-75"
                      style={{ height: `${Math.max(15, h)}%` }}
                    />
                  ))}
                </div>
                <button onClick={() => stopRecording(false)} className="press rounded-xl bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-muted hover:text-fg">لغو</button>
                <button onClick={() => stopRecording(true)} disabled={recSeconds < 1} className="grad-accent press flex h-10 w-10 items-center justify-center rounded-lg text-on-accent disabled:opacity-40" title="پایان ضبط و ارسال">
                  <Icon name="send" size={18} className="-scale-x-100" />
                </button>
              </div>
            )}
            {showEmoji && (
              <div className="mb-2">
                <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} />
              </div>
            )}
            {!recording && (
            <div className="flex items-end gap-2 rounded-xl bg-surface-2 p-1.5 transition focus-within:ring-1 focus-within:ring-accent/50">
              <div className="flex items-center">
                <button onClick={() => setShowEmoji((s) => !s)} title="ایموجی" aria-label="ایموجی" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-accent">
                  <Icon name="smile" size={20} />
                </button>
                {me.permissions.includes("images.upload") && (
                  <button onClick={() => imgInput.current?.click()} title="ارسال تصویر (چند عکس)" aria-label="ارسال تصویر" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-accent">
                    <Icon name="image" size={20} />
                  </button>
                )}
                {me.permissions.includes("files.upload") && (
                  <button onClick={() => fileInput.current?.click()} title="ارسال فایل (چند فایل)" aria-label="ارسال فایل" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-accent">
                    <Icon name="paperclip" size={20} />
                  </button>
                )}
                <button
                  onClick={() => void startRecording()}
                  disabled={sending}
                  title="ضبط پیام صوتی"
                  aria-label="ضبط پیام صوتی"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-3 hover:text-accent"
                >
                  <Icon name="mic" size={20} />
                </button>
              </div>
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.files ?? []);
                  if (files.length) {
                    e.preventDefault();
                    pickFiles(files);
                  }
                }}
                rows={1}
                placeholder="پیام خود را بنویسید..."
                dir="auto"
                className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted/70"
              />
              <button
                onClick={send}
                disabled={sending || (!text.trim() && !pending.length && !editing)}
                className="grad-accent glow press flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-on-accent hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                title="ارسال"
              >
                {sending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <Icon name="send" size={19} className="-scale-x-100" strokeWidth={2} />
                )}
              </button>
            </div>
            )}
            <input ref={imgInput} type="file" accept="image/*" multiple hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
          </div>
        </div>

        {dragOver && (
          <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10 backdrop-blur-sm">
            <p className="flex items-center gap-2 text-lg font-bold text-accent">
              <Icon name="paperclip" size={20} /> فایل را اینجا رها کنید
            </p>
          </div>
        )}
      </div>

      {/* Info panel */}
      {showInfo && detail && (
        <aside className="anim-slide-panel fixed inset-0 z-40 flex w-full flex-col border-r border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:static lg:z-auto lg:w-80 lg:shrink-0 lg:pb-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="font-bold">اطلاعات</h3>
            <button onClick={() => setShowInfo(false)} aria-label="بستن" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
              <Icon name="close" size={17} />
            </button>
          </div>
          <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-4">
            <div className="flex flex-col items-center text-center">
              {detail.type === "saved" ? (
                <span className="grad-accent flex h-[88px] w-[88px] items-center justify-center rounded-2xl text-on-accent shadow-md">
                  <Icon name="bookmark" size={40} />
                </span>
              ) : detail.type === "direct" ? (
                <Avatar name={detail.name} color={detail.peer?.avatarColor} lastSeenAt={detail.peer?.lastSeenAt} size={88} userId={detail.peer?.id} avatarFileId={detail.peer?.avatarFileId} />
              ) : (
                <Avatar name={detail.name} emoji={detail.emoji} size={88} />
              )}
              <h4 className="mt-3 text-lg font-black">{detail.name}</h4>
              {detail.peer && (
                <p className="text-sm text-accent" dir="ltr">
                  @{detail.peer.username}
                </p>
              )}
              {detail.description && <p className="mt-2 text-sm leading-6 text-muted">{detail.description}</p>}
              {detail.type === "direct" && detail.peer && (
                <Button variant="danger" onClick={() => blockUser(detail.peer.id, detail.name)} className="mt-4 w-full">
                  <Icon name="ban" size={16} /> مسدود کردن کاربر
                </Button>
              )}
            </div>

            {detail.type !== "direct" && detail.type !== "saved" && (
              <>
                {(detail.type === "room" || isMod) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted">افزودن عضو</p>
                      <button
                        type="button"
                        onClick={() => { setPickedMembers([]); setAddModalOpen(true); }}
                        className="flex items-center gap-1 text-[11px] font-bold text-accent hover:underline"
                      >
                        <Icon name="user-plus" size={13} /> انتخاب چندتایی دوستان
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Input dir="ltr" placeholder="@username" value={addUser} onChange={(e) => setAddUser(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMember(addUser)} />
                      <Button onClick={() => addMember(addUser)} className="shrink-0">
                        افزودن
                      </Button>
                    </div>
                    {invitable.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {invitable.slice(0, 8).map((f) => (
                          <button
                            key={f.id}
                            onClick={() => addMember(f.user.username)}
                            className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1 text-xs hover:border-accent"
                          >
                            <Avatar name={f.user.displayName} color={f.user.avatarColor} size={20} userId={f.user.id} avatarFileId={f.user.avatarFileId} />+ {f.user.displayName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs font-semibold text-muted">اعضا ({faNum(members.length)})</p>
                  <div className="space-y-1">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        onContextMenu={(event) => {
                          const items = [
                            { type: "label", label: `${m.displayName}${m.id === me.id ? " (شما)" : ""} · ${ROLE_LABEL[m.role] ?? "عضو"}` },
                          ];
                          if (m.id === me.id) {
                            if (onOpenProfile) items.push({ type: "item", key: "profile", label: "مشاهده پروفایل", icon: "user", onClick: () => onOpenProfile(m.id) });
                            items.push({ type: "item", key: "copyme", label: "کپی نام کاربری من", icon: "copy", onClick: () => { void navigator.clipboard?.writeText(`@${m.username}`).then(() => toast("کپی شد", "success")).catch(() => toast("کپی انجام نشد", "error")); } });
                            openMenu(event, items);
                            return;
                          }
                          if (onOpenProfile) items.push({ type: "item", key: "profile", label: "مشاهده پروفایل", icon: "user", onClick: () => onOpenProfile(m.id) });
                          items.push({ type: "item", key: "msg", label: "پیام خصوصی", icon: "chat", onClick: () => onOpenDirect(m.id) });
                          items.push({ type: "item", key: "copy", label: "کپی نام کاربری", icon: "copy", onClick: () => { void navigator.clipboard?.writeText(`@${m.username}`).then(() => toast("کپی شد", "success")).catch(() => toast("کپی انجام نشد", "error")); } });
                          const canManageRoles = detail?.type !== "direct" && (myRole === "owner" || me.permissions.includes("rooms.manage")) && m.role !== "owner";
                          const canKickThis = detail?.type !== "direct" && m.role !== "owner" && (myRole === "owner" || me.permissions.includes("rooms.manage") || (myRole === "admin" && m.role === "member"));
                          if (canManageRoles || canKickThis) {
                            items.push({ type: "divider" });
                            items.push({ type: "label", label: "اقدامات مدیر" });
                            if (canManageRoles) items.push({ type: "item", key: "promote", label: m.role === "admin" ? "برکناری از مدیریت" : "ارتقا به مدیر", icon: m.role === "admin" ? "chevron-down" : "star", onClick: () => void manageMember(m.id, m.role === "admin" ? "demote" : "promote") });
                            if (canKickThis) items.push({ type: "item", key: "kick", label: `حذف از ${detail?.type === "room" ? "اتاق" : "گروه"}`, icon: "door", danger: true, onClick: () => void kickMember(m) });
                          }
                          items.push({ type: "divider" });
                          items.push({ type: "item", key: "block", label: "مسدود کردن این کاربر", icon: "ban", danger: true, onClick: () => void blockUser(m.id, m.displayName) });
                          openMenu(event, items);
                        }}
                        className="group flex items-center gap-3 rounded-lg p-2 hover:bg-surface-2"
                      >
                        <button onClick={() => onOpenProfile?.(m.id)} aria-label={`پروفایل ${m.displayName}`} className="shrink-0">
                          <Avatar name={m.displayName} color={m.avatarColor} lastSeenAt={m.lastSeenAt} size={38} userId={m.id} avatarFileId={m.avatarFileId} status={m.status} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {m.displayName} {m.id === me.id && <span className="text-xs text-muted">(شما)</span>}
                          </p>
                          <p className="truncate text-[11px] text-muted" dir="ltr">
                            @{m.username}
                          </p>
                        </div>
                        {m.role !== "member" && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${m.role === "owner" ? "bg-amber-500/15 text-amber-400" : "bg-accent/15 text-accent"}`}>
                            {ROLE_LABEL[m.role]}
                          </span>
                        )}
                        {m.id !== me.id && (
                          <div className="hidden items-center gap-1 group-hover:flex">
                            <button onClick={() => onOpenDirect(m.id)} title="پیام خصوصی" className="rounded-lg p-1.5 text-muted hover:bg-surface-3 hover:text-accent">
                              <Icon name="chat" size={14} />
                            </button>
                            <button onClick={() => blockUser(m.id, m.displayName)} title="مسدود کردن کاربر" className="rounded-lg p-1.5 text-muted hover:bg-rose-500/15 hover:text-rose-400">
                              <Icon name="ban" size={14} />
                            </button>
                            {(myRole === "owner" || me.permissions.includes("rooms.manage")) && m.role !== "owner" && (
                              <button
                                onClick={() => manageMember(m.id, m.role === "admin" ? "demote" : "promote")}
                                title={m.role === "admin" ? "برکناری از مدیریت" : "ارتقا به مدیر"}
                                className="rounded-lg px-1.5 py-1 text-xs hover:bg-surface-3"
                              >
                                <Icon name={m.role === "admin" ? "chevron-down" : "star"} size={14} className={m.role === "admin" ? "text-muted" : "text-amber-400"} />
                              </button>
                            )}
                            {(isMod || me.permissions.includes("rooms.manage")) && m.role !== "owner" && (myRole === "owner" || m.role === "member" || me.permissions.includes("rooms.manage")) && (
                              <button onClick={() => void kickMember(m)} title="حذف از گفتگو" className="rounded-lg p-1.5 text-muted hover:bg-rose-500/20 hover:text-rose-400">
                                <Icon name="door" size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 border-t border-line pt-4">
                  <Button variant="ghost" onClick={leave} className="w-full">
                    ترک {detail.type === "room" ? "اتاق" : "گروه"}
                  </Button>
                  {(myRole === "owner" || me.permissions.includes("rooms.manage")) && (
                    <Button variant="danger" onClick={remove} className="w-full">
                      حذف {detail.type === "room" ? "اتاق" : "گروه"} برای همه
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      )}

      {showVoice && detail && (
        <VoicePanel
          key={conversationId}
          conversationId={conversationId}
          detail={detail}
          me={me}
          onClose={() => setShowVoice(false)}
          onOpenDirect={onOpenDirect}
          onOpenProfile={onOpenProfile}
        />
      )}

      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title={`افزودن عضو به «${detail?.name ?? "گروه"}»`}>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-muted">نام کاربری (اختیاری)</label>
            <Input
              dir="ltr"
              placeholder="@username"
              value={addUser}
              onChange={(e) => setAddUser(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !addingBatch) void addMembersBatch();
              }}
            />
          </div>
          {invitable.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-bold text-muted">انتخاب از فهرست دوستان ({faNum(pickedMembers.length)} انتخاب‌شده)</p>
              <div className="scroll-thin max-h-60 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-surface/60 p-2">
                {invitable.map((f) => {
                  const on = pickedMembers.includes(f.user.username);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setPickedMembers((prev) => (on ? prev.filter((u) => u !== f.user.username) : [...prev, f.user.username]))}
                      className={`flex w-full items-center gap-3 rounded-lg border p-2 text-right transition ${
                        on ? "border-accent bg-accent/15" : "border-transparent bg-surface-2 hover:border-line"
                      }`}
                    >
                      <Avatar name={f.user.displayName} color={f.user.avatarColor} size={36} userId={f.user.id} avatarFileId={f.user.avatarFileId} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{f.user.displayName}</p>
                        <p className="truncate text-xs text-muted" dir="ltr">@{f.user.username}</p>
                      </div>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${on ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`}>
                        {on && <Icon name="check" size={12} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-surface-2 p-3 text-center text-xs text-muted">
              همهٔ دوستان فعلی شما عضو این گفتگو هستند؛ می‌توانید با وارد کردن نام کاربری افراد جدید را اضافه کنید.
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={() => setAddModalOpen(false)} className="flex-1">انصراف</Button>
            <Button
              onClick={() => void addMembersBatch()}
              disabled={addingBatch || (!pickedMembers.length && !addUser.trim())}
              className="flex-1"
            >
              {addingBatch ? "در حال افزودن…" : "افزودن اعضا"}
            </Button>
          </div>
        </div>
      </Modal>

      <ContextMenu state={menu} onClose={closeMenu} />

      {lightbox && (() => {
        const lbIds = typeof lightbox === "object" ? lightbox.ids : [lightbox];
        const lbIdx = typeof lightbox === "object" ? lightbox.index : 0;
        const activeFid = lbIds[lbIdx] ?? lbIds[0];
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6 backdrop-blur" onClick={() => setLightbox(null)}>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="بستن"
              className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
            >
              <Icon name="close" size={18} />
            </button>
            {lbIds.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightbox({ ids: lbIds, index: (lbIdx - 1 + lbIds.length) % lbIds.length });
                  }}
                  aria-label="تصویر قبلی"
                  className="absolute left-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
                >
                  <Icon name="chevron-left" size={22} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightbox({ ids: lbIds, index: (lbIdx + 1) % lbIds.length });
                  }}
                  aria-label="تصویر بعدی"
                  className="absolute right-4 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"
                >
                  <Icon name="arrow-right" size={20} />
                </button>
              </>
            )}
            <AuthedImage
              key={activeFid}
              fileId={activeFid}
              alt="تصویر"
              className="anim-pop max-h-[82vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {lbIds.length > 1 && (
                <span className="rounded-lg bg-white/15 px-3 py-2 text-xs font-bold text-white backdrop-blur">
                  {faNum(lbIdx + 1)} از {faNum(lbIds.length)}
                </span>
              )}
              <button
                type="button"
                onClick={() => void downloadAuthed(`/api/files/${activeFid}?download=1`, `image-${activeFid}`).catch((err) => toast(err.message, "error"))}
                className="rounded-lg bg-white/15 px-4 py-2 text-sm text-white backdrop-blur hover:bg-white/25"
              >
                <span className="flex items-center gap-1.5"><Icon name="download" size={15} /> دانلود تصویر</span>
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/** A meeting invitation posted into a chat: title, host, lobby note and a join button. */
function MeetingInviteCard({ payload, mine }) {
  let data = {};
  try {
    data = JSON.parse(payload);
  } catch {
    return <p className="px-4 py-2 text-xs opacity-70">دعوت‌نامهٔ جلسه</p>;
  }
  if (!data.token) return <p className="px-4 py-2 text-xs opacity-70">دعوت‌نامهٔ جلسه</p>;
  return (
    <div className={`m-2 rounded-lg border p-3 ${mine ? "border-white/25 bg-white/10" : "border-accent/30 bg-accent/10"}`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${mine ? "bg-white/20 text-white" : "bg-accent/20 text-accent"}`}>
          <Icon name="radio" size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">دعوت به جلسهٔ صوتی</p>
          <p className="truncate text-[11px] opacity-80">{data.title}{data.host ? ` · میزبان: ${data.host}` : ""}</p>
        </div>
      </div>
      {data.lobby && <p className="mt-2 text-[10px] opacity-75">ورود با تأیید میزبان انجام می‌شود.</p>}
      <button
        onClick={() => navigate(`/meet/${data.token}`)}
        className={`press mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${mine ? "bg-white/20 text-white hover:bg-white/30" : "grad-accent text-on-accent"}`}
      >
        <Icon name="phone" size={15} /> پیوستن به جلسه
      </button>
    </div>
  );
}

const DEFAULT_WAVE_BARS = 36;
function makeSeededPeaks(seed, count = DEFAULT_WAVE_BARS) {
  let s = (Number(seed) || 1) * 2654435761;
  return Array.from({ length: count }, (_, i) => {
    s = (s ^ (s >>> 13)) * 1597334677;
    const r = Math.abs(s % 100) / 100;
    const envelope = Math.sin(((i + 0.5) / count) * Math.PI);
    return Math.max(0.18, Math.min(1, 0.22 + r * 0.58 + envelope * 0.25));
  });
}

/** Advanced voice message player with decoded equalizer bars, mouse hover timestamp tooltip, click/drag scrub, and playback speed control. */
function VoiceBubble({ fileId, duration, mine }) {
  const audioRef = useRef(null);
  const trackRef = useRef(null);
  const [src, setSrc] = useState("");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [len, setLen] = useState(duration);
  const [rate, setRate] = useState(1);
  const [peaks, setPeaks] = useState(() => makeSeededPeaks(fileId));
  const [hoverRatio, setHoverRatio] = useState(null);

  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    void authFetch(`/api/files/${fileId}`)
      .then((r) => (r.ok ? r.blob() : null))
      .then(async (blob) => {
        if (!alive || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        // Decode real waveform peaks for equalizer bars
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          let ctx;
          try {
            ctx = new Ctx();
            const buf = await blob.arrayBuffer();
            const decoded = await ctx.decodeAudioData(buf);
            if (!alive) return;
            if (decoded.duration && Number.isFinite(decoded.duration)) {
              setLen(decoded.duration);
            }
            const channel = decoded.getChannelData(0);
            const blockSize = Math.max(1, Math.floor(channel.length / DEFAULT_WAVE_BARS));
            const raw = [];
            let maxPeak = 0.01;
            for (let i = 0; i < DEFAULT_WAVE_BARS; i++) {
              let sum = 0;
              const start = i * blockSize;
              const end = Math.min(channel.length, start + blockSize);
              const stride = Math.max(1, Math.floor((end - start) / 64));
              let count = 0;
              for (let j = start; j < end; j += stride) {
                sum += Math.abs(channel[j]);
                count++;
              }
              const avg = count ? sum / count : 0;
              if (avg > maxPeak) maxPeak = avg;
              raw.push(avg);
            }
            setPeaks(raw.map((v) => Math.max(0.16, Math.min(1, v / maxPeak))));
          } catch {
            /* keep seeded fallback peaks */
          } finally {
            void ctx?.close().catch(() => {});
          }
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  const totalSec = Math.max(len || duration || 0, 0.1);
  const progressRatio = Math.min(1, Math.max(0, pos / totalSec));

  const fmt = (s) => {
    const total = Math.max(0, Math.floor(Number(s) || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };

  const ratioFromClientX = (clientX) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const seekToRatio = (r) => {
    const el = audioRef.current;
    const dur = el?.duration && Number.isFinite(el.duration) ? el.duration : totalSec;
    if (el && dur > 0) {
      el.currentTime = r * dur;
    }
    setPos(r * dur);
  };

  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const sub = mine ? "text-white/80" : "text-muted";
  const activeBarClass = mine ? "bg-white" : "bg-accent";
  const hoverBarClass = mine ? "bg-white/65" : "bg-accent/55";
  const idleBarClass = mine ? "bg-white/30" : "bg-fg/20";

  return (
    <div className="flex min-w-[255px] max-w-[320px] items-center gap-2.5 px-3 pb-1 pt-2.5 sm:min-w-[285px]" dir="ltr">
      <button
        type="button"
        onClick={() => {
          const el = audioRef.current;
          if (!el || !src) return;
          el.playbackRate = rate;
          if (playing) el.pause();
          else void el.play().catch(() => {});
        }}
        aria-label={playing ? "توقف پخش" : "پخش پیام صوتی"}
        className={`press flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition ${
          mine ? "bg-white/25 text-white hover:bg-white/35" : "bg-accent/15 text-accent hover:bg-accent/25"
        } ${!src ? "opacity-50" : ""}`}
      >
        <Icon name={playing ? "pause" : "play"} size={17} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="نوار زمان پیام صوتی"
          aria-valuemin={0}
          aria-valuemax={Math.round(totalSec)}
          aria-valuenow={Math.round(pos)}
          onMouseMove={(e) => setHoverRatio(ratioFromClientX(e.clientX))}
          onMouseLeave={() => setHoverRatio(null)}
          onClick={(e) => seekToRatio(ratioFromClientX(e.clientX))}
          className="group/wave relative flex h-8 cursor-pointer select-none items-center gap-[2.5px] pt-1"
        >
          {hoverRatio !== null && (
            <span
              className="pointer-events-none absolute -top-6 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white shadow-md ring-1 ring-white/15"
              style={{ left: `${Math.min(94, Math.max(6, hoverRatio * 100))}%` }}
            >
              {fmt(hoverRatio * totalSec)}
            </span>
          )}
          {peaks.map((peak, i) => {
            const barPos = (i + 0.5) / peaks.length;
            const played = barPos <= progressRatio;
            const hovered = hoverRatio !== null && barPos <= hoverRatio;
            const liveBounce = playing && Math.abs(barPos - progressRatio) < 0.08 ? 1.15 : 1;
            const heightPct = Math.min(100, Math.max(18, Math.round(peak * 100 * liveBounce)));
            return (
              <span
                key={i}
                className={`flex-1 rounded-full transition-[height,background-color] duration-100 ${
                  played ? activeBarClass : hovered ? hoverBarClass : idleBarClass
                }`}
                style={{ height: `${heightPct}%` }}
              />
            );
          })}
        </div>

        <div className={`flex items-center justify-between gap-2 text-[10px] font-semibold tabular-nums ${sub}`}>
          <span className="flex items-center gap-1">
            <Icon name="mic" size={11} />
            <span>
              {hoverRatio !== null
                ? `${fmt(hoverRatio * totalSec)} / ${fmt(totalSec)}`
                : playing || pos > 0
                  ? `${fmt(pos)} / ${fmt(totalSec)}`
                  : fmt(totalSec)}
            </span>
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              cycleRate();
            }}
            className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold transition ${
              mine ? "bg-white/20 text-white hover:bg-white/30" : "bg-surface-3 text-fg hover:bg-accent/20 hover:text-accent"
            }`}
            title="سرعت پخش"
          >
            {rate}x
          </button>
        </div>
      </div>

      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          className="hidden"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPos(0);
          }}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (d && Number.isFinite(d)) setLen(d);
          }}
        />
      )}
    </div>
  );
}
