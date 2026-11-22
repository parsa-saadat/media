import { getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

const messages = () => getCollection("messages");

// insert

export const insertMessage = async (data) => {
  const doc = { ...data, _id: await nextId("messages"), createdAt: data.createdAt ?? new Date() };
  await (await messages()).insertOne(doc);
  return doc;
};

// find

export const findOneMessage = async (field) => (await messages()).findOne(field);

export const findMessages = async (field, options = {}) =>
  (await messages()).find(field, options).toArray();

export const countMessages = async (field = {}) => (await messages()).countDocuments(field);

/** Ids of the files attached to the matching messages. */
export const findMessageFileIds = async (field) => {
  const col = await messages();
  const [single, multi] = await Promise.all([
    col.distinct("fileId", field),
    col.distinct("fileIds", field),
  ]);
  return [...new Set([...single, ...multi].filter((id) => typeof id === "number"))];
};

/** Newest message of each chat, keyed by chat id. */
export const findLastMessages = async (chatIds) => {
  if (!chatIds.length) return new Map();
  const rows = await (await messages())
    .aggregate([
      { $match: { conversationId: { $in: chatIds } } },
      { $sort: { conversationId: 1, _id: -1 } },
      { $group: { _id: "$conversationId", message: { $first: "$$ROOT" } } },
    ])
    .toArray();
  return new Map(rows.map((row) => [row._id, row.message]));
};

/** Messages newer than each chat's read marker that were not written by the user. */
export const countUnreadMessages = async (userId, markers) => {
  if (!markers.length) return new Map();
  const rows = await (await messages())
    .aggregate([
      {
        $match: {
          senderId: { $ne: userId },
          $or: markers.map((m) => ({ conversationId: m.chatId, _id: { $gt: m.lastRead } })),
        },
      },
      { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((row) => [row._id, row.count]));
};

export const countMessagesByChat = async (chatIds) => {
  if (!chatIds.length) return new Map();
  const rows = await (await messages())
    .aggregate([
      { $match: { conversationId: { $in: chatIds } } },
      { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((row) => [row._id, row.count]));
};

/** Message counts per UTC day ("YYYY-MM-DD"). */
export const countMessagesPerDay = async (since) => {
  const rows = await (await messages())
    .aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((row) => [row._id, row.count]));
};

/** Marks every message up to `messageId` in a chat as read by `userId` (idempotent). */
export const markMessagesReadBy = async (conversationId, userId, messageId) =>
  (await messages()).updateMany(
    { conversationId, _id: { $lte: messageId }, senderId: { $ne: userId }, "readBy.userId": { $ne: userId } },
    { $push: { readBy: { userId, at: new Date() } } },
  );

// update

export const updateOneMessage = async (field, data) =>
  (await messages()).updateOne(field, { $set: data });

// delete

export const deleteMessages = async (field) => (await messages()).deleteMany(field);
