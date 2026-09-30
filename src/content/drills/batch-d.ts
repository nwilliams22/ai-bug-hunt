import type { Drill, Verdict } from "../../types";
import s50 from "../samples/50-token-expiry.py?raw";
import s51 from "../samples/51-tags.py?raw";
import s52 from "../samples/52-batches.py?raw";
import s53 from "../samples/53-retry.py?raw";
import s54 from "../samples/54-quarter-total.py?raw";
import s55 from "../samples/55-price-cache.py?raw";
import s56 from "../samples/56-cache.ts.diff?raw";
import callers56 from "../samples/56-callers.ts.diff?raw";
import reader56 from "../samples/56-reader.ts?raw";
import s57 from "../samples/57-range.sql.diff?raw";
import s58 from "../samples/58-maximum.py?raw";
import s59 from "../samples/59-cutoff.py?raw";

/** Answer-side reasoning only: never display this before a committed review. */
export const CLEAN_REVIEW: Record<number, { verdict: Verdict; mistakenFor: number; reason: string }> = {
  50: { verdict: "approve", mistakenFor: 4,
    reason: "Both timestamps are checked for awareness and normalized to UTC before comparison, including across daylight-saving folds. Missing expiry fails closed and equality expires the token. Try equal instants expressed with different offsets: no naive/aware comparison remains. Filing the timezone bug from drill 4 here would ask the author to fix code that already handles it." },
  51: { verdict: "approve", mistakenFor: 43,
    reason: "The default list is shared, but no path mutates it. copy() gives each call a fresh list; elements are immutable strings, so a shallow copy is sufficient. Call twice, mutate a returned list, and call again: the default and caller's list remain unchanged. A mutable default is a suspicion to trace, not a finding by itself." },
  52: { verdict: "approve", mistakenFor: 10,
    reason: "range excludes len(items). Empty input produces no chunks; an exact multiple produces no empty tail; the final slice retains a short remainder. size is contractually an integer and nonpositive values are rejected. Nothing is skipped or duplicated, and slices do not mutate the input." },
  53: { verdict: "approve", mistakenFor: 37,
    reason: "This retries an immutable, side-effect-free read, not a debit. Only TransportTimeout is retried, permanent failures propagate, invalid attempt counts fail explicitly, and the final timeout is re-raised. Immediate bounded retries are the stated background-worker policy. Demanding payment idempotency here would be a false positive." },
  54: { verdict: "approve", mistakenFor: 32,
    reason: "0.25 is exactly representable in binary. With at most 1000 counts, each no greater than 1000, every intermediate sum is an exact multiple of one quarter and far below the precision limit. This contract has no tax or currency conversion. General warnings about floats do not establish a rounding defect in this domain." },
  55: { verdict: "approve", mistakenFor: 38,
    reason: "The cache key contains both base and the complete immutable rate snapshot; a refresh changes the key. The returned tuple contains only immutable strings and the cache is bounded at 128 entries. Duplicate concurrent computation is explicitly acceptable. Trace the key and ownership before claiming the stale-base or escaped-mutable-result bugs." },
  56: { verdict: "approve", mistakenFor: 48,
    reason: "Both writers move from milliseconds to seconds in the same change, while the unchanged readers pass no duration. An explicit zero remains zero because the default tests undefined, and get rejects equality with expiry. The supplied inventory is complete and key cardinality is bounded. A fifteen-minute session still gets 900 seconds, multiplied once." },
  57: { verdict: "approve", mistakenFor: 46,
    reason: "The new interval includes its lower bound and excludes the next day's start. Adjacent windows therefore partition the rows without dropping or double-counting midnight. This change does not introduce a stored column, so there is no missing writer migration to request. Empty reports still return zero." },
  58: { verdict: "approve-with-comments", mistakenFor: 8,
    reason: "Seeding from the first element handles all-negative inputs, and empty input has an explicit error. The only finding is the copied docstring's word 'smallest'. Correct that nit without blocking otherwise correct maximum logic." },
  59: { verdict: "approve-with-comments", mistakenFor: 47,
    reason: "Ask: 'Does the event producer guarantee ascending timestamps, and can we document that contract here?' The producer does supply sorted events in this exercise, but that precondition is absent from the submitted context. bisect_left then includes every duplicate at cutoff and returns the correct suffix. There is no evidence of an unsorted production input: an unsorted counterexample establishes the need for a precondition, not a confirmed defect. Request the missing contract rather than assert data loss or demand a speculative sort." },
};

