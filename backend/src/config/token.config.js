/**
 * Session tokens. A token is an opaque random id kept in the `sessions` collection, so logging out or
 * banning a user revokes it at once.
 *
 * The browser can send the token in four places. A preview frame, a proxy or a privacy setting may
 * remove any of them, so the server accepts all four and reports which ones arrived (see `me`):
 *   1. `Authorization: Bearer <token>`
 *   2. `x-voxsy-token: <token>`
 *   3. `?voxsy_token=<token>` in the URL  (the client switches to this only when 1 and 2 never arrive)
 *   4. the `voxsy_session` cookie          (set on login; many third-party frames block it)
 */
export const SESSION_COOKIE = "voxsy_session";
export const TOKEN_HEADER = "x-voxsy-token";
export const TOKEN_QUERY = "voxsy_token";
export const SESSION_DAYS = 30;

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/** Every candidate token of a request (valid ones only, in priority order) and what arrived. */
export function readTokens(headers, query) {
  const authorization = headers.get("authorization");
  const custom = headers.get(TOKEN_HEADER);
  const inUrl = query?.get(TOKEN_QUERY) ?? null;
  let inCookie = null;
  for (const part of (headers.get("cookie") || "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) inCookie = value.join("=");
  }
  const candidates = [authorization?.match(/^Bearer\s+(\S+)$/i)?.[1], custom, inUrl, inCookie];
  const tokens = [
    ...new Set(
      candidates
        .filter((value) => !!value)
        .map((value) => value.trim().toLowerCase())
        .filter((value) => TOKEN_PATTERN.test(value)),
    ),
  ];
  return {
    tokens,
    received: { authorization: !!authorization, xVoxsyToken: !!custom, query: inUrl !== null, cookie: !!inCookie },
  };
}

export function serializeSessionCookie(token, expires, secure) {
  const attributes = [`${SESSION_COOKIE}=${token}`, "Path=/", `Expires=${expires.toUTCString()}`, "HttpOnly"];
  // Inside an embedded preview the app is a third-party frame. A browser keeps a cookie there only when
  // it is Secure + SameSite=None, and with third-party cookies blocked only when it is also Partitioned.
  // The client never depends on this cookie: the token also travels in a header or in the URL.
  attributes.push(...(secure ? ["Secure", "SameSite=None", "Partitioned"] : ["SameSite=Lax"]));
  return attributes.join("; ");
}

export function clearSessionCookies(secure) {
  const gone = new Date(0);
  return [
    serializeSessionCookie("", gone, secure),
    `${SESSION_COOKIE}=; Path=/; Expires=${gone.toUTCString()}; HttpOnly`,
  ];
}
