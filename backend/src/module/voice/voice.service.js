import { findOneFile, insertFile } from "../../model/controller/storage/storage.controller.js";
import { findUsersByIds } from "../../model/controller/users/users.controller.js";
import {
  deletePresences,
  deleteSignals,
  findLastSignal,
  findOnePresence,
  findOneRestriction,
  findOneTrack,
  findPresences,
  findRestrictions,
  findSignals,
  findTracks,
  insertSignal,
  updateOneTrack,
  updatePresences,
  upsertPresence,
  upsertRestriction,
  upsertTrack,
  voiceKey,
} from "../../model/controller/voice/voice.controller.js";
import { resolveAndDownloadBotAudio } from "../../utils/audio/audioExtractor.js";
import { generateJoinToken } from "../../utils/generators/token.generator.js";
import { HttpError } from "../../utils/http/http.util.js";
import { isAudioMime } from "../../utils/validators/file.validator.js";
import { requireMember } from "../chats/chats.service.js";
import { assertNotBlocked, blockedIdsOf } from "../contacts/contacts.service.js";
import { removeUnusedFiles, stopTracks } from "../storage/storage.service.js";

/** A participant who sent no heartbeat for this long is no longer in the call. */
const VOICE_TIMEOUT_MS = 12_000;
const alive = () => ({ $gt: new Date(Date.now() - VOICE_TIMEOUT_MS) });

/** In-memory ring buffer of live relayed audio chunks for NAT/firewall fallback (keyed by chatId). */
const voiceAudioRelay = new Map();
let voiceAudioSeq = 0;

function pushVoiceAudioChunk(chatId, fromUserId, joinToken, mime, data) {
  let list = voiceAudioRelay.get(chatId);
  if (!list) {
    list = [];
    voiceAudioRelay.set(chatId, list);
  }
  const now = Date.now();
  const id = ++voiceAudioSeq;
  list.push({ id, fromUserId, joinToken, mime, data, at: now });
  while (list.length > 0 && (now - list[0].at > 6_000 || list.length > 150)) {
    list.shift();
  }
  return id;
}

function readVoiceAudioChunks(chatId, excludeUserId, visibleSet, afterAudioId) {
  const list = voiceAudioRelay.get(chatId);
  if (!list || !list.length) return { audioChunks: [], audioCursor: afterAudioId };
  const now = Date.now();
  const fresh = list.filter(
    (c) => now - c.at <= 5_000 && c.id > afterAudioId && c.fromUserId !== excludeUserId && visibleSet.has(c.fromUserId),
  );
  const latestId = list[list.length - 1]?.id ?? afterAudioId;
  return { audioChunks: fresh, audioCursor: latestId };
}

async function requireVoiceRoom(me, chatId) {
  const room = await requireMember(chatId, me);
  if (!me.permissions.includes("voice.join")) throw new HttpError(403, "شما مجوز ورود به تماس صوتی را ندارید");
  return room;
}

/** Room owners/admins moderate their own room; `voice.moderate` moderates everywhere. */
const isVoiceModerator = (me, role, type) =>
  me.permissions.includes("voice.moderate") || (type !== "direct" && (role === "owner" || role === "admin"));

async function ownRestrictions(chatId, userId) {
  const row = await findOneRestriction({ _id: voiceKey(chatId, userId) });
  return { micMuted: !!row?.micMuted, playBlocked: !!row?.playBlocked, shareBlocked: !!row?.shareBlocked };
}

async function requirePresence(chatId, userId, joinToken) {
  if (!joinToken) throw new HttpError(409, "ابتدا به تماس بپیوندید", { code: "NOT_IN_VOICE" });
  const present = await findOnePresence({ _id: voiceKey(chatId, userId), joinToken, lastSeenAt: alive() });
  if (!present) {
    throw new HttpError(409, "تماس پایان یافته یا به دستگاه/تب دیگری منتقل شده است", { code: "VOICE_EVICTED" });
  }
}

