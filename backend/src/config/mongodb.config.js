import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { GridFSBucket, MongoClient } from "mongodb";
import { env } from "./env.config.js";

/**
 * MongoDB connection — the same MONGO_URI / MONGO_DATABASE_NAME setup as the reference
 * backend's mongodb.config.js, with two differences the host requires:
 *  - the connection opens lazily, never at import time (the production build imports this file);
 *  - when MONGO_URI points at this machine and nothing is listening, a local mongod is started.
 */
const store = globalThis;
const cache = (store.__voxsyMongo ??= { state: "idle" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function localPort() {
  try {
    const url = new URL(env.mongoUri);
    if (url.protocol !== "mongodb:" || !["127.0.0.1", "localhost"].includes(url.hostname)) return null;
    return Number(url.port || 27017);
  } catch {
    return null;
  }
}

async function open(timeoutMs) {
  const client = new MongoClient(env.mongoUri, {
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
    maxPoolSize: 20,
  });
  try {
    await client.connect();
    await client.db(env.mongoDatabaseName).command({ ping: 1 });
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

/** Downloads the official mongod build for this OS on first use, then runs it as a detached daemon. */
async function startLocalServer(port) {
  const { MongoBinary } = await import("mongodb-memory-server-core");
  const binary = await MongoBinary.getPath({ downloadDir: env.mongoBinaryDir });
  await mkdir(env.mongoDataDir, { recursive: true });
  const child = spawn(
    binary,
    [
      "--dbpath", env.mongoDataDir,
      "--port", String(port),
      "--bind_ip", "127.0.0.1",
      "--wiredTigerCacheSizeGB", "0.25",
      "--logpath", path.join(path.dirname(env.mongoDataDir), "mongod.log"),
      "--logappend",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.on("error", (error) => console.error("[mongodb] local server failed to start:", error.message));
  child.unref();

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      return await open(1500);
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await sleep(500);
    }
  }
}

async function ensureIndexes(db) {
  const numeric = (field) => ({ partialFilterExpression: { [field]: { $type: "number" } } });
  await Promise.all([
    db.collection("users").createIndex({ phone: 1 }, { unique: true }),
    db.collection("users").createIndex({ username: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("sessions").createIndex({ userId: 1 }),
    db.collection("roles").createIndex({ name: 1 }, { unique: true }),
    db.collection("chats").createIndex({ "members.userId": 1, updatedAt: -1 }),
    db.collection("chats").createIndex({ type: 1 }),
    db.collection("chats").createIndex(
      { directKey: 1 },
      { unique: true, partialFilterExpression: { directKey: { $type: "string" } } },
    ),
    db.collection("messages").createIndex({ conversationId: 1, _id: 1 }),
    db.collection("messages").createIndex({ fileId: 1 }, numeric("fileId")),
    db.collection("contacts").createIndex({ pairKey: 1 }, { unique: true }),
    db.collection("contacts").createIndex({ requesterId: 1 }),
    db.collection("contacts").createIndex({ addresseeId: 1 }),
    db.collection("blocks").createIndex({ blockerId: 1 }),
    db.collection("blocks").createIndex({ blockedId: 1 }),
    db.collection("voice_presence").createIndex({ conversationId: 1, lastSeenAt: 1 }),
    db.collection("voice_presence").createIndex({ lastSeenAt: 1 }, { expireAfterSeconds: 3600 }),
    db.collection("voice_signals").createIndex({ conversationId: 1, toUserId: 1, _id: 1 }),
    // WebRTC offers/answers/ICE are only useful for a few seconds; MongoDB removes them itself.
    db.collection("voice_signals").createIndex({ createdAt: 1 }, { expireAfterSeconds: 120 }),
    db.collection("voice_tracks").createIndex({ conversationId: 1 }),
    db.collection("voice_tracks").createIndex({ fileId: 1 }, numeric("fileId")),
    db.collection("meetings").createIndex({ token: 1 }, { unique: true }),
    db.collection("meetings").createIndex({ hostId: 1, active: 1 }),
    db.collection("meeting_participants").createIndex({ meetingId: 1, lastSeenAt: 1 }),
    db.collection("meeting_participants").createIndex({ lastSeenAt: 1 }, { expireAfterSeconds: 7200 }),
    db.collection("meeting_signals").createIndex({ meetingId: 1, to: 1, _id: 1 }),
    db.collection("meeting_signals").createIndex({ createdAt: 1 }, { expireAfterSeconds: 120 }),
    db.collection("notifications").createIndex({ userId: 1, _id: -1 }),
    db.collection("notifications").createIndex({ userId: 1, read: 1 }),
    db.collection("users").createIndex({ "photos": 1 }, numeric("photos")),
  ]);
}

async function connect() {
  const client = await open(1500).catch(async (unreachable) => {
    const port = localPort();
    if (port === null || !env.mongoAutostart) throw unreachable;
    console.log(`[mongodb] nothing is listening on ${env.mongoUri} — starting a local mongod`);
    return startLocalServer(port);
  });
  const db = client.db(env.mongoDatabaseName);
  await ensureIndexes(db);
  console.log(`[mongodb] connected to database "${env.mongoDatabaseName}"`);
  return db;
}

export function getDb() {
  if (!cache.db) {
    cache.state = "starting";
    cache.db = connect().then(
      (db) => {
        cache.state = "ready";
        cache.error = undefined;
        return db;
      },
      (error) => {
        cache.state = "error";
        cache.error = error instanceof Error ? error.message : String(error);
        cache.db = undefined;
        throw error;
      },
    );
  }
  return cache.db;
}

export async function getCollection(name) {
  return (await getDb()).collection(name);
}

/** Uploaded files are stored in GridFS, so they are not limited by the 16 MB document size. */
export async function getBucket() {
  return new GridFSBucket(await getDb(), { bucketName: "storage_files" });
}

export const mongoState = () => ({ state: cache.state, error: cache.error ?? null });
