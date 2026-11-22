import { getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

/** Qur'an verses and hadiths; one of the verses is flagged as the daily one by the admin. */
const contents = () => getCollection("contents");

export const findContents = async (field = {}, options = {}) =>
  (await contents()).find(field, options).sort({ createdAt: -1 }).toArray();

export const findOneContent = async (field) => (await contents()).findOne(field);

export const countContents = async (field = {}) => (await contents()).countDocuments(field);

export const insertContent = async (data) => {
  const doc = { ...data, _id: await nextId("contents"), createdAt: new Date() };
  await (await contents()).insertOne(doc);
  return doc;
};

export const updateOneContent = async (field, data) => (await contents()).updateOne(field, { $set: data });

export const deleteContents = async (field) => (await contents()).deleteMany(field);
