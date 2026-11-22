import { getCollection } from "../../../config/mongodb.config.js";

/** `_id` is the session token itself. A TTL index on `expiresAt` deletes expired sessions. */
const sessions = () => getCollection("sessions");

// insert

export const insertSession = async (data) => {
  await (await sessions()).insertOne({ ...data, createdAt: new Date() });
};

// find

export const findOneSession = async (field) => (await sessions()).findOne(field);

// delete

export const deleteSessions = async (field) => (await sessions()).deleteMany(field);
