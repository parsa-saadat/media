import { createServer } from "node:http";
import { bootstrap, handle, health } from "./app.js";

/**
 * Stand-alone HTTP server for the backend — `npm start` inside backend/.
 */

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || "0.0.0.0";

function toHeaders(incoming) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  if (!chunks.length) return undefined;
  const all = Buffer.concat(chunks);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

async function send(res, response) {
  const headers = {};
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") headers[name] = value;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers["set-cookie"] = cookies;
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

function sendError(res, status, message) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ body: null, status, message, success: false }));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/api/health") {
      await send(res, await health());
      return;
    }
    if (!url.pathname.startsWith("/api/")) {
      sendError(res, 404, "مسیر مورد نظر پیدا نشد");
      return;
    }
    const request = new Request(url, { method: req.method, headers: toHeaders(req.headers), body: await readBody(req) });
    const segments = url.pathname.slice("/api/".length).split("/").filter(Boolean);
    await send(res, await handle(request, segments));
  } catch (error) {
    console.error("[inebuly-backend]", error);
    if (res.headersSent) res.end();
    else sendError(res, 500, "خطای داخلی سرور");
  }
});

server.listen(port, host, () => {
  console.log(`[inebuly-backend] API on http://${host}:${port}/api`);
  bootstrap().then(
    () => console.log("[inebuly-backend] database ready"),
    (error) => console.error("[inebuly-backend] database is not ready yet:", error),
  );
});
