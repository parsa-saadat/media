import { getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

/** A friendship or a pending friend request. `pairKey` is unique, so two people have at most one. */
/** `_id` is "blockerId:blockedId". */
const contacts = () => getCollection("contacts");
const blocks = () => getCollection("blocks");

/** Order-independent key for two users: "smallerId:largerId". */
export const pairKeyOf = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export const blockKeyOf = (blockerId, blockedId) => `${blockerId}:${blockedId}`;

// insert

export const insertContact = async (data) => {
  const doc = {
    ...data,
    _id: await nextId("contacts"),
    pairKey: pairKeyOf(data.requesterId, data.addresseeId),
    createdAt: new Date(),
  };
  await (await contacts()).insertOne(doc);
  return doc;
};

export const insertBlock = async (blockerId, blockedId) =>
  (await blocks()).updateOne(
    { _id: blockKeyOf(blockerId, blockedId) },
    { $setOnInsert: { blockerId, blockedId, createdAt: new Date() } },
    { upsert: true },
  );

// find

export const findOneContact = async (field) => (await contacts()).findOne(field);

export const findContacts = async (field) => (await contacts()).find(field).toArray();

export const findOneBlock = async (field) => (await blocks()).findOne(field);

export const findBlocks = async (field) =>
  (await blocks()).find(field).sort({ createdAt: 1 }).toArray();

// update

export const updateOneContact = async (field, data) =>
  (await contacts()).updateOne(field, { $set: data });

// delete

export const deleteContacts = async (field) => (await contacts()).deleteMany(field);

export const deleteBlocks = async (field) => (await blocks()).deleteMany(field);
