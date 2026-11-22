import { randomBytes } from "node:crypto";
import { DEFAULT_MEETING_HOURS } from "../../config/permissions.config.js";
import { AVATAR_COLORS } from "../../utils/validators/color.validator.js";
import { HttpError } from "../../utils/http/http.util.js";
import { insertNotification } from "../../model/controller/notifications/notifications.controller.js";
import {
  countMeetings,
  deleteMeetingSignals,
  deleteParticipant,
  deleteParticipantsOfMeetings,
  findMeetingSignals,
  findMeetings,
  findOneMeeting,
  findOneParticipant,
  findParticipants,
  insertMeeting,
  insertMeetingSignal,
  nextGuestNumber,
  participantKey,
  updateOneMeeting,
  updateParticipant,
  upsertParticipant,
} from "../../model/controller/meetings/meetings.controller.js";
import { insertMessage } from "../../model/controller/messages/messages.controller.js";
import { findOneUser, findUsersByIds } from "../../model/controller/users/users.controller.js";
import { getOrCreateDirect } from "../chats/chats.service.js";
import { touchChat } from "../../model/controller/chats/chats.controller.js";
import { listFriends } from "../contacts/contacts.service.js";
import * as games from "../games/games.service.js";

/** A participant who sent no heartbeat for this long has left. */
const TIMEOUT_MS = 12_000;
const alive = () => ({ $gt: new Date(Date.now() - TIMEOUT_MS) });

/** In-memory ring buffer of live relayed audio chunks for NAT/firewall fallback (keyed by meetingId). */
const meetingAudioRelay = new Map();
let meetingAudioSeq = 0;

function pushMeetingAudioChunk(meetingId, fromJoinToken, mime, data) {
  let list = meetingAudioRelay.get(meetingId);
  if (!list) {
    list = [];
    meetingAudioRelay.set(meetingId, list);
  }
  const now = Date.now();
  const id = ++meetingAudioSeq;
  list.push({ id, from: fromJoinToken, mime, data, at: now });
  while (list.length > 0 && (now - list[0].at > 6_000 || list.length > 150)) {
    list.shift();
  }
  return id;
}

function readMeetingAudioChunks(meetingId, excludeJoinToken, afterAudioId) {
  const list = meetingAudioRelay.get(meetingId);
  if (!list || !list.length) return { audioChunks: [], audioCursor: afterAudioId };
  const now = Date.now();
  const fresh = list.filter((c) => now - c.at <= 5_000 && c.id > afterAudioId && c.from !== excludeJoinToken);
  const latestId = list[list.length - 1]?.id ?? afterAudioId;
  return { audioChunks: fresh, audioCursor: latestId };
}

export const newMeetingToken = () => randomBytes(9).toString("base64url");
export const newJoinToken = () => randomBytes(20).toString("hex");

async function expireMeetingIfDue(meeting) {
  if (!meeting || !meeting.active) return false;
  if (meeting.expiresAt && new Date(meeting.expiresAt).getTime() <= Date.now()) {
    await deleteParticipantsOfMeetings([meeting._id]);
    await deleteMeetingSignals({ meetingId: meeting._id });
    await games.closeActive(meeting._id);
    await updateOneMeeting({ _id: meeting._id }, { active: false, endedReason: "expired" });
    meeting.active = false;
    return true;
  }
  return false;
}

export async function createMeeting(me, input) {
  if (!me.permissions.includes("meetings.create")) throw new HttpError(403, "نقش شما اجازهٔ ساخت جلسه ندارد");

  // Duration is strictly automatic based on the creator's role (e.g. 24h for regular users, 0 = unlimited for admins)
  const roleHours = typeof me.maxMeetingHours === "number" ? me.maxMeetingHours : DEFAULT_MEETING_HOURS;
  const expiresAt = roleHours > 0 ? new Date(Date.now() + roleHours * 3_600_000) : null;
  const finalTitle = (input.title || "").trim() || `جلسهٔ ${me.displayName}`.slice(0, 60);

  const meeting = await insertMeeting({
    token: newMeetingToken(),
    title: finalTitle,
    hostId: me.id,
    lobby: input.lobby,
    allowNames: input.allowNames,
    durationHours: roleHours,
    expiresAt,
    active: true,
  });
  return {
    id: meeting._id,
    token: meeting.token,
    title: meeting.title,
    lobby: meeting.lobby,
    allowNames: meeting.allowNames,
    durationHours: roleHours,
    expiresAt,
  };
}