/** Everything a client needs on each poll: who is in the call, the bots, and WebRTC signals addressed to me. */
async function snapshot(me, chatId, after, afterAudio = 0) {
  const [blocked, presences, restrictions, trackDocs, signalDocs, myRestrictions] = await Promise.all([
    blockedIdsOf(me.id),
    findPresences({ conversationId: chatId, lastSeenAt: alive() }),
    findRestrictions({ conversationId: chatId }),
    findTracks({ conversationId: chatId }),
    findSignals({
      conversationId: chatId,
      toUserId: me.id,
      _id: { $gt: after },
      createdAt: { $gt: new Date(Date.now() - 60_000) },
    }),
    ownRestrictions(chatId, me.id),
  ]);
  const visible = presences.filter((p) => !blocked.has(p.userId)).sort((a, b) => a.userId - b.userId);
  const users = new Map((await findUsersByIds(visible.map((p) => p.userId))).map((user) => [user._id, user]));
  const limits = new Map(restrictions.map((r) => [r.userId, r]));

  const participants = visible.flatMap((p) => {
    const user = users.get(p.userId);
    if (!user) return [];
    const limit = limits.get(p.userId);
    return [
      {
        userId: p.userId,
        username: user.username,
        displayName: user.displayName,
        avatarColor: user.avatarColor,
        avatarFileId: user.avatarFileId ?? null,
        micOn: p.micOn,
        sharingOn: !!p.sharingOn,
        shareQuality: p.shareQuality ?? "720p",
        joinToken: p.joinToken,
        micMuted: !!limit?.micMuted,
        playBlocked: !!limit?.playBlocked,
        shareBlocked: !!limit?.shareBlocked,
      },
    ];
  });
  const present = new Set(participants.map((p) => p.userId));

  const tracks = trackDocs.flatMap((track) => {
    const owner = users.get(track.userId);
    if (!owner || !present.has(track.userId)) return [];
    return [
      {
        userId: track.userId,
        kind: track.kind,
        originKind: track.originKind ?? track.kind,
        url: track.url,
        fileId: track.fileId,
        title: track.title,
        playing: track.playing,
        position: track.position,
        startedAt: track.startedAt,
        updatedAt: track.updatedAt,
        ownerName: owner.displayName,
        ownerColor: owner.avatarColor,
      },
    ];
  });
  const signals = signalDocs
    .filter((signal) => present.has(signal.fromUserId))
    .map((signal) => ({ id: signal._id, fromUserId: signal.fromUserId, kind: signal.kind, payload: signal.payload }));

  const { audioChunks, audioCursor } = readVoiceAudioChunks(chatId, me.id, present, afterAudio);

  return {
    participants,
    tracks,
    signals,
    audioChunks,
    audioCursor,
    cursor: signals.at(-1)?.id ?? after,
    myRestrictions,
    serverTime: Date.now(),
  };
}

export async function getSnapshot(me, chatId, after, afterAudio = 0) {
  await requireVoiceRoom(me, chatId);
  return snapshot(me, chatId, after, afterAudio);
}

export async function joinVoice(me, chatId, input = {}) {
  await requireVoiceRoom(me, chatId);
  const existing = await findOnePresence({ _id: voiceKey(chatId, me.id), lastSeenAt: alive() });

  // Same-tab reload reconnect: if caller already holds the active joinToken, keep their slot seamlessly
  if (existing && input.joinToken && existing.joinToken === input.joinToken) {
    await deleteSignals({ conversationId: chatId, $or: [{ fromUserId: me.id }, { toUserId: me.id }] });
    await upsertPresence(chatId, me.id, {
      joinToken: existing.joinToken,
      micOn: false,
      sharingOn: false,
      shareQuality: "720p",
      lastSeenAt: new Date(),
    });
    const baseline = (await findLastSignal({ conversationId: chatId, toUserId: me.id }))?._id ?? 0;
    const latestAudio = voiceAudioRelay.get(chatId)?.at(-1)?.id ?? 0;
    return { joinToken: existing.joinToken, ...(await snapshot(me, chatId, baseline, latestAudio)), cursor: baseline };
  }

  // Active in another tab or device: ask for explicit takeover unless forceTakeover is true
  if (existing && !input.forceTakeover) {
    throw new HttpError(
      409,
      "شما هم‌اکنون با تب یا دستگاه دیگری در این تماس صوتی حضور دارید.",
      { code: "ALREADY_IN_VOICE_OTHER_DEVICE" },
    );
  }

  if (existing) {
    await deleteSignals({ conversationId: chatId, $or: [{ fromUserId: me.id }, { toUserId: me.id }] });
  }

  // Remember the newest signal that existed before joining, so offers that arrive while we are
  // joining are delivered on the first poll instead of being skipped.
  const baseline = (await findLastSignal({ conversationId: chatId, toUserId: me.id }))?._id ?? 0;
  const joinToken = generateJoinToken();
  await upsertPresence(chatId, me.id, { joinToken, micOn: false, sharingOn: false, shareQuality: "720p", lastSeenAt: new Date() });
  await stopTracks({ _id: voiceKey(chatId, me.id) });
  const latestAudio = voiceAudioRelay.get(chatId)?.at(-1)?.id ?? 0;
  return { joinToken, ...(await snapshot(me, chatId, baseline, latestAudio)), cursor: baseline };
}

