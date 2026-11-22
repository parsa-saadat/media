import { getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

/** Azan sound clips uploaded by the administrator; the bytes live in GridFS like every other file. */
const sounds = () => getCollection("azan_sounds");

export const findSounds = async (field = {}) =>
  (await sounds()).find(field).sort({ createdAt: 1 }).toArray();

export const findOneSound = async (field) => (await sounds()).findOne(field);

export const insertSound = async (data) => {
  const doc = { ...data, _id: await nextId("azan_sounds"), createdAt: new Date() };
  await (await sounds()).insertOne(doc);
  return doc;
};

export const deleteSounds = async (field) => (await sounds()).deleteMany(field);
