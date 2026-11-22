import os from "node:os";
import path from "node:path";

const positive = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const status = process.env.STATUS || "DEV";

/** Same variable names as the reference backend's .env (STATUS, MONGO_URI, MONGO_DATABASE_NAME, MAX_MB_UPLOAD_SIZE). */
export const env = {
  status,
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/",
  mongoDatabaseName: process.env.MONGO_DATABASE_NAME || "voxsy",
  /** Start a local mongod when MONGO_URI points at this machine and nothing is listening there. */
  mongoAutostart: process.env.MONGO_AUTOSTART !== "false",
  mongoDataDir: process.env.MONGO_DATA_DIR || path.join(os.homedir(), ".cache", "inebuly-mongodb"),
  mongoBinaryDir: process.env.MONGO_BINARY_DIR || path.join(os.homedir(), ".cache", "inebuly-mongodb-binaries"),
  /** Mock accounts have been permanently disabled. */
  seedMockData: false,
  maxUploadMb: positive(process.env.MAX_MB_UPLOAD_SIZE, 15),
};