export async function listMyMeetings(me) {
  const raw = await findMeetings({ hostId: me.id, active: true }, 40);
  const activeList = [];
  for (const m of raw) {
    const expired = await expireMeetingIfDue(m);
    if (!expired) activeList.push(m);
  }
  const counts = await Promise.all(
    activeList.map(async (m) => (await findParticipants({ meetingId: m._id, inLobby: false, lastSeenAt: alive() })).length),
  );
  return activeList.map((m, i) => ({
    id: m._id,
    token: m.token,
    title: m.title,
    lobby: m.lobby,
    allowNames: m.allowNames,
    createdAt: m.createdAt,
    durationHours: m.durationHours ?? null,
    expiresAt: m.expiresAt ?? null,
    inside: counts[i],
  }));
}

/** Meetings I can see: the ones I host. Other people's meetings are reached by link only. */
export async function resolveMeeting(tokenOrId, me) {
  const byId = Number(tokenOrId);
  const meeting = Number.isInteger(byId) && byId > 0
    ? await findOneMeeting({ _id: byId })
    : await findOneMeeting({ token: tokenOrId });
  if (!meeting || !meeting.active) throw new HttpError(404, "جلسه پیدا نشد یا پایان یافته است");
  if (await expireMeetingIfDue(meeting)) {
    throw new HttpError(410, "مهلت زمانی این جلسه به پایان رسیده است؛ می‌توانید جلسهٔ جدیدی بسازید");
  }
  if (me && me.id === meeting.hostId) return meeting;
  // Guests and signed-in users may enter by token; the host may also open it by id.
  if (!Number.isInteger(byId) || byId <= 0) return meeting;
  throw new HttpError(403, "به این جلسه دسترسی ندارید");
}

export const isHost = (meeting, me) => !!me && me.id === meeting.hostId;

async function evictParticipantRow(meetingId, pRow) {
  await deleteParticipant({ _id: pRow._id });
  await deleteMeetingSignals({ meetingId, $or: [{ from: pRow.joinToken }, { to: pRow.joinToken }] });
  await games.removeParticipantFromGames(meetingId, pRow.joinToken);
}

/**
 * Join (or return to) a meeting.
 * Enforces:
 * 1) Same account (`userId`) cannot join twice simultaneously.
 * 2) Same browser (`browserId`) cannot join twice simultaneously (unless switching accounts with explicit `forceTakeover`, which evicts the old tab!).
 */
