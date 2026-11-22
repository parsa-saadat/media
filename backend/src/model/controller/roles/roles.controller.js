import { getCollection } from "../../../config/mongodb.config.js";
import { nextId } from "../../../utils/generators/id.generator.js";

/** A role carries its permissions inside the document; users reference roles through `roleIds`. */
const roles = () => getCollection("roles");

// insert

export const insertRole = async (data) => {
  const doc = { ...data, _id: await nextId("roles"), createdAt: new Date() };
  await (await roles()).insertOne(doc);
  return doc;
};

// find

export const findOneRole = async (field) => (await roles()).findOne(field);

export const findRoles = async (field = {}) =>
  (await roles()).find(field).sort({ _id: 1 }).toArray();

export const countRoles = async (field = {}) => (await roles()).countDocuments(field);

// update

export const updateOneRole = async (field, data) =>
  (await roles()).updateOne(field, { $set: data });

// delete

export const deleteRoles = async (field) => (await roles()).deleteMany(field);
