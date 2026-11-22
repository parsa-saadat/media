import { findOneFile, deleteFiles } from "../../model/controller/storage/storage.controller.js";
import { findOneUser, findUsersByIds, toPublicUser, updateOneUser } from "../../model/controller/users/users.controller.js";
import { HttpError } from "../../utils/http/http.util.js";
import { resolveMime } from "../../utils/validators/file.validator.js";
import { notify } from "../notifications/notifications.service.js";
import { assertImageQuota, imageQuota } from "../storage/storage.service.js";
import { insertFile } from "../../model/controller/storage/storage.controller.js";

const PHOTO_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const PHOTO_MAX = 8 * 1024 * 1024;
const MAX_PHOTOS = 12;

/** Adds a photo to the user's gallery (and makes it the avatar when it is the first one). */
export async function addPhoto(me, file, makeAvatar) {
  if (!me.permissions.includes("avatar.upload")) throw new HttpError(403, "نقش شما اجازهٔ گذاشتن عکس پروفایل ندارد");
  if (file.size === 0) throw new HttpError(400, "فایل خالی است");
  if (file.size > PHOTO_MAX) throw new HttpError(413, "حداکثر حجم هر عکس ۸ مگابایت است");
  const mime = resolveMime(file.name, file.type);
  if (!PHOTO_MIMES.has(mime)) throw new HttpError(400, "فرمت عکس باید PNG، JPEG، WebP یا GIF باشد");
  const user = await findOneUser({ _id: me.id });
  if (!user) throw new HttpError(404, "کاربر پیدا نشد");
  const photos = user.photos ?? [];
  if (photos.length >= MAX_PHOTOS) throw new HttpError(409, `حداکثر ${MAX_PHOTOS} عکس در گالری مجاز است`);
  await assertImageQuota(me);
  const doc = await insertFile(
    { name: `photo-${me.username}-${Date.now()}.${mime.split("/")[1]}`, mime, size: file.size, uploaderId: me.id, purpose: "avatar" },
    Buffer.from(await file.arrayBuffer()),
  );
  const next = makeAvatar || !user.avatarFileId ? [doc._id, ...photos] : [...photos, doc._id];
  await updateOneUser({ _id: me.id }, { photos: next.slice(0, MAX_PHOTOS), avatarFileId: makeAvatar || !user.avatarFileId ? doc._id : user.avatarFileId ?? null });
  return { fileId: doc._id, avatarFileId: makeAvatar || !user.avatarFileId ? doc._id : user.avatarFileId ?? null, photos: next.slice(0, MAX_PHOTOS) };
}

export async function removePhoto(me, fileId) {
  const user = await findOneUser({ _id: me.id });
  const photos = (user?.photos ?? []).filter((id) => id !== fileId);
  const nextAvatar = user?.avatarFileId === fileId ? photos[0] ?? null : user?.avatarFileId ?? null;
  await updateOneUser({ _id: me.id }, { photos, avatarFileId: nextAvatar });
  await deleteFiles([fileId]);
  return { photos, avatarFileId: nextAvatar };
}

export async function setAvatar(me, fileId) {
  const user = await findOneUser({ _id: me.id });
  if (!(user?.photos ?? []).includes(fileId)) throw new HttpError(404, "این عکس در گالری شما نیست");
  await updateOneUser({ _id: me.id }, { avatarFileId: fileId });
  return { avatarFileId: fileId };
}

export async function setStatus(me, input) {
  await updateOneUser({ _id: me.id }, { status: input.status, statusText: input.statusText, statusEmoji: input.statusEmoji });
}

const BANNER_MAX = 8 * 1024 * 1024;

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
  if (previous) await deleteFiles([previous]);
  return { bannerFileId: doc._id };
}

export async function removeBanner(me) {
  const previous = (await findOneUser({ _id: me.id }))?.bannerFileId ?? null;
  await updateOneUser({ _id: me.id }, { bannerFileId: null });
  if (previous) await deleteFiles([previous]);
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
  return { ...toPublicUser(user), photos: user.photos ?? [], status: user.status ?? "online", statusText: user.statusText ?? "", statusEmoji: user.statusEmoji ?? "", quota: await imageQuota(me) };
}

/** Public profile of any user: photos, status, bio, roles — never phone or hashes. */
export async function publicProfile(me, userId) {
  const user = await findOneUser({ _id: userId });
  if (!user) throw new HttpError(404, "کاربر پیدا نشد");
  const roles = user.roleIds.length ? (await findUsersByIds([])).length : 0;
  void roles;
  return {
    ...toPublicUser(user),
    photos: user.photos ?? [],
    status: user.status === "invisible" ? "offline" : user.status ?? "online",
    statusText: user.statusText ?? "",
    statusEmoji: user.statusEmoji ?? "",
    joinedAt: user.createdAt,
  };
}

export const notifyUser = notify;
