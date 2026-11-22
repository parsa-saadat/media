import { getBucket, getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

/** File metadata. The bytes themselves are in GridFS (bucket "storage_files") under `gridId`. */
const storage = () => getCollection("storage");

// insert

export const insertFile = async (meta, data) => {
  const id = await nextId("storage");
  const upload = (await getBucket()).openUploadStream(meta.name, { metadata: { storageId: id, mime: meta.mime } });
  await new Promise((resolve, reject) => {
    upload.once("finish", () => resolve());
    upload.once("error", reject);
    upload.end(data);
  });
  const doc = { ...meta, _id: id, gridId: upload.id, createdAt: new Date() };
  await (await storage()).insertOne(doc);
  return doc;
};

// find

export const findOneFile = async (field) => (await storage()).findOne(field);

export const findFiles = async (field) => (await storage()).find(field).toArray();

export const countFiles = async (field = {}) => (await storage()).countDocuments(field);

/** Images this user has uploaded (chat pictures and profile photos) — the figure the per-role quota checks. */
export const countImagesByUploader = async (uploaderId) =>
  (await storage()).countDocuments({ uploaderId, mime: { $regex: /^image\// } });

export const sumFileSizes = async () => {
  const [row] = await (await storage())
    .aggregate([{ $group: { _id: null, total: { $sum: "$size" } } }])
    .toArray();
  return row?.total ?? 0;
};

export const readFileData = async (file) => {
  const chunks = [];
  for await (const chunk of (await getBucket()).openDownloadStream(file.gridId)) chunks.push(chunk);
  return Buffer.concat(chunks);
};

// delete

export const deleteFiles = async (ids) => {
  if (!ids.length) return;
  const collection = await storage();
  const bucket = await getBucket();
  for (const file of await collection.find({ _id: { $in: ids } }).toArray()) {
    await bucket.delete(file.gridId).catch(() => undefined);
  }
  await collection.deleteMany({ _id: { $in: ids } });
};
