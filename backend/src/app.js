import { getDb, mongoState } from "./config/mongodb.config.js";
import { errorHandler } from "./middleware/safety/errorHandler.middleware.js";
import { seedDatabase } from "./mocks/seed.mock.js";
import routes from "./routes/index.js";
import { AppRequest, AppResponse, HttpError } from "./utils/http/http.util.js";

/**
 * Backend entry point — the counterpart of the reference project's src/app.js.
 * There, Express listens on a port. Here the host hands us one Web `Request` at a time, so this
 * file exposes `handle(request)` and runs the same pipeline: routes → middlewares → controller.
 */
const store = globalThis;

/** Connects to MongoDB (starting a local server if needed), then inserts roles and mock data. */
export function bootstrap() {
  if (!store.__voxsyBootstrap) {
    store.__voxsyBootstrap = (async () => {
      await getDb();
      await seedDatabase();
      store.__voxsyBootError = undefined;
    })().catch((error) => {
      store.__voxsyBootstrap = undefined;
      store.__voxsyBootError = error instanceof Error ? error.message : String(error);
      throw error;
    });
  }
  return store.__voxsyBootstrap;
}

export async function handle(raw, segments) {
  try {
    const method = raw.method.toUpperCase();
    const match = routes.match(method, segments);
    if (!match) throw new HttpError(404, "مسیر مورد نظر پیدا نشد");

    await bootstrap().catch((error) => {
      console.error("[voxsy-api] database is not ready:", error);
      throw new HttpError(503, "پایگاه‌داده هنوز آماده نیست؛ چند لحظه دیگر دوباره تلاش کنید");
    });

    let body = {};
    if (method !== "GET" && (raw.headers.get("content-type") || "").includes("application/json")) {
      const parsed = await raw.json().catch(() => null);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed;
    }

    const req = new AppRequest(raw, method, `/${segments.join("/")}`, new URL(raw.url).searchParams, body);
    req.params = match.params;
    const res = new AppResponse();
    for (const handler of match.route.handlers) {
      await handler(req, res);
      if (res.finished) break;
    }
    return res.result();
  } catch (error) {
    return errorHandler(error);
  }
}

/**
 * GET /api/health. Reports 200 as soon as MongoDB answers. While a local mongod is still being
 * downloaded/started (first run on a new machine) it reports 200 with state "starting", and 503
 * only when the database could not be reached at all.
 */
export async function health() {
  const outcome = await Promise.race([
    bootstrap().then(
      () => "ready",
      () => "error",
    ),
    new Promise((resolve) => setTimeout(() => resolve("starting"), 8000)),
  ]);
  const ok = outcome !== "error";
  const status = ok ? 200 : 503;
  const message =
    outcome === "ready" ? "OK" : outcome === "starting" ? "MongoDB is starting" : `Backend is not ready: ${store.__voxsyBootError ?? "unknown error"}`;
  return new Response(
    JSON.stringify({ ok, success: ok, status, message, body: { database: "mongodb", state: outcome === "ready" ? "ready" : mongoState().state } }),
    { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
