import { HttpError } from "../../utils/http/http.util.js";

const store = globalThis;
const buckets = (store.__voxsyRateBuckets ??= new Map());

/**
 * In-memory limiter per client address. It guards the sign-in endpoints against password guessing;
 * it is deliberately not applied globally because the chat polls the API every second or two.
 */
export default function createLimiter({ name, windowMs, max }) {
  return (req) => {
    const now = Date.now();
    const key = `${name}:${req.ip}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size > 5000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const seconds = Math.ceil((bucket.resetAt - now) / 1000);
      throw new HttpError(429, `تعداد تلاش‌ها زیاد است؛ ${seconds} ثانیه دیگر دوباره امتحان کنید`);
    }
  };
}
