import { positiveInt } from "../validators/input.validator.js";

/**
 * A very small Express-shaped HTTP layer (Router, req, res). The reference backend runs on Express;
 * this host only gives us a Web `Request`, so routes/controllers/middlewares are written the Express
 * way and this file adapts them. Swapping it for real Express does not touch any module.
 */
export class HttpError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.data = data;
  }
}

/** Response envelope used by the reference backend: { body, status, message, success }. */
export function envelope(status, body, message, base) {
  const headers = new Headers(base);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify({ body, status, message, success: status < 400 }), { status, headers });
}

export class AppRequest {
  params = {};
  user = null;
  /** Sanitised input placed here by a module's *.middleware.ts before the controller runs. */
  input = null;
  /** What reached the server with this request, and why it was (not) signed in. Set by identify / authenticateToken. */
  session = null;

  constructor(raw, method, path, query, body) {
    this.raw = raw;
    this.method = method;
    this.path = path;
    this.query = query;
    this.body = body;
  }

  get headers() {
    return this.raw.headers;
  }

  /** The signed-in user; only call after `authenticateToken`. */
  get me() {
    if (!this.user) throw new HttpError(401, "ابتدا وارد حساب کاربری شوید");
    return this.user;
  }

  get secure() {
    const h = this.raw.headers;
    const forwarded = (h.get("x-forwarded-proto") || "").split(",")[0].trim();
    return (
      forwarded === "https" ||
      (h.get("origin") || "").startsWith("https://") ||
      (h.get("referer") || "").startsWith("https://") ||
      this.raw.url.startsWith("https://")
    );
  }

  get ip() {
    return (this.raw.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  }

  /** A numeric route parameter such as /conversations/:id. */
  id(name = "id") {
    const value = positiveInt(this.params[name]);
    if (!value) throw new HttpError(400, "شناسه نامعتبر است");
    return value;
  }
}

export class AppResponse {
  code = 200;
  headers = new Headers();
  response = null;

  get finished() {
    return this.response !== null;
  }

  status(code) {
    this.code = code;
    return this;
  }

  set(name, value) {
    this.headers.set(name, value);
    return this;
  }

  cookie(...serialized) {
    for (const cookie of serialized) this.headers.append("Set-Cookie", cookie);
    return this;
  }

  json(body = null, message = "OK") {
    this.response = envelope(this.code, body, message, this.headers);
  }

  send(data, contentType) {
    this.headers.set("Content-Type", contentType);
    this.response = new Response(data, { status: this.code, headers: this.headers });
  }

  result() {
    return this.response ?? envelope(this.code, null, "OK", this.headers);
  }
}

export class Router {
  routes = [];

  add(method, path, handlers) {
    this.routes.push({ method, parts: path.split("/").filter(Boolean), handlers });
    return this;
  }

  get(path, ...handlers) { return this.add("GET", path, handlers); }
  post(path, ...handlers) { return this.add("POST", path, handlers); }
  patch(path, ...handlers) { return this.add("PATCH", path, handlers); }
  delete(path, ...handlers) { return this.add("DELETE", path, handlers); }

  /** Mounts every route of another router, like `app.use(router)`. */
  use(router) {
    this.routes.push(...router.routes);
    return this;
  }

  match(method, parts) {
    for (const route of this.routes) {
      if (route.method !== method || route.parts.length !== parts.length) continue;
      const params = {};
      const fits = route.parts.every((part, i) => {
        if (part.startsWith(":")) {
          params[part.slice(1)] = parts[i];
          return true;
        }
        return part === parts[i];
      });
      if (fits) return { route, params };
    }
    return null;
  }
}
