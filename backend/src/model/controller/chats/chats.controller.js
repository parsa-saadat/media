import { getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

/**
 * room = public and joinable, group = private (invite only), direct = one-to-one.
 * Members live inside the chat document, so one read answers "who is here and what is my role".
 */
const chats = () => getCollection("chats");

// insert

export const insertChat = async (data) => {
  const now = new Date();
  const { directKey, ...rest } = data;
  const doc = { ...rest, ...(directKey ? { directKey } : {}), _id: await nextId("chats"), createdAt: now, updatedAt: now };
  await (await chats()).insertOne(doc);
  return doc;
};

// find

export const findOneChat = async (field) => (await chats()).findOne(field);

export const findChats = async (field = {}, options = {}) =>
  (await chats()).find(field, options).toArray();

export const countChats = async (field = {}) => (await chats()).countDocuments(field);

// update

export const updateOneChat = async (field, data) =>
  (await chats()).updateOne(field, { $set: { ...data, updatedAt: new Date() } });

/** Moves the chat to the top of everyone's list. */
export const touchChat = async (id) => (await chats()).updateOne({ _id: id }, { $set: { updatedAt: new Date() } });

/** Returns false when the user was already a member. */
export const addChatMember = async (id, member) => {
  const result = await (await chats()).updateOne(
    { _id: id, "members.userId": { $ne: member.userId } },
    { $push: { members: member } },
  );
  return result.modifiedCount > 0;
};

export const removeChatMember = async (id, userId) =>
  (await chats()).updateOne({ _id: id }, { $pull: { members: { userId } } });

export const setChatMemberRole = async (id, userId, role) =>
  (await chats()).updateOne({ _id: id, "members.userId": userId }, { $set: { "members.$.role": role } });

/** The read marker only ever moves forward. */
export const markChatRead = async (id, userId, messageId) =>
  (await chats()).updateOne(
    { _id: id, members: { $elemMatch: { userId, lastReadMessageId: { $lt: messageId } } } },
    { $set: { "members.$.lastReadMessageId": messageId } },
  );

// delete

export const deleteChats = async (field) => (await chats()).deleteMany(field);
