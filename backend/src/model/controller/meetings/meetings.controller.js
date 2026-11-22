import { getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

/** A stand-alone meeting, independent of any group: it lives on its own public link. */
/** Live participants. Identity is the joinToken, so guests (no account) work too. */
/** WebRTC signalling between meeting participants, addressed by joinToken. */
const meetings = () => getCollection("meetings");
const participants = () => getCollection("meeting_participants");
const signals = () => getCollection("meeting_signals");

export const participantKey = (meetingId, joinToken) => `${meetingId}:${joinToken}`;

// meetings
export const insertMeeting = async (data) => {
  const now = new Date();
  const doc = { ...data, _id: await nextId("meetings"), createdAt: now, updatedAt: now };
  await (await meetings()).insertOne(doc);
  return doc;
};
export const findOneMeeting = async (field) => (await meetings()).findOne(field);
export const findMeetings = async (field = {}, limit = 100) =>
  (await meetings()).find(field).sort({ createdAt: -1 }).limit(limit).toArray();
export const countMeetings = async (field = {}) => (await meetings()).countDocuments(field);
export const updateOneMeeting = async (field, data) =>
  (await meetings()).updateOne(field, { $set: { ...data, updatedAt: new Date() } });
export const deleteMeetings = async (field) => (await meetings()).deleteMany(field);

/** Allocates a monotonically increasing guest number per meeting so guests get عزیز 1, عزیز 2, عزیز 3... */
export const nextGuestNumber = async (meetingId) => {
  const col = await meetings();
  const res = await col.findOneAndUpdate(
    { _id: meetingId },
    { $inc: { guestCounter: 1 } },
    { returnDocument: "after" },
  );
  const doc = res?.value ?? res;
  return doc?.guestCounter ?? 1;
};

// participants
export const upsertParticipant = async (meetingId, joinToken, data) =>
  (await participants()).updateOne(
    { _id: participantKey(meetingId, joinToken) },
    { $set: { meetingId, joinToken, ...data, lastSeenAt: new Date() } },
    { upsert: true },
  );
export const findOneParticipant = async (field) => (await participants()).findOne(field);
export const findParticipants = async (field) =>
  (await participants()).find(field).toArray();
export const updateParticipant = async (field, data) =>
  (await participants()).updateMany(field, { $set: { ...data, lastSeenAt: new Date() } });
export const deleteParticipant = async (field) => (await participants()).deleteMany(field);
export const deleteParticipantsOfMeetings = async (meetingIds) =>
  meetingIds.length ? (await participants()).deleteMany({ meetingId: { $in: meetingIds } }) : { deletedCount: 0 };

// signals
export const insertMeetingSignal = async (data) =>
  (await signals()).insertOne({ ...data, _id: await nextId("meeting_signals"), createdAt: new Date() });
export const findMeetingSignals = async (field, limit = 200) =>
  (await signals()).find(field).sort({ _id: 1 }).limit(limit).toArray();
export const findLastMeetingSignal = async (field) => (await signals()).findOne(field, { sort: { _id: -1 } });
export const deleteMeetingSignals = async (field) => (await signals()).deleteMany(field);
