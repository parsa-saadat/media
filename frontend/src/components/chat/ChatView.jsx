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
import AuthedImage, { rememberBlob } from "../common/AuthedImage";
import EmojiPicker from "./EmojiPicker";
import { StatusLine } from "../common/StatusDot";
import { playSound } from "../../utils/sounds";
import { navigate } from "../../utils/router";
import { ContextMenu, useContextMenu } from "../common/ContextMenu";
import { useConfirm } from "../common/Confirm";
import ChatWallpaperBackdrop from "./ChatWallpaperBackdrop";
import Gallery from "./Gallery";
import { buildMicConstraints, createMicAudioPipeline, readAudioPrefs } from "../../utils/audioPrefs";

const ROLE_LABEL = { owner: "مالک", admin: "مدیر", member: "عضو" };

const URL_TOKEN_RE = /(https?:\/\/[^\s<>"']+)/gi;
const TRAILING_PUNCT_RE = /[),.!?:;،؛»\]}]+$/;

/** Safely decode percent-encoded Persian/Unicode URLs for clean human-readable display. */
function formatDisplayUrl(rawHref) {
  let decoded = rawHref;
  try {
    decoded = decodeURI(rawHref);
  } catch {
    try {
      decoded = decodeURIComponent(rawHref);
    } catch {
      decoded = rawHref;
    }
  }
  // Strip protocol + trailing slash so links like `https://parsigeo.ir/product/.../` look crisp
  let clean = decoded.replace(/^https?:\/\/(www\.)?/i, "");
  if (clean.endsWith("/") && clean.indexOf("/") !== clean.length - 1) {
    clean = clean.slice(0, -1);
  }
  if (clean.length > 76) {
    clean = clean.slice(0, 46) + "…" + clean.slice(-24);
  }
  return clean;
}