export async function leaveVoice(me, chatId, joinToken) {
  await deletePresences({ _id: voiceKey(chatId, me.id), joinToken });
  await stopTracks({ _id: voiceKey(chatId, me.id) });
}

export async function heartbeat(me, chatId, joinToken) {
  await requireVoiceRoom(me, chatId);
  await requirePresence(chatId, me.id, joinToken);
  await updatePresences({ _id: voiceKey(chatId, me.id) }, { lastSeenAt: new Date() });
}

export async function relayAudio(me, chatId, input) {
  await requireVoiceRoom(me, chatId);
  await requirePresence(chatId, me.id, input.joinToken);
  if (!me.permissions.includes("voice.speak") || (await ownRestrictions(chatId, me.id)).micMuted) return;
  await updatePresences({ _id: voiceKey(chatId, me.id) }, { lastSeenAt: new Date() });
  pushVoiceAudioChunk(chatId, me.id, input.joinToken, input.mime || "audio/webm", input.data);
}

export async function setMic(me, chatId, joinToken, on) {
  await requireVoiceRoom(me, chatId);
  await requirePresence(chatId, me.id, joinToken);
  if (on && (!me.permissions.includes("voice.speak") || (await ownRestrictions(chatId, me.id)).micMuted)) {
    throw new HttpError(403, "میکروفون شما توسط مدیر محدود شده است");
  }
  await updatePresences({ _id: voiceKey(chatId, me.id) }, { micOn: on, lastSeenAt: new Date() });
}

/** Start or stop sharing the screen; quality is only a hint the sender applies to the capture. */
export async function setShare(me, chatId, joinToken, on, quality) {
  await requireVoiceRoom(me, chatId);
  await requirePresence(chatId, me.id, joinToken);
  if (on) {
    if (!me.permissions.includes("screen.share")) throw new HttpError(403, "نقش شما اجازهٔ اشتراک صفحه ندارد");
    if ((await ownRestrictions(chatId, me.id)).shareBlocked) throw new HttpError(403, "مدیر اشتراک صفحهٔ شما را بسته است");
  }
  const q = ["360p", "720p", "1080p"].includes(quality) ? quality : "720p";
  await updatePresences({ _id: voiceKey(chatId, me.id) }, { sharingOn: on, shareQuality: q, lastSeenAt: new Date() });
}

export async function sendSignal(me, chatId, input) {
  await requireVoiceRoom(me, chatId);
  await requirePresence(chatId, me.id, input.joinToken);
  if (input.toUserId === me.id) throw new HttpError(400, "گیرندهٔ سیگنال نامعتبر است");
  const target = await findOnePresence({ _id: voiceKey(chatId, input.toUserId), lastSeenAt: alive() });
  if (!target) throw new HttpError(404, "کاربر دیگر در تماس نیست");
  await assertNotBlocked(me.id, input.toUserId);
  await insertSignal({
    conversationId: chatId,
    fromUserId: me.id,
    toUserId: input.toUserId,
    kind: input.kind,
    payload: input.payload,
  });
}