export async function joinMeeting(me, meeting, input) {
  const existing = input.joinToken
    ? await findOneParticipant({ _id: participantKey(meeting._id, input.joinToken), lastSeenAt: alive() })
    : null;
  const live = await findParticipants({ meetingId: meeting._id, lastSeenAt: alive() });

  if (!existing) {
    // 1. Check same signed-in account already inside this meeting
    if (me) {
      const sameUser = live.find((p) => p.userId === me.id);
      if (sameUser) {
        if (!input.forceTakeover) {
          throw new HttpError(
            409,
            "شما با همین حساب کاربری در تب یا دستگاه دیگری داخل این جلسه هستید.",
            { code: "ALREADY_IN_MEETING_ACCOUNT", existingName: sameUser.name },
          );
        }
        await evictParticipantRow(meeting._id, sameUser);
      }
    }

    // 2. Check same browser already inside this meeting (another tab, guest or different account)
    if (input.browserId) {
      const freshLive = await findParticipants({ meetingId: meeting._id, lastSeenAt: alive() });
      const sameBrowser = freshLive.find((p) => p.browserId && p.browserId === input.browserId);
      if (sameBrowser) {
        const isDifferentIdentity =
          (me && sameBrowser.userId !== me.id) || (!me && sameBrowser.userId !== null);
        if (isDifferentIdentity) {
          if (!input.forceTakeover) {
            throw new HttpError(
              409,
              `در تب دیگری از همین مرورگر با نام «${sameBrowser.name}» در جلسه حضور دارید. با ورود، تب قبلی از جلسه خارج می‌شود.`,
              { code: "BROWSER_SWITCH_CONFIRM", existingName: sameBrowser.name },
            );
          }
          await evictParticipantRow(meeting._id, sameBrowser);
        } else {
          // Same guest or same user trying to open a second tab in the same browser -> block duplicate!
          if (!input.forceTakeover) {
            throw new HttpError(
              409,
              "شما هم‌اکنون در تب دیگری از همین مرورگر داخل این جلسه هستید و امکان ورود هم‌زمان دوباره وجود ندارد.",
              { code: "ALREADY_IN_MEETING_BROWSER", existingName: sameBrowser.name },
            );
          }
          await evictParticipantRow(meeting._id, sameBrowser);
        }
      }
    }
  }

  const joinToken = existing?.joinToken ?? newJoinToken();
  const afterEvictLive = await findParticipants({ meetingId: meeting._id, lastSeenAt: alive() });
  const usedNames = new Set(afterEvictLive.map((p) => p.name));

  if (existing) {
    // Preserve existing participant's lobby status (don't auto-admit someone who refreshed while waiting in lobby!)
    const keepLobby = existing.inLobby && !isHost(meeting, me);
    // Clear stale signals addressed to/from this participant so peers cleanly renegotiate if needed
    await deleteMeetingSignals({ meetingId: meeting._id, $or: [{ from: joinToken }, { to: joinToken }] });
    await upsertParticipant(meeting._id, joinToken, {
      inLobby: keepLobby,
      micOn: false,
      sharingOn: false,
      cameraOn: false,
      ...(input.browserId ? { browserId: input.browserId } : {}),
      lastSeenAt: new Date(),
    });
  } else {
    const customName = (input.name ?? "").trim();
    let name;
    if (customName.length >= 1) {
      name = customName.slice(0, 32);
    } else if (me) {
      name = me.displayName;
    } else {
      let seqNum = await nextGuestNumber(meeting._id);
      name = `عزیز ${seqNum}`;
      while (usedNames.has(name)) {
        seqNum = await nextGuestNumber(meeting._id);
        name = `عزیز ${seqNum}`;
      }
    }
    await upsertParticipant(meeting._id, joinToken, {
      name,
      avatarColor: me ? me.avatarColor : AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      userId: me?.id ?? null,
      browserId: input.browserId || null,
      isGuest: !me,
      // The host never waits in their own lobby.
      inLobby: meeting.lobby && !isHost(meeting, me),
      micOn: false,
      sharingOn: false,
      shareQuality: "720p",
      shareFps: 30,
      cameraOn: false,
      cameraQuality: "720p",
      cameraFps: 30,
      micMuted: false,
      shareBlocked: false,
      lastSeenAt: new Date(),
    });
  }
  return { joinToken, meeting: publicMeeting(meeting), ...(await snapshot(meeting, joinToken)) };
}

export function publicMeeting(m) {
  return {
    id: m._id,
    token: m.token,
    title: m.title,
    lobby: m.lobby,
    allowNames: m.allowNames,
    hostId: m.hostId,
    durationHours: m.durationHours ?? null,
    expiresAt: m.expiresAt ?? null,
  };
}

