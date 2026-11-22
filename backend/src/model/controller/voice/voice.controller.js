import { getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

/** Who is in a call right now. Rows older than a few seconds are ignored (see voice.service). */
/** Moderation set by a room admin; it survives reconnects and page reloads. */
/** Short-lived WebRTC signalling (SDP / ICE). The audio itself never passes through the database. */
/** Each participant owns one music bot per chat. */
const presence = () => getCollection("voice_presence");
const restrictions = () => getCollection("voice_restrictions");
const signals = () => getCollection("voice_signals");
const tracks = () => getCollection("voice_tracks");

/** One document per (chat, user) for presence, restrictions and tracks. */
export const voiceKey = (chatId, userId) => `${chatId}:${userId}`;

// presence

export const upsertPresence = async (chatId, userId, data) =>
  (await presence()).updateOne(
    { _id: voiceKey(chatId, userId) },
    { $set: { conversationId: chatId, userId, ...data } },
    { upsert: true },
  );

export const findOnePresence = async (field) => (await presence()).findOne(field);

export const findPresences = async (field) =>
  (await presence()).find(field).toArray();

export const updatePresences = async (field, data) =>
  (await presence()).updateMany(field, { $set: data });

export const deletePresences = async (field) => (await presence()).deleteMany(field);

// restrictions

export const findOneRestriction = async (field) => (await restrictions()).findOne(field);

export const findRestrictions = async (field) =>
  (await restrictions()).find(field).toArray();

export const upsertRestriction = async (chatId, userId, data) => {
  // A field may appear in $set or in $setOnInsert, never in both.
  const onInsert = { conversationId: chatId, userId };
  if (data.micMuted === undefined) onInsert.micMuted = false;
  if (data.playBlocked === undefined) onInsert.playBlocked = false;
  const set = { updatedAt: new Date() };
  if (data.micMuted !== undefined) set.micMuted = data.micMuted;
  if (data.playBlocked !== undefined) set.playBlocked = data.playBlocked;
  return (await restrictions()).updateOne({ _id: voiceKey(chatId, userId) }, { $set: set, $setOnInsert: onInsert }, { upsert: true });
};

export const deleteRestrictions = async (field) => (await restrictions()).deleteMany(field);

// signals

export const insertSignal = async (data) => {
  await (await signals()).insertOne({ ...data, _id: await nextId("voice_signals"), createdAt: new Date() });
};

export const findSignals = async (field, limit = 200) =>
  (await signals()).find(field).sort({ _id: 1 }).limit(limit).toArray();

export const findLastSignal = async (field) => (await signals()).findOne(field, { sort: { _id: -1 } });

export const deleteSignals = async (field) => (await signals()).deleteMany(field);

// tracks

export const upsertTrack = async (chatId, userId, data) =>
  (await tracks()).updateOne(
    { _id: voiceKey(chatId, userId) },
    { $set: { conversationId: chatId, userId, ...data } },
    { upsert: true },
  );

export const findOneTrack = async (field) => (await tracks()).findOne(field);

export const findTracks = async (field) => (await tracks()).find(field).toArray();

export const updateOneTrack = async (field, data) =>
  (await tracks()).updateOne(field, { $set: data });

export const deleteTracks = async (field) => (await tracks()).deleteMany(field);