/** Splits message text into plain segments and smart clickable links with decoded Persian labels. */
function RichMessageText({ text, mine }) {
  if (!text) return null;
  const parts = [];
  let lastIdx = 0;
  URL_TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = URL_TOKEN_RE.exec(text)) !== null) {
    const start = match.index;
    let rawUrl = match[0];
    let trailing = "";
    const trailMatch = rawUrl.match(TRAILING_PUNCT_RE);
    if (trailMatch) {
      trailing = trailMatch[0];
      rawUrl = rawUrl.slice(0, -trailing.length);
    }
    if (start > lastIdx) {
      parts.push({ kind: "text", value: text.slice(lastIdx, start) });
    }
    parts.push({
      kind: "link",
      href: rawUrl,
      label: formatDisplayUrl(rawUrl),
    });
    if (trailing) {
      parts.push({ kind: "text", value: trailing });
    }
    lastIdx = start + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ kind: "text", value: text.slice(lastIdx) });
  }

  return (
    <>
      {parts.map((part, idx) =>
        part.kind === "link" ? (
          <a
            key={idx}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            dir="auto"
            onClick={(e) => e.stopPropagation()}
            title={part.href}
            className={`inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 align-baseline text-[13px] font-semibold underline decoration-1 underline-offset-4 transition break-all ${
              mine
                ? "bg-accent/18 text-accent decoration-accent/55 hover:bg-accent/28"
                : "bg-accent/12 text-accent decoration-accent/50 hover:bg-accent/20"
            }`}
          >
            <Icon name="globe" size={12} className="shrink-0 opacity-85" />
            <span className="truncate">{part.label}</span>
          </a>
        ) : (
          <span key={idx}>{part.value}</span>
        ),
      )}
    </>
  );
}

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
  convs,
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
  /** multi-select mode: pick several messages and delete/forward them together */
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [showJumpDown, setShowJumpDown] = useState(false);
  /** Forward modal state: array of message IDs to forward, destination search & picked target IDs */
  const [forwardModalIds, setForwardModalIds] = useState([]);
  const [forwardTargets, setForwardTargets] = useState([]);
  const [forwardIncludeSaved, setForwardIncludeSaved] = useState(false);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardingBusy, setForwardingBusy] = useState(false);
  const [localConvs, setLocalConvs] = useState([]);
  const [peerProfile, setPeerProfile] = useState(null);
  const [peerRelation, setPeerRelation] = useState("none");
  const [peerFriendId, setPeerFriendId] = useState(null);
  const [peerGalleryIdx, setPeerGalleryIdx] = useState(null);
  /** Optimistic outgoing queue: `Array<{ tempId, type, content, createdAt, status: 'sending'|'failed', errorText?, files?: File[], localUrls?: string[], voiceBlob?: Blob, voiceSec?: number, fileName?: string, fileSize?: number, fileMime?: string }>` */
  const [outbox, setOutbox] = useState([]);
  const tempSeqRef = useRef(0);
  /** attachments queued for the next send: { file, url } — url is a preview for images only */
  const [pending, setPending] = useState([]);
  /** voice recording: true while MediaRecorder is capturing */
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recBars, setRecBars] = useState(() => Array.from({ length: 24 }, () => 18));
  const [typingUsers, setTypingUsers] = useState([]);
  const [typingCycleIdx, setTypingCycleIdx] = useState(0);
  const { confirm } = useConfirm();
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const scrollRef = useRef(null);
  const contentWrapRef = useRef(null);
  const stickBottom = useRef(true);
  const initialPinnedRef = useRef(false);
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
  const isTypingActiveRef = useRef(false);
  const lastTypingSentAtRef = useRef(0);
  const typingStopTimerRef = useRef(null);
  const clientKeyMapRef = useRef(new Map());

  useEffect(() => {
    setSelectMode(false);
    setSelected(new Set());
    setEditing(null);
    setShowJumpDown(false);
    setTypingUsers([]);
    setTypingCycleIdx(0);
    isTypingActiveRef.current = false;
    lastTypingSentAtRef.current = 0;
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    setOutbox((prev) => {
      prev.forEach((item) => item.localUrls?.forEach((u) => URL.revokeObjectURL(u)));
      return [];
    });
    stickBottom.current = true;
    initialPinnedRef.current = false;
    clientKeyMapRef.current.clear();
    // Clear typing state on unmount or conversation switch
    return () => {
      if (isTypingActiveRef.current) {
        void apiFetch(`/api/conversations/${conversationId}/typing`, {
          method: "POST",
          json: { typing: false },
        }).catch(() => {});
      }
    };
  }, [conversationId]);

  // Smoothly cycle typing names when 2+ users are typing simultaneously
  useEffect(() => {
    if (typingUsers.length < 2) {
      setTypingCycleIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setTypingCycleIdx((prev) => (prev + 1) % typingUsers.length);
    }, 2100);
    return () => clearInterval(timer);
  }, [typingUsers.length]);

  const sendTypingSignal = useCallback(
    (active) => {
      if (!conversationId || detail?.type === "saved") return;
      if (!active) {
        if (!isTypingActiveRef.current) return;
        isTypingActiveRef.current = false;
        lastTypingSentAtRef.current = 0;
        if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
        void apiFetch(`/api/conversations/${conversationId}/typing`, {
          method: "POST",
          json: { typing: false },
        }).catch(() => {});
        return;
      }
      const now = Date.now();
      if (!isTypingActiveRef.current || now - lastTypingSentAtRef.current > 2400) {
        isTypingActiveRef.current = true;
        lastTypingSentAtRef.current = now;
        void apiFetch(`/api/conversations/${conversationId}/typing`, {
          method: "POST",
          json: { typing: true },
        }).catch(() => {});
      }
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = setTimeout(() => {
        isTypingActiveRef.current = false;
        void apiFetch(`/api/conversations/${conversationId}/typing`, {
          method: "POST",
          json: { typing: false },
        }).catch(() => {});
      }, 3600);
    },
    [conversationId, detail?.type],
  );

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

  // When opening the info sidebar on a direct chat, load the peer's rich profile (banner, bio, photos, status, relation)
  useEffect(() => {
    if (!showInfo || detail?.type !== "direct" || !detail.peer?.id) {
      setPeerProfile(null);
      return;
    }
    let alive = true;
    const pid = detail.peer.id;
    apiFetch(`/api/users/${pid}/profile`)
      .then((d) => {
        if (alive) setPeerProfile(d.profile);
      })
      .catch(() => {});
    apiFetch("/api/friends")
      .then((d) => {
        if (!alive) return;
        const find = (list) => list.find((f) => f.user.id === pid);
        if (find(d.friends)) {
          setPeerRelation("friend");
          setPeerFriendId(find(d.friends).id);
        } else if (find(d.incoming)) {
          setPeerRelation("incoming");
          setPeerFriendId(find(d.friends)?.id ?? find(d.incoming).id);
        } else if (find(d.outgoing)) {
          setPeerRelation("outgoing");
          setPeerFriendId(find(d.outgoing).id);
        } else {
          setPeerRelation("none");
          setPeerFriendId(null);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [showInfo, detail?.type, detail?.peer?.id]);

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

  // polling for new messages + live typing state
  useEffect(() => {
    let tick = 0;
    const pollTyping = () => {
      void apiFetch(`/api/conversations/${conversationId}/typing`)
        .then((r) => {
          if (Array.isArray(r?.typingUsers)) {
            setTypingUsers(r.typingUsers.filter((u) => u.id !== me.id));
          }
        })
        .catch(() => {});
    };
    pollTyping();
    const t = setInterval(async () => {
      tick++;
      pollTyping();
      try {
        // Sync readBy receipts & deletions every ~4.5s, and refresh peer presence/detail too
        if (tick % 3 === 0) {
          const d = await apiFetch(`/api/conversations/${conversationId}/messages`);
          setMessages((prev) => {
            const map = new Map(prev.map((m) => [m.id, m]));
            d.messages.forEach((m) => map.set(m.id, m));
            return Array.from(map.values()).sort((a, b) => a.id - b.id);
          });
          if (tick % 6 === 0) loadDetail();
        }
        const d = await apiFetch(
          `/api/conversations/${conversationId}/messages?after=${lastIdRef.current}`
        );
        if (d.messages.length) {
          setMessages((prev) => {
            const map = new Map(prev.map((m) => [m.id, m]));
            for (const m of d.messages) map.set(m.id, m);
            return Array.from(map.values()).sort((a, b) => a.id - b.id);
          });
          lastIdRef.current = Math.max(lastIdRef.current, d.messages.at(-1).id);
          if (document.visibilityState === "visible") markRead(lastIdRef.current);
          if (d.messages.some((m) => m.type === "system")) loadDetail();
          // a message from somebody else arrived while this chat is open
          if (d.messages.some((m) => (m.sender?.id ?? m.senderId) && (m.sender?.id ?? m.senderId) !== me.id)) {
            playSound("message");
          }
        }
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [conversationId, loadDetail, markRead, me.id]);

  // Instant, zero-animation scroll-to-bottom on initial load and whenever pinned to bottom
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || loading) return;
    if (!initialPinnedRef.current) {
      el.scrollTop = el.scrollHeight;
      stickBottom.current = true;
      setShowJumpDown(false);
      if (messages.length > 0 || outbox.length > 0) initialPinnedRef.current = true;
      return;
    }
    if (stickBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, outbox, loading]);

  // Keep bottom pinned without jumpiness when images/fonts OR viewport/window resize!
  useEffect(() => {
    const wrap = contentWrapRef.current;
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let prevClientH = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const cur = scrollRef.current;
      if (!cur) return;
      const heightGrew = cur.clientHeight > prevClientH;
      prevClientH = cur.clientHeight;
      if (stickBottom.current) {
        cur.scrollTop = cur.scrollHeight;
        setShowJumpDown(false);
      } else if (heightGrew) {
        const distFromBottom = cur.scrollHeight - cur.scrollTop - cur.clientHeight;
        stickBottom.current = distFromBottom < 110;
        setShowJumpDown(distFromBottom > 260);
      }
    });
    if (wrap) ro.observe(wrap);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, messages.length, outbox.length]);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickBottom.current = true;
    setShowJumpDown(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

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
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickBottom.current = distFromBottom < 110;
    setShowJumpDown(distFromBottom > 260);
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
      const audioPrefs = readAudioPrefs();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: buildMicConstraints(audioPrefs),
      });
      recStream.current = stream;
      let streamToRecord = stream;
      try {
        const pipe = createMicAudioPipeline(stream, audioPrefs);
        recAudioCtxRef.current = pipe;
        if (pipe.outputStream) streamToRecord = pipe.outputStream;
        if (pipe.analyser) {
          const bins = new Uint8Array(pipe.analyser.frequencyBinCount);
          const tick = () => {
            pipe.analyser.getByteFrequencyData(bins);
            const next = Array.from({ length: 24 }, (_, idx) => {
              const v = bins[idx % bins.length] || 0;
              return Math.max(14, Math.min(100, Math.round((v / 255) * 100)));
            });
            setRecBars(next);
            recAnimRef.current = requestAnimationFrame(tick);
          };
          recAnimRef.current = requestAnimationFrame(tick);
        }
      } catch {
        /* fallback to raw stream */
      }
      const recorder = new MediaRecorder(streamToRecord);
      recChunks.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) recChunks.current.push(e.data); };
      recorder.onstop = () => finishRecording();
      recRef.current = recorder;
      recorder.start();
      recSecondsRef.current = 0;
      setRecSeconds(0);
      setRecording(true);
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
      recAudioCtxRef.current.close?.();
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

  function cancelOutboxItem(tempId) {
    setOutbox((prev) => {
      const target = prev.find((x) => x.tempId === tempId);
      target?.localUrls?.forEach((u) => URL.revokeObjectURL(u));
      return prev.filter((x) => x.tempId !== tempId);
    });
  }

  const executeOutboxItem = useCallback(
    async (item) => {
      setOutbox((prev) =>
        prev.map((x) => (x.tempId === item.tempId ? { ...x, status: "sending", errorText: "" } : x)),
      );
      try {
        const sentMsgs = [];
        if (item.type === "voice" && item.voiceBlob) {
          const file = new File([item.voiceBlob], `voice-${Date.now()}.webm`, {
            type: item.voiceBlob.type || "audio/webm",
          });
          const fd = new FormData();
          fd.append("file", file);
          const up = await apiFetch("/api/files", { method: "POST", body: fd });
          const sent = await apiFetch(`/api/conversations/${conversationId}/messages`, {
            method: "POST",
            json: { content: String(item.voiceSec || 1), fileId: up.file.id },
          });
          if (sent?.message) sentMsgs.push(sent.message);
        } else if (item.files?.length) {
          const imageFileIds = [];
          const otherFileIds = [];
          for (const f of item.files) {
            const fd = new FormData();
            fd.append("file", f);
            const up = await apiFetch("/api/files", { method: "POST", body: fd });
            if (f.type?.startsWith("image/")) {
              imageFileIds.push(up.file.id);
              // Pre-warm AuthedImage blob cache so switching from optimistic to server message never flickers!
              rememberBlob(up.file.id, f);
            } else {
              otherFileIds.push(up.file.id);
            }
          }
          let captionUsed = false;
          if (imageFileIds.length > 0) {
            const sent = await apiFetch(`/api/conversations/${conversationId}/messages`, {
              method: "POST",
              json: { content: item.content || "", fileId: imageFileIds[0], fileIds: imageFileIds },
            });
            if (sent?.message) sentMsgs.push(sent.message);
            captionUsed = true;
          }
          for (let i = 0; i < otherFileIds.length; i++) {
            const sent = await apiFetch(`/api/conversations/${conversationId}/messages`, {
              method: "POST",
              json: { content: !captionUsed && i === 0 ? item.content || "" : "", fileId: otherFileIds[i] },
            });
            if (sent?.message) sentMsgs.push(sent.message);
          }
        } else {
          const sent = await apiFetch(`/api/conversations/${conversationId}/messages`, {
            method: "POST",
            json: { content: item.content, fileId: undefined },
          });
          if (sent?.message) sentMsgs.push(sent.message);
        }

        if (sentMsgs.length > 0) {
          const normalized = sentMsgs.map((msg) => ({
            ...msg,
            senderId: msg.senderId ?? me.id,
            sender: msg.sender || {
              id: me.id,
              username: me.username,
              displayName: me.displayName,
              avatarColor: me.avatarColor,
              avatarFileId: me.avatarFileId ?? null,
            },
            readBy: Array.isArray(msg.readBy) ? msg.readBy : [],
          }));
          // Preserve exact same React DOM key on the primary sent message so the bubble morphs in-place!
          clientKeyMapRef.current.set(normalized[0].id, item.id);
          setMessages((prev) => {
            const map = new Map(prev.map((m) => [m.id, m]));
            for (const nm of normalized) map.set(nm.id, nm);
            return Array.from(map.values()).sort((a, b) => a.id - b.id);
          });
          const maxCreatedId = Math.max(...normalized.map((nm) => nm.id));
          if (maxCreatedId > lastIdRef.current) {
            lastIdRef.current = maxCreatedId;
            markRead(maxCreatedId);
          }
        }

        // Remove optimistic placeholder immediately once the real message is in `messages`
        setOutbox((prev) => {
          const done = prev.find((x) => x.tempId === item.tempId);
          done?.localUrls?.forEach((u) => URL.revokeObjectURL(u));
          return prev.filter((x) => x.tempId !== item.tempId);
        });
        cbRef.current.onChanged();
      } catch (e) {
        setOutbox((prev) =>
          prev.map((x) =>
            x.tempId === item.tempId
              ? { ...x, status: "failed", errorText: e?.message || "ارسال ناموفق" }
              : x,
          ),
        );
      }
    },
    [conversationId, markRead, me.id, me.username, me.displayName, me.avatarColor, me.avatarFileId],
  );

  function sendVoice(blob, seconds) {
    if (blob.size > 15 * 1024 * 1024) return toast("پیام صوتی بیش از حد بزرگ است", "error");
    const tempId = `tmp-${Date.now()}-${++tempSeqRef.current}`;
    const localUrl = URL.createObjectURL(blob);
    const item = {
      tempId,
      id: tempId,
      isOptimistic: true,
      type: "voice",
      content: String(seconds),
      voiceBlob: blob,
      voiceSec: seconds,
      localUrls: [localUrl],
      createdAt: new Date().toISOString(),
      status: "sending",
      sender: { id: me.id, displayName: me.displayName, avatarColor: me.avatarColor, avatarFileId: me.avatarFileId },
    };
    playSound("send");
    stickBottom.current = true;
    setOutbox((prev) => [...prev, item]);
    void executeOutboxItem(item);
  }

  function send() {
    if (editing) return void saveEdit();
    if (recording) return; // the recording bar owns the send button while capturing
    const content = text.trim();
    if (!content && !pending.length) return;

    const filesSnapshot = pending.map((p) => p.file);
    const imageFiles = filesSnapshot.filter((f) => f.type?.startsWith("image/"));
    const otherFiles = filesSnapshot.filter((f) => !f.type?.startsWith("image/"));

    // Clear composer & typing state IMMEDIATELY so user can keep typing without waiting!
    sendTypingSignal(false);
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
    setPending([]); // don't revoke p.url yet if we create fresh object URLs below; clean old ones:
    pending.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    setShowEmoji(false);
    playSound("send");
    stickBottom.current = true;
    taRef.current?.focus();

    const nowIso = new Date().toISOString();
    const senderInfo = {
      id: me.id,
      displayName: me.displayName,
      avatarColor: me.avatarColor,
      avatarFileId: me.avatarFileId,
    };

    const itemsToQueue = [];
    if (imageFiles.length > 0) {
      const urls = imageFiles.map((f) => URL.createObjectURL(f));
      itemsToQueue.push({
        tempId: `tmp-${Date.now()}-${++tempSeqRef.current}`,
        id: `tmp-img-${tempSeqRef.current}`,
        isOptimistic: true,
        type: "image",
        content: content,
        files: imageFiles,
        localUrls: urls,
        createdAt: nowIso,
        status: "sending",
        sender: senderInfo,
      });
    }
    otherFiles.forEach((f, idx) => {
      itemsToQueue.push({
        tempId: `tmp-${Date.now()}-${++tempSeqRef.current}`,
        id: `tmp-file-${tempSeqRef.current}`,
        isOptimistic: true,
        type: "file",
        content: imageFiles.length === 0 && idx === 0 ? content : "",
        files: [f],
        fileName: f.name,
        fileSize: f.size,
        fileMime: f.type,
        localUrls: [],
        createdAt: nowIso,
        status: "sending",
        sender: senderInfo,
      });
    });
    if (!imageFiles.length && !otherFiles.length) {
      itemsToQueue.push({
        tempId: `tmp-${Date.now()}-${++tempSeqRef.current}`,
        id: `tmp-txt-${tempSeqRef.current}`,
        isOptimistic: true,
        type: "text",
        content,
        files: [],
        localUrls: [],
        createdAt: nowIso,
        status: "sending",
        sender: senderInfo,
      });
    }

    setOutbox((prev) => [...prev, ...itemsToQueue]);
    for (const item of itemsToQueue) {
      void executeOutboxItem(item);
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

  async function openForwardModal(msgIds) {
    const valid = msgIds.filter(Boolean);
    if (!valid.length) return;
    setForwardModalIds(valid);
    setForwardTargets([]);
    setForwardIncludeSaved(false);
    setForwardSearch("");
    if (Array.isArray(convs) && convs.length) {
      setLocalConvs(convs);
    } else {
      try {
        const d = await apiFetch("/api/conversations");
        setLocalConvs(d.conversations || []);
      } catch {}
    }
  }

  async function submitForward() {
    if (!forwardModalIds.length || (!forwardTargets.length && !forwardIncludeSaved)) return;
    setForwardingBusy(true);
    try {
      const destIds = [...forwardTargets];
      if (forwardIncludeSaved) {
        const savedConv = (convs || localConvs).find((c) => c.type === "saved");
        if (savedConv) {
          if (!destIds.includes(savedConv.id)) destIds.push(savedConv.id);
        } else {
          const created = await apiFetch("/api/direct", { method: "POST", json: { saved: true } });
          if (created?.conversationId && !destIds.includes(created.conversationId)) {
            destIds.push(created.conversationId);
          }
        }
      }
      await apiFetch("/api/messages/forward", {
        method: "POST",
        json: {
          messageIds: forwardModalIds,
          targetConversationIds: destIds,
        },
      });
      toast(
        destIds.length > 1
          ? `به ${faNum(destIds.length)} گفتگو فوروارد شد`
          : "پیام با موفقیت فوروارد شد",
        "success",
      );
      setForwardModalIds([]);
      setForwardTargets([]);
      setForwardIncludeSaved(false);
      if (selectMode) exitSelect();
      onChanged();
      // If forwarded into the currently open chat, refresh messages immediately
      if (destIds.includes(conversationId)) {
        const d = await apiFetch(`/api/conversations/${conversationId}/messages?after=${lastIdRef.current}`);
        if (d.messages?.length) {
          setMessages((prev) => {
            const seen = new Set(prev.map((x) => x.id));
            return [...prev, ...d.messages.filter((x) => !seen.has(x.id))];
          });
          lastIdRef.current = d.messages.at(-1).id;
        }
      }
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setForwardingBusy(false);
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

  async function openForwardedUserProfile(m) {
    if (!onOpenProfile) return;
    if (m.forwardedFromUserId) {
      onOpenProfile(m.forwardedFromUserId);
      return;
    }
    const rawName = (m.forwardedFrom || "").trim();
    if (!rawName) return;
    // Check in-memory conversation members first
    const localHit = members.find(
      (u) => u.displayName === rawName || u.username === rawName.replace(/^@/, ""),
    );
    if (localHit?.id) {
      onOpenProfile(localHit.id);
      return;
    }
    try {
      const r = await apiFetch(`/api/users/search?q=${encodeURIComponent(rawName)}`);
      const users = r?.users || [];
      const exact =
        users.find((u) => u.displayName === rawName || u.username === rawName.replace(/^@/, "")) ||
        users[0];
      if (exact?.id) {
        onOpenProfile(exact.id);
      } else {
        toast("پروفایل این کاربر پیدا نشد", "info");
      }
    } catch {
      toast("امکان باز کردن پروفایل وجود ندارد", "error");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
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
        <ChatWallpaperBackdrop />

        {/* header */}
        <div
          className="relative z-20 flex items-center gap-2.5 border-b border-line/75 bg-surface/78 px-3 py-2 backdrop-blur-xl sm:px-4"
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
          <button onClick={onBack} aria-label="بازگشت" className="flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-surface-2 md:hidden">
            <Icon name="arrow-right" size={17} />
          </button>
          {detail && (
            <button onClick={() => setShowInfo((s) => !s)} className="flex min-w-0 flex-1 items-center gap-2.5 text-right">
              {detail.type === "saved" ? (
                <span className="grad-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-accent shadow-sm">
                  <Icon name="bookmark" size={18} />
                </span>
              ) : detail.type === "direct" ? (
                <Avatar name={detail.name} color={detail.peer?.avatarColor} status={detail.peer?.status} lastSeenAt={detail.peer?.lastSeenAt} size={40} userId={detail.peer?.id} avatarFileId={detail.peer?.avatarFileId} />
              ) : (
                <Avatar name={detail.name} emoji={detail.emoji} size={40} />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="truncate text-sm font-black text-fg">{detail.name}</h2>
                  <span className="rounded-md bg-accent/12 px-1.5 py-0.5 text-[9.5px] font-bold text-accent">
                    {detail.type === "saved" ? "فضای ابری" : detail.type === "room" ? "اتاق عمومی" : detail.type === "group" ? "گروه" : "خصوصی"}
                  </span>
                </div>
                {typingUsers.length > 0 ? (
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-accent">
                    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.25s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.12s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                    </span>
                    {typingUsers.length === 1 ? (
                      <span className="truncate">
                        {detail.type === "direct"
                          ? "در حال نوشتن…"
                          : `${typingUsers[0].displayName} در حال نوشتن…`}
                      </span>
                    ) : (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          key={typingUsers[typingCycleIdx % typingUsers.length]?.id ?? typingCycleIdx}
                          className="anim-fade-in truncate"
                        >
                          {typingUsers[typingCycleIdx % typingUsers.length]?.displayName} در حال نوشتن…
                        </span>
                        <span className="shrink-0 rounded-full border border-accent/35 bg-accent/15 px-1.5 py-0.5 text-[9.5px] font-black text-accent">
                          {faNum(typingUsers.length)} نفر
                        </span>
                      </span>
                    )}
                  </div>
                ) : detail.type === "direct" && detail.peer ? (
                  <StatusLine status={detail.peer.status} text={detail.peer.statusText} emoji={detail.peer.statusEmoji} className="text-[11px] text-muted" />
                ) : (
                  <p className={`truncate text-[11px] ${subtitle === "آنلاین" ? "font-semibold text-emerald-400" : "text-muted"}`}>{subtitle}</p>
                )}
              </div>
            </button>
          )}
          {detail && detail.type !== "direct" && detail.type !== "saved" && (detail.type === "room" || isMod) && (
            <button
              onClick={() => { setPickedMembers([]); setAddModalOpen(true); }}
              title="افزودن عضو"
              aria-label="افزودن عضو"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line/70 bg-surface-2/70 text-muted transition hover:border-accent/40 hover:bg-surface-2 hover:text-accent"
            >
              <Icon name="user-plus" size={16} />
            </button>
          )}
          {detail && detail.type !== "saved" && me.permissions.includes("voice.join") && (
            <button
              onClick={() => { setShowInfo(false); setShowVoice(true); }}
              title="تماس صوتی"
              className={`press flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                showVoice ? "border-accent/50 bg-accent/20 text-accent shadow-sm" : "border-accent/25 bg-accent/12 text-accent hover:bg-accent/20"
              }`}
            >
              <Icon name="phone" size={15} /><span className="hidden sm:inline">تماس صوتی</span>
            </button>
          )}
          <button
            onClick={() => { setShowVoice(false); setShowInfo((s) => !s); }}
            title="اطلاعات گفتگو"
            className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${showInfo ? "border-accent/40 bg-accent/15 text-accent" : "border-line/70 bg-surface-2/70 text-muted hover:bg-surface-2 hover:text-fg"}`}
          >
            <Icon name="info" size={17} />
          </button>
        </div>

        {/* Middle viewport wrapper: independent scrolling messages over shared full-bleed wallpaper */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* messages — NO scroll-smooth-y here so initial load jumps to bottom instantaneously! */}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="scroll-thin relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pt-3 pb-2 sm:px-4 sm:pt-4 sm:pb-2.5"
          >
          {loading ? (
            <div className="mx-auto flex h-full max-w-4xl flex-col justify-end space-y-2.5 py-3">
              {Array.from({ length: 7 }).map((_, i) => {
                const mineSkel = i % 2 === 1;
                return (
                  <div key={i} className={`flex ${mineSkel ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`shimmer-track h-11 rounded-2xl border backdrop-blur-sm ${
                        mineSkel
                          ? "border-accent/25 bg-accent/12 rounded-bl-md"
                          : "border-line/70 bg-surface-2/75 rounded-br-md"
                      }`}
                      style={{ width: `${24 + ((i * 15) % 36)}%` }}
                    />
                  </div>
                );
              })}
            </div>
          ) : messages.length === 0 && outbox.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="rounded-3xl border border-line bg-surface/80 px-7 py-6 shadow-lg backdrop-blur-xl">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/12 text-accent ring-1 ring-accent/25">
                  <Icon name={detail?.type === "saved" ? "bookmark" : "chat"} size={26} />
                </div>
                <p className="text-sm font-black text-fg">
                  {detail?.type === "saved" ? "فضای پیام‌های ذخیره‌شدهٔ شما" : `آغاز گفتگو با ${detail?.name ?? ""}`}
                </p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-muted">
                  {detail?.type === "saved"
                    ? "یادداشت‌ها، لینک‌ها، تصاویر و پیام‌های مهم را اینجا ذخیره یا فوروارد کنید."
                    : "هنوز پیامی ارسال نشده است؛ اولین پیام، تصویر یا پیام صوتی را بفرستید."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-full flex-col justify-end">
              <div ref={contentWrapRef} className="mx-auto w-full max-w-4xl pb-2">
              {[...messages, ...outbox].map((m, i, allList) => {
                const prev = allList[i - 1];
                const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                const dayEl = newDay ? (
                  <div className="sticky top-1 z-10 flex justify-center py-2">
                    <span className="rounded-full border border-line/70 bg-surface/90 px-2.5 py-0.5 text-[10.5px] font-semibold text-muted shadow-sm backdrop-blur">
                      {formatDay(m.createdAt)}
                    </span>
                  </div>
                ) : null;
                if (m.type === "system") {
                  return (
                    <div key={m.id}>
                      {dayEl}
                      <div className="flex justify-center py-1">
                        <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-accent">{m.content}</span>
                      </div>
                    </div>
                  );
                }
                const isOpt = Boolean(m.isOptimistic);
                const isFailed = isOpt && m.status === "failed";
                const isSendingOpt = isOpt && m.status === "sending";
                const msgSenderId = m.sender?.id ?? m.senderId ?? null;
                const mine = isOpt || msgSenderId === me.id;
                const prevSenderId = prev ? (prev.isOptimistic ? me.id : (prev.sender?.id ?? prev.senderId ?? null)) : null;
                const grouped =
                  !newDay &&
                  prev &&
                  prev.type !== "system" &&
                  prevSenderId !== null &&
                  prevSenderId === (mine ? me.id : msgSenderId) &&
                  new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
                const showSender = !mine && detail?.type !== "direct" && detail?.type !== "saved" && !grouped;

                const openBubbleMenu = (event) => {
                  if (isOpt) {
                    const optItems = [
                      { type: "label", label: isFailed ? "خطا در ارسال پیام" : "در حال ارسال…" },
                    ];
                    if (isFailed) {
                      optItems.push({
                        type: "item",
                        key: "retry",
                        label: "تلاش مجدد",
                        icon: "refresh",
                        onClick: () => void executeOutboxItem(m),
                      });
                    }
                    optItems.push({
                      type: "item",
                      key: "copy",
                      label: "کپی پیام",
                      icon: "copy",
                      onClick: () => {
                        const copyableText =
                          m.content && m.type !== "voice"
                            ? m.content
                            : m.fileName || (m.type === "voice" ? "پیام صوتی" : m.type === "image" ? "تصویر" : "");
                        const firstImgFile = m.type === "image" && m.files?.[0];
                        if (!m.content && firstImgFile && typeof ClipboardItem !== "undefined" && firstImgFile.type === "image/png" && navigator.clipboard?.write) {
                          void navigator.clipboard
                            .write([new ClipboardItem({ "image/png": firstImgFile })])
                            .then(() => toast("تصویر کپی شد", "success"))
                            .catch(() =>
                              navigator.clipboard
                                ?.writeText(copyableText)
                                .then(() => toast("مشخصات پیام کپی شد", "success"))
                                .catch(() => toast("کپی انجام نشد", "error"))
                            );
                          return;
                        }
                        void navigator.clipboard
                          ?.writeText(copyableText)
                          .then(() => toast("پیام کپی شد", "success"))
                          .catch(() => toast("کپی انجام نشد", "error"));
                      },
                    });
                    optItems.push({
                      type: "item",
                      key: "cancel",
                      label: "لغو",
                      icon: "trash",
                      danger: true,
                      onClick: () => cancelOutboxItem(m.tempId),
                    });
                    openMenu(event, optItems);
                    return;
                  }

                  const imageIds = Array.isArray(m.fileIds) && m.fileIds.length ? m.fileIds : m.fileId ? [m.fileId] : [];
                  const items = [
                    { type: "label", label: mine ? "پیام شما" : (m.sender?.displayName ?? "پیام") },
                  ];
                  if (m.content && m.type !== "meeting" && m.type !== "voice") {
                    items.push({ type: "item", key: "copy", label: "کپی متن پیام", icon: "copy", onClick: () => { void navigator.clipboard?.writeText(m.content || "").then(() => toast("متن پیام کپی شد", "success")).catch(() => toast("کپی انجام نشد", "error")); } });
                  }
                  if (m.type !== "deleted") {
                    items.push({ type: "item", key: "forward", label: "فوروارد به گفتگوی دیگر…", icon: "forward", onClick: () => void openForwardModal([m.id]) });
                  }
                  if (m.type !== "deleted" && detail?.type !== "saved") {
                    items.push({ type: "item", key: "save", label: "ذخیره در پیام‌های ذخیره‌شده", icon: "bookmark", onClick: () => void saveToVault(m.id) });
                  }
                  if (imageIds.length && m.type === "image") items.push({ type: "item", key: "view", label: imageIds.length > 1 ? `نمایش تصاویر (${faNum(imageIds.length)})` : "نمایش تصویر", icon: "image", onClick: () => setLightbox({ ids: imageIds, index: 0 }) });
                  if (m.fileId) items.push({ type: "item", key: "dl", label: "دانلود فایل", icon: "download", onClick: () => void downloadAuthed(`/api/files/${m.fileId}?download=1`, m.fileName || "file").catch((e) => toast(e.message, "error")) });
                  if (m.sender && onOpenProfile) items.push({ type: "item", key: "profile", label: "مشاهده پروفایل", icon: "user", onClick: () => m.sender && onOpenProfile(m.sender.id) });
                  if (!mine && m.sender) items.push({ type: "item", key: "pm", label: `پیام خصوصی به ${m.sender.displayName}`, icon: "chat", onClick: () => m.sender && onOpenDirect(m.sender.id) });
                  items.push({ type: "divider" });
                  items.push({ type: "item", key: "select", label: selectMode ? "خروج از حالت انتخاب" : "انتخاب چندتایی پیام‌ها", icon: "check", onClick: () => {
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
                };

                // Render the compact timestamp + clean double-tick seen / single-tick sent / clock meta badge
                const rcpt = mine && !isOpt ? receiptOf(m) : null;
                const metaEl = (
                  <span
                    dir="ltr"
                    className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[9.5px] leading-none select-none ${
                      isFailed ? "text-rose-400" : mine ? "text-fg/70" : "text-muted"
                    }`}
                  >
                    {!!m.editedAt && <span dir="rtl" className="opacity-80">ویرایش</span>}
                    <span className="tabular-nums">{formatTime(m.createdAt)}</span>
                    {mine && (
                      isSendingOpt ? (
                        <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-accent/80" title="در حال ارسال…">
                          <Icon name="clock" size={11} className="animate-pulse" />
                        </span>
                      ) : isFailed ? (
                        <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-rose-400" title="ارسال ناموفق">
                          <Icon name="alert-circle" size={11} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const names = readerNames(m);
                            if (names.length) toast(names.join(" · "), "info");
                          }}
                          title={rcpt?.label}
                          aria-label={rcpt?.label}
                          className={`no-glass-btn inline-flex h-3.5 shrink-0 items-center justify-center rounded px-0.5 transition-colors ${
                            rcpt?.seen
                              ? "text-accent drop-shadow-[0_0_5px_rgb(var(--glow)/0.5)]"
                              : "text-fg/55"
                          }`}
                        >
                          {rcpt?.seen ? (
                            /* Crisp dedicated double-check SVG (no overlapping or glass box!) */
                            <svg viewBox="0 0 20 14" width="15" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M1.5 7.5L5.2 11.2L12.8 2.8" />
                              <path d="M7.2 7.5L10.9 11.2L18.5 2.8" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 14 14" width="11.5" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M2 7.5L5.7 11.2L12.5 3" />
                            </svg>
                          )}
                        </button>
                      )
                    )}
                  </span>
                );

                const isLongText = Boolean(m.content && (m.content.length > 48 || m.content.includes("\n")));
                const rowKey = isOpt ? m.id : (clientKeyMapRef.current.get(m.id) || m.id);

                return (
                  <div key={rowKey} className={grouped ? "pt-1.5" : "pt-3"}>
                    {dayEl}
                    <div
                      className={`group flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""} ${selectMode && !isOpt ? "cursor-pointer" : ""}`}
                      onClick={() => selectMode && !isOpt && toggleSelect(m.id)}
                      onContextMenu={openBubbleMenu}
                      data-message-id={isOpt ? undefined : m.id}
                    >
                      {selectMode && !isOpt && (
                        <span
                          className={`mb-4 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                            selected.has(m.id) ? "border-accent/55 bg-accent/20 text-accent" : "border-line bg-surface-2"
                          }`}
                          aria-hidden="true"
                        >
                          {selected.has(m.id) && <Icon name="check" size={12} strokeWidth={3} />}
                        </span>
                      )}
                      {!mine && detail?.type !== "direct" && detail?.type !== "saved" && (
                        <div className="w-8 shrink-0">
                          {!grouped && m.sender && (
                            <button onClick={() => m.sender && (onOpenProfile ? onOpenProfile(m.sender.id) : onOpenDirect(m.sender.id))} title="پروفایل" aria-label={`پروفایل ${m.sender.displayName}`}>
                              <Avatar name={m.sender.displayName} color={m.sender.avatarColor} size={32} userId={m.sender.id} avatarFileId={m.sender.avatarFileId} />
                            </button>
                          )}
                        </div>
                      )}
                      <div className={`bubble-col flex max-w-[86%] flex-col sm:max-w-[70%] ${mine ? "items-end" : "items-start"}`}>
                        {showSender && m.sender && (
                          <button
                            onClick={() => m.sender && (onOpenProfile ? onOpenProfile(m.sender.id) : onOpenDirect(m.sender.id))}
                            className="mb-0.5 px-1.5 text-[11px] font-bold hover:underline"
                            style={{ color: m.sender.avatarColor }}
                          >
                            {m.sender.displayName}
                          </button>
                        )}
                        <div className={`flex items-end gap-1.5 ${mine ? "flex-row" : "flex-row-reverse"}`}>
                          {/* Tiny inline error pill next to failed outgoing message */}
                          {isFailed && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openBubbleMenu(e);
                              }}
                              title="خطا در ارسال · کلیک برای تلاش مجدد یا لغو"
                              className="press mb-1 flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300 backdrop-blur hover:bg-rose-500/25"
                            >
                              <Icon name="alert-circle" size={12} />
                              <span>خطا · تلاش مجدد</span>
                            </button>
                          )}

                          <div
                            onContextMenu={(e) => {
                              e.stopPropagation();
                              openBubbleMenu(e);
                            }}
                            style={
                              mine && m.type !== "deleted"
                                ? {
                                    background: isFailed
                                      ? "color-mix(in srgb, #f43f5e 14%, var(--surface-2))"
                                      : "linear-gradient(135deg, color-mix(in srgb, var(--accent) 23%, var(--surface-2)), color-mix(in srgb, var(--accent-2) 17%, var(--surface-2)))",
                                  }
                                : undefined
                            }
                            className={`relative overflow-hidden rounded-2xl text-[14px] leading-6 shadow-sm backdrop-blur-md transition-opacity ${
                              isSendingOpt ? "opacity-85" : ""
                            } ${
                              m.type === "deleted"
                                ? "border border-dashed border-line bg-transparent px-3 py-1.5 text-xs italic text-muted"
                                : mine
                                ? `border ${isFailed ? "border-rose-400/45" : "border-accent/35"} text-fg ` + (grouped ? "rounded-bl-2xl" : "rounded-bl-md")
                                : "border border-line/85 bg-surface-2/92 text-fg " + (grouped ? "rounded-br-2xl" : "rounded-br-md")
                            }`}
                          >
                            {m.type === "deleted" ? (
                              <span className="flex items-center gap-1.5">
                                <Icon name="ban" size={13} /> این پیام حذف شد
                              </span>
                            ) : (
                              <>
                                {m.forwardedFrom && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void openForwardedUserProfile(m);
                                    }}
                                    title={`مشاهده پروفایل ${m.forwardedFrom}`}
                                    className="flex w-full items-center gap-1 border-b border-line/60 bg-surface-3/45 px-3 py-1 text-right text-[10.5px] font-bold text-accent transition hover:bg-accent/15 hover:underline"
                                  >
                                    <Icon name="forward" size={11} className="shrink-0" />
                                    <span className="truncate">فوروارد شده از ({m.forwardedFrom})</span>
                                  </button>
                                )}
                                {m.type === "meeting" && <MeetingInviteCard payload={m.content} mine={mine} />}
                                {m.type === "voice" && (m.fileId || m.localUrls?.[0]) && (
                                  <VoiceBubble fileId={m.fileId} localSrc={m.localUrls?.[0]} duration={Number(m.content) || 0} mine={mine} />
                                )}
                                {m.type === "image" && (m.fileId || (Array.isArray(m.fileIds) && m.fileIds.length > 0) || m.localUrls?.length > 0) && (() => {
                                  if (isOpt && m.localUrls?.length) {
                                    return (
                                      <div className={m.localUrls.length === 1 ? "block w-full overflow-hidden" : "w-[260px] p-1 sm:w-[330px]"}>
                                        {m.localUrls.length === 1 ? (
                                          <img src={m.localUrls[0]} alt="" className="max-h-80 w-full max-w-sm object-cover" />
                                        ) : (
                                          <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-lg">
                                            {m.localUrls.slice(0, 4).map((u, idx) => (
                                              <img key={idx} src={u} alt="" className="aspect-square h-full w-full object-cover" />
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
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
                                      <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-lg">
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
                                {m.type === "file" && (m.fileId || isOpt) && (
                                  <button
                                    disabled={isOpt}
                                    onClick={() => m.fileId && downloadAuthed(`/api/files/${m.fileId}?download=1`, m.fileName || "file").catch((e) => toast(e.message, "error"))}
                                    className={`flex items-center gap-3 text-right px-3 pt-2.5 ${m.content ? "" : "pb-2"}`}
                                  >
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent">
                                      <Icon name={fileIcon(m.fileMime, m.fileName)} size={21} />
                                    </span>
                                    <span className="min-w-0">
                                      <span className="block max-w-[220px] truncate text-sm font-bold text-fg" dir="auto">
                                        {m.fileName}
                                      </span>
                                      <span className="flex items-center gap-1 text-[11px] text-muted">
                                        {formatSize(m.fileSize || 0)}
                                        {!isOpt && <Icon name="download" size={11} />}
                                      </span>
                                    </span>
                                  </button>
                                )}

                                {/* Text + Strict Right/Left Timestamp & Seen Layout:
                                    - My message (`mine === true`): Time + Seen ALWAYS on the RIGHT side (or bottom-right if long).
                                    - Received message (`mine === false`): Time ALWAYS on the LEFT side (or bottom-left if long). */}
                                {m.type !== "meeting" && m.type !== "voice" && m.content ? (
                                  isLongText ? (
                                    <div className="px-3 pt-1.5 pb-1">
                                      <div className="whitespace-pre-wrap break-words leading-[1.62]" dir="auto">
                                        <RichMessageText text={m.content} mine={mine} />
                                      </div>
                                      {/* Bottom-Right for mine, Bottom-Left for received */}
                                      <div dir="ltr" className={`mt-0.5 flex ${mine ? "justify-end" : "justify-start"}`}>
                                        {metaEl}
                                      </div>
                                    </div>
                                  ) : (
                                    /* Short message: single compact row — Right side for mine, Left side for received */
                                    <div
                                      dir="ltr"
                                      className={`flex items-end gap-2 px-3 py-1.5 ${
                                        mine ? "flex-row" : "flex-row-reverse"
                                      }`}
                                    >
                                      <div className="min-w-0 whitespace-pre-wrap break-words leading-[1.6]" dir="auto">
                                        <RichMessageText text={m.content} mine={mine} />
                                      </div>
                                      <div className="shrink-0 pb-[1px]">{metaEl}</div>
                                    </div>
                                  )
                                ) : (
                                  /* Media / card messages without text caption: Bottom-Right for mine, Bottom-Left for received */
                                  <div dir="ltr" className={`flex px-2.5 pb-1 pt-0.5 ${mine ? "justify-end" : "justify-start"}`}>
                                    {metaEl}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Subtle quick-forward action on hover (desktop) */}
                      {!selectMode && !isOpt && m.type !== "deleted" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openForwardModal([m.id]);
                          }}
                          title="فوروارد پیام"
                          aria-label="فوروارد پیام"
                          className="mb-1 hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted opacity-0 transition hover:bg-surface-2 hover:text-accent group-hover:opacity-100 sm:flex"
                        >
                          <Icon name="forward" size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          )}
          </div>

          {/* Floating Jump-to-Bottom Pill when scrolled up (outside scrollRef so it never shifts scroll height) */}
          {showJumpDown && !loading && (
            <button
              type="button"
              onClick={jumpToBottom}
              aria-label="پرش به آخرین پیام‌ها"
              className="press absolute bottom-3 start-4 z-20 flex h-9 items-center gap-1.5 rounded-full border border-accent/40 bg-surface-2/95 px-3 text-xs font-bold text-fg shadow-xl backdrop-blur hover:border-accent hover:text-accent"
            >
              <Icon name="chevron-down" size={15} className="text-accent" />
              <span>آخرین پیام</span>
            </button>
          )}
        </div>

        {/* Floating glassy composer sitting directly over the chat wallpaper */}
        <div className="relative z-20 bg-transparent px-2.5 pt-1 pb-2.5 sm:px-3.5 sm:pb-3">
          <div className="mx-auto max-w-4xl">
            {/* Live floating typing indicator pill right above the composer */}
            {typingUsers.length > 0 && (
              <div className="anim-rise mb-1.5 flex items-center">
                <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-accent/35 bg-surface/82 px-3 py-1 text-xs font-bold text-fg shadow-lg backdrop-blur-xl">
                  <span className="inline-flex items-center gap-1" aria-hidden="true">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.25s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.12s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                  </span>
                  {typingUsers.length === 1 ? (
                    <span className="truncate text-[11.5px] text-accent">
                      {detail?.type === "direct"
                        ? `${typingUsers[0].displayName} در حال نوشتن است…`
                        : `${typingUsers[0].displayName} در حال نوشتن…`}
                    </span>
                  ) : (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        key={typingUsers[typingCycleIdx % typingUsers.length]?.id ?? typingCycleIdx}
                        className="anim-fade-in truncate text-[11.5px] text-accent"
                      >
                        {typingUsers[typingCycleIdx % typingUsers.length]?.displayName} در حال نوشتن…
                      </span>
                      <span className="shrink-0 rounded-full border border-accent/40 bg-accent/18 px-2 py-0.5 text-[10px] font-black text-accent">
                        {faNum(typingUsers.length)} نفر هم‌زمان
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectMode && (
              <div className="anim-rise mb-2 flex flex-wrap items-center gap-1.5 rounded-2xl border border-accent/35 bg-surface/85 px-3 py-1.5 shadow-lg backdrop-blur-xl">
                <span className="text-xs font-black text-accent">{faNum(selected.size)} پیام انتخاب شده</span>
                <div className="ms-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void openForwardModal([...selected])}
                    disabled={!selected.size}
                    className="press flex items-center gap-1 rounded-xl border border-accent/45 bg-accent/20 px-2.5 py-1.5 text-[11px] font-black text-accent backdrop-blur-md hover:bg-accent/30 disabled:opacity-40"
                  >
                    <Icon name="forward" size={13} /> فوروارد
                  </button>
                  {selected.size === 1 && (() => {
                    const only = messages.find((m) => m.id === [...selected][0]);
                    return only && only.type === "text" && only.sender?.id === me.id ? (
                      <button onClick={() => startEdit(only)} className="press flex items-center gap-1 rounded-xl border border-line bg-surface-2/80 px-2.5 py-1.5 text-[11px] font-bold hover:bg-surface-3"><Icon name="edit" size={13} /> ویرایش</button>
                    ) : null;
                  })()}
                  <button onClick={() => void deleteSelected()} disabled={!selected.size} className="press flex items-center gap-1 rounded-xl border border-rose-400/35 bg-rose-500/16 px-2.5 py-1.5 text-[11px] font-bold text-rose-300 disabled:opacity-40"><Icon name="trash" size={13} /> حذف</button>
                  <button onClick={exitSelect} className="press flex items-center gap-1 rounded-xl border border-line bg-surface-2/80 px-2.5 py-1.5 text-[11px] font-bold text-muted hover:text-fg"><Icon name="close" size={13} /> لغو</button>
                </div>
              </div>
            )}
            {editing && (
              <div className="anim-rise mb-2 flex items-start gap-2 rounded-2xl border border-accent/35 bg-surface/85 px-3 py-2 shadow-lg backdrop-blur-xl">
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
                  <div key={i} className="relative flex shrink-0 items-center gap-2 rounded-xl border border-line/80 bg-surface/85 p-1.5 pe-3 shadow-md backdrop-blur-xl">
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
              <div className="anim-rise mb-2 flex items-center gap-3 rounded-2xl border border-rose-400/40 bg-surface/85 px-3 py-2.5 shadow-xl backdrop-blur-2xl">
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
                <button onClick={() => stopRecording(false)} className="press rounded-xl border border-line bg-surface-2/80 px-3 py-1.5 text-[11px] font-bold text-muted hover:text-fg">لغو</button>
                <button onClick={() => stopRecording(true)} disabled={recSeconds < 1} className="press flex h-10 w-10 items-center justify-center rounded-xl border border-accent/50 bg-accent/22 text-accent backdrop-blur-md hover:bg-accent/32 disabled:opacity-40" title="پایان ضبط و ارسال">
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
            <div className="flex items-end gap-1.5 rounded-2xl border border-line/85 bg-surface/76 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/30">
              <div className="flex items-center">
                <button onClick={() => setShowEmoji((s) => !s)} title="ایموجی" aria-label="ایموجی" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2/80 hover:text-accent">
                  <Icon name="smile" size={19} />
                </button>
                {me.permissions.includes("images.upload") && (
                  <button onClick={() => imgInput.current?.click()} title="ارسال تصویر (چند عکس)" aria-label="ارسال تصویر" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2/80 hover:text-accent">
                    <Icon name="image" size={19} />
                  </button>
                )}
                {me.permissions.includes("files.upload") && (
                  <button onClick={() => fileInput.current?.click()} title="ارسال فایل (چند فایل)" aria-label="ارسال فایل" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2/80 hover:text-accent">
                    <Icon name="paperclip" size={19} />
                  </button>
                )}
                <button
                  onClick={() => void startRecording()}
                  title="ضبط پیام صوتی"
                  aria-label="ضبط پیام صوتی"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2/80 hover:text-accent"
                >
                  <Icon name="mic" size={19} />
                </button>
              </div>
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => {
                  const val = e.target.value;
                  setText(val);
                  sendTypingSignal(Boolean(val.trim()));
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onBlur={() => sendTypingSignal(false)}
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
                placeholder="پیام بنویسید..."
                dir="auto"
                className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14.5px] text-fg outline-none"
              />
              <button
                onClick={send}
                disabled={!text.trim() && !pending.length && !editing}
                className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/50 bg-accent/22 text-accent shadow-[0_4px_16px_rgb(var(--glow)/0.22)] backdrop-blur-md transition hover:border-accent hover:bg-accent/32 disabled:border-line/50 disabled:bg-surface-2/50 disabled:text-muted disabled:opacity-45 disabled:shadow-none"
                title="ارسال"
              >
                <Icon name="send" size={17} className="-scale-x-100" strokeWidth={2.1} />
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

      {/* Info / User Profile Drawer */}
      {showInfo && detail && (
        <aside className="anim-slide-panel fixed inset-0 z-40 flex w-full flex-col border-r border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:static lg:z-auto lg:w-88 lg:shrink-0 lg:pb-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h3 className="text-sm font-black text-fg">
              {detail.type === "direct" ? "پروفایل کاربر" : detail.type === "saved" ? "فضای ابری من" : "اطلاعات گفتگو"}
            </h3>
            <button onClick={() => setShowInfo(false)} aria-label="بستن" className="flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg">
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-3.5">
            {detail.type === "direct" && detail.peer ? (() => {
              const p = peerProfile || detail.peer;
              const photos = peerProfile?.photos ?? [];
              return (
                <div className="space-y-3.5">
                  {/* Pro Theme-Harmonized Profile Card */}
                  <div className="overflow-hidden rounded-2xl border border-line bg-surface-2/65 shadow-sm">
                    <div
                      className="relative h-24 w-full overflow-hidden"
                      style={{
                        background: `radial-gradient(120% 120% at 85% 15%, ${p.avatarColor || "#8b5cf6"}55, transparent 62%), radial-gradient(100% 100% at 10% 90%, color-mix(in srgb, var(--accent) 42%, transparent), transparent 65%), var(--surface-3)`,
                      }}
                    >
                      {peerProfile?.bannerFileId && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={`/api/banners/${p.id}?v=${peerProfile.bannerFileId}`}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      )}
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background: "linear-gradient(to top, color-mix(in srgb, var(--surface-2) 70%, transparent), transparent 55%)",
                        }}
                      />
                    </div>
                    <div className="relative flex flex-col items-center px-4 pb-4 text-center">
                      <div className="-mt-10 rounded-2xl bg-surface p-1 shadow-lg ring-1 ring-line">
                        <button
                          type="button"
                          disabled={!photos.length && !p.avatarFileId}
                          onClick={() => (photos.length || p.avatarFileId) && setPeerGalleryIdx(0)}
                          className="press relative block disabled:cursor-default"
                        >
                          <Avatar
                            name={p.displayName || detail.name}
                            color={p.avatarColor}
                            lastSeenAt={detail.peer.lastSeenAt}
                            size={82}
                            userId={p.id}
                            avatarFileId={p.avatarFileId}
                            status={p.status}
                          />
                        </button>
                      </div>
                      <h4 className="mt-2.5 text-base font-black text-fg">{p.displayName || detail.name}</h4>
                      <button
                        type="button"
                        dir="ltr"
                        onClick={() => {
                          void navigator.clipboard?.writeText(`@${p.username}`).then(() => toast("نام کاربری کپی شد", "success"));
                        }}
                        className="text-xs font-bold text-accent hover:underline"
                      >
                        @{p.username}
                      </button>
                      <div className="mt-1.5">
                        <StatusLine status={p.status} text={p.statusText} emoji={p.statusEmoji} className="justify-center text-[11px]" />
                      </div>
                      {peerProfile?.roles?.length > 0 && (
                        <div className="mt-2 flex flex-wrap justify-center gap-1">
                          {peerProfile.roles.map((r) => (
                            <span
                              key={r.id}
                              className="rounded-lg border px-2 py-0.5 text-[10px] font-bold"
                              style={{
                                background: `color-mix(in srgb, ${r.color} 15%, var(--surface))`,
                                borderColor: `color-mix(in srgb, ${r.color} 38%, transparent)`,
                                color: r.color,
                              }}
                            >
                              {r.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bio Card */}
                  <div className="rounded-xl border border-line bg-surface-2/65 p-3">
                    <p className="mb-1 text-[11px] font-bold text-muted">درباره</p>
                    <p className="text-xs leading-6 text-fg">
                      {peerProfile?.bio?.trim() ? peerProfile.bio : <span className="text-muted">بیوگرافی ثبت نشده است.</span>}
                    </p>
                  </div>

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-line bg-surface-2/60 p-2.5">
                      <span className="block text-[10px] text-muted">آخرین بازدید</span>
                      <span className="mt-0.5 block truncate text-xs font-bold text-fg">{subtitle || "—"}</span>
                    </div>
                    <div className="rounded-xl border border-line bg-surface-2/60 p-2.5">
                      <span className="block text-[10px] text-muted">تاریخ عضویت</span>
                      <span className="mt-0.5 block truncate text-xs font-bold text-fg">
                        {peerProfile?.joinedAt ? new Date(peerProfile.joinedAt).toLocaleDateString("fa-IR") : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      {me.permissions.includes("voice.join") && (
                        <Button variant="soft" onClick={() => { setShowInfo(false); setShowVoice(true); }} className="!py-2 text-xs">
                          <Icon name="phone" size={14} /> تماس صوتی
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          void navigator.clipboard?.writeText(`@${p.username}`).then(() => toast("نام کاربری کپی شد", "success"));
                        }}
                        className="!py-2 text-xs"
                      >
                        <Icon name="copy" size={14} /> کپی آیدی
                      </Button>
                    </div>

                    {peerRelation === "none" && me.permissions.includes("friends.request") && (
                      <Button
                        variant="soft"
                        onClick={async () => {
                          try {
                            const r = await apiFetch("/api/friends", { method: "POST", json: { username: p.username } });
                            setPeerRelation(r.accepted ? "friend" : "outgoing");
                            toast(r.accepted ? "اکنون دوست هستید" : "درخواست دوستی ارسال شد", "success");
                          } catch (err) { toast(err.message, "error"); }
                        }}
                        className="w-full !py-2 text-xs"
                      >
                        <Icon name="user-plus" size={14} /> افزودن به دوستان
                      </Button>
                    )}

                    <Button variant="danger" onClick={() => blockUser(p.id, detail.name)} className="w-full !py-2 text-xs">
                      <Icon name="ban" size={15} /> مسدود کردن کاربر
                    </Button>
                  </div>
                </div>
              );
            })() : (
              <div className="flex flex-col items-center text-center">
                {detail.type === "saved" ? (
                  <span className="grad-accent flex h-20 w-20 items-center justify-center rounded-2xl text-on-accent shadow-md">
                    <Icon name="bookmark" size={36} />
                  </span>
                ) : (
                  <Avatar name={detail.name} emoji={detail.emoji} size={80} />
                )}
                <h4 className="mt-3 text-base font-black">{detail.name}</h4>
                {detail.description && <p className="mt-1.5 text-xs leading-6 text-muted">{detail.description}</p>}
              </div>
            )}

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

      {/* Forward Message(s) Modal */}
      <Modal
        open={forwardModalIds.length > 0}
        onClose={() => setForwardModalIds([])}
        title={`فوروارد ${faNum(forwardModalIds.length)} پیام به گفتگوی دیگر`}
      >
        <div className="space-y-3">
          <div className="relative">
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" size={15} />
            </span>
            <Input
              placeholder="جستجو در گفتگوها و گروه‌ها…"
              value={forwardSearch}
              onChange={(e) => setForwardSearch(e.target.value)}
              className="pr-9"
            />
          </div>

          <div className="scroll-thin max-h-72 space-y-1.5 overflow-y-auto rounded-2xl border border-line bg-surface/60 p-2">
            {/* Saved Messages quick option */}
            <button
              type="button"
              onClick={() => setForwardIncludeSaved((v) => !v)}
              className={`flex w-full items-center gap-3 rounded-xl border p-2 text-right transition ${
                forwardIncludeSaved ? "border-accent bg-accent/15" : "border-transparent bg-surface-2 hover:border-line"
              }`}
            >
              <span className="grad-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-accent">
                <Icon name="bookmark" size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-fg">پیام‌های ذخیره‌شده</p>
                <p className="truncate text-[10.5px] text-muted">فضای ابری شخصی شما</p>
              </div>
              <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${forwardIncludeSaved ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`}>
                {forwardIncludeSaved && <Icon name="check" size={12} strokeWidth={3} />}
              </span>
            </button>

            {((convs && convs.length ? convs : localConvs) || [])
              .filter((c) => c.type !== "saved" && (!forwardSearch || c.name.toLowerCase().includes(forwardSearch.toLowerCase())))
              .map((c) => {
                const on = forwardTargets.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setForwardTargets((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
                    }
                    className={`flex w-full items-center gap-3 rounded-xl border p-2 text-right transition ${
                      on ? "border-accent bg-accent/15" : "border-transparent bg-surface-2 hover:border-line"
                    }`}
                  >
                    {c.type === "direct" ? (
                      <Avatar name={c.name} color={c.peer?.avatarColor} size={36} userId={c.peer?.id} avatarFileId={c.peer?.avatarFileId} />
                    ) : (
                      <Avatar name={c.name} emoji={c.emoji} size={36} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black text-fg">{c.name}</p>
                      <p className="truncate text-[10.5px] text-muted">
                        {c.type === "direct" ? "گفتگوی خصوصی" : c.type === "group" ? "گروه خصوصی" : "اتاق عمومی"}
                      </p>
                    </div>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${on ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`}>
                      {on && <Icon name="check" size={12} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button variant="ghost" onClick={() => setForwardModalIds([])} className="flex-1">
              انصراف
            </Button>
            <Button
              onClick={() => void submitForward()}
              disabled={forwardingBusy || (!forwardTargets.length && !forwardIncludeSaved)}
              className="flex-1"
            >
              <Icon name="forward" size={15} />
              {forwardingBusy
                ? "در حال ارسال…"
                : `ارسال${forwardTargets.length + (forwardIncludeSaved ? 1 : 0) > 0 ? ` (${faNum(forwardTargets.length + (forwardIncludeSaved ? 1 : 0))})` : ""}`}
            </Button>
          </div>
        </div>
      </Modal>

      <ContextMenu state={menu} onClose={closeMenu} />

      {peerGalleryIdx !== null && (() => {
        const singlePeerPhoto = peerProfile?.avatarFileId ?? peerProfile?.photos?.[0] ?? detail?.peer?.avatarFileId ?? null;
        if (!singlePeerPhoto) return null;
        return (
          <Gallery
            photos={[singlePeerPhoto]}
            names={{ [singlePeerPhoto]: peerProfile?.displayName ?? detail?.name ?? "" }}
            index={0}
            onChange={() => {}}
            onClose={() => setPeerGalleryIdx(null)}
            owner={false}
          />
        );
      })()}

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
    <div className="m-2 rounded-xl border border-accent/30 bg-accent/10 p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/18 text-accent">
          <Icon name="radio" size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-fg">دعوت به جلسهٔ صوتی</p>
          <p className="truncate text-[11px] text-muted">{data.title}{data.host ? ` · میزبان: ${data.host}` : ""}</p>
        </div>
      </div>
      {data.invited ? (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-accent">
          <Icon name="check" size={11} /> ورود مستقیم بدون انتظار در لابی
        </p>
      ) : (
        data.lobby && <p className="mt-1.5 text-[10px] text-muted">ورود با تأیید میزبان انجام می‌شود.</p>
      )}
      <button
        onClick={() => navigate(`/meet/${data.token}`)}
        className={`press mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
          mine ? "border border-accent/40 bg-accent/20 text-accent hover:bg-accent/28" : "grad-accent text-on-accent"
        }`}
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
function VoiceBubble({ fileId, localSrc, duration, mine }) {
  const audioRef = useRef(null);
  const trackRef = useRef(null);
  const [src, setSrc] = useState(localSrc || "");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [len, setLen] = useState(duration);
  const [rate, setRate] = useState(1);
  const [peaks, setPeaks] = useState(() => makeSeededPeaks(fileId || duration || 7));
  const [hoverRatio, setHoverRatio] = useState(null);

  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    const decodePeaksFromBlob = async (blob) => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx || !blob) return;
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
    };

    if (!fileId && localSrc) {
      setSrc(localSrc);
      void fetch(localSrc)
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => decodePeaksFromBlob(blob))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }
    if (!fileId) return undefined;

    void authFetch(`/api/files/${fileId}`)
      .then((r) => (r.ok ? r.blob() : null))
      .then(async (blob) => {
        if (!alive || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        await decodePeaksFromBlob(blob);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, localSrc]);

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

  const sub = mine ? "text-fg/75" : "text-muted";
  const activeBarClass = "bg-accent";
  const hoverBarClass = "bg-accent/55";
  const idleBarClass = mine ? "bg-fg/25" : "bg-fg/20";

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
        className={`press flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/18 text-accent shadow-sm transition hover:bg-accent/28 ${
          !src ? "opacity-50" : ""
        }`}
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
            className="rounded border border-accent/25 bg-surface-3/80 px-1.5 py-0.5 text-[9.5px] font-bold text-fg transition hover:bg-accent/20 hover:text-accent"
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