/** Everyone in the meeting (plus lobby waiters for the host) and my own moderation state. */
async function snapshot(meeting, joinToken, after = 0, afterAudio = 0) {
  const mine = await findOneParticipant({ _id: participantKey(meeting._id, joinToken) });
  if (!mine) {
    throw new HttpError(
      409,
      "شما از این جلسه خارج شدید (احتمالاً در تب دیگری وارد شدید یا نشست پایان یافت).",
      { code: "EVICTED_OR_LEFT" },
    );
  }
  const all = await findParticipants({ meetingId: meeting._id, lastSeenAt: alive() });
  // Lobby waiters are only visible to the host.
  const visible = all.filter((p) => !p.inLobby || isHostByToken(all, meeting, mine));
  const userIds = [...new Set(visible.map((p) => p.userId).filter((id) => typeof id === "number"))];
  const userDocs = userIds.length ? await findUsersByIds(userIds) : [];
  const avatarByUserId = new Map(userDocs.map((u) => [u._id, u.avatarFileId ?? null]));
  const participants = visible
    .sort((a, b) => Number(b.userId !== null) - Number(a.userId !== null) || a.name.localeCompare(b.name, "fa"))
    .map((p) => ({
      joinToken: p.joinToken,
      name: p.name,
      avatarColor: p.avatarColor,
      avatarFileId: p.userId !== null ? (avatarByUserId.get(p.userId) ?? null) : null,
      userId: p.userId,
      isGuest: p.isGuest,
      inLobby: p.inLobby,
      micOn: p.micOn,
      sharingOn: p.sharingOn,
      shareQuality: p.shareQuality,
      shareFps: p.shareFps ?? 30,
      cameraOn: p.cameraOn ?? false,
      cameraQuality: p.cameraQuality ?? "720p",
      cameraFps: p.cameraFps ?? 30,
      micMuted: p.micMuted,
      shareBlocked: p.shareBlocked,
      isHost: p.userId !== null && p.userId === meeting.hostId,
    }));
  const signals = (
    after
      ? await findMeetingSignals({ meetingId: meeting._id, to: joinToken, _id: { $gt: after } })
      : await findMeetingSignals({ meetingId: meeting._id, to: joinToken, createdAt: { $gt: new Date(Date.now() - 30_000) } })
  ).map((s) => ({ id: s._id, from: s.from, kind: s.kind, payload: s.payload }));
  const inCallTokens = new Set(all.filter((p) => !p.inLobby && !p.micMuted).map((p) => p.joinToken));
  const { audioChunks, audioCursor } = mine.inLobby
    ? { audioChunks: [], audioCursor: afterAudio }
    : readMeetingAudioChunks(meeting._id, joinToken, afterAudio);
  return {
    participants,
    signals,
    cursor: signals.at(-1)?.id ?? after,
    audioChunks: audioChunks.filter((c) => inCallTokens.has(c.from)),
    audioCursor,
    game: games.publicGame(await games.activeGame(meeting._id)),
    host: mine.userId !== null && mine.userId === meeting.hostId,
    expiresAt: meeting.expiresAt ?? null,
    myState: {
      inLobby: mine.inLobby,
      micMuted: mine.micMuted,
      shareBlocked: mine.shareBlocked,
    },
    serverTime: Date.now(),
  };
}

/** Only the host (matched by their own participant row) may see the lobby. */
function isHostByToken(all, meeting, mine) {
  return mine.userId !== null && mine.userId === meeting.hostId;
}

export async function getSnapshot(me, meeting, joinToken, after, afterAudio = 0) {
  return snapshot(meeting, joinToken, after, afterAudio);
}

async function requireParticipant(meeting, joinToken) {
  const p = await findOneParticipant({ _id: participantKey(meeting._id, joinToken), lastSeenAt: alive() });
  if (!p) throw new HttpError(409, "نشست شما در این جلسه تمام شده؛ دوباره بپیوندید", { code: "EVICTED_OR_LEFT" });
  return p;
}

async function requireHost(meeting, joinToken) {
  const p = await requireParticipant(meeting, joinToken);
  if (p.userId === null || p.userId !== meeting.hostId) throw new HttpError(403, "فقط میزبان جلسه این کار را می‌کند");
  return p;
}

