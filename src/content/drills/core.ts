import type { Drill } from "../../types";

import s01 from "../samples/01-paginate.py?raw";
import s02 from "../samples/02-median.js?raw";
import s03 from "../samples/03-evict.py?raw";
import s04 from "../samples/04-expiry.py?raw";
import s05 from "../samples/05-sync.ts?raw";
import s06 from "../samples/06-orders.sql?raw";
import s07 from "../samples/07-seat.js?raw";
import s08 from "../samples/08-max.rs?raw";
import s09 from "../samples/09-email.py?raw";
import s10 from "../samples/10-batch.py?raw";
import s11 from "../samples/11-fetchall.go?raw";
import s12 from "../samples/12-discount.java?raw";
import s13 from "../samples/13-largeorders.cs?raw";
import s14 from "../samples/14-backup.sh?raw";
import s15 from "../samples/15-retry.py?raw";
import s16 from "../samples/16-shipping.py?raw";
import s17 from "../samples/17-getuser.diff?raw";
import s18 from "../samples/18-merge.diff?raw";
import s19 from "../samples/19-search.jsx?raw";
import s20 from "../samples/20-window.cpp?raw";
import s21 from "../samples/21-coupon.rb?raw";
import s22 from "../samples/22-token.php?raw";
import s23 from "../samples/23-config.kt?raw";
import s24 from "../samples/24-enrich.ts?raw";
import s25 from "../samples/25-pool.go?raw";
import s26 from "../samples/26-revenue.diff?raw";
import s27 from "../samples/27-poll.jsx?raw";
import s28 from "../samples/28-pricing.diff?raw";
import s29 from "../samples/29-report.java?raw";
import s30 from "../samples/30-uploader.cs?raw";

const t = (s: string) => s.replace(/\s+$/, "");