export const DRILLS_BATCH_D: Drill[] = [
  { id: 50, slug: "aware-expiry", lang: "Python", level: "Standard", title: "Validate token expiry", shape: "function", code: s50.trim(),
    brief: "Review the expiry decision. Tokens are invalid at the expiry instant; callers handle ValueError for invalid timestamp inputs.",
    hintRegion: "Trace awareness, conversion and equality independently.", hintFamily: "Use the time and contract passes to establish whether a finding is justified.", defects: [] },
  { id: 51, slug: "request-tags-copy", lang: "Python", level: "Standard", title: "Append a request tag", shape: "function", code: s51.trim(),
    brief: "Names and tags are strings. Callers may mutate their input and returned lists after the synchronous call.",
    hintRegion: "Follow which list each append reaches, including consecutive default calls.", hintFamily: "Use the state pass: sharing a value and mutating it are different operations.", defects: [] },
  { id: 52, slug: "snapshot-batches", lang: "Python", level: "Standard", title: "Partition a snapshot", shape: "function", code: s52.trim(),
    brief: "The caller supplies a finite list and an integer size. Return each item exactly once without mutating the input.",
    hintRegion: "Trace lengths 0, size, and size + 1.", hintFamily: "Use the boundary and contract passes; establish an actual failing input before filing.", defects: [] },
  { id: 53, slug: "snapshot-retry", lang: "Python", level: "Standard", title: "Retry a snapshot read", shape: "function", code: s53.trim(),
    brief: "Review this background worker helper. attempts is an integer. The fetch contract in the docstring is guaranteed by the storage client.",
    hintRegion: "Trace a timeout on the last attempt and a permanent error on the first.", hintFamily: "Use the failure and time passes; distinguish reads from non-idempotent writes.", defects: [] },
  { id: 54, slug: "quarter-dollar-total", lang: "Python", level: "Standard", title: "Total kiosk purchases", shape: "function", code: s54.trim(),
    brief: "Input validation already enforces the docstring's bounds. The API requires a floating-point dollar total.",
    hintRegion: "Establish the representation and maximum possible intermediate total.", hintFamily: "Use the coercion and boundary passes with the actual input domain.", defects: [] },
  { id: 55, slug: "snapshot-price-cache", lang: "Python", level: "Hard", title: "Cache a rendered price table", shape: "function", code: s55.trim(),
    brief: "Rates are complete immutable snapshots, each at most 100 currencies. The function formats quotes; it does not fetch live rates.",
    hintRegion: "Trace two bases and two snapshots through the key, then inspect the returned value.", hintFamily: "Use the state and time passes to establish ownership and freshness.", defects: [] },
  { id: 56, slug: "cache-seconds-rollout", lang: "TypeScript", level: "Hard", title: "Roll out cache duration units", shape: "diff", code: s56.trim(),
    files: [{ path: "cache.ts.diff", code: s56.trim() }, { path: "callers.ts.diff", code: callers56.trim() }, { path: "reader.ts", code: reader56.trim() }],
    brief: "Review the complete rollout to seconds. All files deploy atomically with a process restart; durations are at most one hour. Treat Date.now as the demo's nondecreasing expiry clock.",
    hintRegion: "Inventory every duration argument, including zero, and every unchanged caller.", hintFamily: "Use contract, time and coercion passes across the file boundary.", defects: [] },
  { id: 57, slug: "report-half-open", lang: "SQL", level: "Standard", title: "Adjust the daily report boundary", shape: "diff", code: s57.trim(),
    brief: "PostgreSQL: sales amounts are non-null integer cents; sold_at and both supplied boundaries are UTC timestamps. Adjacent reports must include every sale exactly once.",
    hintRegion: "Put one row exactly at each endpoint and compare adjacent days.", hintFamily: "Use the boundary pass, then check whether this diff changes any writer contract.", defects: [] },
  { id: 58, slug: "maximum-docstring", lang: "Python", level: "Standard", title: "Find the maximum measurement", shape: "function", code: s58.trim(),
    brief: "The caller needs the largest integer measurement and handles ValueError for an empty list.",
    hintRegion: "Try all-negative input, then compare the documentation with the implementation.", hintFamily: "Use boundary and contract passes; calibrate severity to the actual consequence.",
    defects: [{ family: "contract", title: "Docstring says smallest instead of largest", signal: "silent", severity: "nit",
      body: "For [-9, -2], maximum correctly returns -2, but the docstring promises the smallest value. Runtime behavior matches the ticket and function name; the copied word only misleads a reader. It does not justify requesting changes to the algorithm.",
      fix: "Change 'smallest' to 'largest' in the docstring; approve with this nonblocking comment." }] },
  { id: 59, slug: "event-cutoff-contract", lang: "Python", level: "Hard", title: "Select events since a cutoff", shape: "function", code: s59.trim(),
    brief: "Review the helper used by an event export. Events and cutoff are integer timestamps. The producer implementation is not included; distinguish questions about its contract from established defects.",
    hintRegion: "What property does bisect_left require from its input, and where is that property established?", hintFamily: "Use the contract pass. Missing evidence can call for a question rather than a defect claim.",
    defects: [{ family: "contract", title: "Question: is ascending order guaranteed?", signal: "silent", severity: "minor",
      body: "The helper's documentation omits the ordering precondition. On sorted input, including tied timestamps, its result is correct. On [30, 10, 20] the same search need not return all eligible events, but nothing in this review establishes that the producer can supply that order. Treat this as a documentation question, not a proven runtime failure.",
      fix: "Ask whether the producer guarantees ascending timestamps. It does in this exercise: document that precondition and link its guarantee. Do not block on an invented production counterexample." }] },
];