export async function meetingAction(me, meeting, input) {
  const key = participantKey(meeting._id, input.joinToken);

  if (input.action === "leave") {
    await deleteParticipant({ _id: key });
    await deleteMeetingSignals({ meetingId: meeting._id, $or: [{ from: input.joinToken }, { to: input.joinToken }] });
    await games.removeParticipantFromGames(meeting._id, input.joinToken);
    return;
  }
  if (input.action === "heartbeat") {
    const row = await findOneParticipant({ _id: key });
    if (!row) throw new HttpError(409, "شما از این جلسه خارج شده‌اید", { code: "EVICTED_OR_LEFT" });
    await updateParticipant({ _id: key }, {});
    return;
  }
  const actor = await requireParticipant(meeting, input.joinToken);

  if (input.action === "audio-chunk") {
    if (actor.inLobby || actor.micMuted) return;
    await updateParticipant({ _id: key }, {});
    pushMeetingAudioChunk(meeting._id, input.joinToken, input.mime || "audio/webm", input.data);
    return;
  }

  if (input.action === "mic") {
    if (input.on && actor.micMuted) throw new HttpError(403, "میکروفون شما توسط میزبان بسته شده است");
    await updateParticipant({ _id: key }, { micOn: input.on });
    return;
  }
  if (input.action === "share") {
    if (input.on) {
      if (actor.shareBlocked) throw new HttpError(403, "میزبان اشتراک صفحهٔ شما را بسته است");
      if (me && !me.permissions.includes("screen.share")) throw new HttpError(403, "نقش شما اجازهٔ اشتراک صفحه ندارد");
    }
    await updateParticipant({ _id: key }, { sharingOn: input.on, shareQuality: input.quality, shareFps: input.fps });
    return;
  }
  if (input.action === "camera") {
    if (input.on && actor.shareBlocked) throw new HttpError(403, "میزبان اشتراک تصویر شما را بسته است");
    await updateParticipant({ _id: key }, { cameraOn: input.on, cameraQuality: input.quality, cameraFps: input.fps });
    return;
  }
  if (input.action === "game-create") {
    const created = await games.createGame(meeting, actor, input.game);
    return { game: games.publicGame(created) };
  }
  if (input.action === "game-join") {
    return games.joinGame(meeting, actor);
  }
  if (input.action === "game-spectate") {
    return games.spectateGame(meeting, actor);
  }
  if (input.action === "game-start") {
    return games.startGame(meeting, actor);
  }
  if (input.action === "game-rematch") {
    return games.rematchGame(meeting, actor);
  }
  if (input.action === "game-move") {
    return games.applyMove(meeting, actor, input.move);
  }
  if (input.action === "game-close") {
    if (actor.userId !== null && actor.userId === meeting.hostId) return games.closeActive(meeting._id);
    return games.closeGame(meeting, actor);
  }
  if (input.action === "signal") {
    const target = await findOneParticipant({ _id: participantKey(meeting._id, input.to), lastSeenAt: alive() });
    if (!target) throw new HttpError(404, "گیرنده در جلسه نیست");
    await insertMeetingSignal({
      meetingId: meeting._id,
      from: input.joinToken,
      to: input.to,
      kind: input.kind,
      payload: input.payload,
    });
    return;
  }

  // host-only actions
  await requireHost(meeting, input.joinToken);
  const targetKey = participantKey(meeting._id, input.target);
  const target = await findOneParticipant({ _id: targetKey, lastSeenAt: alive() });
  if (!target) throw new HttpError(404, "این فرد در جلسه نیست");
  if (target.userId !== null && target.userId === meeting.hostId) throw new HttpError(400, "نمی‌توانید میزبان را محدود کنید");

  switch (input.action) {
    case "admit":
      await updateParticipant({ _id: targetKey }, { inLobby: false });
      if (target.userId) {
        await insertNotification({ userId: target.userId, kind: "meeting-admitted", title: "به جلسه پیوستید", body: `میزبان شما را به «${meeting.title}» راه داد`, path: `/meet/${meeting.token}`, actorName: (await findOneUser({ _id: meeting.hostId }))?.displayName });
      }
      break;
    case "kick":
      await deleteParticipant({ _id: targetKey });
      await deleteMeetingSignals({ meetingId: meeting._id, $or: [{ from: input.target }, { to: input.target }] });
      await games.removeParticipantFromGames(meeting._id, input.target);
      if (target.userId) await insertNotification({ userId: target.userId, kind: "kicked", title: "از جلسه خارج شدید", body: `میزبان شما را از «${meeting.title}» خارج کرد`, actorName: (await findOneUser({ _id: meeting.hostId }))?.displayName });
      break;
    case "mute":
      await updateParticipant({ _id: targetKey }, { micMuted: true, micOn: false });
      if (target.userId) await insertNotification({ userId: target.userId, kind: "muted", title: "میکروفون شما بسته شد", body: `در جلسهٔ «${meeting.title}»`, actorName: (await findOneUser({ _id: meeting.hostId }))?.displayName });
      break;
    case "unmute":
      await updateParticipant({ _id: targetKey }, { micMuted: false });
      break;
    case "block-share":
      await updateParticipant({ _id: targetKey }, { shareBlocked: true, sharingOn: false, cameraOn: false });
      if (target.userId) await insertNotification({ userId: target.userId, kind: "share-blocked", title: "اشتراک صفحه و کمرای شما بسته شد", body: `در جلسهٔ «${meeting.title}»`, actorName: (await findOneUser({ _id: meeting.hostId }))?.displayName });
      break;
    case "allow-share":
      await updateParticipant({ _id: targetKey }, { shareBlocked: false });
      break;
  }
}

