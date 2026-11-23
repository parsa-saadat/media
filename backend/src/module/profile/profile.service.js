import { findRoles } from "../../model/controller/roles/roles.controller.js";
import { deleteFiles, findOneFile, insertFile, readFileData } from "../../model/controller/storage/storage.controller.js";
import { findOneUser, toPublicUser, updateOneUser } from "../../model/controller/users/users.controller.js";
import { HttpError } from "../../utils/http/http.util.js";
import { resolveMime } from "../../utils/validators/file.validator.js";
import { notify } from "../notifications/notifications.service.js";
import { assertImageQuota, imageQuota } from "../storage/storage.service.js";

const PHOTO_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const PHOTO_MAX = 8 * 1024 * 1024;
const BANNER_MAX = 8 * 1024 * 1024;

/**
 * Sets (and replaces) the user's single profile photo.
 * Nobody can have more than 1 profile photo — any previous photo(s) are deleted cleanly.
 */
export async function addPhoto(me, file) {
  if (!me.permissions.includes("avatar.upload")) throw new HttpError(403, "نقش شما اجازهٔ گذاشتن عکس پروفایل ندارد");
  if (file.size === 0) throw new HttpError(400, "فایل خالی است");
  if (file.size > PHOTO_MAX) throw new HttpError(413, "حداکثر حجم عکس پروفایل ۸ مگابایت است");
  const mime = resolveMime(file.name, file.type);
  if (!PHOTO_MIMES.has(mime)) throw new HttpError(400, "فرمت عکس باید PNG، JPEG، WebP یا GIF باشد");
  const user = await findOneUser({ _id: me.id });
  if (!user) throw new HttpError(404, "کاربر پیدا نشد");
  await assertImageQuota(me);

  const oldIds = [
    ...new Set([
      ...(Array.isArray(user.photos) ? user.photos : []),
      ...(user.avatarFileId ? [user.avatarFileId] : []),
    ]),
  ];

  const doc = await insertFile(
    { name: `avatar-${me.username}-${Date.now()}.${mime.split("/")[1]}`, mime, size: file.size, uploaderId: me.id, purpose: "avatar" },
    Buffer.from(await file.arrayBuffer()),
  );
  const single = [doc._id];
  await updateOneUser({ _id: me.id }, { photos: single, avatarFileId: doc._id });
  if (oldIds.length) await deleteFiles(oldIds).catch(() => {});
  return { fileId: doc._id, avatarFileId: doc._id, photos: single };
}

export async function removePhoto(me, fileId) {
  const user = await findOneUser({ _id: me.id });
  const existing = [
    ...new Set([
      ...(Array.isArray(user?.photos) ? user.photos : []),
      ...(user?.avatarFileId ? [user.avatarFileId] : []),
    ]),
  ];
  const toDelete = fileId ? existing.filter((id) => id === fileId) : existing;
  const remaining = existing.filter((id) => !toDelete.includes(id)).slice(0, 1);
  const nextAvatar = remaining[0] ?? null;
  await updateOneUser({ _id: me.id }, { photos: remaining, avatarFileId: nextAvatar });
  if (toDelete.length) await deleteFiles(toDelete).catch(() => {});
  return { photos: remaining, avatarFileId: nextAvatar };
}

export async function setAvatar(me, fileId) {
  const user = await findOneUser({ _id: me.id });
  if (!(user?.photos ?? []).includes(fileId) && user?.avatarFileId !== fileId) {
    throw new HttpError(404, "این عکس در پروفایل شما نیست");
  }
  await updateOneUser({ _id: me.id }, { photos: [fileId], avatarFileId: fileId });
  return { avatarFileId: fileId };
}

export async function setStatus(me, input) {
  await updateOneUser(
    { _id: me.id },
    {
      status: input.status,
      statusText: input.statusText,
      statusEmoji: input.statusEmoji,
      lastSeenAt: new Date(),
    },
  );
}

/** Sets the profile banner (cover image). The previous banner is removed. */
export async function setBanner(me, file) {
  if (!me.permissions.includes("avatar.upload")) throw new HttpError(403, "نقش شما اجازهٔ گذاشتن بنر ندارد");
  if (file.size === 0) throw new HttpError(400, "فایل خالی است");
  if (file.size > BANNER_MAX) throw new HttpError(413, "حداکثر حجم بنر ۸ مگابایت است");
  const mime = resolveMime(file.name, file.type);
  if (!PHOTO_MIMES.has(mime)) throw new HttpError(400, "فرمت بنر باید PNG، JPEG، WebP یا GIF باشد");
  await assertImageQuota(me);
  const user = await findOneUser({ _id: me.id });
  const previous = user?.bannerFileId ?? null;
  const doc = await insertFile(
    { name: `banner-${me.username}.${mime.split("/")[1]}`, mime, size: file.size, uploaderId: me.id, purpose: "banner" },
    Buffer.from(await file.arrayBuffer()),
  );
  await updateOneUser({ _id: me.id }, { bannerFileId: doc._id });
  if (previous) await deleteFiles([previous]).catch(() => {});
  return { bannerFileId: doc._id };
}

export async function removeBanner(me) {
  const previous = (await findOneUser({ _id: me.id }))?.bannerFileId ?? null;
  await updateOneUser({ _id: me.id }, { bannerFileId: null });
  if (previous) await deleteFiles([previous]).catch(() => {});
}

/** Banners are visible to every signed-in user, like avatars. */
export async function readBanner(userId) {
  const user = await findOneUser({ _id: userId });
  if (!user?.bannerFileId) throw new HttpError(404, "این کاربر بنر ندارد");
  const file = await findOneFile({ _id: user.bannerFileId });
  if (!file) throw new HttpError(404, "بنر پیدا نشد");
  return { file, data: await readFileData(file) };
}

export async function myProfile(me) {
  const user = await findOneUser({ _id: me.id });
  if (!user) throw new HttpError(404, "کاربر پیدا نشد");
  const singlePhoto = user.avatarFileId ? [user.avatarFileId] : (user.photos ?? []).slice(0, 1);
  return {
    ...toPublicUser(user),
    photos: singlePhoto,
    avatarFileId: singlePhoto[0] ?? null,
    status: user.status ?? "online",
    statusText: user.statusText ?? "",
    statusEmoji: user.statusEmoji ?? "",
    quota: await imageQuota(me),
  };
}

/** Public profile of any user: single avatar photo, live effective status, bio, roles — never phone or hashes. */
export async function publicProfile(_me, userId) {
  const user = await findOneUser({ _id: userId });
  if (!user) throw new HttpError(404, "کاربر پیدا نشد");
  const pub = toPublicUser(user);
  const roleDocs = user.roleIds?.length ? await findRoles({ _id: { $in: user.roleIds } }) : [];
  const singlePhoto = user.avatarFileId ? [user.avatarFileId] : (user.photos ?? []).slice(0, 1);
  return {
    ...pub,
    photos: singlePhoto,
    avatarFileId: singlePhoto[0] ?? null,
    roles: roleDocs.map((r) => ({ id: r._id, name: r.name, color: r.color })),
    joinedAt: user.createdAt,
  };
}

export const notifyUser = notify;
