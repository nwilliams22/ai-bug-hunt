/**
 * Model reviews — what a careful reviewer files for each drill, written to the
 * standard in the "Writing the finding" lesson: verdict up front with one
 * reason, findings as where/trigger/caller-sees/fix, ordered by severity,
 * proportionate on nits, no scolding or hedges.
 *
 * These are *evidence against the same defects* the drill plants, so they read
 * like a real review of the sample in front of you, not a restatement of the
 * answer key.
 */
import type { ModelReview } from "../types";

const REVIEWS: Record<number, ModelReview> = {
  /* ---- drill 1 ----------------------------------------------------------- */
  1: {
    verdict: "approve-with-comments",
    reason:
      "The docstring doesn't define the page indexing convention, and `page = -1` returns real data rather than an error — both are silent contract failures, not correctness-breaking.",
    findings: [
      {
        title: "Page indexing convention is not stated and `page = 0` vs `page = 1` diverge",
        where: "line 3, `start = page * per_page`",
        body: "The docstring says 'return page number `page`' but does not say whether 0 or 1 is the first page. The arithmetic is zero-based: `page = 1` starts at index 20, so a caller using one-based page numbers silently skips the first 20 items. A one-based caller sees page 1 is two pages in. Neither caller gets an error; the data just starts one page late.",
      },
      {
        title: "A negative `page` returns the last page rather than an error",
        where: "line 3, `start = page * per_page` (Python slice with negative index)",
        body: "`page = -1` makes `start = -20`. Python slices treat negative indices as counted from the end, so the function returns the last 20 items — valid data, no exception. A malformed or hostile request gets 200 with plausible content instead of a 400. Fix: validate `page >= 0` (or `>= 1` if documenting one-based) and `per_page > 0` before slicing.",
      },
    ],
  },

  /* ---- drill 2 ----------------------------------------------------------- */
  2: {
    verdict: "request-changes",
    reason:
      "`Array.prototype.sort()` with no comparator coerces elements to strings, so the median is wrong for any data that crosses digit counts — and it returns a plausible number, never an exception. That is a blocker.",
    findings: [
      {
        title: "Sort is lexicographic, not numeric",
        where: "line 2, `times.sort()`",
        body: "`[10, 9, 100]` sorts to `[10, 100, 9]` and the median is 100 instead of 9. Wrong for any data crossing digit counts — which for response times is all of it. Silent: a plausible number, no exception, every SLO dashboard built on it is quietly wrong. Fix: `times.sort((a, b) => a - b)`.",
      },
      {
        title: "Mutates the caller's array",
        where: "line 2, `times.sort()` — sorts in place and returns the same reference",
        body: "`const sorted` is the caller's array reordered. Downstream code that relied on the original order — likely, for logged response times that happen to be chronological — breaks in a way that looks unrelated to this function.",
      },
      {
        title: "Empty input returns `NaN`",
        where: "line 4, even branch with length 0: `sorted[-1]` is `undefined`, `undefined / 2` is `NaN`",
        body: "`[].length % 2 === 0` takes the even branch, `sorted[0 - 1]` and `sorted[0]` are both `undefined`, so the function returns `NaN`. That propagates silently through every alerting threshold and dashboard arithmetic downstream.",
      },
    ],
  },

  /* ---- drill 3 ----------------------------------------------------------- */
  3: {
    verdict: "request-changes",
    reason:
      "`del cache[key]` inside `for … in cache.items()` raises `RuntimeError` the moment the first stale entry is hit. Tests with fresh entries pass cleanly; production blows up on the first TTL elapse.",
    findings: [
      {
        title: "Deleting while iterating the same dict",
        where: "lines 3–5, `for key, entry in cache.items()` → `del cache[key]`",
        body: "`cache.items()` is a live view into the object the loop mutates. On CPython the `del` raises `RuntimeError: dictionary changed size during iteration` as soon as the first stale entry is removed — so the sweep itself is the failure, not a stale entry. It only fires once there is something to evict, which is why a unit test with all-fresh entries passes cleanly. Fix: iterate over a snapshot — `for key, entry in list(cache.items()):`.",
      },
      {
        title: "An entry exactly `ttl` seconds old is retained (undocumented)",
        where: "line 4, `now - entry[\"ts\"] > ttl` (strict `>`, not `>=`)",
        body: "Whether `== ttl` should be evicted or retained is a real contract decision and the docstring doesn't say. Minor: flagging undocumented boundary semantics is exactly what a review should do, and it costs the author one sentence to document the intent.",
      },
    ],
  },

  /* ---- drill 4 ----------------------------------------------------------- */
  4: {
    verdict: "request-changes",
    reason:
      "The two timestamps come from different timezone assumptions and are compared without a guard, so the outcome is either a `TypeError` or a wrong answer by the local UTC offset — and the caller cannot tell which until it fires.",
    findings: [
      {
        title: "Naive vs aware `datetime` comparison",
        where: "line 4, `datetime.utcnow() > token.expires_at`",
        body: "`datetime.utcnow()` is naive. If `expires_at` is timezone-aware the `>` raises `TypeError: can't compare offset-naive and offset-aware datetimes`. If `expires_at` is naive local time, the comparison succeeds and is wrong by the local offset — tokens expire hours early or late with no error, which is the dangerous case. Fix: `datetime.now(timezone.utc) > token.expires_at`, with `expires_at` guaranteed aware.",
      },
      {
        title: "`expires_at` may be `None` for an evergreen token, raising `TypeError`",
        where: "line 4, comparison with `None`",
        body: "A token with no expiry (or a malformed record) makes `expires_at = None`. `datetime.utcnow() > None` raises `TypeError: '>' not supported between instances of 'datetime.datetime' and 'NoneType'` inside what looks like a cheap boolean check. Auth code should decide explicitly whether `None` means 'never expires' or 'reject'.",
      },
      {
        title: "`datetime.utcnow()` is deprecated as of Python 3.12",
        where: "line 4",
        body: "Precisely because it returns a naive object that callers treat as UTC-aware, Python emits a `DeprecationWarning`. Its presence in new code is a signal the author copied an older pattern without checking. Use `datetime.now(timezone.utc)`.",
      },
    ],
  },

  /* ---- drill 5 ----------------------------------------------------------- */
  5: {
    verdict: "request-changes",
    reason:
      "`Promise.all` rejects on the first failure, so the `cache.invalidate` on line 3 never runs — while the other upserts are already committed. The cache is now stale on a half-written users table.",
    findings: [
      {
        title: "Cache is never invalidated if any upsert fails",
        where: "lines 2–3: `await Promise.all(…)` → `await cache.invalidate(\"users\")`",
        body: "`Promise.all` rejects immediately on the first rejection, so line 3 never runs. The other upserts that were already dispatched and committed make the database partially updated while the cache still serves the old values — the single worst outcome, and it happens silently from the caller's perspective apart from the thrown error. Fix: invalidate in a `finally` block so the cache is cleared regardless of the batch outcome.",
      },
      {
        title: "A read between the last upsert and the invalidate repopulates the cache with stale data",
        where: "between line 2 and line 3",
        body: "The classic cache-aside race: a reader arrives after the last `upsert` lands but before `invalidate`, reads the stale row, and writes it back into the cache — so the invalidation is undone. Even on the success path this is a window where the cache is wrong. Fix: invalidate before and after, or use a versioned key so the stale entry is orphaned.",
      },
      {
        title: "`Promise.all` discards which users failed",
        where: "line 2, `Promise.all(…)`",
        body: "Once one promise rejects, the results of every other promise in the batch are lost. The caller learns that something went wrong but cannot tell which users synced successfully, so the only option is to retry all of them — including those that are already correct.",
      },
      {
        title: "Unbounded concurrency for large batches",
        where: "line 2, `users.map(…)` fires every upsert in parallel",
        body: "Fine for 50 users; for 50,000 it exhausts the connection pool and the resulting timeouts look like database problems rather than a client concurrency bug. Fix: batch with a concurrency limit.",
      },
    ],
  },

  /* ---- drill 6 ----------------------------------------------------------- */
  6: {
    verdict: "request-changes",
    reason:
      "The `WHERE` clause filters out the NULL-filled rows the `LEFT JOIN` produced, so every user with zero orders in the window disappears — exactly the population the join was written to keep.",
    findings: [
      {
        title: "`WHERE o.created_at >= …` demotes the `LEFT JOIN` to an `INNER JOIN`",
        where: "line 4, `WHERE o.created_at >= '2026-01-01'`",
        body: "For a user with no orders in the window every `o.*` column is `NULL`. `NULL >= '2026-01-01'` evaluates to `NULL`, not `TRUE`, so `WHERE` drops the row. The query runs, returns data, and quietly answers a different question than the one asked: it reports the users with at least one order rather than all users with their order counts. Fix: move the predicate into the `ON` clause: `LEFT JOIN orders o ON o.user_id = u.id AND o.created_at >= '2026-01-01'`.",
      },
      {
        title: "Bare date literal coerced against a `timestamptz` column",
        where: "line 4, `'2026-01-01'` vs a `timestamptz` column",
        body: "Postgres coerces the date to `2026-01-01 00:00:00`, but in what time zone depends on column type and session settings. Reports built this way drift by a day at month boundaries. Fix: compare against an explicit timestamptz, parameterised rather than inlined.",
      },
    ],
  },

  /* ---- drill 7 ----------------------------------------------------------- */
  7: {
    verdict: "request-changes",
    reason:
      "The read and the write are separate round trips with no atomicity between them. Two concurrent requests can both pass the `reserved` check and both write `true`, selling the same seat twice.",
    findings: [
      {
        title: "Check-then-act race (TOCTOU)",
        where: "lines 2–6: `findOne` → check `seat.reserved` → `update`",
        body: "Two requests for the same `seatId` arriving milliseconds apart both read `reserved: false`, both pass line 3, and both write `reserved: true` — returning `{ ok: true }` for both. The seat is double-booked and the system has no record of a conflict. Load testing at low concurrency never surfaces this; a real on-sale will. Fix: one atomic conditional update — `update({ eventId, seatId, reserved: false }, { reserved: true })` — and treat `modifiedCount === 0` as the failure case.",
      },
      {
        title: "Missing seat (`findOne` returns `null`) throws an opaque `TypeError`",
        where: "line 3, `seat.reserved` on a `null` value",
        body: "If `findOne` returns `null` for an invalid `seatId`, line 3 raises `TypeError: Cannot read properties of null`, producing a 500 with a stack trace instead of a 404. The logs point at the wrong layer. Fix: guard for `null` and raise a typed `NotFound` error.",
      },
      {
        title: "`{ ok: true }` is asserted, not verified",
        where: "line 6, `await db.seats.update(…)` — the result is not checked",
        body: "If the `update` matched zero documents (the seat was already reserved or does not exist in the `update`'s filter), the function still returns `{ ok: true }`. The caller is told the reservation succeeded when it didn't. Fix: inspect `modifiedCount` and return based on it.",
      },
    ],
  },

  /* ---- drill 8 ----------------------------------------------------------- */
  8: {
    verdict: "request-changes",
    reason:
      "The accumulator is seeded at `0.0`, so any all-negative slice returns a value not present in the input. The compiler is happy and the function returns a plausible number.",
    findings: [
      {
        title: "Seed at `0.0` is inside the domain of valid answers for some inputs",
        where: "line 2, `let mut max = 0.0;`",
        body: "For `[-5.0, -2.0, -9.0]` the function returns `0.0` — a value that does not appear in the input. This is the most common seeded-accumulator bug in generated code and it is completely silent. Temperatures, deltas, and profit-and-loss figures all go negative. Fix: seed with `f64::NEG_INFINITY`, or fold over the first element.",
      },
      {
        title: "Empty slice returns `0.0`, indistinguishable from a real maximum of zero",
        where: "entire function with `values.len() == 0`",
        body: "An empty input skips the loop and returns the seed, `0.0`. A caller cannot tell 'the maximum is zero' from 'there was no input'. Rust's type system gives you the right tool here (`Option`) and the signature declines to use it.",
      },
      {
        title: "`NaN` is silently discarded",
        where: "line 4, `if v > max` — `NaN > x` is always `false`",
        body: "Every comparison involving `NaN` is `false` in Rust, so a `NaN` in the input is never selected as the maximum and is never reported. A function that silently discards invalid input rather than surfacing it is making a policy decision the signature doesn't disclose.",
      },
    ],
  },

  /* ---- drill 9 ----------------------------------------------------------- */
  9: {
    verdict: "approve-with-comments",
    reason:
      "The regex works for the common cases and rejects obviously malformed strings, which is the stated purpose. Two real limitations worth flagging: it accepts one trailing newline, and it rejects uppercase TLDs. Neither is a blocker for a UI field.",
    findings: [
      {
        title: "Python `$` accepts one trailing newline",
        where: "line 3, `EMAIL_RE = re.compile(r\"^[…]+$\")` using `$`",
        body: "In Python, `$` matches immediately before a single trailing newline. `is_valid_email(\"attacker@evil.com\\n\")` returns `True`. The control character can break callers that place the value in a line-oriented header or record. Fix: use `re.fullmatch` or anchor with `\\A` and `\\Z`.",
      },
      {
        title: "Uppercase TLDs are rejected",
        where: "line 3, `[a-z]{2,}` (no `re.IGNORECASE`)",
        body: "`USER@EXAMPLE.COM` fails validation because the TLD character class is lowercase only. Email domains are case-insensitive, so this rejects legitimate addresses and will look to support like an intermittent bug — it depends on how the user typed the domain. Fix: add `re.IGNORECASE` or normalise to lowercase before matching.",
      },
      {
        title: "Non-string input raises `TypeError` rather than returning `False`",
        where: "line 6, `EMAIL_RE.match(s)` — `match` on a non-string raises",
        body: "Validators are called on untrusted input. Passing `None` or an `int` raises `TypeError` from inside a function whose name promises a boolean. Fix: type-check and return `False`, or validate upstream.",
      },
    ],
  },

  /* ---- drill 10 ---------------------------------------------------------- */
  10: {
    verdict: "request-changes",
    reason:
      "The generator yields a reference to the same list object every time and then `clear()`s it in place. A consumer that accumulates, like `list(batch(range(10), 3))`, ends up with three references to one object — all showing the final state — rather than three distinct batches.",
    findings: [
      {
        title: "The yielded list is reused and then emptied in place",
        where: "lines 6–8: `yield batch` → `batch.clear()`",
        body: "`yield` hands the consumer a reference to the same list object. `batch.clear()` empties it in place. A consumer that processes each batch immediately works fine — which is why this passes casual testing. A consumer that accumulates, like `list(batch(range(10), 3))`, gets a list of three references to one object and every entry reflects its final state: `[[9], [9], [9]]` instead of the expected batches. Fix: rebind (`batch = []`) rather than `clear()`, or `yield batch[:]`.",
      },
      {
        title: "The final partial batch is dropped",
        where: "line 6, `if len(batch) == size` — only fires when the batch is exactly full",
        body: "With 10 items and size 3, the generator yields `[1,2,3]`, `[4,5,6]`, `[7,8,9]` and returns. Item 10 is silently discarded. Data loss with no error — the worst defect category for ETL or bulk sending. Fix: after the loop, `if batch: yield batch`.",
      },
      {
        title: "`size ≤ 0` never yields or loops forever",
        where: "line 6, `len(batch) == 0` is only true before any item has been appended",
        body: "`size = 0`: `len(batch) == 0` is true when `batch` is empty, so the first `yield` fires with the first item appended, then `batch.clear()` empties it, and the second item triggers the next `yield` — an infinite alternating yield of one-item batches. A function designed to bound memory ends up buffering one item at a time for the whole iterable, which is actually O(n) memory if the caller accumulates. Fix: raise `ValueError` for `size < 1`.",
      },
    ],
  },

  /* ---- drill 11 ---------------------------------------------------------- */
  11: {
    verdict: "request-changes",
    reason:
      "The goroutines write to a shared map with no mutex. Go's runtime detects this and aborts the process with `fatal error: concurrent map writes` — a fatal error, not a panic: `recover()` cannot catch it. It's also probabilistic, so it passes review and CI and takes the service down under real load.",
    findings: [
      {
        title: "Concurrent writes to an unsynchronised map",
        where: "line 14, `results[u] = resp.StatusCode` from N goroutines",
        body: "Every goroutine writes to the shared `results` map with no lock. Go's runtime detects concurrent map writes and aborts with a `fatal error` — not a panic, so `recover()` cannot catch it and no deferred cleanup runs. It is probabilistic: two URLs will almost never trip it. Passes review, passes CI, takes the service down under real load. Fix: guard with `sync.Mutex`, use `sync.Map`, or funnel results through a channel.",
      },
      {
        title: "A failed request is silently omitted from the result",
        where: "lines 10–12, `if err != nil { return }`",
        body: "On an `http.Get` error the goroutine just returns. The URL is absent from the map, which is indistinguishable from a URL that was never in the input. A status-checking function that silently omits its failures has inverted its own purpose. Fix: return a per-URL result struct carrying either a status or an error.",
      },
      {
        title: "No timeout on `http.Get`",
        where: "line 9, `http.Get(u)` — uses `http.DefaultClient` which has `Timeout = 0`",
        body: "A server that accepts the connection and never responds holds a goroutine and a connection forever; `wg.Wait()` then never returns and the whole call hangs. There is no context and no cancellation path. Fix: use a `*http.Client` with an explicit `Timeout`, and `http.NewRequestWithContext` so the caller can cancel.",
      },
      {
        title: "Unbounded goroutine and connection fan-out",
        where: "line 7, one goroutine per URL with no semaphore",
        body: "Ten thousand URLs means ten thousand simultaneous sockets. You exhaust file descriptors or the remote rate-limits you, and the resulting errors look like a network problem rather than a client bug. Fix: bound concurrency with a buffered-channel semaphore or `errgroup.SetLimit`.",
      },
    ],
  },

  /* ---- drill 12 ---------------------------------------------------------- */
  12: {
    verdict: "request-changes",
    reason:
      "`Math.round(double)` returns a `long`, so `…/ 100` is integer division. A price of `19.99` with no discount gives `1999 / 100 = 19`, returned as `19.0` — every amount is truncated to whole units and the customer is undercharged by up to 99 cents.",
    findings: [
      {
        title: "`Math.round` returns a `long`, so the division truncates",
        where: "line 4, `Math.round((price - discount) * 100) / 100`",
        body: "`Math.round(double)` returns `long`. `1999L / 100` is `19L` (integer division), widened to `19.0` on return. The signature says `double` and the arithmetic is integer; nothing warns. Every amount is truncated to whole units and the customer is undercharged by up to 99 cents. Fix: divide by a double literal — `Math.round(…) / 100.0` — or use integer cents.",
      },
      {
        title: "`double` for money accumulates representation error",
        where: "lines 3–4, `price * percent / 100` and the subsequent subtraction",
        body: "`double` cannot represent most decimal fractions exactly. `price * percent / 100` accumulates error, and once values are summed across a basket the total drifts from any hand calculation. This is the defect that generates accounting tickets nobody can reproduce. Fix: `BigDecimal` with explicit scale and `RoundingMode`.",
      },
      {
        title: "`percent` is not validated",
        where: "line 3, `price * percent / 100`",
        body: "`percent = 150` produces a discount larger than the price and returns a negative amount, which downstream becomes a refund. `percent = -10` raises the price. Neither looks wrong in a log line. Fix: reject `percent` outside `[0, 100]`.",
      },
    ],
  },

  /* ---- drill 13 ---------------------------------------------------------- */
  13: {
    verdict: "request-changes",
    reason:
      "`Where()` is deferred — it builds a query and executes nothing. `Count()` on line 4 executes it once, and the caller's iteration executes it a second time. Against a database that's two round trips; against a single-read stream the second enumeration yields nothing and the log line lies about what the caller received.",
    findings: [
      {
        title: "The sequence is enumerated twice, and a single-read source fails on the second pass",
        where: "line 4, `.Count()` (first enumeration) and line 5, `return large` (second enumeration by the caller)",
        body: "`Where()` builds an `IQueryable` that has not yet run. `.Count()` forces a full enumeration to count, then returning `large` hands the caller a query they will enumerate again. Against a database: two round trips. Against a `yield`-return iterator over a stream or a network reader: the second enumeration throws or yields nothing, so the log says 'Found 40 large orders' and the caller receives zero. Fix: materialise once — `var large = orders.Where(…).ToList();` — then `large.Count` and `return large`.",
      },
      {
        title: "Deferred execution escapes the lifetime of its `DbContext`",
        where: "line 5, `return large` — the query executes wherever the caller iterates it",
        body: "If `orders` is an EF `DbSet`, the returned `IQueryable` runs on the first iteration. If the caller iterates after the request-scoped `DbContext` has been disposed, the iteration throws `ObjectDisposedException` from a stack frame in the view layer. The investigation starts in the wrong file. Fix: materialise before returning.",
      },
      {
        title: "A log line performs the expensive work",
        where: "line 4, `large.Count()` is evaluated as an argument even if the logger is above `Information`",
        body: "C# evaluates all arguments before calling the log method. `large.Count()` runs unconditionally, so the cost is paid even when the level is set to `Warning` and the string is never formatted. Reviewers read log lines as free; this one is not. Fix: compute the count into a local and log the local.",
      },
    ],
  },

  /* ---- drill 14 ---------------------------------------------------------- */
  14: {
    verdict: "request-changes",
    reason:
      "Without `set -euo pipefail`, an unset argument directs `rm` at `/*`, and a failing `cp` still reaches the echo. The cron output says 'Backup complete' for a backup that never happened.",
    findings: [
      {
        title: "Unset argument sends `rm` and `cp` at the filesystem root",
        where: "line 6, `rm -rf $BACKUP_DIR/*` — `$1` absent makes `BACKUP_DIR` empty",
        body: "With no argument, `BACKUP_DIR` is empty. `rm -rf /*` is refused by GNU `rm`'s root safeguard, but `cp -r /var/data/* /` then copies into the filesystem root. Run as root, that can overwrite system files. The script relies on an implementation safeguard and never validates that the argument names the intended directory. Fix: `set -euo pipefail`, quote the expansion, and validate: `[[ -d \"$BACKUP_DIR\" ]] || exit 1`.",
      },
      {
        title: "Unquoted expansions word-split and glob",
        where: "line 6, `rm -rf $BACKUP_DIR/*` — unquoted `$BACKUP_DIR`",
        body: "A path containing a space splits into two arguments: `rm` gets `\"/mnt/my\"` and `backups/*`. A path containing a glob character is expanded against the filesystem. The shell does this silently. Fix: quote every expansion: `rm -rf \"${BACKUP_DIR:?}\"/*`.",
      },
      {
        title: "Success is printed unconditionally",
        where: "lines 6–8, no `set -e` before the `echo`",
        body: "A failing `cp` — disk full, permission denied, source missing — does not stop the script. The `echo` runs anyway and cron's output says 'Backup complete'. The monitoring signal and the actual outcome are decoupled; the failure is discovered at restore time. Fix: `set -euo pipefail`.",
      },
      {
        title: "The old backup is destroyed before the new one is created",
        where: "lines 6–7, `rm` then `cp`",
        body: "If the `cp` fails halfway, there is now neither a complete old backup nor a complete new one. A backup job should never reach a state where no valid backup exists. Fix: copy to a temporary directory, then `mv` into place atomically once the copy has succeeded.",
      },
      {
        title: "Dotfiles are silently excluded from the copy",
        where: "line 7, `cp -r /var/data/*` — `*` does not match dotfiles by default",
        body: "`/var/data/.env`, `.ssh`, `.config` and friends are never copied, and the corresponding files in the destination are never deleted — so stale hidden data survives every refresh. The backup looks complete because everything visible is there. Fix: `cp -a /var/data/. \"$dest/\"`.",
      },
    ],
  },

  /* ---- drill 15 ---------------------------------------------------------- */
  15: {
    verdict: "request-changes",
    reason:
      "`except Exception` catches every failure, including non-retryable ones, and the final `return None` makes the caller unable to tell what went wrong. The endpoint returning an HTML error page is retried three times and treated as a transient failure.",
    findings: [
      {
        title: "`except Exception` catches failures that retrying cannot fix and swallows programming errors",
        where: "line 6, `except Exception:`",
        body: "A non-JSON response body makes `.json()` raise; the code retries three times and returns `None`. A typo'd name inside the `try` becomes a `NameError` that is caught, retried, and reported as an upstream outage. Fix: catch only `requests.Timeout`, `ConnectionError`, and 5xx responses, and let everything else propagate.",
      },
      {
        title: "Returning `None` erases the reason for failure",
        where: "line 8, `return None`",
        body: "The caller cannot distinguish 'all retries exhausted' from 'the endpoint legitimately returned null' from a 404. Every caller writes `if price is None:` and guesses. The exception that explains the problem has already been discarded. Fix: re-raise the final exception or return a typed result carrying the failure reason.",
      },
      {
        title: "A non-2xx response that is valid JSON is returned as data on the first attempt",
        where: "line 5, `requests.get(url, timeout=5).json()` — `requests` does not raise on non-2xx",
        body: "A 503 whose body is JSON (typical for an API gateway) parses cleanly and is returned as pricing data with no retry. The retry logic never engages for the exact failures it was written for. Fix: `resp.raise_for_status()` before `.json()`.",
      },
      {
        title: "`retries = 3` makes three total attempts, not three retries",
        where: "line 3, `for i in range(retries)`",
        body: "`range(3)` gives three iterations: one initial attempt plus two retries. The docstring says 'retrying up to `retries` times', which would be four attempts. Callers tuning against an SLA will be off by one. Fix: `range(retries + 1)` or rename the parameter to `attempts`.",
      },
      {
        title: "It sleeps after the final attempt",
        where: "line 7, `time.sleep(2 ** i)` inside `except` with no check for remaining attempts",
        body: "The last failure is followed by a four-second sleep (at `i=2`) before returning `None`. Under load that is four seconds of held connection bought for nothing. Fix: only sleep when another attempt will follow.",
      },
    ],
  },

  /* ---- drill 16 ---------------------------------------------------------- */
  16: {
    verdict: "request-changes",
    reason:
      "A chain of early returns means first-match-wins, so a $150 international order and a $150 order weighing 40kg both ship free. The docstring lists four rules as a set; the code silently invents a precedence nobody agreed to.",
    findings: [
      {
        title: "The rules are unordered in the docstring but ordered in the code, and no one chose the order",
        where: "lines 9–15, the chain of `if … return`",
        body: "A $150 international order ships free because line 9 fires before line 11 is reached. A $150 order weighing 40kg also ships free. Whether that is intended is unknowable from the docstring — a list of bullet points has no precedence. The code silently invented one and nobody agreed to it. The correct review action is to state the ambiguity and ask which rule wins, then encode the decision explicitly and add a test per rule combination.",
      },
      {
        title: "The $100 threshold is `>`, not `>=`; round-number carts land exactly on it",
        where: "line 9, `if order.total > 100`",
        body: "An order of exactly $100.00 pays $5. That may be right, but nothing states it, and the off-by-one at a price point customers actually hit — round numbers are exactly where carts land — generates support tickets. Fix: decide inclusive or exclusive, document it, and test at 99.99, 100.00 and 100.01.",
      },
      {
        title: "Float comparison at a currency threshold",
        where: "line 9, `order.total > 100` — `order.total` is a float accumulated from line items",
        body: "A basket that should total exactly 100.00 can hold `100.00000000000001` or `99.99999999999999`. The free-shipping branch then fires or does not fire depending on the order items were added in. Intermittent, unreproducible, and correct-looking in every log. Fix: use `Decimal` or integer cents.",
      },
      {
        title: "Negative and missing values fall through to a price",
        where: "lines 9–15, no input validation on `order.total` or `order.weight_kg`",
        body: "A refund with a negative total is charged $5. A digital product with `weight_kg = None` raises `TypeError` inside the comparison on line 13. Neither case is handled, and the function has no way to express 'we do not ship this'.",
      },
    ],
  },

  /* ---- drill 17 ---------------------------------------------------------- */
  17: {
    verdict: "request-changes",
    reason:
      "The diff adds a cache with no invalidation path. From the moment it merges, every profile edit appears to silently fail — the write lands, the read returns the cached row, the user re-types the change — and the staleness is unbounded because no TTL is visible.",
    findings: [
      {
        title: "The cache is introduced with no invalidation path",
        where: "the whole diff — nothing deletes a key when a user is updated or deleted",
        body: "Nothing in this diff, and nothing it references, invalidates a cache entry on write. From the moment this merges, every profile edit appears to silently fail: the write lands, the read returns the cached old row, and the user re-types their change. No TTL is visible, so the staleness is unbounded. The correct review response is to reject the diff as incomplete — the missing code is the defect, and reviewing only the lines shown will not find it. Fix: invalidate on every write path, and set a TTL as a backstop. Both belong in this PR.",
      },
      {
        title: "Truthiness check on a value that is legitimately `null`",
        where: "line 4, `if (cached)` — `cache.get(id)` returns `null` for a cached non-existent user",
        body: "The return type is `User | null`. When `findById` returns `null`, line 8 stores that `null`, and line 4 reads it back: `if (null)` is false, so the code falls through to the DB on every subsequent lookup of a non-existent id. The cache never serves a negative result. An attacker enumerating random ids makes the hostile path more expensive, not less. Fix: use `cache.has(id)` or store a sentinel wrapper and test for `undefined`.",
      },
      {
        title: "Concurrent misses stampede the database",
        where: "between line 4 (`if (cached)` is false) and line 8 (`cache.set`)",
        body: "On a hot key — the stated reason for the change — a cold cache produces a burst of identical DB queries rather than one. The cache reduces steady-state load and amplifies the load spike at the moment the system is already struggling. Fix: store the in-flight promise in the cache rather than the resolved value, so concurrent callers await the same query.",
      },
      {
        title: "The cached value is returned without a type check",
        where: "line 5, `return cached` (or line 9, `return user` from cache)",
        body: "`cache.get` almost certainly returns `any` or `unknown`. If the cache holds a value written by an older deployment with a different `User` shape, the type annotation is a lie and the failure surfaces as an undefined property access in the view. Caches outlive deploys; the schema in them is not versioned by the compiler. Fix: type the cache as `Cache<User | null>` and include a schema version in the key.",
      },
    ],
  },

  /* ---- drill 18 ---------------------------------------------------------- */
  18: {
    verdict: "request-changes",
    reason:
      "This is a silent behaviour change for every existing caller: before, a reduced override section cleared fields; after, the omitted keys survive from base. No version bump, no docstring change, no test — and callers relying on the old clear-on-override semantics will break silently.",
    findings: [
      {
        title: "Silent behaviour change for every existing caller",
        where: "the diff as a whole: `result.update(override)` replaced with recursive merge",
        body: "Before the change, `override = {'db': {'host': 'x'}}` replaced the entire `db` section, so any key the override omitted was gone in the result. After it, the omitted keys survive from base. Callers written against the old behaviour — any caller passing a deliberately reduced section to clear fields — now silently stop clearing them. Flagging the compatibility break is the primary finding of this review. Fix: update the docstring, add tests covering both shapes, and provide an explicit way to replace a subtree wholesale.",
      },
      {
        title: "Unbounded recursion on deep or self-referential config",
        where: "line 7, `merge_configs(result[key], value)` — no depth limit, no cycle detection",
        body: "A config object that contains itself — trivially constructible by any loader that resolves YAML anchors — recurses until `RecursionError`. The previous implementation could not fail this way; the diff introduced the failure mode. Fix: track visited ids or cap the depth explicitly and raise a clear error.",
      },
      {
        title: "Dicts are merged and lists are replaced, with nothing saying so",
        where: "line 6, `isinstance(value, dict)` — lists take the `else` branch and are replaced",
        body: "Appending one item to a list in the override wipes out the other entries. That is a real design decision — most config systems land on it — but it is now undocumented behaviour that a user will discover when they lose data. Fix: state the list policy in the docstring.",
      },
      {
        title: "Shallow copy still aliases the caller's data (pre-existing)",
        where: "line 3, `result = base.copy()` — `dict.copy` is shallow",
        body: "Any nested container that the loop does not descend into — a dict present only in base, or any list — is the same object in the result as in base. A caller mutating the merged config mutates the original. This defect predates the diff; say so explicitly when reporting it. Fix: `copy.deepcopy(base)` or document the aliasing.",
      },
      {
        title: "`isinstance(dict)` misses custom `Mapping` types (nit)",
        where: "line 6, `isinstance(value, dict)` and `isinstance(result.get(key), dict)`",
        body: "Config loaders can return custom `Mapping` types that do not subclass `dict`. Those take the `else` branch and replace instead of merging, so behaviour depends on which YAML library produced the object. Fix: test against `collections.abc.Mapping`.",
      },
    ],
  },

  /* ---- drill 19 ---------------------------------------------------------- */
  19: {
    verdict: "request-changes",
    reason:
      "Two responses can be in flight at the same time and nothing decides which one wins: the response for the earlier keystroke can land after the later one and overwrite the correct results. On a phone that happens constantly.",
    findings: [
      {
        title: "Out-of-order responses overwrite newer results",
        where: "lines 4–8, `useEffect` fires per keystroke with no abort",
        body: "Typing 'a' then 'b' quickly fires two requests. The response for 'a' can land after the response for 'ab' and `setResults` replaces the correct list with the stale one. The UI then shows results for a query the user has already typed past. Reproduces rarely on a fast local network and constantly on a phone. Fix: return a cleanup from the effect that calls `AbortController.abort()`, or set an `ignore` flag the late response checks.",
      },
      {
        title: "`fetch` does not reject on 4xx/5xx; an error page causes an unhandled `SyntaxError`",
        where: "line 6, `r.json()` on a response with `ok === false`",
        body: "A 500 is a resolved promise with `ok === false`. `r.json()` then tries to parse the HTML error body, throws a `SyntaxError` inside the `.then` chain, and — with no `.catch` — becomes an unhandled rejection. The component keeps its previous state, so a total backend outage looks like a search that found nothing. Fix: `if (!r.ok) throw new Error(r.status)` and handle it with an explicit error state.",
      },
      {
        title: "The query is interpolated into a URL without encoding",
        where: "line 5, `\"/api/search?q=\" + query`",
        body: "A `&` in the query introduces a second parameter, `#` truncates the URL before the request is sent, and `+` arrives as a space. The search silently returns results for a different query than the one typed. Fix: `encodeURIComponent(query)` or `URLSearchParams`.",
      },
      {
        title: "No loading or error state",
        where: "the entire component — exactly two states: results present or results from the previous query",
        body: "The user cannot tell 'searching' from 'found nothing' from 'server is down'. Three distinct outcomes render identically, so a bug report will say 'search doesn't work' and contain no information. Fix: model the states explicitly: idle | loading | error | empty | results.",
      },
      {
        title: "One request per keystroke — no debounce (minor)",
        where: "the `useEffect` dependency on `[query]`",
        body: "Typing a ten-character query issues ten requests, nine of which are obsolete when sent. Not a correctness bug on its own, but it is the load that turns the race above from theoretical into daily. Fix: debounce by ~250 ms.",
      },
    ],
  },

  /* ---- drill 20 ---------------------------------------------------------- */
  20: {
    verdict: "request-changes",
    reason:
      "`std::accumulate` deduces its accumulator type from the initial value, not the iterator's value type: passing the literal `0` makes it an `int`, so every `double` is truncated on each addition. A window of `[0.9, 0.9, 0.9]` sums to `0`, not `2.7` — and it compiles without a warning under `-Wall`.",
    findings: [
      {
        title: "`std::accumulate` accumulator is deduced as `int`",
        where: "line 20, `std::accumulate(w.begin(), w.end(), 0)` — the init value is `int`",
        body: "`std::accumulate` deduces its accumulator type from the third argument, which here is `0` (an `int`). Every `double` value is converted to `int` on each addition. A window of `[0.9, 0.9, 0.9]` sums to `0`, not `2.7`. Compiles cleanly under `-Wall`; returns a plausible number for any test whose values happen to be whole. Fix: `std::accumulate(w.begin(), w.end(), 0.0)` or `0.0L`.",
      },
      {
        title: "The returned span points into a vector that is destroyed (use-after-free)",
        where: "line 30, `top_windows` takes `readings` by value; line 34, `readings.erase(readings.begin())`",
        body: "`best_window` on line 33 stores a `std::span` pointing into `readings.data()`. Line 34 erases from `readings`, invalidating the buffer that the span pushed into `out` on the previous iteration already points at. Even on the first iteration: when `top_windows` returns, `readings` (the by-value parameter) is destroyed and every span in `out` dangles. Debug builds 'work' because the freed pages still hold the old bytes. Fix: return an owning `std::vector<double>` per window, or take the data by `const&` and document that the caller must outlive the result.",
      },
      {
        title: "`best_sum` starts at `0.0`, so an all-negative dataset never selects any window",
        where: "lines 16, 21, `double best_sum = 0.0;` and `if (sum > best_sum)`",
        body: "For data where every window sums below zero — temperature deltas, drawdowns, signed error terms — `sum > best_sum` is never true, and the function returns the default-constructed `Window`: an empty span, `mean = 0.0`, empty label. The caller has been handed a window that does not exist, and `0.0` is a believable mean for all-negative data. Fix: seed with the first window's sum, or track a `bool have_best`.",
      },
      {
        title: "'No window exists' is indistinguishable from a real answer",
        where: "line 18, `i + width <= data.size()` — if `width > data.size()` the loop body never runs",
        body: "The default `Window` (empty span, `mean = 0.0`) is returned for both 'the best window has mean zero' and 'you asked for an impossible width'. There is no error, no optional, no exception. Fix: `std::optional<Window>`, or throw on `width > data.size()`.",
      },
      {
        title: "Negative `width` promotes to a huge `size_t` and the condition is immediately false",
        where: "line 18, `i + width <= data.size()` where `width` is `int` and `i` is `size_t`",
        body: "`i` is `size_t`, so `width` is converted to `size_t` before the addition. A negative `width` becomes a huge positive value; the condition is false immediately; and the function silently returns the default `Window` instead of rejecting the argument. `-Wsign-compare` does not fire because both operands end up unsigned. `width == 0` is accepted and causes `sum / width` — a division by zero. Fix: validate `width > 0` up front and take it as `size_t`.",
      },
    ],
  },

  /* ---- drill 21 ---------------------------------------------------------- */
  21: {
    verdict: "request-changes",
    reason:
      "`DISCOUNTS[code] || 0` turns a typo, an expired code and a hostile guess into a 0% discount, and the method appends the bogus code to `@cart[:applied]` — the customer is told their code was accepted and charged as though it wasn't, and support cannot reproduce it because the code 'works'.",
    findings: [
      {
        title: "An unknown coupon silently becomes a 0% discount and is recorded as applied",
        where: "lines 14, 25: `percent = DISCOUNTS[code] || 0` and `@cart[:applied] << code`",
        body: "`DISCOUNTS.fetch(code)` would raise; `DISCOUNTS[code] || 0` returns 0 for a missing key. The method returns the full subtotal AND appends the unknown code to `@cart[:applied]`. Support sees the code in the audit trail, the total shows no discount, and cannot tell which is wrong. Fix: `DISCOUNTS.fetch(code) { return Result.invalid_code(code) }` — make the unknown case a distinct outcome.",
      },
      {
        title: "`or` binds looser than `=`; `stackable` is never influenced by `params[:override]`",
        where: "line 17, `stackable = params[:stackable] == \"true\" or params[:override]`",
        body: "Ruby parses this as `(stackable = (params[:stackable] == \"true\")) or params[:override]`. The `||` equivalent: `stackable = (params[:stackable] == \"true\") || params[:override]`. The `or` form evaluates `params[:override]`, discards its value, and `stackable` is always the result of the assignment — i.e. `true` or `false`. The override flag has no effect. Ruby warns only under `-w`. Fix: use `||` in expressions; reserve `and`/`or` for control flow.",
      },
      {
        title: "The 100% cap only applies on the `stackable` path, and that path is almost never taken",
        where: "line 18, `percent = 100 if stackable && percent > 100`",
        body: "With `HALF` (50%) plus `bonus = 60`, `percent = 110` and `stackable` is false (per the defect above), so `discount = subtotal * 1.10` and `total` goes negative — the coupon pays the customer. The `stackable` guard is dead code in most cases. Fix: `percent = percent.clamp(0, 100)` unconditionally.",
      },
      {
        title: "`String#to_i` never fails: `\"abc\".to_i` is 0, `\"50%\".to_i` is 50",
        where: "line 15, `params[:bonus].to_i`",
        body: "`nil.to_i` is 0, `\"abc\".to_i` is 0, `\"50%\".to_i` is 50, `\"1e9\".to_i` is 1. A malformed bonus is silently ignored or misread, and nothing raises, which is exactly why the parameter is never validated. Fix: `Integer(params[:bonus], exception: false)` and reject `nil` explicitly.",
      },
      {
        title: "The caller's cart is mutated and applying the same code twice is not idempotent",
        where: "lines 23–25: `@cart[:total] = total; @cart[:applied] << code`",
        body: "`@cart` is the caller's hash. A retry (double-click, Sidekiq retry after a timeout) appends the code a second time: the audit trail says applied twice, the total says applied once. Fix: return the new total and let the caller commit it; guard with `return if @cart[:applied].include?(code)`.",
      },
      {
        title: "Integer division truncates, picking a rounding rule nobody chose (minor)",
        where: "line 20, `discount = subtotal * percent / 100` — integer division in Ruby when both operands are integers",
        body: "10% of 1999 cents is `1999 * 10 / 100 = 199`, not 200. Consistently in the merchant's favour; disagrees with the finance spec at every amount that is not a multiple of 10. Fix: `(subtotal * percent).fdiv(100).round` with the direction stated.",
      },
    ],
  },

  /* ---- drill 22 ---------------------------------------------------------- */
  22: {
    verdict: "request-changes",
    reason:
      "`strpos(...)` returns `false` when the substring is absent, and `false == 0` is `true` in PHP. The allowlist loop returns the path on its first iteration for every path that does not contain the prefix — the exact opposite of what it is for.",
    findings: [
      {
        title: "`strpos(...) == 0` is true for every path that does not contain the prefix",
        where: "line 29, `if (strpos($path, $prefix) == 0)`",
        body: "`strpos` returns `false` when the needle is not found. In PHP, `false == 0` is `true` — comparing a boolean against anything converts the other operand to a boolean, and 0 is falsy. So the loop returns `$path` on its first iteration for every path that does not start with the prefix. Tests where the path does start with the prefix pass, which is why this reaches production. Fix: `str_starts_with($path, $prefix)` or at minimum `===`.",
      },
      {
        title: "Loose hash comparison lets a numeric-string signature through",
        where: "line 20, `md5(...) != $signature`",
        body: "PHP still compares two numeric strings numerically even in PHP 8. An MD5 output that happens to look like scientific notation (e.g. `\"0e462097431906509019562988736854\"`) is a numeric string, so any two such hashes compare equal. Attackers precompute them. Additionally, `!=` and `!==` are both variable-time, so the comparison leaks the signature byte by byte. Fix: `hash_equals($expected, $signature)` and `hash_hmac('sha256', ...)` instead of MD5.",
      },
      {
        title: "No protection against path traversal after `urldecode`",
        where: "lines 16, 29: `$path = urldecode($parts[0])` then prefix-only check",
        body: "`\"uploads/../../etc/passwd\"` satisfies a prefix of `\"uploads/\"` and is returned as the granted path. `%2e%2e%2f` arrives as `../` after `urldecode`, so any filter on the raw token is bypassed. Fix: `realpath()` the result and assert it is still inside the allowed root.",
      },
      {
        title: "A non-numeric `$expires` compares as a string and never expires",
        where: "line 24, `$expires < time()` — `$expires` is a string from `explode()`",
        body: "PHP 8 casts the int to a string when one operand is a non-numeric string: `\"abc\" < \"1790000000\"` is `false`, so the token is treated as unexpired. A bug upstream that produces a malformed expiry yields links that never die. Fix: require `ctype_digit($expires)` and compare `(int) $expires < time()`.",
      },
      {
        title: "Four different rejection reasons return the same `null` (minor)",
        where: "lines 12–13, 20–21, 24–25, 28–32, 34 — all paths return `null`",
        body: "Malformed, bad signature, expired, and not-allowed are indistinguishable to the caller. A clock-skew problem and a forged signature are recorded as the same event in the access log — one is a support ticket, the other is an incident. Fix: return a result object with a reason code, or log the reason separately.",
      },
    ],
  },

  /* ---- drill 23 ---------------------------------------------------------- */
  23: {
    verdict: "request-changes",
    reason:
      "The cache key is just `path`, but `load` accepts an `overrides` parameter that is merged into the policy before caching. The first caller's overrides are baked in and served to every later caller of the same path — and the first call in a process is usually the one with no overrides at all, from a health check, so in production the overrides are silently never applied.",
    findings: [
      {
        title: "The cache key omits `overrides`",
        where: "lines 16–17, `cache[path]?.let { return it }` and line 37, `cache[path] = policy`",
        body: "The first caller to call `load(path, overrides = {...})` has their overrides baked into the cached `RetryPolicy`. Every later caller of the same `path` gets that policy regardless of what overrides they pass. In production the first call is usually a health check with no overrides, so the overrides are never applied silently. In a test that calls `load()` once with overrides they are always applied — the test passes and production disagrees. Fix: key on `(path, overrides)`, or apply overrides to the cached result outside the cache lookup.",
      },
      {
        title: "`backoffMs / attempts` divides by a caller-supplied value that can be zero",
        where: "line 34, `Duration.ofMillis(backoffMs / attempts.toLong())`",
        body: "`attempts = 0` is a reasonable config value meaning 'do not retry', and it throws `ArithmeticException: divide by zero` at load time. `attempts > backoffMs` floors to zero, so `Duration.ZERO` becomes the backoff and the retry loop spins as fast as the network allows. The arithmetic is also inverted in meaning: dividing the per-attempt backoff by the attempt count is not what a key named `backoff_ms` means. Fix: validate `attempts >= 1`, and use the configured value directly as the backoff.",
      },
      {
        title: "Destructuring `split(\"=\")` breaks on both edges",
        where: "line 22, `val (k, v) = line.split(\"=\")`",
        body: "A blank line or a line with no `=` gives a one-element list and `val (k, v)` throws `IndexOutOfBoundsException`. A value containing `=` (a base64 secret, a query string) gives three elements and the third is silently dropped — the value is truncated at the first `=`. One edge is loud, the other is silent and corrupts a credential. Fix: `line.split(\"=\", limit = 2)` plus an explicit error for blank and malformed lines.",
      },
      {
        title: "`?: 3` looks like input validation and is not",
        where: "line 28, `merged[\"attempts\"]?.toInt() ?: 3`",
        body: "The elvis operator only covers the null case (the key being absent). `\"three\".toInt()` throws `NumberFormatException`, which is not null, so the default never applies. The line advertises tolerance for bad input and delivers a stack trace naming neither the key nor the file. Fix: `merged[\"attempts\"]?.toIntOrNull() ?: 3`.",
      },
      {
        title: "Process-wide `HashMap` mutated with no synchronisation",
        where: "line 14, `private val cache = HashMap<String, RetryPolicy>()` in a `object` (singleton)",
        body: "`object` makes this a process-wide singleton. `HashMap` is not thread-safe. Two threads calling `load()` concurrently both miss, both parse, and both `put` — the work is duplicated and one policy is silently discarded. A concurrent `put` during a resize can also lose unrelated entries. Fix: `ConcurrentHashMap` with `computeIfAbsent`.",
      },
    ],
  },

  /* ---- drill 24 ---------------------------------------------------------- */
  24: {
    verdict: "request-changes",
    reason:
      "`forEach` with an `async` callback does not await it — `forEach` ignores the promises the callback returns. The function falls through to the sort and returns an empty array before `fetchPlan` resolves, and `failures` is still empty so the warning never fires.",
    findings: [
      {
        title: "`forEach` does not await its async callback",
        where: "line 19, `accounts.forEach(async (a) => { … })`",
        body: "`Array.prototype.forEach` invokes each callback and collects no return value; the `async` arrow function returns a `Promise` that `forEach` discards. The code on lines 28–32 runs synchronously immediately after line 19 dispatches, at which point zero `fetchPlan` calls have resolved. `out` is empty, `failures` is empty, the warning does not fire, and the caller receives `[]` with a fully successful log. Fix: `await Promise.allSettled(accounts.map(async (a) => enrichOne(a)))`.",
      },
      {
        title: "The return type promises one record per account but silently drops failures",
        where: "line 22, `out.push(...)` — only successful records are pushed",
        body: "`Enriched[]` gives the caller no way to line results up with inputs. `out.length` silently differs from `accounts.length`. A caller that zips the two arrays by index — the obvious thing to do — pairs the wrong plan with the wrong account. Fix: return `Map<string, Enriched | Error>` or `Array<{ id: string; result: Enriched | Error }>`. Make partial success representable in the type.",
      },
      {
        title: "Errors are counted, not reported",
        where: "lines 23–25, `catch { failures.push(a.id) }` — the error object is discarded",
        body: "`'Nine hundred accounts failed'` and `'the auth token expired'` are the same event, and only one of them is actionable. The caller receives a shorter array and no signal at all. Fix: keep the error objects and return them, or rethrow an `AggregateError` once the fan-out completes.",
      },
      {
        title: "The comparator never returns 0",
        where: "line 32, `(x, y) => (x.email > y.email ? 1 : -1)`",
        body: "The comparator claims every pair is strictly ordered, including equal pairs. An inconsistent comparator is undefined behaviour for `sort`: V8's TimSort can produce an order that is not merely unstable but wrong, moving unrelated elements. It is also a raw UTF-16 code-unit comparison, so accented and non-Latin addresses sort in an order no user recognises. Fix: `x.email.localeCompare(y.email)`.",
      },
      {
        title: "The natural fix (`Promise.all` over `accounts.map`) introduces unbounded concurrency",
        where: "line 19 as currently written: one in-flight `fetchPlan` per account",
        body: "Fifty thousand accounts means fifty thousand simultaneous requests. Exhausts sockets locally and rate-limits or topples the dependency remotely. There is also no timeout, so one hung request holds the whole batch open forever. Worth flagging in the same review because it is where the natural fix lands. Fix: a bounded worker pool plus an `AbortSignal` timeout per request.",
      },
    ],
  },

  /* ---- drill 25 ---------------------------------------------------------- */
  25: {
    verdict: "request-changes",
    reason:
      "`worker` takes `wg sync.WaitGroup` by value, so each goroutine calls `Done()` on its own copy. The counter in `Process` never drops below `workers` and `wg.Wait()` blocks forever. `go vet` reports this — nobody ran `go vet`.",
    findings: [
      {
        title: "`sync.WaitGroup` passed by value — `Done()` is called on a copy",
        where: "line 49, `wg sync.WaitGroup` (in `worker` parameter list), line 53, `defer wg.Done()`",
        body: "Each `worker` goroutine gets its own copy of the `WaitGroup`. `wg.Done()` decrements the copy, not the original in `Process`. `Process`'s `wg` counter stays at `workers` forever and `wg.Wait()` on line 41 blocks. The compiler is happy. `go vet` reports 'passes lock by value: sync.WaitGroup contains sync.noCopy'. Fix: `worker(ctx, &wg, jobs, results, fn)` and take `*sync.WaitGroup`.",
      },
      {
        title: "The `results` channel is never closed, so `for r := range results` never ends",
        where: "line 36, `for r := range results` — nothing calls `close(results)`",
        body: "`for range` only exits when the channel is closed. Even with the WaitGroup fixed, `Process` deadlocks: the range loop waits for a close that none of the workers can perform (any one closing it would panic the others' sends). The producer goroutine got this right for `jobs` (line 32, `close(jobs)`), and the same reasoning was not applied one line down. Fix: `go func() { wg.Wait(); close(results) }()` before the range loop.",
      },
      {
        title: "`ctx` is accepted and never used",
        where: "lines 17, 25 — `ctx` threaded into `worker` and then ignored",
        body: "The signature promises a cancellable, deadline-aware operation. The body threads `ctx` into `worker` and ignores it there too. A caller who cancels gets nothing — the pool runs every id to completion and the goroutines outlive the request. A context parameter that is not selected on is worse than no parameter, because it advertises a guarantee the code does not provide. Fix: `select` on `ctx.Done()` in both the job loop and the result send.",
      },
      {
        title: "The timeout abandons the work rather than stopping it",
        where: "lines 61–62, the `time.After(5s)` branch — the goroutine running `fn` is still running",
        body: "On the timeout path, `fn` is still executing. Its side effects land after the caller has been told 'timeout on X'. A retry of the same id runs `fn` twice concurrently — two writes, two charges, two emails. `time.After` also allocates a timer per job that is not collected until it fires. Fix: give `fn` a context with a deadline and make it honour cancellation; use a timer you can `Stop()`.",
      },
      {
        title: "No aggregate outcome, and a library writing to stdout (minor)",
        where: "line 42, `fmt.Printf(\"processed %d of %d\\n\", …)`",
        body: "There is no way to express 'the run was cancelled' or 'the pool itself failed' — the caller infers it from a short slice. `fmt.Printf` from a package means the library cannot be embedded in anything with a log format. Fix: return `([]Result, error)` and take a `*slog.Logger`, or print at the call site.",
      },
    ],
  },

  /* ---- drill 26 ---------------------------------------------------------- */
  26: {
    verdict: "request-changes",
    reason:
      "For an account with no orders, `NULL <> 'cancelled'` evaluates to `NULL`, not `TRUE`, so `WHERE` drops the row — and the comment two lines above, left untouched by the diff, still says the query includes accounts with no orders yet. The diff makes its own context comment false.",
    findings: [
      {
        title: "The new `WHERE` predicates demote the `LEFT JOIN` to an `INNER JOIN`",
        where: "added lines 13–14, `AND o.status <> 'cancelled'` and `AND o.created_at >= NOW() - INTERVAL '12 months'`",
        body: "For an account with no orders, every `o.*` column is `NULL`. `NULL <> 'cancelled'` is `NULL`, not `TRUE`, so `WHERE` drops the row. The comment on line 1 — part of the diff's context and left unchanged — says the query includes accounts with no orders yet. Those accounts now vanish from the report entirely. The rows that disappeared are exactly the ones a churn or onboarding dashboard exists to show. Fix: move both predicates into the `ON` clause: `LEFT JOIN orders o ON o.account_id = a.id AND o.status <> 'cancelled' AND o.created_at >= ...`.",
      },
      {
        title: "`COUNT(*)` counts the NULL-extended row, inflating `order_count` to 1",
        where: "changed line 8, `COUNT(o.id) → COUNT(*)`",
        body: "On a `LEFT JOIN`, `COUNT(o.id)` skips the NULL-filled row and reports 0; `COUNT(*)` counts the row and reports 1. So every account with no orders claims one order worth zero cents, and `avg_order_cents = SUM / 1 = 0` computed against that phantom row. The two defects mask each other: while the `WHERE` clause is wrong, those accounts are filtered out, so fixing the `JOIN` is what makes this one appear. Fix: keep `COUNT(o.id)` and divide by `NULLIF(COUNT(o.id), 0)`.",
      },
      {
        title: "Integer division truncates the average, always downward",
        where: "added line 9, `SUM(o.amount_cents) / COUNT(*)` — `amount_cents` is an integer type",
        body: "`bigint / bigint` in Postgres truncates. An average of `1999.87` cents reports as `1999`, every time, always downward. Presented next to an exact `revenue_cents` total it reads as precise, and a spreadsheet that multiplies the average back out will not reconcile with the sum. Fix: `SUM(o.amount_cents)::numeric / NULLIF(COUNT(o.id), 0)`.",
      },
      {
        title: "`<> 'cancelled'` also drops orders whose status is `NULL`",
        where: "added line 13, `o.status <> 'cancelled'`",
        body: "An order whose status has not been set yet — pending insertion by a worker, or a column added with no backfill — compares `NULL` against `'cancelled'` and is excluded. Revenue that exists in the orders table silently does not appear in the report, and the missing amount is proportional to how busy the system was when the report ran. Fix: `(o.status IS NULL OR o.status <> 'cancelled')`.",
      },
      {
        title: "`NOW()` makes the report unreproducible and the oldest month partial (minor)",
        where: "added line 14, `NOW() - INTERVAL '12 months'`",
        body: "`NOW() - INTERVAL '12 months'` lands mid-month, so the twelfth month back is a partial month shown alongside eleven full ones — a graph of this data always dips at the left edge. `NOW()` also resolves in the session's time zone, so a scheduler in UTC and an analyst in PDT disagree on which orders fall in which month. Fix: take the window as an explicit parameter, truncated to a month boundary, with an explicit zone.",
      },
    ],
  },

  /* ---- drill 27 ---------------------------------------------------------- */
  27: {
    verdict: "request-changes",
    reason:
      "The effect on line 29 has no cleanup function, so the polling chain outlives the component — and `tick`'s dependency array omits `onDone`, which `JobPanel` recreates on every render, so the callback captured is the one from the first render with the first (empty) `log` array.",
    findings: [
      {
        title: "No cleanup from the effect: polling outlives the component and chains accumulate",
        where: "lines 28–30, `useEffect(() => { tick() }, [jobId])` — no return, no cancel",
        body: "A new `jobId` starts a second polling chain while the first keeps running, and both call `setStatus` — so the status shown is whichever chain last resolved, usually the stale one. On unmount, the fetch still resolves and `setState` fires on a dead component. The `cancel` handle the hook returns is the only way to stop it, and no caller in this file uses it. Fix: return a cleanup that clears `timer.current` and flips a `cancelled` ref the code checks after every await.",
      },
      {
        title: "`useCallback`'s dependency array omits `onDone`",
        where: "line 26, `}, [jobId])` — `tick` closes over `onDone`, which is not in the array",
        body: "`tick` is memoised on `[jobId]` but closes over `onDone`, which `JobPanel` recreates on every render (line 44, `onDone={(b) => setLog([...log, …])}`). So `tick` keeps the very first `onDone` forever, and that closure captured the very first `log` — the empty array. Every completion runs `setLog([...[], entry])`, so the log never holds more than one line and which line it holds depends on completion order. Fix: keep `onDone` in a ref updated each render and use the functional form: `setLog((l) => [...l, entry])`.",
      },
      {
        title: "`res.ok` is never checked before `res.json()`",
        where: "lines 14–15, `const res = await fetch(…)`, `const body = await res.json()`",
        body: "A 500 with an HTML error body throws a `SyntaxError`, which lands in `setError` as a JSON parsing problem — the operator sees 'Unexpected token <' instead of 'the job service is down'. A 404 that returns valid JSON is worse: `body.status` is `undefined`, which is neither 'succeeded' nor 'failed', so the poller schedules itself again indefinitely. Fix: `if (!res.ok) throw new Error(…)`, and treat an unrecognised status as terminal.",
      },
      {
        title: "The `catch` path stops polling permanently with no backoff",
        where: "lines 23–25, `catch (e) { setError(e) }` — no timer rescheduled",
        body: "A single transient network blip ends the poll. The UI keeps showing the last status, which is 'running', and `JobPanel` never reads the `error` field so the page looks like the job is still in progress with no indication that polling has stopped. Fix: reschedule with backoff on a transient failure, cap the attempts, and surface the error where the caller can render it.",
      },
      {
        title: "`key={i}` on a list whose items come and go (major)",
        where: "line 41, `<li key={i}>`",
        body: "React identifies children by key. With an index key, removing the first job shifts every subsequent one onto its neighbour's key. The `JobRow` instance — and the hook state inside it, including the in-flight poll for a different `jobId` — is reused for the wrong job. The symptom is one job's status appearing on another row, which reads as a backend bug. Fix: `key={job.id}`.",
      },
    ],
  },

  /* ---- drill 28 ---------------------------------------------------------- */
  28: {
    verdict: "request-changes",
    reason:
      "`lru_cache` on a method keys on `self` plus the arguments. `reload()` mutates `self.rates` in place without touching the cache key, so every `(sku, region, qty)` combination already quoted keeps returning the old price for the life of the process. A pricing update deploys successfully and silently does not take effect for exactly the popular items.",
    findings: [
      {
        title: "`reload()` cannot invalidate the cache, so prices freeze",
        where: "line 5, `self.rates = rates` vs the `@lru_cache` on `quote`",
        body: "`lru_cache` keys on all arguments including `self`. `reload()` mutates `self.rates` in place; `self` is unchanged, so the key is unchanged and every previously-quoted combination continues to return the old price. A pricing update appears to deploy successfully and silently does not take effect for exactly the popular items — the ones already in the cache. Fix: hold the cache on the instance and `cache_clear()` in `reload()`, or cache a free function of the rate card's version.",
      },
      {
        title: "`lru_cache` requires hashable arguments; the same diff adds a `dict`",
        where: "line 3, `def quote(self, sku, region, qty, options=None)` — `options` is a `dict`",
        body: "`options=None` is hashable, so the default path caches fine. The moment a caller passes `{'rush': True}` — the new feature the diff was written to support — it raises `TypeError: unhashable type: 'dict'`. The new feature and the new cache are mutually exclusive, and the happy path (no options) is the one that works, so a smoke test passes. Fix: take the option as a keyword-only bool (`rush: bool = False`) or a `frozenset` of flags.",
      },
      {
        title: "Memoising a method pins every instance in memory",
        where: "the `@lru_cache` on `quote` holds a strong reference to `self`",
        body: "The cache holds a strong reference to `self`, so no `PricingEngine` is ever garbage-collected. In a request-scoped or tenant-scoped design that is an unbounded leak that looks like a slow memory climb with no single culprit. Cache hits are also decided by instance identity, so two engines built from identical rate cards share nothing. Fix: move the cached computation to a free function that takes only value types.",
      },
      {
        title: "`int(base * 1.15)` truncates, and the float is not what it looks like",
        where: "line 14, `base = int(base * 1.15)` — `int()` truncates toward zero",
        body: "`2000 * 1.15` is `2299.9999999999995` in IEEE 754, so `int(2299.999…) = 2299`, not 2300. A 15% surcharge on 2000 cents yields 2299 — one cent light, on an invoice. The error is always truncation in the same direction, at an amount you cannot predict from reading the code. Fix: `base = base * 115 // 100` with the rounding direction stated.",
      },
      {
        title: "`qty` in the cache key makes `maxsize=1024` meaningless (minor)",
        where: "line 3, `qty` in the `lru_cache` key",
        body: "The key space is `sku × region × qty × options`, and `qty` is an unbounded integer a caller supplies. With 1024 slots and a long tail of quantities, the hit rate collapses toward zero while the retained-instance cost from the previous defect keeps growing. The cache was added because `quote()` is hot; as keyed, it is pure overhead plus a correctness hazard. Fix: cache the per-unit rate lookup (low-cardsinality) and do the `qty` arithmetic outside the cache.",
      },
    ],
  },

  /* ---- drill 29 ---------------------------------------------------------- */
  29: {
    verdict: "request-changes",
    reason:
      "`equals` on `AccountKey` uses `==` to compare `String` fields, so two logically equal keys from different allocations are never equal. Every unit test written with string literals passes because interned strings are the same reference; in production with keys from a `ResultSet` or JSON parser, every `add()` creates a new entry and `render()`'s lookup finds none of them.",
    findings: [
      {
        title: "`equals` compares `String` fields with `==`",
        where: "line 28, `return region == other.region && tier == other.tier;`",
        body: "`String ==` compares references. It is true for interned literals (which is why tests with `\"US\"` and `\"gold\"` pass). It is false for the same text arriving from a `ResultSet`, JSON parser, `substring`, or concatenation. In production, two logically equal keys are never equal. `hashCode` still agrees, so they land in the same bucket and `equals` separates them — every `add()` creates a new entry and `render()`'s lookup finds none of them. Fix: `Objects.equals(region, other.region) && Objects.equals(tier, other.tier)`, or make `AccountKey` a record.",
      },
      {
        title: "`static SimpleDateFormat` shared across threads",
        where: "line 11, `private static final SimpleDateFormat DAY = new SimpleDateFormat(\"yyyy-MM-dd\");`",
        body: "`SimpleDateFormat` keeps parse/format state in a mutable `Calendar` field, and this one is `static`. Two threads rendering at once produce interleaved output: a date from the wrong instant, a garbled string, or a `NumberFormatException` thrown from inside `format()`. Intermittent and load-dependent — reproduces in production, not in a test. Fix: `DateTimeFormatter.ofPattern(\"yyyy-MM-dd\")`, which is immutable and thread-safe.",
      },
      {
        title: "A missing region renders the literal string `\"null\"`",
        where: "line 49, `.append(totals.get(new AccountKey(r, \"standard\")))` — `StringBuilder.append(Object)` calls `String.valueOf`, which writes `\"null\"` for a `null` argument",
        body: "`totals.get(...)` returns `null` for a region with no rows. The report contains the line `EMEA: null`, which is indistinguishable from a genuine zero to a reader and fatal to any parser downstream. Had the author written `double total = totals.get(key)`, the same case would have been an `NPE` — a loud failure is the better bug, and the code accidentally chose the quiet one. Fix: `totals.getOrDefault(key, 0.0)` and format it explicitly.",
      },
      {
        title: "`double` for money accumulates representation error",
        where: "line 40, `current + amount` on `double` values",
        body: "Repeated addition on doubles accumulates representation error, so a column of amounts that sum exactly by hand disagrees in the report at a magnitude that grows with row count. `1234.5600000000002` is what a finance team sees. The boxed `Double` adds an allocation per `add()` and an unboxing NPE hazard. Fix: `long` cents or `BigDecimal` with explicit scale and `RoundingMode`.",
      },
      {
        title: "`region` and `tier` are mutable and package-visible (minor)",
        where: "lines 16–17, `String region; String tier;` — not `final`, not `private`",
        body: "Anything that mutates an `AccountKey` after insertion changes its `hashCode`, so the entry is in the wrong bucket and unreachable forever — the value is still in the map, still retained, and can never be found or removed. Keys must be immutable and nothing here enforces it. Fix: `final` fields, a private constructor, or a record.",
      },
    ],
  },

  /* ---- drill 30 ---------------------------------------------------------- */
  30: {
    verdict: "request-changes",
    reason:
      "`async void` on line 15 returns no `Task`, so the caller cannot await it or catch anything it throws. `Manifest()` called immediately after reads a list that is still being filled. Any exception is raised on the captured context — on .NET Core with no synchronisation context it goes to the thread pool and terminates the process, with a stack that does not include the call site.",
    findings: [
      {
        title: "`async void` — no `Task` to await, no exception to catch, manifest read before it is complete",
        where: "line 15, `public async void UploadAll(…)`",
        body: "Control returns to the caller at the first `await` — line 23, `await Task.WhenAll(tasks)` — before all uploads have finished. `Manifest()` called on the next line (line 41) reads a list still in flight. Any exception in `UploadOne` is uncatchable by the caller and, on .NET Core with no synchronisation context, goes to the thread pool and terminates the process long after the call site, with a stack that does not name the caller. Fix: `public async Task UploadAllAsync(…)` — `async void` is only correct for an event handler.",
      },
      {
        title: "Concurrent `List<string>.Add` from many tasks without synchronisation",
        where: "line 36, `_uploaded.Add(path)` from N concurrent `UploadOne` tasks",
        body: "`List<T>` is not thread-safe. Concurrent `Add` calls race on the count and backing array, so entries are silently overwritten and a resize can throw `IndexOutOfRangeException` from inside the framework. The manifest is short by an amount that varies per run, and a short manifest is indistinguishable from files that genuinely failed to upload — which is what the manifest exists to tell you. Fix: return the path from `UploadOne` and collect the results of `Task.WhenAll`, or use `ConcurrentBag<string>`.",
      },
      {
        title: "A non-success HTTP response is silently dropped from the manifest",
        where: "lines 34–37, `if (response.IsSuccessStatusCode) { _uploaded.Add(path); }` — no `else`",
        body: "A 403 from an expired credential, a 413 on an oversized file, and a 500 from the storage tier all end the same way: the file is absent from `_uploaded` and nobody is told. `IsSuccessStatusCode` is 2xx only, so a 307 redirect reads as failure and a 200 carrying an error document reads as success. The count printed at the end is the only signal, and it is a number with no names attached. Fix: `response.EnsureSuccessStatusCode()` inside a try, and return a per-file outcome naming the path and status.",
      },
      {
        title: "The object key is `Path.GetFileName(path)`, not the full path",
        where: "line 32, `var url = $\"https://{bucket}.example.com/{Path.GetFileName(path)}\"`",
        body: "`Path.GetFileName(\"2024/report.csv\")` and `Path.GetFileName(\"2025/report.csv\")` are both `\"report.csv\"`. The second upload overwrites the first, both return 200, both are added to the manifest, and the run reports two files uploaded. The data loss is complete, silent, and confirmed by the log. Fix: key on the path relative to the upload root, normalised and URI-escaped.",
      },
    ],
  },
};

export const MODEL_REVIEWS: Record<number, ModelReview> = REVIEWS;
export function modelReview(id: number): ModelReview | undefined {
  return REVIEWS[id];
}