export async function endMeeting(me, meeting) {
  if (!isHost(meeting, me) && !me.permissions.includes("rooms.manage")) throw new HttpError(403, "فقط میزبان می‌تواند جلسه را پایان دهد");
  await deleteParticipantsOfMeetings([meeting._id]);
  await deleteMeetingSignals({ meetingId: meeting._id });
  await games.closeActive(meeting._id);
  await updateOneMeeting({ _id: meeting._id }, { active: false, endedReason: "host" });
}

/** Friends of the host who are not in the meeting yet — the invite popup lists exactly these. */
export async function invitableFriends(me, meeting) {
  if (!isHost(meeting, me)) throw new HttpError(403, "فقط میزبان می‌تواند دعوت کند");
  const friends = await listFriends(me);
  const inside = new Set(
    (await findParticipants({ meetingId: meeting._id, lastSeenAt: alive() })).map((p) => p.userId).filter((id) => typeof id === "number"),
  );
  return friends.friends
    .filter((f) => !inside.has(f.user.id))
    .map((f) => ({ id: f.user.id, username: f.user.username, displayName: f.user.displayName, avatarColor: f.user.avatarColor, avatarFileId: f.user.avatarFileId ?? null, status: f.user.status }));
}

export async function inviteToMeeting(me, meeting, userIds) {
  if (!isHost(meeting, me)) throw new HttpError(403, "فقط میزبان می‌تواند دعوت کند");
  if (!userIds.length) throw new HttpError(400, "کسی را انتخاب نکرده‌اید");
  const friends = await listFriends(me);
  const allowed = new Map(friends.friends.map((f) => [f.user.id, f.user]));
  const invited = [];
  for (const id of userIds.slice(0, 25)) {
    const friend = allowed.get(id);
    if (!friend) throw new HttpError(403, "فقط دوستانتان را می‌توانید دعوت کنید");
    const chat = await getOrCreateDirect(me.id, id);
    await insertMessage({
      conversationId: chat._id,
      senderId: me.id,
      type: "meeting",
      content: JSON.stringify({ token: meeting.token, title: meeting.title, host: me.displayName, lobby: meeting.lobby, at: Date.now() }),
      fileId: null,
    });
    await touchChat(chat._id);
    await insertNotification({
      userId: id,
      kind: "meeting-invite",
      title: "دعوت به جلسه",
      body: `${me.displayName} شما را به «${meeting.title}» دعوت کرد`,
      path: `/meet/${meeting.token}`,
      actorName: me.displayName,
    });
    invited.push(friend.displayName);
  }
  return { invited };
}

export async function meetingStats() {
  return { meetings: await countMeetings({ active: true }) };
}