export const DRILLS_CORE: Drill[] = [
  {
    id: 1,
    slug: "pagination-helper",
    lang: "Python",
    level: "Warm-up",
    title: "Pagination helper",
    shape: "function",
    code: t(s01),
    hintRegion:
      "Look at what happens for the values of `page` a real API caller would send.",
    hintFamily: "Two families: Contract and Boundaries.",
    defects: [
      {
        family: "contract",
        title: "Ambiguous page indexing",
        signal: "silent",
        severity: "major",
        body:
          "The docstring does not define whether page is zero- or one-based. The implementation is zero-based: page=0 returns the first page, while page=1 returns the second. A caller using one-based page numbers skips the first 20 items. State and enforce one convention.",
        fix: "Pick a convention, state it in the docstring, and subtract 1 if 1-indexed.",
      },
      {
        family: "boundary",
        title: "Negative page silently returns real data",
        signal: "silent",
        severity: "major",
        body:
          "page=-2 produces start=-40 and end=-20; Python interprets these as offsets from the end, so a request intended to be invalid returns an earlier slice of the collection. The caller gets plausible but unrelated results instead of a 400.",
        fix: "Validate page >= 1 (or >= 0) and per_page > 0 before slicing.",
      },
    ],
  },
  {
    id: 2,
    slug: "median-response-time",
    lang: "JavaScript",
    level: "Warm-up",
    title: "Median response time",
    shape: "function",
    code: t(s02),
    hintRegion: "Follow the sort operation through with even and odd input.",
    hintFamily: "Silent coercion, Shared state, Boundaries.",
    defects: [
      {
        family: "coercion",
        title: "Default sort is lexicographic",
        signal: "silent",
        severity: "major",
        body:
          "Array.prototype.sort() with no comparator converts elements to strings. [10, 9, 100] sorts to [10, 100, 9], so the median of a latency array is wrong whenever values differ in digit count — which for response times is always. Returns a plausible number, never throws.",
        fix: "times.sort((a, b) => a - b)",
      },
      {
        family: "state",
        title: "Mutates the caller's array",
        signal: "silent",
        severity: "major",
        body:
          "sort() sorts in place and returns the same reference, so `const sorted` is not a copy. The caller's array is silently reordered. If they were relying on chronological order — likely, for response times — downstream code breaks in a way that looks unrelated to this function.",
        fix: "const sorted = [...times].sort((a, b) => a - b)",
      },
      {
        family: "boundary",
        title: "Empty input returns NaN",
        signal: "silent",
        severity: "major",
        body:
          "Length 0 takes the even branch: sorted[-1] and sorted[0] are both undefined, so it returns NaN. That NaN then propagates silently through any dashboard or alerting arithmetic downstream.",
        fix: "Guard for empty and decide explicitly: throw, or return null.",
      },
    ],
  },
  {
    id: 3,
    slug: "cache-eviction",
    lang: "Python",
    level: "Warm-up",
    title: "Cache eviction",
    shape: "function",
    code: t(s03),
    hintRegion: "This function passes tests where no entry is stale.",
    hintFamily: "Shared state and Boundaries.",
    defects: [
      {
        family: "state",
        title: "Mutating a dict during iteration",
        signal: "loud",
        severity: "blocker",
        body:
          "del cache[key] inside `for ... in cache.items()` raises RuntimeError: dictionary changed size during iteration. The reason this survives review is that it only fires when something is actually stale — a unit test with fresh entries passes cleanly, and it blows up in production the first time the TTL elapses.",
        fix: "Iterate over a snapshot: for key, entry in list(cache.items())",
      },
    ],
  },
  {
    id: 4,
    slug: "token-expiry",
    lang: "Python",
    level: "Standard",
    title: "Token expiry check",
    shape: "function",
    code: t(s04),
    hintRegion:
      "Four words of code, three problems. Think about what utcnow() actually returns.",
    hintFamily: "Time & concurrency, Contract, Failure surface.",
    defects: [
      {
        family: "time",
        title: "Naive vs aware datetime comparison",
        signal: "mixed",
        severity: "blocker",
        body:
          "datetime.utcnow() returns a naive datetime — no tzinfo — despite representing UTC. If expires_at came from a database driver that returns timezone-aware datetimes, this raises TypeError: can't compare offset-naive and offset-aware datetimes. If expires_at is naive but was stored in local time, the comparison succeeds and is wrong by the UTC offset. That second case is the dangerous one: tokens expire hours early or late with no error.",
        fix: "datetime.now(timezone.utc) > token.expires_at, with expires_at guaranteed aware.",
      },
      {
        family: "failure",
        title: "No handling for a missing expiry",
        signal: "loud",
        severity: "major",
        body:
          "If expires_at is None — a token that never expires, or a malformed record — this raises TypeError inside what looks like a cheap boolean check. Auth code should decide explicitly whether None means 'never expires' or 'reject'.",
        fix: "Handle None explicitly and fail closed.",
      },
    ],
  },
  {
    id: 5,
    slug: "bulk-user-sync",
    lang: "TypeScript",
    level: "Standard",
    title: "Bulk user sync",
    shape: "function",
    code: t(s05),
    hintRegion: "Consider what state the system is in if the 4th of 50 upserts rejects.",
    hintFamily: "Time & concurrency, Failure surface, Boundaries.",
    defects: [
      {
        family: "failure",
        title: "Cache is left stale after a partial write",
        signal: "mixed",
        severity: "blocker",
        body:
          "Promise.all rejects on the first rejection, so the await throws and cache.invalidate never runs. But the other upserts were already in flight and most will still land. The database is now partially updated while the cache still serves the old values — the single worst outcome available, and it happens silently from the caller's perspective apart from a thrown error.",
        fix: "Invalidate in a finally block, so the cache is cleared whether or not the batch succeeded.",
      },
      {
        family: "time",
        title: "No isolation between the write and the invalidation",
        signal: "silent",
        severity: "major",
        body:
          "Even on the success path, a read arriving between the last upsert and the invalidate repopulates the cache with stale data, which then survives the invalidation. This is the classic cache-aside race.",
        fix: "Invalidate before and after, or use versioned keys.",
      },
      {
        family: "failure",
        title: "Which users failed is unrecoverable",
        signal: "mixed",
        severity: "major",
        body:
          "Promise.all discards the results of every other promise once one rejects. The caller learns that something failed but not which users synced, so there is no way to retry only the failures.",
        fix: "Promise.allSettled, then report the rejected indices.",
      },
      {
        family: "boundary",
        title: "Unbounded concurrency",
        signal: "mixed",
        severity: "major",
        body:
          "users.map fires every upsert simultaneously. For 50 users this is fine; for 50,000 it exhausts the connection pool and the failures look like database problems rather than a client bug.",
        fix: "Batch with a concurrency limit.",
      },
    ],
  },
  {
    id: 6,
    slug: "orders-per-user",
    lang: "SQL",
    level: "Standard",
    title: "Orders per user report",
    shape: "function",
    code: t(s06),
    hintRegion:
      "Ask what the LEFT JOIN was written to accomplish, then whether it still does it.",
    hintFamily: "Contract and Silent coercion.",
    defects: [
      {
        family: "contract",
        title: "The WHERE clause silently converts the LEFT JOIN to an INNER JOIN",
        signal: "silent",
        severity: "blocker",
        body:
          "A LEFT JOIN produces NULL-filled rows for users with no matching orders. The WHERE clause then evaluates NULL >= '2026-01-01', which is NULL, which is not true — so those rows are filtered out. Every user with zero orders in the window disappears, which is exactly the population the LEFT JOIN existed to preserve. The query runs, returns data, and quietly answers a different question than the one asked.",
        fix: "Move the predicate into the join: LEFT JOIN orders o ON o.user_id = u.id AND o.created_at >= '2026-01-01'",
      },
      {
        family: "coercion",
        title: "Date literal compared against a timestamp",
        signal: "silent",
        severity: "major",
        body:
          "If created_at is a timestamp, the bare date is coerced to midnight, and whether that's in UTC or session-local time depends on the column type and server configuration. Reports built this way drift by a day at month boundaries.",
        fix: "Compare against an explicit timestamptz, parameterized rather than inlined.",
      },
    ],
  },
  {
    id: 7,
    slug: "seat-reservation",
    lang: "JavaScript",
    level: "Standard",
    title: "Seat reservation",
    shape: "function",
    code: t(s07),
    hintRegion: "Imagine two requests arriving 3ms apart.",
    hintFamily: "Time & concurrency, Boundaries, Failure surface.",
    defects: [
      {
        family: "time",
        title: "Check-then-act race (TOCTOU)",
        signal: "silent",
        severity: "blocker",
        body:
          "The read and the write are separate round trips with no atomicity between them. Two concurrent requests both read reserved: false, both pass the guard, and both write. Two people are sold the same seat, and both receive { ok: true }. No error is raised anywhere. Load testing at low concurrency will never surface this; a ticket on-sale will surface it immediately.",
        fix: "One atomic conditional update — UPDATE ... WHERE reserved = false — and treat zero rows affected as the failure case.",
      },
      {
        family: "boundary",
        title: "Missing seat throws an opaque TypeError",
        signal: "loud",
        severity: "major",
        body:
          "If findOne returns null for a bad seatId, `seat.reserved` throws TypeError: Cannot read properties of null. The caller gets a 500 and a stack trace instead of a 404, and the logs point at the wrong layer.",
        fix: "Guard for null and raise a typed NotFound error.",
      },
      {
        family: "failure",
        title: "Success is asserted, not verified",
        signal: "silent",
        severity: "major",
        body:
          "The function returns { ok: true } without inspecting the update result. If the update matched zero documents, the caller is still told the reservation succeeded.",
        fix: "Check the modified count and return based on it.",
      },
    ],
  },
  {
    id: 8,
    slug: "find-max",
    lang: "Rust",
    level: "Hard",
    title: "Maximum value",
    shape: "function",
    code: t(s08),
    hintRegion: "The compiler is happy. Try it with data that isn't all positive.",
    hintFamily: "Boundaries, Silent coercion, Failure surface.",
    defects: [
      {
        family: "boundary",
        title: "Accumulator seeded at zero",
        signal: "silent",
        severity: "blocker",
        body:
          "For an all-negative slice such as [-5.0, -2.0, -9.0] the function returns 0.0 — a value that does not appear in the input. This is the single most common seeded-accumulator bug and it is completely silent. Temperatures, deltas, and profit-and-loss figures all routinely go negative.",
        fix: "Seed with f64::NEG_INFINITY, or fold over the first element.",
      },
      {
        family: "failure",
        title: "Empty slice returns a fabricated value",
        signal: "silent",
        severity: "major",
        body:
          "An empty input also returns 0.0, indistinguishable from a real maximum of zero. Rust's type system gives you the right tool here and the signature declines to use it.",
        fix: "Return Option<f64> and yield None for an empty slice.",
      },
    ],
  },
  {
    id: 9,
    slug: "email-validation",
    lang: "Python",
    level: "Hard",
    title: "Email validation",
    shape: "function",
    code: t(s09),
    hintRegion:
      "Check whether the match consumes every character in the input.",
    hintFamily: "Boundaries, Contract, Failure surface.",
    defects: [
      {
        family: "boundary",
        title: "`$` accepts one trailing newline",
        signal: "silent",
        severity: "major",
        body:
          'In Python, `$` also matches immediately before a single final newline. So `is_valid_email("attacker@evil.com\\n")` returns True. It does not accept an embedded newline followed by another address, but accepting the trailing control character can still break callers that place the value into a line-oriented header or record.',
        fix: "Use re.fullmatch, or anchor with \\A and \\Z.",
      },
      {
        family: "contract",
        title: "Uppercase TLDs are rejected",
        signal: "silent",
        severity: "major",
        body:
          "[a-z]{2,} is case-sensitive with no re.IGNORECASE flag, so USER@EXAMPLE.COM fails validation. Email domains are case-insensitive, so this rejects legitimate addresses — and it will look to support like an intermittent bug, because it depends on how the user typed it.",
        fix: "Add re.IGNORECASE, or normalize before matching.",
      },
    ],
  },
  {
    id: 10,
    slug: "batching-generator",
    lang: "Python",
    level: "Hard",
    title: "Batching generator",
    shape: "function",
    code: t(s10),
    hintRegion:
      "Track the object yielded to the caller across two iterations, then inspect the end of input.",
    hintFamily: "Shared state, Boundaries.",
    defects: [
      {
        family: "state",
        title: "The yielded list is reused and then emptied",
        signal: "silent",
        severity: "blocker",
        body:
          "yield hands the consumer a reference to the same list object every time, and clear() empties it in place. A consumer that iterates and processes immediately works fine — which is why this passes casual testing. A consumer that accumulates, like list(batch(range(10), 3)), gets a list of references to one object, and every entry reflects its final state. The result is [[9], [9], [9]] rather than the expected batches. Silent, and genuinely confusing to debug.",
        fix: "yield batch, then rebind batch = [] rather than clearing in place. Or yield a copy.",
      },
      {
        family: "boundary",
        title: "The final partial batch is dropped",
        signal: "silent",
        severity: "blocker",
        body:
          "The yield only fires when len(batch) == size exactly. With 10 items and size 3, the trailing item is silently discarded. Data loss with no error — the worst category of defect for anything doing ETL or bulk sending.",
        fix: "After the loop, `if batch: yield batch`.",
      },
      {
        family: "boundary",
        title: "size <= 0 loops forever or never yields",
        signal: "silent",
        severity: "major",
        body:
          "size=0 means len(batch) == 0 is never true after an append, so nothing is ever yielded and the whole iterable is buffered in memory. A negative size behaves the same way. For a function designed to bound memory, this is an unbounded-memory failure.",
        fix: "Raise ValueError for size < 1.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  /*  Added drills — more languages, and the diff-review shape.          */
  /* ------------------------------------------------------------------ */

  {
    id: 11,
    slug: "concurrent-fetch",
    lang: "Go",
    level: "Hard",
    title: "Concurrent status check",
    shape: "function",
    code: t(s11),
    brief: "Fan out an HTTP HEAD-style status check over a list of URLs.",
    hintRegion:
      "Run it with two URLs and it works. Run it with two hundred and read the crash message carefully.",
    hintFamily: "Shared state, Failure surface, Time & concurrency.",
    defects: [
      {
        family: "state",
        title: "Concurrent writes to an unsynchronized map",
        signal: "loud",
        severity: "blocker",
        body:
          "Every goroutine writes into the same `results` map with no mutex. Go's runtime detects this and aborts the process with `fatal error: concurrent map writes` — and note that this is a fatal error, not a panic: recover() cannot catch it and no deferred cleanup runs. It is also probabilistic. Two URLs will almost never trip it, so it passes review, passes CI, and takes the service down under real load.",
        fix: "Guard the map with a sync.Mutex, use sync.Map, or have each goroutine send to a channel that one collector owns.",
      },
      {
        family: "failure",
        title: "The error is discarded and the caller cannot tell",
        signal: "silent",
        severity: "blocker",
        body:
          "On an http.Get error the goroutine just returns. The URL is then simply absent from the map, which is indistinguishable from a URL that was never in the input. A caller iterating the result sees a shorter map and no indication that anything went wrong. A status-checking function that silently omits the failures has inverted its own purpose.",
        fix: "Return (map[string]int, error) or a per-URL result struct carrying either a status or an error.",
      },
      {
        family: "time",
        title: "http.Get has no timeout",
        signal: "silent",
        severity: "major",
        body:
          "http.Get uses http.DefaultClient, whose Timeout is zero, meaning no timeout. A server that accepts the connection and never responds holds a goroutine and a connection forever; wg.Wait() then never returns and the whole call hangs. There is no context and no cancellation path.",
        fix: "Use a *http.Client with an explicit Timeout, and http.NewRequestWithContext so the caller can cancel.",
      },
      {
        family: "boundary",
        title: "Unbounded goroutine and connection fan-out",
        signal: "mixed",
        severity: "major",
        body:
          "One goroutine per URL with no semaphore. Ten thousand URLs means ten thousand simultaneous sockets; you exhaust file descriptors or the remote rate-limits you, and the resulting errors look like a network problem rather than a client bug.",
        fix: "Bound concurrency with a buffered-channel semaphore or golang.org/x/sync/errgroup with SetLimit.",
      },
      {
        family: "contract",
        title: "Version-dependent loop-variable capture",
        signal: "silent",
        severity: "minor",
        body:
          "The closure captures `u` from the enclosing loop rather than taking it as a parameter. Under Go 1.22 and later each iteration gets a fresh `u` and this is correct. Under Go 1.21 and earlier every goroutine shares one variable, so most of them read whichever URL the loop reached last, and the function checks the same URL many times. Worth a comment whenever you see the pattern: it tells you the code was written against one language version and may be running on another, and the `go` directive in go.mod decides which.",
        fix: "Pass it explicitly — go func(u string) { ... }(u) — which is correct on every version.",
      },
    ],
  },
  {
    id: 12,
    slug: "apply-discount",
    lang: "Java",
    level: "Standard",
    title: "Percentage discount",
    shape: "function",
    code: t(s12),
    brief: "Used by checkout to compute the payable amount.",
    hintRegion:
      "Work out the exact type of every subexpression on the return line. One of them is not what it looks like.",
    hintFamily: "Silent coercion, Contract, Boundaries.",
    defects: [
      {
        family: "coercion",
        title: "Math.round returns a long, so the division truncates",
        signal: "silent",
        severity: "blocker",
        body:
          "Math.round(double) returns a long. `Math.round(...) / 100` is therefore long / long — integer division — and the fractional part is discarded before the result is widened back to double on return. A price of 19.99 with no discount gives Math.round(1999.0) = 1999, then 1999 / 100 = 19, returned as 19.0. Every amount is truncated to whole units and the customer is undercharged by up to 99 cents. The signature says double and the arithmetic is integer; nothing warns.",
        fix: "Divide by a double literal: Math.round(...) / 100.0 — or better, do not use floating point for money at all.",
      },
      {
        family: "coercion",
        title: "Money in double",
        signal: "silent",
        severity: "major",
        body:
          "double cannot represent most decimal fractions exactly. price * percent / 100 accumulates representation error, and once these values are summed across a basket the total drifts from what any hand calculation produces. This is the defect that generates accounting tickets nobody can reproduce.",
        fix: "BigDecimal with an explicit scale and RoundingMode, or integer cents.",
      },
      {
        family: "boundary",
        title: "percent is not validated",
        signal: "silent",
        severity: "major",
        body:
          "percent = 150 produces a discount larger than the price and the function returns a negative amount, which downstream becomes a refund. percent = -10 raises the price. Neither is rejected, and neither looks wrong in a log line.",
        fix: "Reject percent outside [0, 100], and clamp the result at zero.",
      },
    ],
  },
  {
    id: 13,
    slug: "large-orders",
    lang: "C#",
    level: "Hard",
    title: "Filtered order query",
    shape: "function",
    code: t(s13),
    brief: "A service method on a class whose DbContext is scoped to the request.",
    hintRegion:
      "Nothing here has run yet by the time the method returns. Except that one line did run it.",
    hintFamily: "Time & concurrency, Failure surface, Contract.",
    defects: [
      {
        family: "time",
        title: "The sequence is enumerated twice",
        signal: "silent",
        severity: "blocker",
        body:
          "Where() is deferred: it builds a query and executes nothing. Count() then executes the whole thing, and returning `large` hands the caller a query that will execute a second time when they iterate. Against a database that is two round trips for one logical question. Against a sequence that can only be read once — a yield-return iterator over a stream, a network reader, an IAsyncEnumerable adapter — the second enumeration yields nothing or throws, so the log line says 'Found 40 large orders' and the caller receives zero.",
        fix: "Materialize once: var large = orders.Where(...).ToList(); then log large.Count and return it.",
      },
      {
        family: "failure",
        title: "Deferred execution escapes the lifetime of its context",
        signal: "loud",
        severity: "blocker",
        body:
          "If `orders` is backed by an Entity Framework DbSet scoped to the request, the returned query executes wherever the caller happens to iterate it — possibly after the DbContext has been disposed, which throws ObjectDisposedException from a stack frame with no obvious relationship to this method. The exception surfaces in the view layer and the investigation starts in the wrong file.",
        fix: "Materialize before returning, or return IQueryable deliberately and document that the caller owns the lifetime.",
      },
      {
        family: "contract",
        title: "A logging line performs the expensive work",
        signal: "silent",
        severity: "major",
        body:
          "The Count() call inside a log statement is a full enumeration — potentially a full table scan. Reviewers read log lines as free. Worse, if the logger is configured above Information the string is never formatted, but large.Count() is still evaluated first, because it is an ordinary argument. The cost is paid whether or not anything is logged.",
        fix: "Compute the count once into a local, and log the local.",
      },
    ],
  },
  {
    id: 14,
    slug: "backup-script",
    lang: "Bash",
    level: "Standard",
    title: "Nightly backup refresh",
    shape: "function",
    code: t(s14),
    brief: "Runs from cron as root. Argument comes from the crontab line.",
    hintRegion:
      "Ask what every line does when the argument is missing. Then ask what happens when the copy fails.",
    hintFamily: "Boundaries, Failure surface, Silent coercion.",
    defects: [
      {
        family: "boundary",
        title: "An unset argument directs removal and copy commands at the filesystem root",
        signal: "mixed",
        severity: "blocker",
        body:
          "With no argument, BACKUP_DIR is empty, so rm receives /*. GNU rm refuses to remove root's contents by default, but the next command expands its destination to / and copies /var/data entries there. Run as root, that can overwrite system files. The script relies on rm's implementation safeguard and never checks that the argument names the intended backup directory.",
        fix: 'Set `set -euo pipefail` (so unset variables abort), quote the expansion, and validate: `[[ -d "$BACKUP_DIR" ]] || exit 1`.',
      },
      {
        family: "coercion",
        title: "Unquoted expansions word-split and glob",
        signal: "silent",
        severity: "blocker",
        body:
          'Every use of $BACKUP_DIR is unquoted. A path containing a space — "/mnt/my backups" — splits into two arguments, so rm is handed "/mnt/my" and "backups/*". A path containing a glob character is expanded against the filesystem. The shell does this silently; there is no error and the wrong paths are operated on.',
        fix: 'Quote every expansion: rm -rf "$BACKUP_DIR"/* — and prefer "${BACKUP_DIR:?BACKUP_DIR is required}".',
      },
      {
        family: "failure",
        title: "Success is printed unconditionally",
        signal: "silent",
        severity: "blocker",
        body:
          "Without `set -e`, a failing cp — disk full, permission denied, source missing — does not stop the script. The echo runs anyway and cron's output says 'Backup complete'. The monitoring signal and the actual outcome are now decoupled, and the failure is discovered at restore time.",
        fix: "set -euo pipefail, and check the exit status explicitly before reporting success.",
      },
      {
        family: "failure",
        title: "The old backup is destroyed before the new one exists",
        signal: "silent",
        severity: "major",
        body:
          "The script deletes first and copies second. If the copy fails halfway, there is now neither a complete old backup nor a complete new one. A backup job should never be in a state where no valid backup exists.",
        fix: "Copy to a temporary directory alongside, then swap it into place atomically with mv once the copy has succeeded.",
      },
      {
        family: "boundary",
        title: "Dotfiles are silently excluded",
        signal: "silent",
        severity: "major",
        body:
          "`*` does not match names beginning with a dot unless dotglob is set. So /var/data/.env, .ssh, .config and friends are never copied — and the corresponding files in the destination are never deleted either, so stale hidden data survives every refresh. The backup looks complete because everything visible is there.",
        fix: "Use `cp -a /var/data/. \"$dest\"/` (the trailing dot includes dotfiles), or rsync -a with a trailing slash.",
      },
    ],
  },
  {
    id: 15,
    slug: "retry-with-backoff",
    lang: "Python",
    level: "Standard",
    title: "Retry with backoff",
    shape: "function",
    code: t(s15),
    brief: "Used for all outbound calls to a third-party pricing API.",
    hintRegion:
      "Count the attempts. Then ask which failures are worth retrying and which can never succeed.",
    hintFamily: "Failure surface, Contract, Boundaries, Time & concurrency.",
    defects: [
      {
        family: "failure",
        title: "The except clause catches failures that retrying cannot fix",
        signal: "silent",
        severity: "blocker",
        body:
          "`except Exception` catches everything, including .json() raising on a response body that is not JSON. If the endpoint returns an HTML error page, the code retries three times, sleeps seven seconds, and returns None — a deterministic failure treated as a transient one. It also swallows programming errors: a typo'd name inside the try becomes a NameError that is caught, retried, and reported as an upstream outage.",
        fix: "Catch only what is retryable — requests.Timeout, ConnectionError, and 5xx — and let everything else propagate.",
      },
      {
        family: "failure",
        title: "Returning None erases the reason for failure",
        signal: "silent",
        severity: "blocker",
        body:
          "After exhausting the retries the function returns None, which the caller cannot distinguish from an endpoint that legitimately returned null, nor from a 404, nor from a DNS failure. Every caller will end up writing `if price is None:` and guessing. The exception that actually explains the problem has already been discarded.",
        fix: "Re-raise the final exception, or return a result object carrying the failure.",
      },
      {
        family: "contract",
        title: "A non-2xx response is returned as if it were data",
        signal: "silent",
        severity: "blocker",
        body:
          "requests does not raise on HTTP error status. A 429 or a 503 whose body happens to be JSON — which is typical for APIs — parses cleanly and is returned as the pricing data, on the first attempt, with no retry at all. The retry logic never engages for exactly the failures it was written for.",
        fix: "Call resp.raise_for_status() before .json().",
      },
      {
        family: "contract",
        title: "'retries' is the total attempt count, not the number of retries",
        signal: "silent",
        severity: "minor",
        body:
          "range(retries) with retries=3 makes three attempts: one try and two retries. The parameter name and the docstring both say the function retries three times, which would be four attempts. Callers tuning this against an SLA will be off by one, and the timeout budget they compute will be wrong.",
        fix: "Loop `for i in range(retries + 1)` or rename the parameter to `attempts`.",
      },
      {
        family: "boundary",
        title: "It sleeps after the final attempt",
        signal: "silent",
        severity: "minor",
        body:
          "The sleep is inside the except with no check for whether another attempt remains, so the last failure is followed by a four-second sleep before returning None. Under load that is four seconds of held connection, held thread, and held request budget bought for nothing.",
        fix: "Only sleep when another attempt will follow.",
      },
      {
        family: "time",
        title: "Backoff with no jitter synchronizes every client",
        signal: "silent",
        severity: "minor",
        body:
          "Fixed 2**i delays mean that every client that saw the same outage retries at the same instants. The recovering service is hit by the entire fleet simultaneously and knocked back down. Backoff without jitter converts one outage into several.",
        fix: "Multiply the delay by a random factor — full jitter is the usual choice.",
      },
    ],
  },
  {
    id: 16,
    slug: "shipping-rules",
    lang: "Python",
    level: "Warm-up",
    title: "Shipping cost rules",
    shape: "function",
    code: t(s16),
    brief:
      "The ticket said: 'implement the shipping rules from the pricing doc.' The docstring is copied from that doc.",
    hintRegion:
      "The docstring is a list of four rules. The code is a chain of four branches. Those are not the same thing.",
    hintFamily: "Contract, Boundaries, Silent coercion.",
    defects: [
      {
        family: "contract",
        title: "The rules are unordered in the spec and ordered in the code",
        signal: "silent",
        severity: "blocker",
        body:
          "A chain of early returns means first match wins. A $150 international order ships free, and so does a $150 order weighing 40kg, because the first branch returns before anything else is consulted. Whether that is intended is genuinely unknowable from the docstring — a list of bullet points has no precedence. The important thing is that the code silently invented a precedence and nobody agreed to it. This is the most common real defect in AI-generated business logic, and the correct review action is not to propose a fix but to state the ambiguity and ask which rule wins.",
        fix: "Get the precedence decided, then encode it explicitly — and add a test per rule combination, not per rule.",
      },
      {
        family: "boundary",
        title: "The threshold boundary is undefined",
        signal: "silent",
        severity: "major",
        body:
          "'orders over $100' is written as `> 100`, so an order of exactly $100.00 pays $5. That may be right, but nothing states it, and the off-by-one at a price point customers actually hit — round numbers are exactly where carts land — generates support tickets.",
        fix: "Decide inclusive or exclusive, write it in the docstring, and test at 99.99, 100.00 and 100.01.",
      },
      {
        family: "coercion",
        title: "Float comparison at a currency threshold",
        signal: "silent",
        severity: "major",
        body:
          "If order.total is a float accumulated from line items, a basket that should total exactly 100.00 can hold 100.00000000000001 or 99.99999999999999. The free-shipping branch then fires or does not fire depending on the order the items were added in. Intermittent, unreproducible, and correct-looking in every log.",
        fix: "Use Decimal or integer cents for money, and compare against a Decimal literal.",
      },
      {
        family: "boundary",
        title: "Negative and missing values fall through to a price",
        signal: "mixed",
        severity: "minor",
        body:
          "A credit or refund with a negative total skips the free branch and is charged $5. A missing weight_kg — None on a digital product — raises TypeError inside the comparison. Neither case is considered, and the function has no way to express 'we do not ship this'.",
        fix: "Validate the inputs and raise, or return None with a documented meaning.",
      },
    ],
  },
  {
    id: 17,
    slug: "add-a-cache",
    lang: "TypeScript",
    level: "Hard",
    title: "Add a cache to getUser",
    shape: "diff",
    code: t(s17),
    brief:
      "PR description: 'getUser is hot on the profile page. Adds a simple cache.' Approve, or request changes?",
    hintRegion:
      "Two questions the diff does not answer: what does cache.get return on a miss, and what happens when a user is updated?",
    hintFamily: "Silent coercion, Failure surface, Time & concurrency.",
    defects: [
      {
        family: "coercion",
        title: "A truthiness check on a value that is legitimately falsy",
        signal: "silent",
        severity: "blocker",
        body:
          "The function's return type is `User | null`, so null is a real answer: this user does not exist. `cache.set(id, null)` stores it, and then `if (cached)` is false for it forever, so the cache never serves a negative result and every lookup of a nonexistent id goes to the database. That is the one case an attacker can generate at will by enumerating random ids, so the cache makes the hostile path more expensive rather than less. The same line cannot distinguish a miss from a cached null in any case — it needs to ask whether the key is present, not whether the value is truthy.",
        fix: "Use cache.has(id), or store a sentinel wrapper: `{ value: User | null }` and test for undefined.",
      },
      {
        family: "failure",
        title: "A cache is introduced with no invalidation path",
        signal: "silent",
        severity: "blocker",
        body:
          "Nothing in this diff, and nothing it references, deletes a key when a user is updated or deleted. From the moment this merges, every profile edit appears to silently fail: the write lands, the read returns the cached old row, and the user re-types their change. No TTL is visible either, so the staleness is unbounded. The correct review response is to reject the diff as incomplete rather than to nitpick the lines in it — the missing code is the defect, and reviewing only the lines shown will never find it.",
        fix: "Invalidate on every write path, and set a TTL as a backstop. Both belong in this PR, not a follow-up.",
      },
      {
        family: "time",
        title: "Concurrent misses stampede the database",
        signal: "silent",
        severity: "major",
        body:
          "Between the miss and the cache.set there is a window in which every other concurrent request also misses and also queries. On a hot key — which is the stated reason for the change — a cold cache produces a burst of identical queries rather than one. The cache reduces steady-state load and amplifies the load spike at exactly the moment the system is already struggling.",
        fix: "Store the in-flight promise in the cache rather than the resolved value, so concurrent callers await the same query.",
      },
      {
        family: "contract",
        title: "The cached value is returned without a type check",
        signal: "silent",
        severity: "major",
        body:
          "cache.get almost certainly returns `any` or `unknown`. Returning it satisfies `Promise<User | null>` with no runtime verification, so if the cache holds a value written by an older deployment with a different User shape, the type annotation is a lie and the failure surfaces as an undefined property access somewhere in the view. Caches outlive deploys; the schema in them is not versioned by the compiler.",
        fix: "Type the cache as Cache<User | null>, and include a schema version in the key.",
      },
      {
        family: "state",
        title: "The cached object is shared with every caller",
        signal: "silent",
        severity: "minor",
        body:
          "Every caller that gets a hit receives the same object reference. One caller mutating the returned user — even something innocuous like deleting a field before serializing — corrupts what every subsequent caller sees, and the corruption persists in memory with no way to trace it back.",
        fix: "Freeze the cached object, or return a structured clone.",
      },
    ],
  },
  {
    id: 18,
    slug: "deep-merge-diff",
    lang: "Python",
    level: "Hard",
    title: "Make merge_configs recursive",
    shape: "diff",
    code: t(s18),
    brief:
      "PR description: 'merge_configs was clobbering nested sections. Makes it merge recursively.' No tests or docs changed.",
    hintRegion:
      "Separate two questions: what does the diff break for existing callers, and what new inputs can it not survive? Then ask which defects the diff introduced and which were already there.",
    hintFamily: "Contract, Boundaries, Shared state.",
    defects: [
      {
        family: "contract",
        title: "It is a silent behavior change for every existing caller",
        signal: "silent",
        severity: "blocker",
        body:
          "Before the change, `override={'db': {'host': 'x'}}` replaced the whole db section, so any key the override omitted was gone. After it, the omitted keys survive from base. Both behaviors are defensible, but callers were written against the first, and nothing tells them the second is now in force: no version bump, no docstring change, no test. Somewhere there is a caller passing a deliberately reduced section in order to clear fields, and it now silently stops clearing them. Flagging the compatibility break is the finding here, not the merge logic itself.",
        fix: "Update the docstring, add tests covering both shapes, and provide an explicit way to replace a subtree wholesale.",
      },
      {
        family: "boundary",
        title: "Unbounded recursion on deep or self-referential config",
        signal: "loud",
        severity: "major",
        body:
          "The recursion has no depth limit and no cycle detection. A config object that contains itself — trivially constructible by any loader that resolves references, and not rare in YAML with anchors — recurses until RecursionError. The previous implementation could not fail this way; the diff introduced the failure mode.",
        fix: "Track visited ids, or cap the depth explicitly and raise a clear error.",
      },
      {
        family: "contract",
        title: "Dicts are merged and lists are replaced, with nothing saying so",
        signal: "silent",
        severity: "major",
        body:
          "Only dict values recurse. A list value in override replaces the base list entirely. That asymmetry is a real design decision — most config systems land on it — but it is now undocumented behavior that a user will discover when appending one item to a list wipes out the other ten.",
        fix: "State the list policy in the docstring, and be consistent about it.",
      },
      {
        family: "state",
        title: "The shallow copy still aliases the caller's data (pre-existing)",
        signal: "silent",
        severity: "minor",
        body:
          "base.copy() is shallow, so any nested container that the loop does not descend into — a dict present only in base, or any list — is the same object in the result as in base. A caller that mutates the merged config mutates the original. Note carefully that this defect predates the diff: it is not introduced here, and the diff arguably makes it likelier by preserving more of base in the output. Say so explicitly when you report it. Reviewers who present pre-existing issues as regressions lose credibility fast, and reviewers who never mention them miss real bugs.",
        fix: "copy.deepcopy(base), or document that the result shares structure with the inputs.",
      },
      {
        family: "boundary",
        title: "isinstance(dict) misses dict-like mappings",
        signal: "silent",
        severity: "nit",
        body:
          "Config loaders routinely return OrderedDict, defaultdict — both fine, they subclass dict — but also custom Mapping types that do not. Those take the else branch and replace instead of merging, so the function's behavior depends on which YAML library produced the object.",
        fix: "Test against collections.abc.Mapping.",
      },
    ],
  },
  {
    id: 19,
    slug: "search-effect",
    lang: "React",
    level: "Standard",
    title: "Search-as-you-type",
    shape: "function",
    code: t(s19),
    brief: "Renders under a text input; `query` changes on every keystroke.",
    hintRegion:
      "Type 'ab' quickly. Two requests are now in flight. Nothing in this code decides which one wins.",
    hintFamily: "Time & concurrency, Failure surface, Silent coercion.",
    defects: [
      {
        family: "time",
        title: "Out-of-order responses overwrite newer results",
        signal: "silent",
        severity: "blocker",
        body:
          "The effect fires per keystroke and never cancels the previous request. Responses are not guaranteed to arrive in the order they were sent, so the response for 'a' can land after the response for 'ab' and setResults replaces the correct list with a stale one. The UI then shows results for a query the user has already finished typing past. It reproduces roughly never on a fast local network and constantly on a phone, which is why it reaches production.",
        fix: "Return a cleanup from the effect that aborts the request (AbortController), or set an `ignore` flag the late response checks before calling setResults.",
      },
      {
        family: "failure",
        title: "fetch does not reject on 4xx or 5xx",
        signal: "silent",
        severity: "blocker",
        body:
          "A 500 is a resolved promise with ok === false. r.json() then tries to parse the error page, throws a SyntaxError inside the then chain, and — with no .catch — becomes an unhandled rejection that React does not surface. The component keeps rendering whatever it had before, so a total backend outage looks to the user like a search that found nothing.",
        fix: "if (!r.ok) throw new Error(r.status) — then handle it with an explicit error state.",
      },
      {
        family: "coercion",
        title: "The query is interpolated into a URL without encoding",
        signal: "silent",
        severity: "major",
        body:
          "A query containing & introduces a second parameter, # truncates everything after it before the request is even sent, and + arrives at the server as a space. The search silently returns results for a different query than the one typed, with no error anywhere. Anything that builds a URL out of user input and does not encode it is also the first place to look for injection into whatever consumes that URL.",
        fix: "encodeURIComponent(query), or build it with new URLSearchParams.",
      },
      {
        family: "failure",
        title: "No loading or error state at all",
        signal: "silent",
        severity: "major",
        body:
          "There are exactly two states in this component — some results, or the previous results. The user cannot tell 'searching' from 'found nothing' from 'the server is down'. Three distinct outcomes render identically, which makes the component unsupportable: a bug report will say 'search doesn't work' and contain no information.",
        fix: "Model the states explicitly: idle | loading | error | empty | results.",
      },
      {
        family: "boundary",
        title: "One request per keystroke",
        signal: "silent",
        severity: "minor",
        body:
          "No debounce. Typing a ten-character query issues ten requests, of which nine are already obsolete when they are sent. Multiply by every user on the page. Not a correctness bug on its own, but it is the load that turns the race above from theoretical into daily.",
        fix: "Debounce the query by ~250ms before the effect fires.",
      },
      {
        family: "boundary",
        title: "The key assumes a unique, present id",
        signal: "silent",
        severity: "nit",
        body:
          "If any result lacks an id, key is undefined; if two share one, React silently reuses the wrong DOM node and stale text persists across renders. Search backends that merge several indexes produce duplicate ids more often than you would expect.",
        fix: "Verify uniqueness at the boundary, or fall back to a composite key.",
      },
    ],
  },
  {
    id: 20,
    slug: "best-window",
    lang: "C++",
    level: "Hard",
    title: "Best sample window",
    shape: "function",
    code: t(s20),
    brief:
      "Sensor analytics. Returns the highest-scoring run of consecutive readings as a view into the caller's data, so nothing is copied.",
    hintRegion:
      "One defect is in the third argument of a call. One is about who owns the memory the returned value points at.",
    hintFamily: "Silent coercion, Boundaries, Shared state, Failure surface.",
    defects: [
      {
        family: "coercion",
        title: "accumulate's init argument fixes the accumulator type to int",
        signal: "silent",
        severity: "blocker",
        body:
          "std::accumulate deduces its accumulator from the *initial value*, not from the iterator's value type. Passing the literal 0 makes it an int, so every double is truncated on each addition: a window of [0.9, 0.9, 0.9] sums to 0, not 2.7. The result compiles without a warning under -Wall and returns a plausible number. This is the single most common numeric defect in generated C++ and it survives any test whose values happen to be whole.",
        fix: "std::accumulate(w.begin(), w.end(), 0.0) — or 0.0L, or std::reduce with an explicit type.",
      },
      {
        family: "state",
        title: "The returned span points into a vector that is destroyed",
        signal: "mixed",
        severity: "blocker",
        body:
          "top_windows takes `readings` by value, so best_window views a local copy. Every Window in the returned vector holds a span into that copy's buffer, which is freed when top_windows returns — the caller reads freed memory. It is worse inside the loop: readings.erase() invalidates the buffer that the spans already pushed into `out` point at, so earlier passes dangle before the function has even finished. Both are undefined behavior that usually 'works' in a debug build because the freed pages are still mapped and still hold the old bytes.",
        fix:
          "Return owning values (a std::vector<double> per window, or an index+width pair), or take the data by const reference and document that the caller must outlive the result.",
      },
      {
        family: "boundary",
        title: "best_sum starts at 0.0, so all-negative data never wins",
        signal: "silent",
        severity: "blocker",
        body:
          "`sum > best_sum` can never be true when every window sums below zero — temperature deltas, drawdowns, signed error terms. The function then returns the default-constructed Window: an empty span, mean 0.0, and an empty label. The caller has been handed a window that does not exist, and 0.0 is a believable mean.",
        fix:
          "Seed with the first window, or track `bool have_best` — never a value that is inside the domain of the data.",
      },
      {
        family: "failure",
        title: "'No window exists' is indistinguishable from a real answer",
        signal: "silent",
        severity: "major",
        body:
          "When width exceeds data.size() the loop body never runs and the same default Window comes back. There is no error, no optional, no exception: an empty span and a zero mean are the encoding for both 'the best window has mean zero' and 'you asked for something impossible'.",
        fix: "std::optional<Window>, or throw on width > data.size().",
      },
      {
        family: "coercion",
        title: "int width promotes to size_t in the loop condition",
        signal: "silent",
        severity: "major",
        body:
          "In `i + width <= data.size()`, i is size_t, so width is converted to size_t before the addition. A negative width becomes an enormous positive value, the condition is false immediately, and the function silently returns the default Window instead of rejecting the argument. Because both operands end up unsigned, -Wsign-compare does not fire. width == 0 is also accepted and gives `sum / width` — a division by zero.",
        fix:
          "Validate width > 0 up front and take it as size_t (or compare as `width <= data.size() && i <= data.size() - width`).",
      },
    ],
  },
  {
    id: 21,
    slug: "apply-coupon",
    lang: "Ruby",
    level: "Hard",
    title: "Apply a coupon",
    shape: "function",
    code: t(s21),
    brief: "Checkout. Applies a promo code to a cart and returns the new total in cents.",
    hintRegion:
      "Read line 17 out loud and then say what it assigns. Then ask what happens when `code` is not in the hash.",
    hintFamily: "Contract, Silent coercion, Boundaries, Shared state, Failure surface.",
    defects: [
      {
        family: "failure",
        title: "An unknown coupon silently becomes a 0% discount",
        signal: "silent",
        severity: "blocker",
        body:
          "`DISCOUNTS[code] || 0` turns a typo, an expired code and a hostile guess into the same thing as a valid code worth nothing. The method returns the full subtotal and appends the bogus code to @cart[:applied], so the customer is told their code was accepted and charged as though it wasn't. Support cannot reproduce it because the code 'works'.",
        fix:
          "percent = DISCOUNTS.fetch(code) { return Result.invalid_code(code) } — make the unknown case a distinct outcome, not a number.",
      },
      {
        family: "contract",
        title: "`or` binds looser than `=`",
        signal: "silent",
        severity: "major",
        body:
          "`stackable = params[:stackable] == \"true\" or params[:override]` parses as `(stackable = (params[:stackable] == \"true\")) or params[:override]`. The override flag is evaluated, its value discarded, and `stackable` is never influenced by it. Ruby warns about this only under `-w`, and the line reads exactly like the thing it does not do. Generated Ruby reaches for the English keywords `and`/`or` because prose-like code is well represented in training data.",
        fix: "Use || in expressions. Reserve and/or for control flow (`do_thing or raise`).",
      },
      {
        family: "boundary",
        title: "The 100% cap only applies on the stackable path",
        signal: "silent",
        severity: "blocker",
        body:
          "`percent = 100 if stackable && percent > 100` guards the wrong case. With HALF plus a bonus of 60, percent is 110 and stackable is false, so discount exceeds subtotal and total goes negative — a coupon that pays the customer. There is no floor at 0 either. Note that the previous defect makes `stackable` almost always false, so the cap is effectively dead code.",
        fix: "Clamp unconditionally: percent = percent.clamp(0, 100).",
      },
      {
        family: "coercion",
        title: "String#to_i never fails",
        signal: "silent",
        severity: "major",
        body:
          "nil.to_i is 0, \"abc\".to_i is 0, \"50%\".to_i is 50, \" 7\".to_i is 7 and \"1e9\".to_i is 1. So a malformed bonus is silently ignored, a percentage written with its sign grants the discount anyway, and a value in scientific notation is quietly misread. Nothing raises, which is exactly why the parameter is never validated.",
        fix: "Integer(params[:bonus], exception: false) and reject nil explicitly.",
      },
      {
        family: "state",
        title: "The caller's cart is mutated, and applying twice is not idempotent",
        signal: "silent",
        severity: "major",
        body:
          "@cart is the hash the caller still holds. Every call writes :total and appends to :applied — including the unknown-code path. A retried request (a double-clicked button, a Sidekiq retry after a timeout) appends the same code a second time, so the audit trail says the coupon was applied twice while the total says it was applied once. Reconciliation then disagrees with the charge and nobody can tell which is right.",
        fix:
          "Return a new total and let the caller commit it; guard with `return if @cart[:applied].include?(code)`.",
      },
      {
        family: "coercion",
        title: "Integer division picks a rounding rule nobody chose",
        signal: "silent",
        severity: "minor",
        body:
          "`subtotal * percent / 100` truncates toward zero, so 10% of 1999 cents is 199, not 200. It is consistently in the merchant's favor and consistently disagrees with whatever the finance spec says at every amount that is not a multiple of 10. One cent, on every order, is an accounting discrepancy rather than a rounding detail.",
        fix: "Decide and write it down: (subtotal * percent).fdiv(100).round, or use BigDecimal.",
      },
    ],
  },
  {
    id: 22,
    slug: "verify-download",
    lang: "PHP",
    level: "Hard",
    title: "Verify a signed download link",
    shape: "function",
    code: t(s22),
    brief:
      "A CDN helper. Given a token and the paths the caller is allowed to reach, return the granted path or null.",
    hintRegion:
      "Check how the runtime represents failure values in each comparison, and how the decoded path is constrained.",
    hintFamily: "Silent coercion twice, Boundaries, Failure surface.",
    defects: [
      {
        family: "coercion",
        title: "strpos(...) == 0 is true whenever the prefix is absent",
        signal: "silent",
        severity: "blocker",
        body:
          "strpos returns false when the needle is not found. `false == 0` is true in PHP — comparing a bool against anything converts the other operand to bool, and 0 is falsy. So the allowlist loop returns the path on its *first* iteration for every path that does not contain the prefix, which is the exact opposite of what it is for. The check passes in a test where the path does start with the prefix, because then strpos really is 0.",
        fix: "str_starts_with($path, $prefix) — or at minimum ===, never ==.",
      },
      {
        family: "coercion",
        title: "Loose comparison of a hash lets a numeric-string signature through",
        signal: "silent",
        severity: "blocker",
        body:
          "PHP 8 no longer juggles a non-numeric string against a number, but it still compares *two numeric strings* numerically. md5 output that looks like scientific notation — \"0e462097431906509019562988736854\" — is a numeric string, so any two such hashes compare equal. Roughly 1 in 340 million inputs hashes to that shape, and attackers precompute them. Separately, == and === are both variable-time, so the comparison leaks the signature byte by byte.",
        fix: "hash_equals($expected, $signature), and hash_hmac('sha256', ...) instead of md5.",
      },
      {
        family: "boundary",
        title: "Nothing rejects path traversal",
        signal: "silent",
        severity: "blocker",
        body:
          "$path is urldecoded and then only prefix-checked, so \"uploads/../../etc/passwd\" satisfies an allowlist entry of \"uploads/\" and the function hands it back as an approved path. Decoding before validation is the same mistake one layer down: %2e%2e%2f arrives as ../ after urldecode, so any filter applied to the raw token is bypassed.",
        fix:
          "realpath() the result and assert it is still inside the allowed root, after decoding and before returning.",
      },
      {
        family: "coercion",
        title: "A non-numeric expiry compares as a string and never expires",
        signal: "silent",
        severity: "major",
        body:
          "$expires comes out of explode() as a string. When it is numeric, `$expires < time()` compares numerically and is fine. When it is not — \"never\", \"\", a truncated token — PHP 8 casts the int to a string and compares the two as strings: \"abc\" < \"1790000000\" is false, so the token is treated as unexpired. The token is still signed, so this is not directly exploitable, but it means a bug upstream that produces a malformed expiry yields links that never die.",
        fix: "Require ctype_digit($expires) and compare (int) $expires.",
      },
      {
        family: "failure",
        title: "Four different rejections return the same null",
        signal: "silent",
        severity: "minor",
        body:
          "Malformed, bad signature, expired and not-allowed are indistinguishable to the caller, so the access log records one outcome for a clock-skew problem and for a forged signature. The first is a support ticket and the second is an incident, and you cannot tell them apart after the fact.",
        fix:
          "Return a small result object, or throw distinct exceptions. Log the reason even if the HTTP response stays a flat 403.",
      },
    ],
  },
  {
    id: 23,
    slug: "config-loader",
    lang: "Kotlin",
    level: "Hard",
    title: "Cached config loader",
    shape: "function",
    code: t(s23),
    brief: "Reads a retry policy out of a `key = value` file and caches it by path.",
    hintRegion:
      "Start with the cache key and the parameter list. Then ask what `?: 3` actually defends against.",
    hintFamily: "Shared state, Boundaries, Time & concurrency, Failure surface.",
    defects: [
      {
        family: "state",
        title: "The cache key omits `overrides`",
        signal: "silent",
        severity: "blocker",
        body:
          "The first caller's overrides are baked into the cached RetryPolicy and served to every later caller of the same path, whatever they pass. Worse, the first call in a process is usually the one with no overrides at all — from a health check or an eager initializer — so in production the overrides are silently never applied, while in a test that calls load() once with overrides they always are.",
        fix:
          "Key on (path, overrides), or take overrides out of the cached function and apply them to the cached result.",
      },
      {
        family: "boundary",
        title: "Destructuring split(\"=\") breaks on both edges",
        signal: "mixed",
        severity: "major",
        body:
          "A blank line or a line with no `=` — a trailing newline is enough — gives a one-element list, and `val (k, v)` throws IndexOutOfBoundsException. A line whose value contains `=` (a base64 secret, a query string, a padded token) gives three elements and the third is silently dropped, so the value is truncated at the first `=`. One edge is loud, the other is silent, and the silent one corrupts a credential.",
        fix: "line.split(\"=\", limit = 2) plus a filter for blank lines and an explicit error for malformed ones.",
      },
      {
        family: "failure",
        title: "`?: 3` looks like input validation and is not",
        signal: "loud",
        severity: "major",
        body:
          "The elvis operator only covers the *null* case — the key being absent. `\"three\".toInt()` throws NumberFormatException, which is not null, so the default never applies. The shape of the line advertises tolerance for bad input and delivers a stack trace whose message is `For input string: \"three\"` and which names neither the key nor the file.",
        fix: "merged[\"attempts\"]?.toIntOrNull() ?: 3 — and if you want to reject bad input, say which key.",
      },
      {
        family: "boundary",
        title: "backoffMs / attempts divides by a caller-supplied value",
        signal: "mixed",
        severity: "blocker",
        body:
          "attempts = 0 is a reasonable thing to write in a config file to mean 'do not retry', and it throws ArithmeticException at load time. attempts greater than backoffMs floors to zero, so Duration.ZERO becomes the backoff and the retry loop spins as fast as the network allows — a self-inflicted denial of service against your own dependency. The arithmetic is also just wrong: dividing the configured backoff by the attempt count is not what a key named backoff_ms means.",
        fix:
          "Validate attempts >= 1, and use the configured value as the backoff rather than dividing it.",
      },
      {
        family: "time",
        title: "A process-wide HashMap mutated with no synchronization",
        signal: "silent",
        severity: "major",
        body:
          "`object` is a singleton, and HashMap is not thread safe. Two threads calling load() concurrently both miss, both parse, and both put — the read-then-write is a TOCTOU, so the work is duplicated and one policy is discarded. A concurrent put during a resize can also lose unrelated entries or leave the map in a state that a later read never recovers from. None of this appears in a single-threaded test.",
        fix: "ConcurrentHashMap with computeIfAbsent, keyed on the full argument tuple.",
      },
    ],
  },
  {
    id: 24,
    slug: "enrich-accounts",
    lang: "TypeScript",
    level: "Standard",
    title: "Enrich accounts",
    shape: "function",
    code: t(s24),
    brief: "Fans out one lookup per account and returns the combined records.",
    hintRegion: "Follow the promise created inside the array callback to the return statement.",
    hintFamily: "Time & concurrency, Contract, Failure surface, Silent coercion.",
    defects: [
      {
        family: "time",
        title: "forEach does not await its async callback",
        signal: "silent",
        severity: "blocker",
        body:
          "Array.prototype.forEach ignores the promise the callback returns. The function falls through to the sort and returns an empty array before fetchPlan resolves. failures is also still empty, so the warning does not fire and the function reports total success with zero results. The later pushes go to an array nobody is holding; the catch does handle fetchPlan rejections, but the caller has already received the empty result.",
        fix: "await Promise.all(accounts.map(async (a) => { ... })) — or Promise.allSettled and inspect the results.",
      },
      {
        family: "contract",
        title: "The return type promises one record per account",
        signal: "silent",
        severity: "major",
        body:
          "Enriched[] gives the caller no way to line results up with inputs, and the failure path drops accounts entirely, so out.length silently differs from accounts.length. A caller that zips the two arrays by index — the obvious thing to do with a function shaped like this — pairs the wrong plan with the wrong account.",
        fix:
          "Return a Map<string, Enriched> or Array<{ id: string; result: Enriched | Error }>. Make partial success representable in the type.",
      },
      {
        family: "failure",
        title: "Errors are counted, not reported",
        signal: "silent",
        severity: "major",
        body:
          "The catch discards the error object and keeps only the id. The caller receives a shorter array and no signal at all; the only trace is a warn line on stdout with a number in it. 'Nine hundred accounts failed' and 'the auth token expired' are the same event, and only one of them is actionable.",
        fix: "Keep the errors and return them, or rethrow an AggregateError once the fan-out completes.",
      },
      {
        family: "coercion",
        title: "The comparator never returns 0",
        signal: "silent",
        severity: "minor",
        body:
          "`x.email > y.email ? 1 : -1` claims every pair is strictly ordered, including equal pairs. An inconsistent comparator is undefined behavior for sort: V8's TimSort can produce an order that is not merely unstable but wrong, moving unrelated elements. It is also a raw UTF-16 code-unit comparison, so accented and non-Latin addresses sort in an order no user recognizes.",
        fix: "(x, y) => x.email.localeCompare(y.email)",
      },
      {
        family: "time",
        title: "The fix introduces unbounded concurrency",
        signal: "mixed",
        severity: "major",
        body:
          "Worth flagging in the same review, because Promise.all over accounts.map is where this lands next: fifty thousand accounts means fifty thousand simultaneous requests, which exhausts sockets locally and rate-limits or topples the dependency remotely. There is also no timeout, so one hung request holds the whole batch open forever.",
        fix:
          "A bounded worker pool (p-limit, or a hand-rolled queue of N consumers), plus an AbortSignal timeout per request.",
      },
    ],
  },
  {
    id: 25,
    slug: "worker-pool",
    lang: "Go",
    level: "Hard",
    title: "Bounded worker pool",
    shape: "function",
    code: t(s25),
    brief:
      "Runs fn over every id with at most `workers` in flight, and returns the results once all of them are done.",
    hintRegion:
      "Trace channel closure and ownership of the synchronization counter through the full call.",
    hintFamily: "Shared state, Time & concurrency, Contract, Failure surface.",
    defects: [
      {
        family: "state",
        title: "sync.WaitGroup passed by value",
        signal: "loud",
        severity: "blocker",
        body:
          "worker takes `wg sync.WaitGroup`, not `*sync.WaitGroup`, so each goroutine calls Done() on its own copy. The counter in Process never drops below `workers` and wg.Wait() blocks forever. The compiler is perfectly happy; `go vet` reports 'passes lock by value: sync.WaitGroup contains sync.noCopy', which is the whole argument for vet being in CI rather than in someone's habits.",
        fix: "worker(ctx, &wg, jobs, results, fn) and take *sync.WaitGroup.",
      },
      {
        family: "time",
        title: "The results channel is never closed",
        signal: "loud",
        severity: "blocker",
        body:
          "`for r := range results` only ends when results is closed, and nothing closes it. Even with the WaitGroup fixed, Process deadlocks: the range loop waits for a close that the workers cannot perform (any one of them closing it would panic the others' sends), and wg.Wait() is unreachable below it. The producer goroutine got this right for `jobs` and the same reasoning was not applied one line down.",
        fix: "Start `go func() { wg.Wait(); close(results) }()` before the range loop, and drop the later wg.Wait().",
      },
      {
        family: "contract",
        title: "ctx is accepted and never used",
        signal: "silent",
        severity: "major",
        body:
          "The signature promises a cancelable, deadline-aware operation; the body threads ctx into worker and ignores it there too. A caller who cancels gets nothing — the pool runs every id to completion and the goroutines outlive the request that started them. A context parameter that is not selected on is worse than no parameter, because it advertises a guarantee the code does not provide.",
        fix: "select on ctx.Done() in both the job loop and the result send, and pass ctx into fn.",
      },
      {
        family: "time",
        title: "The timeout abandons the work rather than stopping it",
        signal: "silent",
        severity: "major",
        body:
          "On the time.After branch, the goroutine running fn is still running. Its side effects land after the caller has been told 'timeout on X', so a retry runs fn twice concurrently on the same id — two writes, two charges, two emails. The buffered done channel prevents a goroutine leak on the send but does nothing about the work itself. time.After also allocates a timer per job that is not collected until it fires, so a fast queue holds five seconds' worth of dead timers at all times.",
        fix:
          "Give fn a context with a deadline and make it honor cancellation. Use a timer you can Stop, or context.WithTimeout.",
      },
      {
        family: "failure",
        title: "No aggregate outcome, and a library writing to stdout",
        signal: "silent",
        severity: "minor",
        body:
          "Per-item errors are returned, but there is no way to express 'the run was canceled' or 'the pool itself failed' — the caller has to infer it from a short slice. fmt.Printf from a package makes that inference harder, not easier: a library that prints cannot be embedded in anything with a log format.",
        fix: "Return ([]Result, error) and take a *slog.Logger, or return the counts and print at the call site.",
      },
    ],
  },
  {
    id: 26,
    slug: "revenue-report",
    lang: "SQL",
    level: "Hard",
    title: "Revenue report gains a filter",
    shape: "diff",
    code: t(s26),
    brief:
      "Ticket: exclude canceled orders, limit the report to the last twelve months, and add an average order value.",
    hintRegion:
      "The comment on line 1 is part of the diff's context, and the change makes it false. Read the WHERE clause against the join type.",
    hintFamily: "Contract, Boundaries, Silent coercion, Time.",
    defects: [
      {
        family: "contract",
        title: "A WHERE predicate on the outer side demotes the LEFT JOIN to an INNER JOIN",
        signal: "silent",
        severity: "blocker",
        body:
          "For an account with no orders, every `o.*` column is NULL. `NULL <> 'cancelled'` evaluates to NULL, not true, so WHERE drops the row — and the same applies to the created_at bound. The query's stated purpose, in a comment the diff leaves untouched two lines above, is to include accounts with no orders yet. Those accounts now vanish from the report entirely. Nothing errors; the report is simply shorter, and the rows that disappeared are the ones a churn or onboarding dashboard exists to show.",
        fix:
          "Move both predicates into the ON clause: LEFT JOIN orders o ON o.account_id = a.id AND o.status <> 'cancelled' AND o.created_at >= ...",
      },
      {
        family: "boundary",
        title: "COUNT(*) counts the null-extended row",
        signal: "silent",
        severity: "blocker",
        body:
          "The diff changes COUNT(o.id) to COUNT(*). On a LEFT JOIN those are different functions: COUNT(o.id) skips NULLs and reports 0 for an account with no orders, while COUNT(*) counts rows and reports 1. So every order-less account claims one order worth zero cents, and avg_order_cents is computed against that phantom. The two defects mask each other — while the WHERE clause is wrong those accounts are filtered out, so fixing the join is what makes this one appear. That is the usual shape: the safe-looking half of a change is only safe because the unsafe half is hiding it.",
        fix: "Keep COUNT(o.id), and divide by COUNT(o.id) with a NULLIF guard.",
      },
      {
        family: "coercion",
        title: "Integer division on the average",
        signal: "silent",
        severity: "major",
        body:
          "amount_cents is an integer type, so SUM(...) / COUNT(*) is bigint / bigint and Postgres truncates. An average of 1999.87 cents reports as 1999, every time, always downward. Presented next to an exact revenue_cents total it reads as precise, and a spreadsheet that multiplies the average back out will not reconcile with the sum.",
        fix: "SUM(o.amount_cents)::numeric / NULLIF(COUNT(o.id), 0), then round explicitly.",
      },
      {
        family: "coercion",
        title: "`<> 'cancelled'` also drops orders with a NULL status",
        signal: "silent",
        severity: "major",
        body:
          "Independently of the join problem: an order whose status has not been set yet — pending insertion by a worker, or a column added with no backfill — compares NULL against 'canceled' and is excluded. Revenue that exists in the orders table silently does not appear in the revenue report, and the missing amount is proportional to how busy the system was when the report ran.",
        fix: "AND (o.status IS NULL OR o.status <> 'cancelled') — or COALESCE the status to a known default.",
      },
      {
        family: "time",
        title: "NOW() makes the report unreproducible and the oldest month partial",
        signal: "silent",
        severity: "minor",
        body:
          "NOW() - INTERVAL '12 months' lands mid-month, so the twelfth month back is a partial month shown in the same column as eleven full ones — a graph of this data always dips at the left edge. NOW() also resolves in the session's time zone against a timestamptz column, so the same query run by a scheduler in UTC and by an analyst in PDT disagrees on which orders fall in which month.",
        fix:
          "Take the window as an explicit parameter, truncate it to a month boundary, and be explicit about the zone: >= DATE_TRUNC('month', $1::timestamptz AT TIME ZONE 'UTC').",
      },
    ],
  },
  {
    id: 27,
    slug: "job-poller",
    lang: "React",
    level: "Hard",
    title: "Job status poller",
    shape: "function",
    code: t(s27),
    brief: "A hook that polls a job until it finishes, and the list component that uses it.",
    hintRegion:
      "The effect on line 29 is missing something. And `tick` closes over two values that are not in its dependency array.",
    hintFamily: "Time & concurrency, Shared state, Failure surface, Boundaries.",
    defects: [
      {
        family: "time",
        title: "The effect has no cleanup, so polling outlives the component",
        signal: "silent",
        severity: "blocker",
        body:
          "Nothing clears timer.current on unmount or when jobId changes. A new jobId starts a second chain while the first keeps running, and both call setStatus — so the status shown is whichever chain last resolved, which is usually the stale one, because the old job is further along and its request is faster. On unmount the fetch still resolves and setState fires on a dead component. The `cancel` handle the hook returns is the only way to stop it, and no caller in this file uses it.",
        fix:
          "Return a cleanup from the effect that clears the timer and flips a `cancelled` ref the code checks after every await.",
      },
      {
        family: "state",
        title: "useCallback's dependency array omits onDone",
        signal: "silent",
        severity: "blocker",
        body:
          "tick is memoized on [jobId] but closes over onDone, which JobPanel recreates on every render. So tick keeps the very first onDone forever — and that closure captured the very first `log`, the empty array. Every completion runs setLog([...[], entry]), so the log never holds more than one line and which line it holds depends on completion order. The lint rule that catches this (react-hooks/exhaustive-deps) is a warning, and generated code frequently ships with the dependency array trimmed to whatever made the warning quiet.",
        fix:
          "Keep onDone in a ref updated each render, and use the functional form: setLog((l) => [...l, entry]).",
      },
      {
        family: "failure",
        title: "res.ok is never checked before res.json()",
        signal: "silent",
        severity: "blocker",
        body:
          "A 500 that returns an HTML error page throws a SyntaxError, which lands in setError as 'Unexpected token <' — the operator is shown a JSON parsing problem instead of 'the job service is down'. A 404 that returns valid JSON is worse: body.status is undefined, which is neither 'succeeded' nor 'failed', so the poller schedules itself again and keeps requesting a job that does not exist until the tab is closed.",
        fix:
          "if (!res.ok) throw new Error(`job ${jobId}: HTTP ${res.status}`), and treat an unrecognized status as terminal rather than as 'keep going'.",
      },
      {
        family: "failure",
        title: "The catch path stops polling permanently",
        signal: "silent",
        severity: "major",
        body:
          "setError is called and no timer is rescheduled, so a single transient network blip ends the poll for good. The UI keeps displaying the last status it saw, which is 'running', and the parent is never told — `error` is returned from the hook but JobPanel does not read it. A job that finished ten minutes ago shows as in progress with no indication that the page stopped asking.",
        fix:
          "Reschedule with backoff on a transient failure, cap the attempts, and surface the error where the caller can render it.",
      },
      {
        family: "boundary",
        title: "key={i} on a list whose items come and go",
        signal: "silent",
        severity: "major",
        body:
          "React identifies children by key, so with an index key, removing the first job shifts every subsequent one onto its neighbor's key. The JobRow instance — and the hook state inside it, including the in-flight poll for a different jobId — is reused for the wrong job. The symptom is one job's status appearing on another row, which reads as a backend bug.",
        fix: "key={job.id}",
      },
    ],
  },
  {
    id: 28,
    slug: "pricing-cache",
    lang: "Python",
    level: "Hard",
    title: "Pricing engine gains a cache",
    shape: "diff",
    code: t(s28),
    brief:
      "Ticket: quote() is hot, so cache it. Also add a rush surcharge and a way to reload the rate card.",
    hintRegion:
      "What is in the cache key that the author did not intend to put there? And what happens when reload() is called?",
    hintFamily: "Shared state, Contract, Silent coercion, Boundaries.",
    defects: [
      {
        family: "state",
        title: "reload() cannot invalidate the cache, so prices freeze",
        signal: "silent",
        severity: "blocker",
        body:
          "lru_cache keys on all arguments including self, and reload() mutates the same self in place. The key is therefore unchanged by the new rate card, and every (sku, region, qty) combination already quoted keeps returning the old price for the life of the process. A pricing update appears to deploy successfully and silently does not take effect for exactly the popular items — the ones already in the cache. This is the defect that costs money, and it is invisible in any test that constructs a fresh PricingEngine.",
        fix:
          "Cache a module-level function of the rate card's version, or hold the cache on the instance and clear it in reload(). Never memoize a method whose correctness depends on mutable instance state.",
      },
      {
        family: "contract",
        title: "lru_cache requires hashable arguments, and the same diff adds a dict",
        signal: "loud",
        severity: "blocker",
        body:
          "options=None is hashable, so the default path caches fine. The moment a caller passes the rush option the diff was written to support — quote(sku, region, qty, {\"rush\": True}) — it raises TypeError: unhashable type: 'dict'. The new feature and the new cache are mutually exclusive, and the happy path is the one that works, so a smoke test passes.",
        fix:
          "Take the option as a keyword-only bool (rush: bool = False), or accept a frozenset of flags.",
      },
      {
        family: "state",
        title: "Memoizing a method pins every instance in memory",
        signal: "silent",
        severity: "major",
        body:
          "The cache holds a strong reference to self, so no PricingEngine is ever collected — in a request-scoped or tenant-scoped design that is an unbounded leak that looks like a slow memory climb with no single culprit. Cache hits are also decided by the instance's __eq__ and __hash__, which here are identity, so two engines built from identical rate cards share nothing.",
        fix: "Move the cached computation to a free function that takes only value types.",
      },
      {
        family: "coercion",
        title: "int(base * 1.15) truncates, and the float is not what you think",
        signal: "silent",
        severity: "major",
        body:
          "int() truncates toward zero rather than rounding, so the surcharge is always at least a fraction of a cent light. The float multiply makes which fraction unpredictable: 2000 * 1.15 is 2299.9999999999995, so a 15% surcharge on 2000 cents yields 2299 rather than 2300. The error is one cent, at amounts you cannot predict from reading the code, in a number that appears on an invoice.",
        fix: "Integer arithmetic on cents: base = base * 115 // 100, with the rounding direction stated.",
      },
      {
        family: "boundary",
        title: "qty in the key makes maxsize meaningless",
        signal: "silent",
        severity: "minor",
        body:
          "The key space is sku × region × qty × options, and qty is an unbounded integer a caller supplies. With 1024 slots and a long tail of quantities, the hit rate collapses toward zero while the retained-instance cost from the previous defect keeps growing. The cache was added because quote() is hot; as keyed, it is pure overhead plus a correctness hazard.",
        fix:
          "Cache the per-unit rate lookup, which is low-cardinality, and do the qty arithmetic outside the cache.",
      },
    ],
  },
  {
    id: 29,
    slug: "report-builder",
    lang: "Java",
    level: "Standard",
    title: "Report builder",
    shape: "function",
    code: t(s29),
    brief: "Accumulates totals per (region, tier) and renders a text report.",
    hintRegion:
      "The equals method is the interesting one. Then look at what `static` means for the field on line 11.",
    hintFamily: "Silent coercion, Time & concurrency, Shared state, Failure surface.",
    defects: [
      {
        family: "coercion",
        title: "equals compares Strings with ==",
        signal: "silent",
        severity: "blocker",
        body:
          "`region == other.region` compares references. It is true for interned literals, which is why every unit test written with \"US\" and \"gold\" passes. It is false for the same text arriving from a ResultSet, a JSON parser, String.substring or concatenation — so in production two logically equal keys are never equal. hashCode still agrees, so they land in the same bucket and equals separates them: every add() creates a new entry, and render()'s lookup finds none of them.",
        fix: "Objects.equals(region, other.region), or make AccountKey a record.",
      },
      {
        family: "time",
        title: "A static SimpleDateFormat shared across threads",
        signal: "mixed",
        severity: "blocker",
        body:
          "SimpleDateFormat keeps parse and format state in a mutable Calendar field, and this one is static. Two threads rendering at once produce interleaved output: a date from the wrong instant, a garbled string, or a NumberFormatException thrown from inside format(). It is intermittent and load-dependent, so it reproduces in production and not in a test. Making a formatter static is the textbook micro-optimization, which is exactly why it is so well represented in training data.",
        fix: "DateTimeFormatter.ofPattern(\"yyyy-MM-dd\") — immutable and thread safe — with java.time types.",
      },
      {
        family: "failure",
        title: "A missing region renders the literal string \"null\"",
        signal: "silent",
        severity: "major",
        body:
          "totals.get(...) returns null for a region with no rows, and StringBuilder.append(Object) writes \"null\". The report then contains a line reading `EMEA: null`, which is indistinguishable from a genuine zero to a reader and fatal to any parser downstream. Had the author written `double total = totals.get(key)` instead, the same case would have been a NullPointerException — a loud failure is the better bug here, and the code accidentally chose the quiet one.",
        fix: "totals.getOrDefault(key, 0.0), and format it explicitly.",
      },
      {
        family: "coercion",
        title: "Double for money",
        signal: "silent",
        severity: "major",
        body:
          "Repeated `current + amount` on doubles accumulates representation error, so a column of amounts that sum exactly by hand disagrees in the report at a magnitude that grows with the row count. The boxed Double adds an allocation per add() and an unboxing NPE hazard, and the rendered value carries whatever digits the double happens to have — 1234.5600000000002 is what a finance team sees.",
        fix: "long cents, or BigDecimal with an explicit scale and RoundingMode.",
      },
      {
        family: "state",
        title: "The map key's fields are mutable",
        signal: "silent",
        severity: "minor",
        body:
          "region and tier are non-final and package-visible. Anything that mutates an AccountKey after it has been used to insert changes its hashCode, so the entry is in the wrong bucket and is unreachable forever — the value is still in the map, still retained, and can never be found or removed. Keys must be immutable, and nothing here enforces it.",
        fix: "final fields, a private constructor, or a record.",
      },
    ],
  },
  {
    id: 30,
    slug: "bulk-uploader",
    lang: "C#",
    level: "Hard",
    title: "Bulk uploader",
    shape: "function",
    code: t(s30),
    brief: "Uploads a set of files to a bucket in parallel and keeps a manifest of what landed.",
    hintRegion: "Line 15 has one word that decides how every failure in this class behaves.",
    hintFamily: "Failure surface, Shared state, Boundaries, Time & concurrency.",
    defects: [
      {
        family: "failure",
        title: "async void",
        signal: "mixed",
        severity: "blocker",
        body:
          "An async void method returns no Task, so the caller cannot await it and cannot catch anything it throws. Control returns at the first await, which means Manifest() called on the next line reads a list that is still being filled. Any exception is raised on the captured context instead of propagating; on .NET Core, with no synchronization context, it goes to the thread pool and terminates the process — long after the call site, with a stack that does not include it. Nothing about the signature warns the caller; it reads exactly like a fire-and-forget helper is supposed to.",
        fix: "public async Task UploadAllAsync(...) — async void is only ever correct for an event handler.",
      },
      {
        family: "state",
        title: "List<T>.Add from many concurrent tasks",
        signal: "silent",
        severity: "blocker",
        body:
          "Every UploadOne task appends to the same List<string>. List<T> is not thread safe: concurrent Adds race on the count and the backing array, so entries are silently overwritten, and an Add that lands during a resize can throw IndexOutOfRangeException from inside the framework or leave a null hole. The manifest is short by an amount that varies per run, and a short manifest is indistinguishable from files that genuinely failed to upload — which is what the manifest exists to tell you.",
        fix: "Return the path from UploadOne and collect the results of Task.WhenAll, or use ConcurrentBag.",
      },
      {
        family: "failure",
        title: "A non-success response is silently dropped",
        signal: "silent",
        severity: "blocker",
        body:
          "The `if (response.IsSuccessStatusCode)` has no else. A 403 from an expired credential, a 413 on an oversized file and a 500 from the storage tier all end the same way: the file is absent from _uploaded and nobody is told. The count printed at the end is then the only signal, and it is a number with no names attached. IsSuccessStatusCode is also 2xx only, so a 307 redirect reads as failure, while a 200 carrying an error document in its body reads as success.",
        fix:
          "response.EnsureSuccessStatusCode() inside a try, and return a per-file outcome that names the status and the path.",
      },
      {
        family: "boundary",
        title: "The object key is the file name, not the path",
        signal: "silent",
        severity: "major",
        body:
          "Path.GetFileName collapses 2024/report.csv and 2025/report.csv onto the same object. The second upload overwrites the first, both return 200, both are added to the manifest, and the run reports two files uploaded. The data loss is complete, silent and confirmed by the log.",
        fix:
          "Key on the path relative to the upload root, normalized and URI-escaped — and set If-None-Match if overwriting should be an error.",
      },
      {
        family: "time",
        title: "No concurrency limit and no per-file timeout",
        signal: "mixed",
        severity: "major",
        body:
          "paths is an IEnumerable, so a lazily enumerated directory walk starts a task per file with no ceiling — a hundred thousand files means a hundred thousand open streams and sockets, and File.OpenRead will start throwing before HttpClient does. HttpClient's default 100-second timeout applies per request, and Task.WhenAll waits for the slowest, so one stalled upload holds every open file handle for the duration. Enumerating an IEnumerable exactly once also makes this method unsafe to retry with the same argument if the caller passed a LINQ query.",
        fix:
          "Parallel.ForEachAsync with MaxDegreeOfParallelism, a CancellationToken with a per-file deadline, and materialize the paths first.",
      },
    ],
  },
];