/** Mute someone's microphone or take away their right to play music in this chat. */
export async function moderate(me, chatId, input) {
  const { chat, membership } = await requireVoiceRoom(me, chatId);
  if (!isVoiceModerator(me, membership.role, chat.type)) throw new HttpError(403, "اجازهٔ مدیریت تماس را ندارید");
  if (input.userId === me.id) throw new HttpError(400, "از دکمهٔ میکروفون خودتان استفاده کنید");
  const target = chat.members.find((member) => member.userId === input.userId);
  if (!target) throw new HttpError(404, "کاربر عضو گفتگو نیست");
  const global = me.permissions.includes("voice.moderate");
  if (target.role === "owner" && !global) throw new HttpError(403, "فقط مدیر کل می‌تواند مالک را محدود کند");
  if (membership.role === "admin" && target.role === "admin" && !global) {
    throw new HttpError(403, "مدیر گفتگو نمی‌تواند مدیر دیگری را محدود کند");
  }
  await upsertRestriction(chatId, input.userId, { [input.field]: input.enabled });
  const key = voiceKey(chatId, input.userId);
  if (input.field === "micMuted" && input.enabled) await updatePresences({ _id: key }, { micOn: false });
  if (input.field === "playBlocked" && input.enabled) await stopTracks({ _id: key });
  if (input.field === "shareBlocked") {
    await updatePresences({ _id: key }, { sharingOn: false });
  }
}

/** start / pause / resume / stop for a music bot. Returns the source kind when a track starts. */
export async function trackAction(me, chatId, input) {
  const { chat, membership } = await requireVoiceRoom(me, chatId);

  if (input.action === "stop") {
    const targetId = input.userId || me.id;
    if (targetId !== me.id && !isVoiceModerator(me, membership.role, chat.type)) {
      throw new HttpError(403, "اجازهٔ قطع ربات دیگران را ندارید");
    }
    await stopTracks({ _id: voiceKey(chatId, targetId) });
    return undefined;
  }

  await requirePresence(chatId, me.id, input.joinToken);
  if (!me.permissions.includes("voice.play") || (await ownRestrictions(chatId, me.id)).playBlocked) {
    throw new HttpError(403, "مدیر مجوز پخش ربات شما را غیرفعال کرده است");
  }
  const key = voiceKey(chatId, me.id);
  const previous = await findOneTrack({ _id: key });
  const now = new Date();

  if (input.action === "pause" || input.action === "resume") {
    if (!previous) throw new HttpError(404, "آهنگ فعالی ندارید");
    const elapsed = Math.floor((now.getTime() - previous.startedAt.getTime()) / 1000);
    const position = input.action === "pause" && previous.playing ? Math.max(0, previous.position + elapsed) : previous.position;
    await updateOneTrack({ _id: key }, { playing: input.action === "resume", position, startedAt: now, updatedAt: now });
    return undefined;
  }

  let kind;
  let url = null;
  let fileId = null;
  let suggestedTitle;
  let originKind = null;
  if (input.fileId) {
    const file = await findOneFile({ _id: input.fileId });
    if (!file || file.uploaderId !== me.id || !isAudioMime(file.mime)) {
      throw new HttpError(400, "فایل باید صوتی و متعلق به شما باشد");
    }
    kind = "upload";
    originKind = "upload";
    fileId = file._id;
    suggestedTitle = file.name;
  } else {
    // Server-side extraction & download: SoundCloud or direct audio URLs are fetched by our backend
    // and stored in GridFS so all listeners stream native synchronized audio directly from our server!
    const extracted = await resolveAndDownloadBotAudio(input.url);
    const safeName = `${(input.title || extracted.title || "bot-track").slice(0, 80)}.${extracted.ext}`;
    const stored = await insertFile(
      {
        name: safeName,
        mime: extracted.mime,
        size: extracted.buffer.byteLength,
        uploaderId: me.id,
        purpose: "bot-audio",
      },
      extracted.buffer,
    );
    kind = "upload";
    originKind = extracted.sourceKind; // "soundcloud" | "url"
    fileId = stored._id;
    url = null;
    suggestedTitle = extracted.title;
  }
  await upsertTrack(chatId, me.id, {
    kind,
    originKind,
    url,
    fileId,
    title: input.title || suggestedTitle,
    playing: true,
    position: 0,
    startedAt: now,
    updatedAt: now,
  });
  // The audio file of the replaced track is no longer needed.
  if (previous?.fileId && previous.fileId !== fileId) await removeUnusedFiles([previous.fileId]);
  return originKind || kind;
}
