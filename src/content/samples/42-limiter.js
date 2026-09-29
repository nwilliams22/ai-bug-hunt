/**
 * Per-key rate limiting for the public API: at most `max` requests inside a
 * rolling `windowMs`. One table, shared by every request handler in the
 * process.
 */
const buckets = {};

/** True if this request is inside the caller's budget. */
export function allow(key, max = 100, windowMs = 60_000) {
  const now = Date.now();
  let bucket = buckets[key];

  if (!bucket || now - bucket.start > windowMs) {
    bucket = buckets[key] = { start: now, count: 0 };
  }

  bucket.count++;
  return bucket.count <= max;
}

/** Seconds the caller should wait, for the Retry-After header. */
export function retryAfter(key, windowMs = 60_000) {
  const bucket = buckets[key];
  if (!bucket) return 0;
  return Math.round((bucket.start + windowMs - Date.now()) / 1000);
}

/** Drops buckets nobody has touched for an hour. Runs on a timer. */
export function sweep() {
  const cutoff = Date.now() - 3_600_000;
  for (const key in buckets) {
    if (buckets[key].start < cutoff) {
      delete buckets[key];
    }
  }
}
