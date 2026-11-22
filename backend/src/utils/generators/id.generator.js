import { getCollection } from "../../config/mongodb.config.js";

/**
 * Numeric, strictly increasing ids kept in a `counters` collection (MongoDB's auto-increment pattern).
 * Messages and voice signals are polled with "everything after id N", which needs a total order
 * that ObjectIds do not guarantee.
 */
export async function nextId(name) {
  const counters = await getCollection("counters");
  const counter = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  if (!counter) throw new Error(`Could not allocate an id for "${name}"`);
  return counter.seq;
}
