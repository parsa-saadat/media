import { env } from "../../config/env.config.js";
import { countChats } from "../../model/controller/chats/chats.controller.js";
import { findMessageFileIds, findMessages } from "../../model/controller/messages/messages.controller.js";
import { countImagesByUploader, deleteFiles, findOneFile, insertFile, readFileData } from "../../model/controller/storage/storage.controller.js";
import { findOneUser, updateOneUser } from "../../model/controller/users/users.controller.js";
import { UNLIMITED_IMAGES } from "../../config/permissions.config.js";
import { deleteTracks, findTracks } from "../../model/controller/voice/voice.controller.js";
import { HttpError } from "../../utils/http/http.util.js";
import { resolveMime } from "../../utils/validators/file.validator.js";

export async function uploadFile(me, file) {
  if (file.size === 0) throw new HttpError(400, "فایل خالی است");
  if (file.size > env.maxUploadMb * 1024 * 1024) {
    throw new HttpError(413, `حداکثر حجم فایل ${env.maxUploadMb} مگابایت است`);
  }
  const mime = resolveMime(file.name, file.type);
  const isImage = mime.startsWith("image/");
  if (isImage && !me.permissions.includes("images.upload")) throw new HttpError(403, "شما اجازه ارسال تصویر ندارید");
  if (!isImage && !me.permissions.includes("files.upload")) throw new HttpError(403, "شما اجازه ارسال فایل ندارید");
  if (isImage) await assertImageQuota(me);

  const doc = await insertFile(
    { name: file.name.slice(0, 200) || "file", mime, size: file.size, uploaderId: me.id },
    Buffer.from(await file.arrayBuffer()),
  );
  return { id: doc._id, name: doc.name, mime: doc.mime, size: doc.size };
}

/** Per-role image quota (0 = unlimited). Counts every image the user has ever uploaded. */
export async function assertImageQuota(me) {
  if (me.imageLimit === UNLIMITED_IMAGES) return;
  const used = await countImagesByUploader(me.id);
  if (used >= me.imageLimit) {
    throw new HttpError(403, `سهمیهٔ تصویر شما (${me.imageLimit} عکس) پر شده است؛ برای ارسال تصویر بیشتر با مدیر تماس بگیرید`);
  }
}

export async function imageQuota(me) {
  return { used: await countImagesByUploader(me.id), limit: me.imageLimit, unlimited: me.imageLimit === UNLIMITED_IMAGES };
}

const AVATAR_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const AVATAR_MAX = 4 * 1024 * 1024;

/** Sets the user's profile photo. The previous photo is removed. */
export async function setAvatar(me, file) {
  if (!me.permissions.includes("avatar.upload")) throw new HttpError(403, "نقش شما اجازهٔ گذاشتن عکس پروفایل ندارد");
  if (file.size === 0) throw new HttpError(400, "فایل خالی است");
  if (file.size > AVATAR_MAX) throw new HttpError(413, "حداکثر حجم عکس پروفایل ۴ مگابایت است");
  const mime = resolveMime(file.name, file.type);
  if (!AVATAR_MIMES.has(mime)) throw new HttpError(400, "فرمت عکس پروفایل باید PNG، JPEG، WebP یا GIF باشد");
  await assertImageQuota(me);
  const previous = (await findOneUser({ _id: me.id }))?.avatarFileId ?? null;
  const doc = await insertFile(
    { name: `avatar-${me.username}.${mime.split("/")[1]}`, mime, size: file.size, uploaderId: me.id, purpose: "avatar" },
    Buffer.from(await file.arrayBuffer()),
  );
  await updateOneUser({ _id: me.id }, { avatarFileId: doc._id });
  if (previous) await deleteFiles([previous]);
  return { avatarFileId: doc._id };
}

export async function clearAvatar(me) {
  const previous = (await findOneUser({ _id: me.id }))?.avatarFileId ?? null;
  await updateOneUser({ _id: me.id }, { avatarFileId: null });
  if (previous) await deleteFiles([previous]);
}

/** Profile photos are visible to every signed-in user (they appear next to names everywhere). */
export async function readAvatar(userId) {
  const user = await findOneUser({ _id: userId });
  if (!user?.avatarFileId) throw new HttpError(404, "این کاربر عکس پروفایل ندارد");
  const file = await findOneFile({ _id: user.avatarFileId });
  if (!file) throw new HttpError(404, "عکس پروفایل پیدا نشد");
  return { file, data: await readFileData(file) };
}

/**
 * A file may be read by its uploader, by members of a chat where it was posted, and by members of a
 * chat where it is currently playing as somebody's music bot. Nobody else.
 */
export async function readFileFor(me, id) {
  const file = await findOneFile({ _id: id });
  if (!file) throw new HttpError(404, "فایل پیدا نشد");
  if (file.uploaderId !== me.id) {
    const chatIds = [
      ...(await findMessages({ $or: [{ fileId: id }, { fileIds: id }] })).map((message) => message.conversationId),
      ...(await findTracks({ fileId: id })).map((track) => track.conversationId),
    ];
    const shared = chatIds.length ? await countChats({ _id: { $in: [...new Set(chatIds)] }, "members.userId": me.id }) : 0;
    if (!shared) throw new HttpError(403, "به این فایل دسترسی ندارید");
  }
  return { file, data: await readFileData(file) };
}

/** Deletes uploads that no message and no music bot refers to any more. */
export async function removeUnusedFiles(ids) {
  if (!ids.length) return;
  const inMessages = new Set(await findMessageFileIds({ $or: [{ fileId: { $in: ids } }, { fileIds: { $in: ids } }] }));
  const inTracks = new Set((await findTracks({ fileId: { $in: ids } })).map((track) => track.fileId));
  await deleteFiles(ids.filter((id) => !inMessages.has(id) && !inTracks.has(id)));
}

/** Stops the matching music bots and frees the audio files only they were using. */
export async function stopTracks(filter) {
  const fileIds = (await findTracks(filter)).map((track) => track.fileId).filter((id) => typeof id === "number");
  await deleteTracks(filter);
  await removeUnusedFiles(fileIds);
}
