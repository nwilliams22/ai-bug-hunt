import type { Drill } from "../types";

import s01 from "./samples/01-paginate.py?raw";
import s02 from "./samples/02-median.js?raw";
import s03 from "./samples/03-evict.py?raw";
import s04 from "./samples/04-expiry.py?raw";
import s05 from "./samples/05-sync.ts?raw";
import s06 from "./samples/06-orders.sql?raw";
import s07 from "./samples/07-seat.js?raw";
import s08 from "./samples/08-max.rs?raw";
import s09 from "./samples/09-email.py?raw";
import s10 from "./samples/10-batch.py?raw";
import s11 from "./samples/11-fetchall.go?raw";
import s12 from "./samples/12-discount.java?raw";
import s13 from "./samples/13-largeorders.cs?raw";
import s14 from "./samples/14-backup.sh?raw";
import s15 from "./samples/15-retry.py?raw";
import s16 from "./samples/16-shipping.py?raw";
import s17 from "./samples/17-getuser.diff?raw";
import s18 from "./samples/18-merge.diff?raw";
import s19 from "./samples/19-search.jsx?raw";

const t = (s: string) => s.replace(/\s+$/, "");

export const DRILLS: Drill[] = [
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
    hintFamily: "Two families: Contract, and Boundaries.",
    defects: [
      {
        family: "contract",
        title: "Ambiguous page indexing",
        signal: "silent",
        severity: "major",
        body:
          "The docstring says 'page number', which by convention is 1-indexed, but the arithmetic is 0-indexed. Called with page=1 the function silently skips the first 20 items. Nothing raises; users just never see the first page.",
        fix: "Pick a convention, state it in the docstring, and subtract 1 if 1-indexed.",
      },
      {
        family: "boundary",
        title: "Negative page silently returns real data",
        signal: "silent",
        severity: "major",
        body:
          "page=-1 produces start=-20, and Python slicing accepts negative indices. Instead of an error the caller gets the last page of results. A malformed or hostile request returns plausible data rather than a 400.",
        fix: "Validate page >= 1 (or >= 0) and per_page > 0 before slicing.",
      },
      {
        family: "failure",
        title: "Out-of-range page is indistinguishable from an empty result",
        signal: "silent",
        severity: "minor",
        body:
          "A page past the end returns [], which the caller cannot tell apart from a legitimately empty result set. This matters for pagination UIs deciding whether to show 'no results' or 'end of list'.",
        fix: "Return total count alongside the slice, or raise on out-of-range.",
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
    hintRegion: "Line 2 contains two separate defects.",
    hintFamily: "Silent coercion, Shared state, Boundaries.",
    defects: [
      {
        family: "coercion",
        title: "Default sort is lexicographic",
        signal: "silent",
        severity: "blocker",
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
    hintRegion: "This function passes any test where nothing happens to be stale.",
    hintFamily: "Shared state, plus a Contract issue.",
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
      {
        family: "contract",
        title: "Mutates in place but also returns",
        signal: "silent",
        severity: "minor",
        body:
          "Returning the same object it mutated implies to a reader that the input is left alone. Callers will write `cache = evict_stale(cache, ...)` and assume the original is intact. Pick one: mutate and return None, or copy and return the copy.",
        fix: "Return None, or build and return a new dict.",
      },
      {
        family: "boundary",
        title: "Strict inequality at the TTL boundary",
        signal: "silent",
        severity: "nit",
        body:
          "An entry exactly ttl seconds old is retained. Whether that's right depends on whether the TTL is inclusive, and the docstring doesn't say. Minor, but flagging undocumented boundary semantics is exactly what these rubrics reward.",
        fix: "Document the intent; use >= if TTL is meant to be exclusive.",
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
    hintFamily: "Time & concurrency.",
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
        family: "contract",
        title: "utcnow() is deprecated",
        signal: "loud",
        severity: "minor",
        body:
          "As of Python 3.12, datetime.utcnow() emits a DeprecationWarning precisely because it returns a naive object that people treat as aware. Its presence in new code is a signal the author copied an older pattern without checking.",
        fix: "Use datetime.now(timezone.utc).",
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
    hintFamily: "Time & concurrency, Failure surface.",
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
    hintFamily: "Contract.",
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
        fix: "Compare against an explicit timestamptz, parameterised rather than inlined.",
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
    hintFamily: "Time & concurrency, Boundaries.",
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
      {
        family: "coercion",
        title: "NaN is silently skipped",
        signal: "silent",
        severity: "minor",
        body:
          "Every comparison involving NaN is false, so `v > max` never fires for a NaN and it is dropped without comment. Whether that is correct depends on the caller, but a function that silently discards invalid input rather than reporting it is making a policy decision the signature doesn't disclose.",
        fix: "Document the NaN policy, or use total_cmp and surface it.",
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
      "In Python's re module, `$` does not mean quite what you think it means.",
    hintFamily: "Boundaries, Contract.",
    defects: [
      {
        family: "boundary",
        title: "`$` matches before a trailing newline",
        signal: "silent",
        severity: "blocker",
        body:
          'In Python, `$` matches at the end of the string *or* immediately before a newline at the end of the string. So "attacker@evil.com\\nvictim@bank.com" passes validation. Anywhere the validated value is later written into a header, a log line, or an SMTP envelope, that newline is an injection vector. This is a genuine security defect hiding behind a correct-looking regex.',
        fix: "Use re.fullmatch, or anchor with \\A and \\Z.",
      },
      {
        family: "contract",
        title: "Uppercase TLDs are rejected",
        signal: "silent",
        severity: "major",
        body:
          "[a-z]{2,} is case-sensitive with no re.IGNORECASE flag, so USER@EXAMPLE.COM fails validation. Email domains are case-insensitive, so this rejects legitimate addresses — and it will look to support like an intermittent bug, because it depends on how the user typed it.",
        fix: "Add re.IGNORECASE, or normalise before matching.",
      },
      {
        family: "coercion",
        title: "\\w is Unicode-aware by default",
        signal: "silent",
        severity: "minor",
        body:
          "In Python 3, \\w matches Unicode word characters, including non-ASCII digits and letters. The pattern therefore accepts local parts the author almost certainly did not intend, while the rest of the pattern assumes ASCII. The intent is inconsistent with the implementation.",
        fix: "Use re.ASCII if ASCII was intended, or commit to full internationalised addresses.",
      },
      {
        family: "failure",
        title: "Non-string input raises rather than returning False",
        signal: "loud",
        severity: "minor",
        body:
          "Passing None or an int raises TypeError from inside a function whose name promises a boolean. Validators are usually called on untrusted input, which is exactly where this will happen.",
        fix: "Type-check and return False, or annotate and validate upstream.",
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
      "Try list(batch(range(10), 3)) on paper and write down what you actually get.",
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
      {
        family: "contract",
        title: "Local name shadows the function name",
        signal: "silent",
        severity: "nit",
        body:
          "The local variable `batch` shadows the function `batch` inside its own body. Harmless here since there is no recursion, but it blocks any future recursive or self-referential use and reads badly in a traceback.",
        fix: "Rename the local to `current`.",
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
        title: "Concurrent writes to an unsynchronised map",
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
      {
        family: "contract",
        title: "The Javadoc describes behaviour the body does not have",
        signal: "silent",
        severity: "minor",
        body:
          "'round to the nearest cent' is exactly what the code fails to do. This is the characteristic AI pattern: the comment states the intent, the body states something else, and because the comment reads as documentation rather than as a claim to be checked, reviewers skim past it. Treat every docstring as an assertion to verify, never as evidence.",
        fix: "Fix the arithmetic, then keep the Javadoc as the test oracle.",
      },
      {
        family: "coercion",
        title: "Math.round is asymmetric around zero",
        signal: "silent",
        severity: "nit",
        body:
          "Math.round breaks ties toward positive infinity: Math.round(2.5) is 3 but Math.round(-2.5) is -2. Anywhere refunds or credits are negative, the rounding is biased in one direction. Most finance code wants HALF_UP or HALF_EVEN on magnitude instead.",
        fix: "BigDecimal.setScale(2, RoundingMode.HALF_UP).",
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
        fix: "Materialise once: var large = orders.Where(...).ToList(); then log large.Count and return it.",
      },
      {
        family: "failure",
        title: "Deferred execution escapes the lifetime of its context",
        signal: "loud",
        severity: "blocker",
        body:
          "If `orders` is backed by an Entity Framework DbSet scoped to the request, the returned query executes wherever the caller happens to iterate it — possibly after the DbContext has been disposed, which throws ObjectDisposedException from a stack frame with no obvious relationship to this method. The exception surfaces in the view layer and the investigation starts in the wrong file.",
        fix: "Materialise before returning, or return IQueryable deliberately and document that the caller owns the lifetime.",
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
      {
        family: "boundary",
        title: "A null `orders` fails at the caller, not here",
        signal: "loud",
        severity: "minor",
        body:
          "Where() on a null source throws ArgumentNullException — but only when enumerated. Here that happens at the Count() call, which is at least inside this method; had the log line not existed, the NullReferenceException would have surfaced in the caller's foreach with this method absent from the stack.",
        fix: "ArgumentNullException.ThrowIfNull(orders) at the top.",
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
        title: "An unset argument expands to nothing and deletes the filesystem root",
        signal: "silent",
        severity: "blocker",
        body:
          "With no argument, BACKUP_DIR is the empty string, so `rm -rf $BACKUP_DIR/*` expands to `rm -rf /*`. Running as root from cron, that is the machine. Nothing in the script checks that the argument exists or that it points anywhere sane. This is the single most destructive shape in shell scripting and it is one missing crontab argument away at all times.",
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
    hintFamily: "Failure surface, Contract, Boundaries.",
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
        title: "Backoff with no jitter synchronises every client",
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
          "Every caller that gets a hit receives the same object reference. One caller mutating the returned user — even something innocuous like deleting a field before serialising — corrupts what every subsequent caller sees, and the corruption persists in memory with no way to trace it back.",
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
        title: "It is a silent behaviour change for every existing caller",
        signal: "silent",
        severity: "blocker",
        body:
          "Before the change, `override={'db': {'host': 'x'}}` replaced the whole db section, so any key the override omitted was gone. After it, the omitted keys survive from base. Both behaviours are defensible, but callers were written against the first, and nothing tells them the second is now in force: no version bump, no docstring change, no test. Somewhere there is a caller passing a deliberately reduced section in order to clear fields, and it now silently stops clearing them. Flagging the compatibility break is the finding here, not the merge logic itself.",
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
          "Only dict values recurse. A list value in override replaces the base list entirely. That asymmetry is a real design decision — most config systems land on it — but it is now undocumented behaviour that a user will discover when appending one item to a list wipes out the other ten.",
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
          "Config loaders routinely return OrderedDict, defaultdict — both fine, they subclass dict — but also custom Mapping types that do not. Those take the else branch and replace instead of merging, so the function's behaviour depends on which YAML library produced the object.",
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
];

export const DRILL_BY_ID = new Map(DRILLS.map((d) => [d.id, d]));
