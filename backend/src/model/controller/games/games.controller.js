import { getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

/** One game per meeting at a time. State is embedded, so a single read feeds every player. */
const games = () => getCollection("meeting_games");

export const findOneGame = async (field) => (await games()).findOne(field);

/** The most recently touched game of a meeting (active or just finished). */
export const findLatestGame = async (meetingId, cutoff) =>
  (await games()).find({ meetingId, updatedAt: { $gt: cutoff } }).sort({ updatedAt: -1 }).limit(1).next();

export const findGames = async (field) =>
  (await games()).find(field).sort({ updatedAt: -1 }).limit(6).toArray();

export const insertGame = async (data) => {
  const doc = { ...data, _id: await nextId("meeting_games"), createdAt: new Date(), updatedAt: new Date() };
  await (await games()).insertOne(doc);
  return doc;
};

export const updateOneGame = async (field, data) =>
  (await games()).findOneAndUpdate(
    field,
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

export const deleteGames = async (field) => (await games()).deleteMany(field);
