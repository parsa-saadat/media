import { getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

const notifications = () => getCollection("notifications");

export const insertNotification = async (data) =>
  (await notifications()).insertOne({ ...data, _id: await nextId("notifications"), read: false, createdAt: new Date() });

export const findNotifications = async (userId, limit = 40) =>
  (await notifications()).find({ userId }).sort({ _id: -1 }).limit(limit).toArray();

export const countUnreadNotifications = async (userId) => (await notifications()).countDocuments({ userId, read: false });

export const markNotificationsRead = async (userId, ids) =>
  (await notifications()).updateMany(
    ids?.length ? { userId, _id: { $in: ids } } : { userId, read: false },
    { $set: { read: true } },
  );

export const deleteNotifications = async (field) => (await notifications()).deleteMany(field);
