import { countContents, deleteContents, findContents, insertContent, findOneContent, updateOneContent } from "../../model/controller/content/content.controller.js";
import { HttpError } from "../../utils/http/http.util.js";
import { text } from "../../utils/validators/input.validator.js";
import { DEFAULT_HADITHS, DEFAULT_VERSES } from "./content.defaults.js";

export const CONTENT_KINDS = ["verse", "hadith"];

/** Seeds the built-in verses and hadiths once; deleted ones stay deleted. */
export async function ensureContentSeed() {
  const meta = await (await import("../../config/mongodb.config.js")).getCollection("meta");
  if (await meta.findOne({ _id: "content-seed" })) return;
  const existing = await countContents({});
  if (existing === 0) {
    for (const v of DEFAULT_VERSES) await insertContent({ kind: "verse", fa: v.fa, ar: v.ar, source: v.source, isDaily: false });
    for (const h of DEFAULT_HADITHS) await insertContent({ kind: "hadith", fa: h.fa, ar: "", source: h.source, isDaily: false });
  }
  await meta.insertOne({ _id: "content-seed", version: 1, seededAt: new Date() });
}

export async function listContent(me) {
  if (!me.permissions.includes("content.manage")) throw new HttpError(403, "شما مجوز مدیریت محتوا را ندارید");
  return { items: (await findContents()).map(toPublic) };
}

/** The verse (or hadith) of the day: the admin's pick, otherwise a rotation over the collection. */
export async function dailyContent() {
  const picked = await findOneContent({ isDaily: true });
  if (picked) return publicItem(picked, picked.kind === "hadith" ? "حدیث روز" : "آیهٔ روز");
  const verses = await findContents({ kind: "verse" }, { sort: { createdAt: 1 } });
  if (!verses.length) return null;
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
  return publicItem(verses[dayOfYear % verses.length], "آیهٔ روز");
}

/** The shape every client sees: `id` (never the raw Mongo `_id`), plus all display fields. */
function toPublic(doc) {
  return { id: doc._id, kind: doc.kind, fa: doc.fa, ar: doc.ar, source: doc.source, isDaily: !!doc.isDaily, createdAt: doc.createdAt };
}

function publicItem(doc, label) {
  return { ...toPublic(doc), label };
}

export async function createContent(me, input) {
  if (!me.permissions.includes("content.manage")) throw new HttpError(403, "شما مجوز مدیریت محتوا را ندارید");
  if (!CONTENT_KINDS.includes(input.kind)) throw new HttpError(400, "نوع محتوا نامعتبر است");
  if (!input.fa) throw new HttpError(400, "متن فارسی لازم است");
  return toPublic(await insertContent({ kind: input.kind, fa: input.fa, ar: input.ar ?? "", source: input.source ?? "", isDaily: false }));
}

export async function updateContent(me, id, input) {
  if (!me.permissions.includes("content.manage")) throw new HttpError(403, "شما مجوز مدیریت محتوا را ندارید");
  const doc = await findOneContent({ _id: id });
  if (!doc) throw new HttpError(404, "این آیه/حدیث پیدا نشد");
  const patch = {};
  if (input.fa) patch.fa = input.fa;
  if (input.ar !== undefined) patch.ar = input.ar;
  if (input.source !== undefined) patch.source = input.source;
  if (Object.keys(patch).length) await updateOneContent({ _id: id }, patch);
  return { ok: true };
}

export async function deleteContent(me, id) {
  if (!me.permissions.includes("content.manage")) throw new HttpError(403, "شما مجوز مدیریت محتوا را ندارید");
  await deleteContents({ _id: id });
  return { ok: true };
}

/** Marks one item as today's pick; every other item loses the flag. */
export async function setDaily(me, id) {
  if (!me.permissions.includes("content.manage")) throw new HttpError(403, "شما مجوز مدیریت محتوا را ندارید");
  const doc = await findOneContent({ _id: id });
  if (!doc) throw new HttpError(404, "این آیه/حدیث پیدا نشد");
  await updateOneContent({ isDaily: true }, { isDaily: false });
  await updateOneContent({ _id: id }, { isDaily: true });
  return { ok: true };
}

export const sanitizeInput = (body) => ({
  kind: text(body.kind, 10),
  fa: text(body.fa, 400).trim().slice(0, 300),
  ar: text(body.ar ?? "", 600).trim().slice(0, 500),
  source: text(body.source ?? "", 80).trim().slice(0, 60),
});
