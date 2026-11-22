import { findNotifications, countUnreadNotifications, markNotificationsRead, deleteNotifications, insertNotification } from "../../model/controller/notifications/notifications.controller.js";

export async function listFor(me) {
  const [items, unread] = await Promise.all([findNotifications(me.id), countUnreadNotifications(me.id)]);
  return { unread, items: items.map((n) => ({ id: n._id, kind: n.kind, title: n.title, body: n.body, path: n.path ?? null, actorName: n.actorName ?? null, read: n.read, createdAt: n.createdAt })) };
}

export async function markRead(me, ids) {
  await markNotificationsRead(me.id, ids);
  return { unread: await countUnreadNotifications(me.id) };
}

export async function clear(me) {
  await deleteNotifications({ userId: me.id });
}

/** Used by other modules (friends, meetings, voice moderation, admin). */
export const notify = (userId, kind, title, body, path, actorName) =>
  userId ? insertNotification({ userId, kind, title, body, ...(path ? { path } : {}), ...(actorName ? { actorName } : {}) }) : Promise.resolve();
