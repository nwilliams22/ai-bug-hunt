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

  /* ---- drill 31 ---------------------------------------------------------- */
  31: {
    verdict: "request-changes",
    reason:
      "The per-user override — the only reason `override!` exists — cannot turn a flag off, because `false` is falsy in Ruby and falls through to the shipped default. Alongside a corrupt flag file being swallowed and a query method that mutates its argument, this is a request-changes.",
    findings: [
      {
        title: "An override to `false` is discarded",
        where: "last line of `enabled?`, `@overrides[name] || @flags[name] || DEFAULTS[name]`",
        body: "`@overrides[name] || @flags[name] || DEFAULTS[name]` cannot express 'overridden to off': only `nil` and `false` are falsy, and `false || nil || DEFAULTS[name]` returns the default. `override!(\"new_search\", false)` followed by `enabled?(\"new_search\")` evaluates `false || nil || true` and returns `true`. The per-user kill switch — the reason overrides exist — works in exactly one direction, and the direction it fails in is the one you reach for during an incident. Fix: test presence, not truthiness — `return @overrides[name] if @overrides.key?(name)`, then the same for `@flags`.",
      },
      {
        title: "`tags << \"internal\"` mutates the caller's array",
        where: "`enabled?`, `tags << \"internal\" if @flags[\"internal_build\"]`",
        body: "`<<` appends in place to the array the caller passed. A handler that builds one `tags` array per request and then asks about ten flags ends up with ten copies of `\"internal\"` in it, and whatever that array feeds — a log line, a metrics label, a cache key — changes shape depending on how many flags were consulted. The method reads like a pure query and its parameter defaults to `[]`. Fix: `tags = tags + [\"internal\"]` (a new array), or take the tags as a frozen argument.",
      },
      {
        title: "A JSON `\"false\"` string turns the flag on",
        where: "`enabled?`, `@flags[name]` when the file wrote the string `\"false\"`",
        body: "Only `nil` and `false` are falsy in Ruby, so the string `\"false\"` is truthy. A flag file that writes `{\"beta_checkout\": \"false\"}` — which is what happens the moment the file is generated by a shell template, an env var dump, or a YAML-to-JSON step — enables the flag. The file says off, the code says on, and neither is wrong on its face. Fix: coerce at the boundary — parse the file into real booleans and reject a value that is neither `true` nor `false`.",
      },
      {
        title: "A malformed flag file is swallowed",
        where: "`load_flags`, `rescue Errno::ENOENT, JSON::ParserError` → `{}`",
        body: "`rescue` returns `{}` with no log line. A deploy that writes a truncated file then serves every flag from `DEFAULTS`: every experiment silently reverts to its shipped value, for every request, and the only symptom is a metrics step change with no deploy marker that explains it. The missing-file and corrupt-file cases also deserve different answers — one is a first boot, the other is a broken deploy. Fix: log and re-raise on a parse error; treat a missing file as fatal at boot rather than per call.",
      },
    ],
  },

  /* ---- drill 32 ---------------------------------------------------------- */
  32: {
    verdict: "request-changes",
    reason:
      "`static` pins the rate table to the first cart's shipping state for the life of the process, and an unclamped coupon percentage produces an order that pays the customer — two blocker defects on a money path.",
    findings: [
      {
        title: "`static` caches the table against the first state seen",
        where: "lines 22–26, `static $rates = null;` … `$rates[$state] = $rates[$state] ?? 0.0;`",
        body: "A `static` local in PHP is initialised once and then persists for the life of the process, not the call. The `$rates[$state] ?? 0.0` line therefore runs for the *first* cart only, so a later cart shipping to a state absent from `TAX` — say `'TX'` — reads an undefined key: PHP 8 emits a warning and evaluates it to `null`, `1 + null` is 1, and the cart ships untaxed. Under FPM, where the process is usually fresh, this never reproduces; under a persistent worker (Swoole, Road Runner, a queue consumer) it depends on the order carts arrive in. Fix: drop `static` — the const is already built once — and look the rate up with an explicit `array_key_exists` check that throws on an unknown state.",
      },
      {
        title: "The coupon percentage is never clamped",
        where: "line 34, `$subtotal -= $subtotal * $coupon / 100;`",
        body: "`$coupon` is whatever the caller passes. 150 makes `$subtotal` negative, tax on a negative subtotal is negative, and the method returns a negative total — an order that pays the customer. Nothing in the signature or the docblock says the value must be 0–100, and a `?int` type tells you nothing about range. Fix: reject anything outside 0..100 before applying it, and assert the total is >= 0 on the way out.",
      },
      {
        title: "`(int)` truncates a float total",
        where: "line 37, `return (int) ($subtotal * (1 + $rates[$state]));`",
        body: "`$subtotal * $coupon / 100` turns an int subtotal into a float, and `(int)` truncates toward zero rather than rounding. A cart of 1999 cents with a 10% coupon is 1799.1, taxed to 1956.61, truncated to 1956 — a cent below the correct 1957. The itemised receipt rounds each line and disagrees with this number, and the difference is a cent, which is exactly small enough for nobody to file a bug and exactly large enough for the payment processor's reconciliation to fail. Fix: stay in integer cents (`intdiv`) and round the tax with the direction stated.",
      },
    ],
  },

  /* ---- drill 33 ---------------------------------------------------------- */
  33: {
    verdict: "request-changes",
    reason:
      "Formatting runs through a `SimpleDateFormat` shared by a process-wide `object`, so request threads rendering at once interleave — and `isCurrent` both under-counts a day at 30 days and 23 hours and calls a future invoice current.",
    findings: [
      {
        title: "A shared `SimpleDateFormat` is not thread safe",
        where: "line 14, `private val ISO = SimpleDateFormat(\"yyyy-MM-dd\")`",
        body: "`SimpleDateFormat` keeps mutable parse state in an internal `Calendar`, and this one is a field of a Kotlin `object` — a process-wide singleton. Two request threads formatting at the same moment interleave writes to that calendar. The result is not an exception: it is a valid-looking date with digits from the other thread's invoice. A statement shows a date that belongs to a different customer's invoice, and it happens on a small fraction of concurrent renders, so it reads as a data problem rather than a formatting one. Fix: use `java.time.format.DateTimeFormatter`, which is immutable and thread safe, or build a `SimpleDateFormat` per call, or hold one in a `ThreadLocal`.",
      },
      {
        title: "The formatter has no time zone",
        where: "line 14, `SimpleDateFormat` with no `setTimeZone`",
        body: "`SimpleDateFormat` with no explicit zone formats in the JVM default zone, so the same `Date` — the same instant — renders as a different calendar day depending on which host does the rendering. An invoice issued at 23:30 UTC prints as the previous day on a host set to UTC-5, and `period()` then files it in the previous billing month. The statement and the ledger disagree, and which one is wrong depends on which machine rendered it. Fix: pin the zone explicitly to the one the invoice is denominated in, and make it a parameter rather than a default.",
      },
      {
        title: "The cache is keyed on the millisecond and never bounded",
        where: "lines 16 and 19, `cache.getOrPut(at.time)` on an unbounded `mutableMapOf`",
        body: "`cache.getOrPut(at.time)` keys on the exact epoch millisecond, so two renders of the same invoice share an entry only if their `Date` objects are millisecond-identical. The map is an unbounded `HashMap` written from many threads with no synchronisation, so it grows for the life of the process and a concurrent resize can lose entries or spin. Note the trap in the obvious fix: keying on the *day* makes the formatter almost never run, which masks the thread-safety defect above until production traffic finds it. Fix: drop the cache — `DateTimeFormatter.format` is cheap — or use a bounded, concurrent cache keyed on the value you actually want to reuse.",
      },
      {
        title: "The payment window is measured in fixed 24-hour days",
        where: "line 23, `(now.time - issued.time) / (1000 * 60 * 60 * 24)`",
        body: "The division truncates, so 30 days and 23 hours reports 30 and the invoice is still 'current' — the window is really 31 days. It also counts fixed 86,400,000 ms units, which is not what a calendar day is: a 30-day window spanning a spring-forward transition is an hour short of 30 calendar days, so one day a year the window closes early. The terms say 30 days; the code implements neither 30 days nor 30×24 hours. Fix: `ChronoUnit.DAYS.between` on `LocalDate`s in the invoice's zone, and decide out loud whether the bound is inclusive.",
      },
      {
        title: "A future invoice date is treated as current",
        where: "line 24, `return days <= 30`",
        body: "If `issued` is in the future, `(now.time - issued.time)` is negative, and every negative value is `<= 30`. The invoice is marked current before it has been issued, until more than 30 days after its date. Fix: require `issued <= now` and define the inclusive 30-day boundary using the invoice's billing zone.",
      },
    ],
  },

  /* ---- drill 34 ---------------------------------------------------------- */
  34: {
    verdict: "request-changes",
    reason:
      "The `EXIT` trap that removes the lock is installed *before* the lock is acquired, so a run that finds the lock held removes the running instance's lock on its way out — and reports `exit 0` while doing so, so cron never sees a problem.",
    findings: [
      {
        title: "The `EXIT` trap deletes a lock this run does not own",
        where: "line 11, `trap 'rm -f $LOCK' EXIT` — before the `if [ -f $LOCK ]` test on line 13",
        body: "Because the trap is installed first, the 'already running' branch removes a lock belonging to a live reindex on its way out. The second invocation therefore unlocks the first, and the third starts a concurrent reindex against the same directory while the first is still writing `index.new`. The script's log says 'already running' and stops, which is exactly what it is supposed to say — the damage is done by the line that runs after the `exit`. Fix: install the trap only after the lock is acquired, and have it remove the file only if the pid inside is `$$`.",
      },
      {
        title: "Check-then-act on the lock file",
        where: "lines 13 and 18, `[ -f $LOCK ]` … then `echo $$ > $LOCK`",
        body: "`[ -f $LOCK ]` and `echo $$ > $LOCK` are two operations with a gap between them. Two cron runs that fire in the same second — which happens after a host resumes from suspend, or when the previous run overran by an hour — both see no lock, both write their pid, and both reindex. The `mv` at the end then races: whichever finishes second wins, and the surviving index may be a mix of two runs' output. Fix: use an atomic primitive — `mkdir \"$LOCK\"` (fails if it exists) or, better, wrap the body in `flock -n`.",
      },
      {
        title: "Unquoted, unvalidated `$1`",
        where: "line 20, `find $DATA -name '*.idx' ...`",
        body: "`DATA` is unquoted, so a path containing whitespace is split into multiple arguments and `find` can operate on a different path than the caller supplied. With no argument at all, GNU `find` receives `-name` where it expects a starting path, prints an error, and `set -e` exits before the delete or indexer runs. Fix: `set -eo pipefail`, quote every expansion, and check `[[ -d \"$DATA\" ]]` before use so a missing directory is a loud usage error, not a different-path operation.",
      },
      {
        title: "The contended path exits 0",
        where: "line 15, `exit 0` in the 'already running' branch",
        body: "`exit 0` tells cron, and any wrapper watching the status, that the reindex succeeded. If one run wedges and holds its lock, every subsequent hourly run reports success while the index goes stale indefinitely. The one condition that most needs an alert is the one reported as healthy. Fix: exit non-zero (or emit a metric) when the lock is held, and alert on a lock older than one run interval.",
      },
    ],
  },

  /* ---- drill 35 ---------------------------------------------------------- */
  35: {
    verdict: "approve-with-comments",
    reason:
      "Correct under light load, but three majors worth of shared-state and time defects: no single-flight on a miss, a sweeper that evicts entries a concurrent render just refreshed, and a cache size the caller controls. None breaks a single request in isolation, so this is a request-changes worth filing as comments rather than a hard block.",
    findings: [
      {
        title: "No single flight: every concurrent miss renders",
        where: "`get`, lines 30–34 — drops the read guard, then each miss calls `render` and inserts",
        body: "`get` releases the read lock before taking the write lock. Fifty threads that miss at the same instant all call `render`, all take two seconds, and all insert — so a cold start or a TTL expiry on a hot key costs fifty renders instead of one, and the fiftieth writer's timestamp is the one that survives. Worse for correctness, a caller can be handed a value that is immediately replaced by a *different* render, so two requests in the same instant can see two different price tables. Fix: insert a shared `Arc<OnceCell>` (or per-key `tokio::sync::OnceCell`) under the write lock, render outside it, and let the other callers await the same cell.",
      },
      {
        title: "`sweep` removes entries it has not re-checked",
        where: "`sweep`, lines 40–46 — collects stale keys under the read lock, drops it, removes under the write lock",
        body: "`sweep` collects stale keys under the read lock, releases it, then removes them under the write lock. A key that was stale during the collect pass may have been re-rendered in the gap — which for a hot key is the common case — and `remove` throws the fresh entry away. The next `get` re-renders, so the symptom is a two-second latency spike on a key that was just populated, at an interval set by the sweeper rather than by the TTL. Fix: do the whole sweep under the write lock, or re-check `at.elapsed() >= ttl` inside the write section before removing.",
      },
      {
        title: "Unbounded map keyed on a caller-supplied string",
        where: "line 34, `entries.insert(region.to_string(), ...)` — `region` is an unvalidated `&str`",
        body: "`region` comes from the caller with no validation, and nothing caps the map's size. If `region` is ever reachable from a query parameter, an unauthenticated client can insert a distinct entry per request, each holding a rendered table, and `sweep` reclaims them only a TTL later — so the ceiling is (request rate × TTL) entries, not the dozen regions that actually exist. There is no `len` limit and no eviction policy other than age. Fix: validate `region` against the known set, and cap the map with an LRU eviction.",
      },
    ],
  },

  /* ---- drill 36 ---------------------------------------------------------- */
  36: {
    verdict: "request-changes",
    reason:
      "`Add` hands back a reference into a `std::vector` that reallocates, `Remove` shifts the vector and leaves `index_` stale so `Find` returns the wrong session, and the accessors that read both take no lock at all — three independent ways for a message to reach the wrong socket.",
    findings: [
      {
        title: "`Add` returns a reference into a vector that reallocates",
        where: "line 22, `return sessions_.back();` after line 20 `push_back`",
        body: "`sessions_.push_back` invalidates every pointer and reference into the vector whenever it grows past capacity. `Add` returns a reference to `sessions_.back()`, and the comment invites the caller to keep it and update `pending` in place. The next connection can reallocate, and that write then lands in freed memory: usually nothing visible, sometimes a corrupted heap, always at a moment unrelated to the code that caused it. It compiles, it passes a test that adds one session, and it survives until traffic exceeds the initial capacity. Fix: store `std::unique_ptr<Session>` (or use a node-based container) so addresses are stable, and return a handle or an id rather than a reference.",
      },
      {
        title: "`Remove` shifts the vector and leaves `index_` stale",
        where: "line 37, `sessions_.erase(sessions_.begin() + it->second)`",
        body: "Erasing one element moves every later element down a slot, but only the removed key is erased from `index_`. Every session added after the removed one now maps to its neighbour's slot, so `Find` returns the **wrong session** — a message is delivered to the wrong user's socket, with a right-looking id. The registry keeps working and `Count()` stays correct, so the defect scales silently with the number of disconnects that have happened. Fix: swap-and-pop and repair the moved element's index entry, or key the container on the id and keep a separate stable list.",
      },
      {
        title: "`Find`, `All` and `Count` take no lock",
        where: "lines 26–30 (`Find`), 42 (`All`), 44 (`Count`) — `mu_` is only taken in `Add` and `Remove`",
        body: "`Find` running during a `Remove`'s `erase` reads elements being shifted under it, and a `Find` during an `Add`'s reallocation reads through a dangling `data()`. `All` hands the admin page a reference to a vector that other threads resize. This defect is what the index-shift bug above hides: while `Find` is already returning wrong sessions for a structural reason, nobody attributes anything to the missing lock. Fix: lock in every accessor — `mu_` must be `mutable` for the `const` ones — and `All` must return a copy, because handing out a live reference cannot be made safe by a lock inside the accessor.",
      },
      {
        title: "A duplicate id orphans a row forever",
        where: "`Add`, lines 18–23 — `index_[id] = sessions_.size() - 1;` overwrites with no check",
        body: "`Add` never checks whether `id` is already present. A reconnect that reuses its session id pushes a second `Session` and overwrites the index entry, so the first row is unreachable: `Remove` deletes the newer one and the older one stays for the life of the process. `Count()` and the admin page keep climbing while the real connection count does not, and the leak is slow enough to read as normal growth. Fix: return an error, or the existing session, on a duplicate id, and state in the comment whether reusing an id is legal.",
      },
    ],
  },

  /* ---- drill 37 ---------------------------------------------------------- */
  37: {
    verdict: "request-changes",
    reason:
      "The retry retries on a *timeout* — the one failure mode where the charge may already have succeeded — with no idempotency key, so the customer can be charged more than once and the duplicates never reach the `Charge` table.",
    findings: [
      {
        title: "The retry is not idempotent — the customer is charged twice",
        where: "line 23, `gateway.charge(customer_id, amount)` inside `for attempt in range(attempts)`",
        body: "`gateway.charge` carries no idempotency key, so the gateway cannot tell attempt two from a second purchase. The failure this retry exists for is a *timeout*, and a timeout is precisely the case where the charge may already have succeeded — we lost the response, not the request. Three attempts can move the money three times, and because only the final `result.reference` is written, the duplicates do not exist in our own data at all. The first evidence is a chargeback. Fix: generate an idempotency key per logical charge, pass it on every attempt, and persist it *before* the first call so a retry after a crash reuses it.",
      },
      {
        title: "Every existing call site silently acquires retry behaviour",
        where: "line 14, `def charge_customer(..., attempts: int = 3)`",
        body: "The signature defaults `attempts` to 3, so every call site — including a bulk payout job — now triple-waits and triple-exposes itself to the duplicate-charge path above with no review of whether retry is safe there. And the `Charge` row is still created *after* the gateway call, outside any transaction with it, so a process death in that window moves money with no local record; the retry loop widens that window from one call to three plus the sleep. Neither an idempotency-key column nor a migration appears in this change. Fix: make the new behaviour opt-in at each call site, and write an intent row with the idempotency key before the first gateway call so a crash is recoverable.",
      },
      {
        title: "A hard decline is retried like a timeout",
        where: "line 25, `except gateway.GatewayError` is the only handler",
        body: "A hard decline almost certainly raises the same `GatewayError` class, so an insufficient-funds decline is submitted three times: the card network reads repeated declines as a fraud signal and may block the card, the customer gets three declined-payment notifications, and the call takes three extra seconds to return the answer it had immediately. This also hides the duplicate-charge bug — the easy failure to reproduce in staging is a decline, which never double-charges, so the timeout path is unexercised until production actually times out. Fix: retry only genuinely transient errors (timeout, 5xx, reset) and let terminal errors raise on the first attempt — that distinction has to live in the gateway client, not here.",
      },
      {
        title: "Blocking sleep with no jitter, in a request path",
        where: "line 27, `time.sleep(2 ** attempt)`",
        body: "`time.sleep` blocks the worker for 1 then 2 seconds, so the worst case adds three seconds to a request that is going to fail anyway — long enough for the client to time out and, if it retries, to start the whole thing over from the top. There is no jitter, so a gateway blip backs every in-flight request off by the same amount and they all return together: the recovery attempt is a synchronised thundering herd aimed at a dependency that is already unwell. Fix: randomised exponential backoff with a cap, an overall deadline, and the retry moved off the request thread.",
      },
      {
        title: "`attempts=0` raises `TypeError`, not the gateway error",
        where: "lines 20 and 28–29, `last_error` is `None` when `range(attempts)` is empty, `else: raise last_error`",
        body: "`range(0)` is empty, so the loop body never runs, the `else` clause fires, and `raise last_error` raises `None` — `TypeError: exceptions must derive from BaseException`. Any caller that threads a configured retry count through and lands on `0` to mean 'do not retry' gets a type error from inside the billing module instead of the payment error it was handling. Fix: validate `attempts >= 1`, and guard the `raise` on `last_error is not None`.",
      },
    ],
  },

  /* ---- drill 38 ---------------------------------------------------------- */
  38: {
    verdict: "request-changes",
    reason:
      "A single module-level cache slot serves the first caller's base currency to every other base for a minute; `cached!` returns `null` on a cold start; and `refreshing` is never reset if the fetch rejects, pinning the cache for the life of the process. `convert`'s `?? 1` turns any of these into a silent rate-of-parity charge.",
    findings: [
      {
        title: "The cache ignores `base`",
        where: "lines 18–19, `let cached: Rates | null` / `let refreshing`; line 25 `getRates(base)`",
        body: "`cached` is one module-level slot, but `getRates` takes a base currency. The first caller's table is served to every other base for the next minute, so `convert(amount, \"GBP\", rates)` multiplies by a GBP quote struck against EUR when the caller asked for USD. The returned object even carries the `base` field that would expose it, and `convert` never looks at it. Every number is plausible and every number is wrong by an exchange rate. Fix: key the cache on `base` (a `Map<string, Rates>`), and have `convert` assert `rates.base` matches what it was asked for.",
      },
      {
        title: "`return cached!` returns `null` on a cold start",
        where: "line 31, `return cached!;` in the `if (refreshing)` branch",
        body: "On the first requests after a deploy, `cached` is `null` and the first caller has set `refreshing = true`. Every concurrent caller takes the `if (refreshing)` branch and returns `cached!` — `null` laundered through a non-null assertion that exists only to make the compiler agree — and `convert` throws on `rates.quotes`. The cache fails hardest at exactly the moment it was added to help. Fix: share the in-flight promise, not a boolean — `let inflight: Promise<Rates> | null; return inflight ?? (inflight = fetchRates(base))`. A `!` on a field the code path can prove is `null` is the tell.",
      },
      {
        title: "`refreshing` is never reset on a rejection",
        where: "lines 34–38 — `refreshing = false` sits after `await fetchRates(base)` with no `finally`",
        body: "There is no `try/finally`. If `fetchRates` rejects, `refreshing` stays `true` for the life of the process and the `if (refreshing)` branch short-circuits every future call, so no further fetch is ever attempted. The service then serves the last successful table forever — or, on a cold start, throws forever — and the only fix is a restart. This is the defect the cold-start crash hides: the crash is loud and gets fixed first, and the obvious fix (seed `cached` with a default) converts this from a crash into a permanently stale rate table. Fix: `try { … } finally { refreshing = false }`, and alert when refreshes have been failing for N minutes rather than logging.",
      },
      {
        title: "`convert` silently falls back to a rate of 1",
        where: "line 42, `return amount * (rates.quotes[to] ?? 1);`",
        body: "Unchanged by this diff and easy to scroll past: `?? 1` treats an unknown currency as parity. An order in a currency the table does not carry — a newly supported market, a currency the gateway dropped, or the wrong-base table above — is charged its numeric amount in the base currency. 5,000 JPY becomes 5,000 USD. The change makes this worse by making a stale or wrong-base table far more likely to be what `convert` is handed. Fix: throw on an unknown currency — a missing exchange rate has no safe default.",
      },
      {
        title: "`asOf` measures rate age, not cache age",
        where: "line 26, `Date.now() - cached.asOf < TTL_MS`",
        body: "`asOf` is documented as when the rates were *struck* — the issuer's timestamp, not when we fetched them. `Date.now() - cached.asOf` therefore asks how old the quote is, not how old our copy is. A gateway that returns rates struck at the last market fix hands us a payload whose `asOf` is already older than 60 seconds, the freshness test fails on every call, and the cache — the entire point of the change — never serves a single hit while looking like it is working. Fix: record `fetchedAt = Date.now()` when the response lands and expire on that; keep `asOf` for display.",
      },
    ],
  },

  /* ---- drill 39 ---------------------------------------------------------- */
  39: {
    verdict: "request-changes",
    reason:
      "`Quote` copies the map header under the read lock and immediately releases it, so a concurrent `refresh` write is a data race the Go runtime detects and aborts on; and a failed refresh leaves the table stale by definition, so every request pays the provider's full latency aimed at an already-failing dependency.",
    findings: [
      {
        title: "The map reference escapes the read lock",
        where: "line 58, `quotes := t.quotes` — the lock is released on line 59, before `quotes[code]` is read",
        body: "`quotes := t.quotes` copies the map *header*, not the map, and the lock is released immediately after. `refresh` then writes into that same map under the write lock — and a map read concurrent with a map write is not a data race Go tolerates: the runtime detects it and aborts the process with `fatal error: concurrent map read and map write`, which no `recover` can catch. A crash loop on every refresh tick, under load, with a stack trace in the runtime rather than in this file. Fix: read the value while holding the lock (`rate, ok := t.quotes[code]` before `RUnlock`) or have `refresh` build a new map and swap the field, publishing it immutable.",
      },
      {
        title: "A failed refresh turns every request into a fetch",
        where: "lines 41–44, `refresh` logs and returns without touching `fetched`; lines 61–66 then call `t.refresh` inline on `stale`",
        body: "`refresh` logs the error and returns without updating `fetched`, so the table stays stale and `Quote`'s `stale` test is true for every subsequent request. Each one then calls `t.fetch` inline and pays its full latency. A provider outage is amplified from one request per TTL into one per *order*, aimed at a dependency that is already failing, while every handler blocks on it. The log line is one per request, so the logs are unusable for the duration. Fix: back off on failure (record the attempt time and refuse to retry within a cooldown), cap it with a circuit breaker, and serve the stale value while it is open.",
      },
      {
        title: "`refresh` merges instead of replacing",
        where: "lines 47–49, `for code, rate := range fresh { t.quotes[code] = rate }`",
        body: "The loop copies the fetched rates *into* the existing map, so a code that has disappeared upstream — a delisted currency, a pair the provider stopped quoting, a typo removed — keeps its last known rate forever. `Quote` returns it with `ok == true` and no indication that the number is from whenever it was last quoted, which could be months. The map also only ever grows. Fix: build a fresh map and assign it, so a code absent from the fetch is absent from the table.",
      },
      {
        title: "No single flight, and the cold table is stale by definition",
        where: "line 16, `fetched` is the zero `time.Time`; lines 61–65, `if stale { t.refresh(...) }`",
        body: "`fetched` is the zero `time.Time`, so `time.Since(t.fetched) > t.ttl` is true for every request that arrives before the first tick — and the first tick is a whole TTL after `Start`. Every one of those requests calls `refresh` concurrently, so a deploy under load opens N simultaneous connections to the rate provider for the same data. The same herd forms after every expiry, because nothing coordinates the refreshers. Fix: refresh once synchronously in `New` or at the top of `Start`, and gate inline refreshes through `golang.org/x/sync/singleflight`.",
      },
      {
        title: "`Quote` cannot tell the caller the rate is stale",
        where: "line 55, `func (t *Table) Quote(ctx, code) (float64, bool)` — and the `Start` goroutine, lines 30–37",
        body: "The comment promises the table is refreshed rather than serving an out-of-date rate, but when the refresh fails `Quote` returns the old value with `ok == true` and no age. A caller pricing an order has no way to decide that a rate from four hours ago is not good enough to commit to, because the signature does not carry the one fact that would let it. `Start` also leaks: the ticker is never stopped and the goroutine never selects on `ctx.Done()`, so a cancelled boot context makes every refresh fail and the goroutine lives on. Fix: return the rate's age (or an error when it exceeds a maximum), and give `Start` a `select` on `ctx.Done()` with `defer ticker.Stop()`.",
      },
    ],
  },

  /* ---- drill 40 ---------------------------------------------------------- */
  40: {
    verdict: "request-changes",
    reason:
      "`pending` is a plain `HashMap` written by request threads and drained by a scheduler, `draining` is neither volatile nor a correct guard, and a single flush exception cancels the scheduler permanently — metered usage is silently lost, and the one exception that stops all billing goes unlogged.",
    findings: [
      {
        title: "A plain `HashMap` shared by request threads and the flusher",
        where: "line 23, `private final Map<String, Long> pending = new HashMap<>()`",
        body: "`record` calls `merge` on it from request threads while `flush` iterates and removes from it. Concurrent `merge` during a resize loses entries outright or corrupts a bucket chain; iteration concurrent with a write throws `ConcurrentModificationException` *sometimes* and silently skips entries the rest of the time. Metered usage that is lost is revenue never billed, and there is no second copy anywhere that says it existed. Fix: a `ConcurrentHashMap` with `merge`, or an append-only queue the flusher drains — the aggregation has to be the single writer's job.",
      },
      {
        title: "`draining` is not `volatile`, and the guard drops events",
        where: "line 28, `private boolean draining`; line 38, `if (draining) { return; }`",
        body: "One field with two defects that conceal each other. `draining` is written by the flusher and read by request threads with no `volatile` and no lock, so there is no happens-before edge: the JIT may hoist the read out of the hot path and a request thread can go indefinitely without ever observing `true`. That is why the second defect almost never shows in testing — when the guard does fire, `record` simply `return`s, silently discarding the event instead of queueing it. Making the field `volatile` converts an invisible visibility bug into a reliable, measurable hole in the billing data every five minutes. Fix: delete the flag — correct publication is not the point; an event must never be dropped, so the map has to accept writes during a flush.",
      },
      {
        title: "The event's day and `today` come from different clocks",
        where: "line 41, `at.toLocalDate()` vs line 49 `LocalDate.now()` (and line 29)",
        body: "`at.toLocalDate()` takes the day from a `LocalDateTime` the caller built in whatever zone it was working in, while `today` is `LocalDate.now()` in the *JVM default* zone. On a host running UTC, usage at 18:00 America/Los_Angeles is already tomorrow, so it lands in the next day's bucket and is flushed a day early into a period the invoice has closed. The two zones agree for most of each day, so the daily totals are right most of the time and wrong near the boundary — which is when the batch jobs run. Fix: take an `Instant` from the caller and convert it once, explicitly, in the zone the contract bills in. Never call a `now()` that reads the default zone.",
      },
      {
        title: "One exception stops all flushing, permanently and silently",
        where: "line 33, `scheduleAtFixedRate(this::flush, ...)`; line 62 `warehouse.write(batch)` is not transactional with the remove loop at lines 63–65",
        body: "`scheduleAtFixedRate` cancels the schedule the first time the task throws, and the returned `ScheduledFuture` is discarded, so nothing logs it and nothing restarts it. The intermittent `ConcurrentModificationException` from the first defect is exactly the trigger: one occurrence and the process stops flushing for the rest of its life while `record` keeps filling a map nobody drains — an unbounded memory leak whose contents are the unbilled revenue. And `warehouse.write(batch)` is not atomic with the `pending.remove` loop: a write that throws halfway has already committed some rows and `pending` still holds them all, and a crash after a successful write double-counts them on the next flush. Fix: wrap the task in `try/catch(Throwable)` and log, keep the future and check it, and make the drain idempotent — remove only what the warehouse confirms, keyed so a replay is a no-op.",
      },
      {
        title: "`billableHours` throws the zone away before measuring",
        where: "lines 73–75, `Duration.between(from.atStartOfDay(zone).toLocalDateTime(), to.atStartOfDay(zone).toLocalDateTime())`",
        body: "`atStartOfDay(zone)` correctly resolves the instants, and `.toLocalDateTime()` immediately discards the offsets, so `Duration.between` measures wall-clock arithmetic. A period containing a spring-forward reports 24 hours for a day that had 23, and a fall-back reports 24 for a day that had 25. Every customer in a DST zone is billed for an hour that did not exist, twice a year, on an invoice line that is plausible to the hour. Fix: `Duration.between(from.atStartOfDay(zone), to.atStartOfDay(zone))` on the `ZonedDateTime`s, without the conversion — and decide whether a billing 'day' is a calendar day or 24 hours, because they are not the same thing.",
      },
    ],
  },

  /* ---- drill 41 ---------------------------------------------------------- */
  41: {
    verdict: "request-changes",
    reason:
      "Under READ COMMITTED the CTE is an unlocked `SELECT`, so twelve workers see and claim the same ten rows twice each; and the stale-lock reclaim only matches `queued` rows — but a claimed job is `running`, so a dead worker's job is never recovered.",
    findings: [
      {
        title: "No `FOR UPDATE SKIP LOCKED` — every job is claimed twice",
        where: "CTE, lines 11–17 (a plain `SELECT`), and line 23 `WHERE id IN (SELECT id FROM next)`",
        body: "The CTE is a plain `SELECT`, so under READ COMMITTED two workers running this at the same moment both see the same ten `queued` rows. The second `UPDATE` blocks on the first's row locks, and when it wakes it re-evaluates its own `WHERE` — which is an id list that is still satisfied no matter what the status now says. So it claims the same ten rows, sets `locked_by` to itself, and `RETURNING` hands the payloads to a second worker. Every job runs twice, both workers succeed, and with twelve workers the multiplier is worse than two. Fix: `SELECT id … FOR UPDATE SKIP LOCKED` in the CTE — `SKIP LOCKED` is what makes this a queue rather than a convoy.",
      },
      {
        title: "The stale-lock reclaim is dead code",
        where: "line 14, `AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')` under `WHERE status = 'queued'` (line 13)",
        body: "The reclaim clause only matches rows where `status = 'queued'`, but claiming a row sets `status = 'running'`. So a job whose worker was OOM-killed sits at `running` with a `locked_at` from an hour ago and is never selected again by anything: the clause that exists to recover it can never see it. Jobs leak out of the queue permanently, one per worker death. This is invisible while the double-claim above is present — while every job is being claimed repeatedly, something always picks the work up anyway, so nothing appears stuck. Fix: `status = 'queued' OR (status = 'running' AND locked_at < NOW() - '5 minutes')`, and make the reclaim visible — count it, alert on it, cap it with `attempts`.",
      },
    ],
  },

  /* ---- drill 42 ---------------------------------------------------------- */
  42: {
    verdict: "request-changes",
    reason:
      "`buckets` is a plain object keyed by an attacker-controlled API key, so a key of `__proto__` writes `NaN` onto `Object.prototype` — corrupting every object in the process — and that key is then limited to zero requests forever.",
    findings: [
      {
        title: "A key of `__proto__` poisons every object in the process",
        where: "line 11, `let bucket = buckets[key];` — `key` is the caller's API key",
        body: "`buckets` is `{}`, so it inherits from `Object.prototype` and property lookup finds inherited names. A request whose API key is `__proto__` makes `buckets[key]` resolve to `Object.prototype`: `bucket.count++` writes `NaN` onto `Object.prototype`, so every object in the process now has an enumerable `count` property and every `for...in` visits it. `NaN <= max` is `false`, so that key is limited to zero requests forever. `constructor`, `toString` and `valueOf` behave the same way, and the input is attacker-controlled. Fix: `const buckets = new Map()` — or `Object.create(null)` at minimum — and validate the key's format before it is used as a property name.",
      },
      {
        title: "A fixed window, documented as rolling, allows 2× the limit",
        where: "line 13, `if (!bucket || now - bucket.start > windowMs)`",
        body: "The docstring says rolling; the code resets the whole bucket once `windowMs` has elapsed since its start. A caller can send `max` requests in the last millisecond of one window and `max` more in the first millisecond of the next, so the real ceiling across any window-sized interval is `2 × max`. The published limit is a number the implementation cannot hold, and the caller most likely to find that out is the one hammering you. Fix: a sliding window (keep timestamps, or two weighted counters) or a token bucket with a refill rate — and make the documented number the one the code enforces.",
      },
      {
        title: "`for...in` in `sweep` walks the prototype chain",
        where: "line 31, `for (const key in buckets)`",
        body: "`for...in` visits inherited enumerable properties. Once the defect above has put `count` on `Object.prototype`, `sweep` visits it, `buckets[\"count\"]` is `NaN`, and the sweep either misses real buckets or throws — inside a timer callback, where the rejection is swallowed and the sweeper stops, leaving the table to grow without bound. Separately, `for...in` visits integer-like keys in ascending numeric order rather than insertion order. Fix: `Object.entries(...)` / `Map#forEach`, and a `try/catch` around any timer-callback body.",
      },
      {
        title: "The window is measured on the wall clock",
        where: "lines 10 and 13, `Date.now()`",
        body: "`Date.now()` is subject to NTP correction, a manual clock change and a VM's clock resync after a live migration. A backwards step larger than `windowMs` makes `now - bucket.start` negative, so `> windowMs` is false and no bucket in the process ever resets again: every key is stuck at whatever count it had reached, and every caller over the limit stays over it. `retryAfter` returns a negative number in the same situation, which serialises into a `Retry-After` header clients handle in whatever way they feel like. Fix: measure elapsed time from a monotonic source (`performance.now()` or `process.hrtime.bigint()`), and clamp `retryAfter` to `>= 0`.",
      },
      {
        title: "One shared table, per-call limits",
        where: "line 9, `allow(key, max = 100, windowMs)` vs line 6, `const buckets` — no record of which limit produced an entry",
        body: "`max` and `windowMs` are arguments, but `buckets` is module state with no record of which limit produced an entry. Two call sites with different limits — a 100/minute public route and a 10/minute export route — share one bucket per key: whichever created the bucket set the window boundary, each then compares the shared count against its own `max`, and the export route's budget is consumed by public traffic. The signature promises per-call configuration the storage cannot represent. Fix: key on `(limit, key)`, or pass a limiter instance configured once per route rather than the limits per call.",
      },
    ],
  },

  /* ---- drill 43 ---------------------------------------------------------- */
  43: {
    verdict: "request-changes",
    reason:
      "`footer = []` is a class attribute, so `self.footer.append` writes into a list shared by every `DigestBuilder` in the process — one cross-tenant data leak in an email that a single-account test cannot see.",
    findings: [
      {
        title: "`footer` is a class attribute, and the digest leaks across accounts",
        where: "line 15, `footer = []`; line 39, `self.footer.append(...)`",
        body: "`self.footer.append` resolves `footer` on the *class* and mutates that list in place — no instance attribute is ever created. Every `DigestBuilder` in the process shares one list, so the second account's digest ends with two footer lines, the five-hundredth ends with five hundred, and each one names another customer's email address. A cross-tenant data leak, in an email, that a unit test building a single digest cannot see. The `if sections is None` guard three lines earlier is what makes a reviewer believe this author knows about mutable shared defaults. Fix: build the footer in `__init__` as `self.footer = []`, or better, return a fresh list from a method.",
      },
      {
        title: "`sections` is mutated when the caller does pass one",
        where: "line 37, `sections.append(self._render(event))` — the guard at line 27 only protects the default",
        body: "The `is None` guard protects the default but not the argument. A caller that builds a list of shared header blocks once and passes it for every account has that list appended to on every call, so account N's digest contains every event and footer from accounts 1..N-1. This also conceals the class-attribute defect above: while the caller's list is growing, the footer growing too is indistinguishable from it, and fixing this one is what isolates the class attribute as a separate cause. Fix: `sections = list(sections) if sections else []` — copy on the way in — and say in the docstring the argument is not modified.",
      },
      {
        title: "A naive local `now` against naive UTC timestamps",
        where: "line 30, `now = now or datetime.now()`, compared to `e.created_at` (naive UTC per the docstring)",
        body: "`datetime.now()` is the server's local wall clock with no tzinfo, and `event.created_at` is naive **UTC** — the docstring says so, and `_render` confirms it by localizing to UTC. The comparison does not raise, because both sides are naive; it is simply wrong by the host's UTC offset. On a host in UTC-7, `since` is seven hours later than intended and the digest silently omits the oldest hours of the day it claims to cover. In CI, where the host is UTC, the window is exactly right and the defect does not exist. Fix: `datetime.now(timezone.utc)` and make every timestamp in the system aware; if timestamps must be naive at the storage layer, convert once at the boundary.",
      },
      {
        title: "`localize` applied to a UTC instant in `next_run`",
        where: "lines 50–51, `now = now or datetime.utcnow()` then `local = self.tz.localize(now)`",
        body: "`datetime.utcnow()` returns a naive datetime holding UTC wall time, and `self.tz.localize(now)` *asserts* that the naive value is already local time in `self.tz`. So a UTC instant is relabeled as Tokyo wall time, nine hours off, and the '07:00 local' computed is 07:00 on the wrong day for anyone far enough east or west. `build` defaults to `datetime.now()` while `next_run` defaults to `datetime.utcnow()`, so the two methods of the same class do not even agree on what `now` means. Fix: `datetime.now(pytz.utc).astimezone(self.tz)` — convert, never `localize`, a value that is already an instant.",
      },
      {
        title: "`replace` on a pytz datetime keeps the old DST offset",
        where: "line 51, `.replace(hour=7, minute=0, second=0)`",
        body: "This is pytz's documented trap: a localized datetime carries the offset in force at *that* moment, and `.replace` changes the fields while keeping that tzinfo. Across a DST boundary the result is tagged with the old offset, so `astimezone(pytz.utc)` produces an instant an hour away from 07:00 local and the digest goes out an hour early or late for the account. `replace` also leaves `microsecond` alone, so the `<=` comparison on line 52 can flip on a sub-second difference. Fix: `self.tz.normalize(local)` after any arithmetic or `replace`, or move to `zoneinfo`.",
      },
      {
        title: "The window has no upper bound",
        where: "line 33, `recent = [e for e in events if e.created_at > since]`",
        body: "`e.created_at > since` filters the old end and nothing filters the new one. An event with a timestamp in the future — clock skew on a producing service, or a scheduled item stored with its target time — is newer than `since` on every run, so it appears in that account's digest every single day until the future catches up. Fix: `since < e.created_at <= now`, and reject a `created_at` beyond a small tolerance at the write path.",
      },
    ],
  },

  /* ---- drill 44 ---------------------------------------------------------- */
  44: {
    verdict: "request-changes",
    reason:
      "The `setInterval` callback closes over `body` from the first render — so it PUTs the pre-edit document over the server copy — and it clears `dirty` only after the PUT resolves, dropping every keystroke that arrives while the request is in flight.",
    findings: [
      {
        title: "The interval saves the document the user started from",
        where: "line 26, `body: JSON.stringify({ body })` inside an effect with `[]` as its dependency list (line 34)",
        body: "The effect has `[]` as its dependency list, so the callback passed to `setInterval` closes over `body` from the first render forever — `initial`. `dirty.current` flips true on the first keystroke, the PUT fires, and it sends the original text. The server copy is overwritten with the pre-edit document, the request returns 200, and the UI updates to 'saved'. Everything the user typed is destroyed, and the interface confirms it was saved. Note the author reached for `useRef` for `dirty` precisely because refs escape the closure — and then read `body` from the closure anyway. Fix: hold the text in a ref and read the ref inside the interval, or list `body` in the dependencies and accept the interval being recreated per change.",
      },
      {
        title: "`dirty.current = false` after the `await` loses edits",
        where: "line 21 reads `dirty.current`; line 29 clears it, after the `await fetch` at line 23",
        body: "The flag is read at the top of the callback and cleared *after* the PUT resolves. Every keystroke that lands while the request is in flight sets it to true, and the completion then clears it — those characters are marked clean and will never be sent. A slow network widens the window: a 500 ms round trip means roughly half a second of typing is silently dropped on every save cycle. This is hidden while the stale-closure defect above is present, because nothing the user types is ever sent at all. Fix: snapshot the body and clear the flag *before* the request, re-set it if the request fails, and compare a saved-version marker rather than a boolean.",
      },
      {
        title: "The fetch result is never checked, and a rejection is swallowed",
        where: "lines 23–30, `await fetch(...)` with no `res.ok` check and no `try/catch`",
        body: "`await fetch(...)` is not inspected, so a 401 after a session expiry, a 409 from a concurrent editor and a 413 on a large document all fall straight through to `setSavedAt(Date.now())` and the label says 'saved'. And a network failure *rejects*: the async callback returned from `setInterval` produces a promise nobody holds, so the rejection is unhandled with no log the user sees, `dirty.current` is never cleared, and the UI still shows the last successful time — steadily older while the user keeps typing into a document that is not being saved. Fix: check `res.ok`, wrap in `try/catch`, and surface a real state — 'saving', 'saved at T', 'failed — retrying'. Never report success on an unexamined response.",
      },
      {
        title: "Nothing resets on a new document, and nothing saves on unmount",
        where: "the effect's `[]` dependency list (line 34) and cleanup `return () => clearInterval(timer)` (line 33)",
        body: "Outside the changed lines, and the reason a diff review is worth paying for. `docId` is read from the closure of an effect with no dependencies, so navigating from document A to document B — without a `key` forcing a remount — keeps A's `body` in state *and* keeps PUTing to A's id: edits to B are written over A. `body` is also initialised from `initial` only on mount, so a changed `initial` prop is ignored. And the cleanup only clears the interval: up to three seconds of typing since the last tick is discarded on every navigation and tab close — the exact problem this change was written to solve. Fix: key the component on `docId`, and flush a final save in the cleanup and on `visibilitychange`.",
      },
      {
        title: "`setInterval` does not wait for the previous save",
        where: "line 20, `setInterval(async () => { … await fetch … }, AUTOSAVE_MS)`",
        body: "The interval fires every three seconds regardless of whether the last PUT has returned. A save slower than that overlaps the next one, and two in-flight PUTs can land in either order, so an older body can be written after a newer one. With no version or sequence number on the request the server cannot detect it and last-write-wins does the wrong thing. This defect is masked while the stale-closure bug above is present. Fix: chain with `setTimeout` after each save completes, and send a version the server can reject with a 409 on a stale write.",
      },
    ],
  },

  /* ---- drill 45 ---------------------------------------------------------- */
  45: {
    verdict: "request-changes",
    reason:
      "Nothing ever sets `inflight` back to `null`, so the first mint's promise is memoised for the life of the process — the first expired token is returned forever, and a mint that rejects at boot poisons every outbound call until a restart.",
    findings: [
      {
        title: "`inflight` is never cleared, so the first token is the only token",
        where: "lines 33–35, `if (!this.inflight) this.inflight = this.mint();` — with no assignment to `null` anywhere",
        body: "Nothing ever sets `inflight` back to `null`. The first mint's promise is memoised for the life of the process, so once the token passes its expiry the freshness test at line 29 fails, `if (!this.inflight)` is false, and `await this.inflight` resolves the *original, expired* token — forever. Every outbound call then presents an expired credential and every downstream starts returning 401 about an hour after each deploy, from a process that is otherwise healthy. No test run lasts longer than a token lifetime, so this is invisible until it is in production, where it looks like an identity-provider problem. Fix: `try { return await this.inflight } finally { this.inflight = null }` — and clear it in `invalidate` too.",
      },
      {
        title: "A rejected mint is cached and replayed forever",
        where: "lines 33–38, `await this.inflight` with no `finally` — a thrown promise remains the stored one",
        body: "If `mint()` rejects, the rejected promise stays in `inflight` and every subsequent caller awaits the same one, so a single transient failure at boot — a DNS blip, the identity provider restarting — permanently poisons the token source. Worse for diagnosis, each caller receives the *original* error, so the message, the stack and any correlation id point at a request that completed minutes or hours ago. This is the defect that gets found in staging, because a mint failure is easy to inject — and clearing `inflight` only on rejection leaves the expired-token defect above completely intact, because the success path still never clears it. Fix: the same `finally`. One `finally` fixes both; a `catch` fixes only the one you were looking at.",
      },
      {
        title: "`invalidate()` does not clear `inflight`",
        where: "lines 43–45, `invalidate()` sets only `this.token = null`",
        body: "`invalidate` is the 401 handler: its whole purpose is to force a fresh mint. It clears `token` and leaves `inflight`, so the next `get()` skips the freshness test, finds `inflight` truthy, and returns the very token the downstream just rejected. The caller retries, gets another 401, invalidates again, and receives the same token — a tight loop against the downstream with a rejected credential, which is how a single revoked key becomes a rate-limit ban. Fix: `invalidate() { this.token = null; this.inflight = null; }`, and cap the caller's retry at one.",
      },
      {
        title: "A late joiner re-caches a token that was already rejected",
        where: "line 38, `this.token = token` — unconditionally after `await this.inflight`",
        body: "`this.token = token` runs unconditionally after the await, for every caller. A caller that joined a mint started *before* an `invalidate()` completes afterwards and writes that token back into `this.token`, resurrecting the credential the 401 handler had just discarded. Concurrency turns `invalidate` from a guarantee into a suggestion, and which of the two effects wins depends on request timing. Fix: tag each mint with a generation counter, bump it in `invalidate`, and only store the result if the generation still matches.",
      },
      {
        title: "Expiry is checked against the issuer's wall clock",
        where: "line 29, `this.token.expiresAt - this.skewMs > this.clock.now()`",
        body: "`clock: Clock = Date` means `Date.now()`, the local wall clock, compared against an `expiresAt` that came from the issuer. If that value was derived from a JWT `exp` claim it is on the *issuer's* clock, and the 30-second skew budget is applied in one direction only: a host running a minute behind considers an expired token live and presents it, while a host running ahead merely mints early. Clock drift of a minute is ordinary on a VM that has not resynced, and nothing in the type says which clock `expiresAt` belongs to. Nothing validates the minted token either — a `mint` that returns an `expires_in` misread as seconds-instead-of-milliseconds produces an already-expired token, which the first defect above then pins in place forever. Fix: compute `expiresAt` from our own clock at the moment the response lands, give the skew a realistic margin, and reject a token already past expiry.",
      },
    ],
  },

  /* ---- drill 46 ---------------------------------------------------------- */
  46: {
    verdict: "request-changes",
    reason:
      "The report is changed to read `net_cents`, but no writer sets it — the unchanged `INSERT` leaves every new sale at the migration's `DEFAULT 0`, so post-deploy sales vanish from revenue. The query also uses `<= :next_day_start`, double-counting midnight in the adjacent report.",
    findings: [
      {
        title: "The unchanged writer never populates net revenue",
        where: "`sales/insert.sql` (unchanged) writes only `gross_cents, refund_cents`; `migrations/042-net.sql` adds `net_cents BIGINT NOT NULL DEFAULT 0`",
        body: "`sales/insert.sql` still writes only `gross_cents` and `refund_cents`. A new 10000-cent sale with no refund therefore receives `net_cents = 0` from the migration's default. The one-time backfill makes historical reports look correct, but every sale created after deployment silently disappears from revenue totals — the migration makes existing rows look fine and papers over the fact that the writer was never updated. Fix: make `net_cents` a generated column, or update every insert/update path to maintain it transactionally; and test a sale created *after* the migration, not only migrated fixtures.",
      },
      {
        title: "Adjacent reports both include midnight",
        where: "`reports/revenue.sql`, `WHERE sold_at >= :day_start AND sold_at <= :next_day_start`",
        body: "The boundary is `sold_at <= :next_day_start`, which is closed on the right. A sale at exactly `2026-01-02 00:00` (the next day's start) appears in *both* the Jan 1 and the Jan 2 totals. Each daily report also looks correct on its own, so the double-count only shows up when adjacent days are compared. Fix: keep the half-open interval `sold_at >= :day_start AND sold_at < :next_day_start`, and verify adjacent daily totals against their combined interval.",
      },
    ],
  },

  /* ---- drill 47 ---------------------------------------------------------- */
  47: {
    verdict: "request-changes",
    reason:
      "The existing exporter still sends `offset` and never reads `after`, so the new handler — which ignores `offset` — hands it the first page forever; and a `created_at`-only cursor skips every order tied at a page boundary.",
    findings: [
      {
        title: "The existing exporter loops over the first page forever",
        where: "`clients/export.py` (unchanged) sends `offset` and never reads `after`; `api/orders.py` (changed) ignores `offset` and returns `after`",
        body: "`clients/export.py` sends `offset` and never reads `after`. The new handler ignores `offset` entirely, so a non-empty dataset returns the same first page on every request; the loop `offset += len(rows)` advances an offset the server has already forgotten, and the export silently re-emits the first 100 orders until it is killed or hangs — a hang that looks like a slow export. Keeping `items` in place preserved the response *shape* but not the pagination *contract*. Fix: migrate the exporter to the new cursor protocol with an explicit completion rule, or version the endpoint and retain `offset` support for existing clients; and test two successive requests through the actual exporter.",
      },
      {
        title: "A timestamp cursor skips tied orders",
        where: "`api/orders.py`, `WHERE created_at > %s … ORDER BY created_at LIMIT 100`; `schema/orders.sql` allows repeated `created_at`",
        body: "`schema/orders.sql` permits repeated `created_at` values and says imports assign one timestamp to the whole batch. With 101 orders sharing one timestamp, `LIMIT 100` returns only 100; the next `created_at > cursor` filter skips the remaining order permanently, because its `created_at` equals the cursor and `>` excludes it. Updating the exporter alone does not make the export complete — the ordering key itself is the problem. Fix: order by `(created_at, id)`, carry both in the cursor, and filter strictly after that pair; test a tied batch larger than one page.",
      },
    ],
  },

  /* ---- drill 48 ---------------------------------------------------------- */
  48: {
    verdict: "request-changes",
    reason:
      "The helper now takes seconds (`ttlSeconds * 1000`), but the unchanged `sessions.ts` still passes `SESSION_TTL_MS = 900000` — so a fifteen-minute session is extended to about ten days. The type checker accepts the security regression because both arguments are numbers.",
    findings: [
      {
        title: "Session expiry becomes a thousand times longer",
        where: "`sessions.ts` (unchanged), `put(\"session:\" + token, userId, SESSION_TTL_MS)` feeding `cache.ts`'s `Date.now() + ttlSeconds * 1000`",
        body: "`sessions.ts` still supplies `SESSION_TTL_MS = 900000` to `put`. The changed helper multiplies its argument by 1000 on the assumption it is now in seconds, so a fifteen-minute session stays valid for about 10.4 days. Both arguments are numbers, so the type checker accepts the security regression, and reviewing only the updated search caller misses it entirely. (Note: the search caller's `Number(env.SEARCH_TTL_SECONDS) || 60` correctly preserves the documented zero setting — zero is a valid, explicit duration, not a falsy default.) Fix: migrate *every* caller atomically, or introduce `putSeconds` as a distinct API while preserving the old contract; give durations distinct types, and verify the session is absent after fifteen minutes.",
      },
    ],
  },

  /* ---- drill 49 ---------------------------------------------------------- */
  49: {
    verdict: "request-changes",
    reason:
      "`Boolean(\"false\")` is `true`, so the documented 'off' setting — and omission — both enable the retry path; and the retry re-POSTs a debit the ledger may already have committed, charging twice with no deduplication.",
    findings: [
      {
        title: "Retrying a committed debit charges twice",
        where: "`worker.ts`, `catch (error) { … await debit(account, cents); }` — `ledger.ts` documents one debit per POST with no deduplication",
        body: "`ledger.ts` applies one debit per POST and provides no deduplication, and documents that a network failure may arrive *after* the server commits. If the first request commits but its response is lost, `fetch` rejects with a `TypeError` (network-level), `worker.ts` passes that error and issues a second POST — and a 2500-cent charge can debit 5000 cents while `charge` resolves successfully. This is the classic retry-without-idempotency defect, and it fires exactly on the failure this feature exists to handle. Fix: give the logical charge a stable idempotency key and enforce deduplication at the ledger across all attempts, or reconcile the uncertain outcome before retrying; and test a committed first request followed by a lost response.",
      },
      {
        title: "The disabled flag enables the new branch",
        where: "`config.ts`, `retryWrites: Boolean(env.RETRY_WRITES ?? \"false\")`",
        body: "`Boolean(\"false\")` is `true` because the string is non-empty — `Boolean` on a non-empty string is always `true`. So both `RETRY_WRITES=\"false\"` and an omitted setting enable retries, and the operator cannot keep the previous behavior with the documented 'off' value. The supposedly gated path runs *before* rollout approval, which is precisely what a rollout flag is for. Fix: parse the explicit string values (`env.RETRY_WRITES === \"true\"`), default an absent setting to `false` rather than `\"false\"`-coerced-to-true, and verify the false/true/absent configurations.",
      },
    ],
  },

  /* ---- drill 50 ---------------------------------------------------------- */
  50: {
    verdict: "approve",
    reason:
      "I checked all three things a reviewer is told to verify — awareness, conversion, and the equality boundary — before approving. The tempting finding, the classic naive `datetime` against a UTC timestamp (drill 4's defect), is already handled: `now.utcoffset() is None` is rejected and both sides are normalised with `astimezone(timezone.utc)` before the `>=` comparison, so an offset difference or a daylight-saving fold cannot slip through. Missing expiry fails closed (`return True`), which is the stated contract, and `ValueError` on a naive input is the documented caller obligation, not a bug in the code under review. Approve.",
    findings: [],
  },

  /* ---- drill 51 ---------------------------------------------------------- */
  51: {
    verdict: "approve",
    reason:
      "I traced which list each `append` reaches, including two consecutive default calls, before approving. The mutable-default finding this one is a stand-in for (drill 43's `footer = []`) does not apply: `tags_for` copies the default into `result` via `copy()` and appends to that copy, and the elements are immutable strings, so a shallow copy is enough. Call twice and mutate a returned list, and both the default and the caller's original list remain unchanged. Sharing a value and mutating it are different operations, and this one mutates only its own copy. Approve.",
    findings: [],
  },

  /* ---- drill 52 ---------------------------------------------------------- */
  52: {
    verdict: "approve",
    reason:
      "I traced lengths 0, `size`, and `size + 1` before approving. `range(0, len(items), size)` excludes the empty-tail case — an exact multiple produces no empty final chunk, an empty input produces no chunks, and the last slice carries a short remainder — while `size <= 0` fails fast with a clear `ValueError`. Nothing is skipped or duplicated and the input list is not mutated. The off-by-one this is a stand-in for (a slice that emits an empty tail or drops a remainder) does not arise because the stop and the step are both derived from `size`. Approve.",
    findings: [],
  },

  /* ---- drill 53 ---------------------------------------------------------- */
  53: {
    verdict: "approve",
    reason:
      "I confirmed this is a read, not a write, before approving — which is the whole distinction from drill 37. `fetch` reads an immutable snapshot with no side effects, so retrying it is safe. Only `TransportTimeout` is retried and a permanent error propagates on its first attempt; `attempts` outside 1..3 raises early, and a timeout on the final attempt re-raises rather than swallowing. Demanding payment-style idempotency here would be a false positive: there is no charge to duplicate. Approve.",
    findings: [],
  },

  /* ---- drill 54 ---------------------------------------------------------- */
  54: {
    verdict: "approve",
    reason:
      "I established the representation before approving, which is the point of drill 32's float-truncation warning not applying here. `0.25` is exactly representable in binary, and with at most 1000 counts of at most 1000 the largest intermediate sum is 250,000 dollars — a multiple of a quarter well within exact range for a `float`. There is no tax, rounding, or currency conversion in scope, so the general float-representation warning does not establish a defect in this domain. Reject a finding I could not produce a failing input for; approve.",
    findings: [],
  },

  /* ---- drill 55 ---------------------------------------------------------- */
  55: {
    verdict: "approve",
    reason:
      "I traced two bases and two snapshots through the cache key, then inspected the returned value, before approving. The stale-base and escaped-mutable findings this one is a stand-in for (drill 38's defects) are avoided: the key includes both `base` and the full immutable rate tuple, so a refresh changes the key and cannot serve one base's rates to another; the returned `tuple` of strings is immutable, so nothing escapes mutable; and `lru_cache(maxsize=128)` bounds the table. Duplicate concurrent renders are explicitly acceptable per the docstring. Approval is warranted once the key and ownership are established, and both are.",
    findings: [],
  },

  /* ---- drill 56 ---------------------------------------------------------- */
  56: {
    verdict: "approve",
    reason:
      "I inventoried every duration argument and every unchanged caller across the file boundary before approving — which is exactly what drill 48 gets wrong, and this rollout does it right. Both writers move from milliseconds to seconds in the same atomic change (`rememberSession` from `15 * 60 * 1000` to `15 * 60`, `cacheSearch` from `(…) * 1000` to a bare number), so a fifteen-minute session still gets 900 seconds and is multiplied once, not a thousand times over. An explicit zero is preserved because the default tests `ttl === undefined` rather than truthiness, and `get` treats `expiresAt > Date.now()` as live, so expiry is clean. With all writers converted and readers passing no duration, the mirror of drill 48's defect is absent. Approve.",
    findings: [],
  },

  /* ---- drill 57 ---------------------------------------------------------- */
  57: {
    verdict: "approve",
    reason:
      "I placed one row exactly at each endpoint and compared adjacent days before approving. The new boundary `sold_at >= :day_start AND sold_at < :next_day_start` is half-open, so adjacent windows partition the rows with neither a dropped nor a double-counted midnight — the precise fix for drill 46's `<=`. This change does not introduce a stored column, so there is no missing-writer migration to request, and an empty report still returns zero via `COALESCE`. Approval is the right verdict: the boundary is correct end-to-end.",
    findings: [],
  },

  /* ---- drill 58 ---------------------------------------------------------- */
  58: {
    verdict: "approve-with-comments",
    reason:
      "The maximum logic is correct and is not a defect: it seeds from the first element, so an all-negative input returns the largest value (not `0` as drill 8's seeded accumulator would), and empty input raises `ValueError` exactly as the caller expects. The only thing I found is in the docstring, which still says 'smallest' — a nonblocking correction, not a reason to change the algorithm.",
    findings: [
      {
        title: "The docstring says 'smallest'; the function returns the largest",
        where: "line 2, docstring `Return the smallest value;`",
        body: "For `[-9, -2]` it correctly returns `-2`, and the name, ticket, and behavior all agree on 'largest' — only the copied docstring word is wrong, and it misleads a reader, not a caller. This is a documentation nit to fix before it propagates into the next function that shares this comment; it does not justify requesting changes to the algorithm, which is correct. Approve with the one-word correction.",
      },
    ],
  },

  /* ---- drill 59 ---------------------------------------------------------- */
  59: {
    verdict: "approve-with-comments",
    reason:
      "On sorted input the helper is correct, and that is what the sample establishes: `bisect_left` lands before the first timestamp `>= cutoff`, so every event at or after the cutoff — including ties — is included in the slice. The precondition `bisect_left` *requires* — ascending order — is not stated anywhere in the submitted context, and nothing in the sample proves the producer supplies it. So this is a contract question to be asked and documented, not a defect to assert on an invented unsorted input.",
    findings: [
      {
        title: "The ascending-order precondition for `bisect_left` is not documented",
        where: "line 6, `return events[bisect_left(events, cutoff):]`",
        body: "`bisect_left` assumes a sorted sequence; on a genuinely unsorted input it can return a suffix that omits eligible events, so a missing guarantee would be a real bug. But nothing in this review establishes that the producer can supply unsorted order, and an unsorted counterexample only proves the need for a precondition, not a confirmed failure — asserting data loss here would be overclaiming. The right response is to state that the event producer guarantees ascending timestamps and link that guarantee in the docstring. Approve with that comment once the contract is on record.",
      },
    ],
  },
};

export const MODEL_REVIEWS: Record<number, ModelReview> = REVIEWS;
export function modelReview(id: number): ModelReview | undefined {
  return REVIEWS[id];
}
