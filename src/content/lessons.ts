import type { Lesson, Module } from "../types";

export const MODULES: Module[] = [
  {
    id: "orientation",
    title: "Orientation",
    blurb: "What the work actually is, and why this code fails in its own particular way.",
  },
  {
    id: "method",
    title: "The six-pass review",
    blurb: "A fixed order of questions that finds defects by construction rather than by inspiration.",
  },
  {
    id: "practice",
    title: "Working the review",
    blurb: "Reading a diff, writing the finding, and deciding the verdict.",
  },
];

export const LESSONS: Lesson[] = [
  /* ------------------------------------------------------------------ */
  {
    id: "the-job",
    moduleId: "orientation",
    title: "The job, and what it rewards",
    blurb: "Reviewing generated code is a different skill from writing it.",
    practice: [1, 2],
    body: `
You are handed a function, or a diff, that is syntactically perfect, idiomatically
plausible, well named, and commented. Your job is to decide whether it is correct,
and if it is not, to say precisely why.

This is not the same skill as writing the code yourself. When you write, you build a
mental model first and the text follows it. When you review generated code, the text
arrives first and it *supplies* you a mental model — a confident, fluent, wrong one.
The entire difficulty of the work is that reading plausible code installs the author's
assumptions in your head before you have had a chance to check them.

## What gets paid for

Across the review rubrics this kind of contract work uses, four things are consistently
rewarded, in roughly this order:

1. **Finding the silent defect.** A crash is found by running the code. Nobody needs a
   human for that. The value is in the defect that returns a plausible wrong answer —
   the median computed on a lexicographic sort, the report that drops every user with
   zero orders. Those survive tests, survive staging, and surface as a business number
   that is quietly wrong for six months.
2. **Naming the mechanism.** "This looks fragile" is worth nothing. "Array.prototype.sort
   with no comparator coerces to strings, so [10, 9, 100] orders as [10, 100, 9]" is worth
   everything. The mechanism is what makes the finding checkable by someone who
   disagrees with you.
3. **A concrete failing input.** The shortest input that produces a wrong output. This is
   the difference between an opinion and a bug report, and it is what turns your review
   into a test case.
4. **Calibration.** Knowing that the shadowed variable name is a nit and the missing
   cache invalidation is a blocker — and *saying so*. A reviewer who files everything at
   the same urgency has told the reader nothing.

## What gets penalised

- **Style comments dressed as defects.** If it does not change behaviour, it is not a
  defect. Say it separately or not at all.
- **Vagueness.** "Might have concurrency issues" is unfalsifiable and therefore useless.
- **Volume.** Ten weak findings are worse than three strong ones; they cost the reader
  time and they cost you credibility for the one that mattered.
- **Missing the obvious one while finding a clever one.** Run the passes in order. The
  boring pass catches the expensive bug.

## How to use this course

Read the method module once through. Then do drills. The drills are gated: you must
write your review before the answers unlock, because *recognition feels like learning
and is not*. Reading a defect and thinking "yes, obviously" builds nothing. Writing
"I don't see anything", then discovering four defects, builds a great deal.

> Score yourself honestly. If you gestured at the right area without naming the
> mechanism, that is a miss. The rubric that pays you will score it as a miss.
`,
  },

  {
    id: "how-ai-code-fails",
    moduleId: "orientation",
    title: "How AI-generated code fails differently",
    blurb: "Ten failure modes that follow from how the code is produced.",
    practice: [12, 16, 17],
    body: `
Human code and generated code do not fail the same way, because they are not produced
the same way. A human writes a bug because they held the wrong model of the problem.
A model writes a bug because it produced the most plausible *text*, and plausibility
and correctness come apart in specific, learnable places.

Knowing the failure modes is most of the skill. They are not exotic.

## 1. Plausibility is the objective, correctness is a side effect

The output is optimised to look like code that works. Everything that signals
correctness to a skimming reader — good names, a docstring, consistent style, a
complete-looking set of branches — is present *because it is a surface feature*. Your
priors about what well-written code implies about its author no longer hold. Treat
fluency as carrying no information at all.

## 2. The docstring is a second guess, not a description

A model writes the comment from the function name, not from the body it just emitted.
So the comment is an independent attempt at the same problem — which makes a
disagreement between comment and code genuinely common, and genuinely informative.

> **Read every docstring as an assertion to be checked against the body.** When they
> disagree, you have found a defect *and* you have been told what the intent was.
> That is the highest-value thing a comment can do and most reviewers skim past it.

## 3. The happy path is finished; the edges are decorative

Training data is overwhelmingly code in the middle of its range. Empty input, a single
element, zero, negative, duplicate, and maximum are handled in real codebases by a
layer somewhere else — a validator, a caller, a framework. The model was asked for the
function, so you get the function, with the guards silently omitted.

## 4. It is fluent in the median idiom, which may be years out of date

\`datetime.utcnow()\`. Pre-1.22 Go loop-variable capture. \`componentWillMount\`.
\`md5\` for anything. The weight of the training corpus is historical, so idioms that
were correct for years and are now wrong have enormous mass. **When you see an API
used confidently, check whether it is still the right one**; this is a reliable,
cheap source of real findings.

## 5. Each part is right and the composition is wrong

This is the one that separates good reviewers from adequate ones. Ask a model to add a
cache and it writes a correct cache. It does not write the invalidation, because you
did not ask for the invalidation, and nothing in the local text demands it. The defect
is *not on any line of the diff* — it is in the code that should exist and does not.
Reviewing only the lines shown will never find it.

Same shape: a transaction opened and not committed on one path. A retry added without
idempotency. A new column with no backfill. A feature flag with no default.

## 6. Concurrency is written as if single-threaded

A single file read top to bottom is the model's entire view, and that view contains
exactly one caller. Check-then-act, unsynchronised shared maps, effects that race
themselves — these are not oversights, they are what you get when the code is a
description of one sequence of events.

## 7. Errors are handled in the shape that looks handled

\`except Exception: pass\` and \`return None\` both terminate every path, which makes the
function *look* total. They are the textual signature of completeness and the semantic
signature of a system nobody can operate. Ask of every error path: can the caller tell
what happened, and can they do anything about it?

## 8. Security defaults are omitted, not refused

No parameterisation, no escaping, no encoding, no authorisation check, no timeout.
None of these are visible as absences. The code does not look insecure; it looks short.

## 9. It will agree with you

If you ask "is this correct?", you will be told yes. If you ask "isn't this a race
condition?", you will be told yes to that too. Agreement carries no signal in either
direction. **Never resolve a review question by asking the model that wrote the code.**
Resolve it by constructing the failing input.

## 10. The tests encode the bug

When tests are generated alongside the implementation, they are generated *from the
implementation*. They will pass. They will assert the buggy behaviour as expected
behaviour, in confident prose:
\`assert paginate(items, 1) == items[20:40]  # second page\`.

A green test suite on generated code means the code is self-consistent, not that it is
correct. **Review the tests as adversarially as the implementation, and specifically
look for the edge cases that are absent.** The test file's gaps map exactly onto the
implementation's gaps, because they have the same author.
`,
  },

  /* ------------------------------------------------------------------ */
  {
    id: "six-passes",
    moduleId: "method",
    title: "The method: six passes, in order",
    blurb: "Why a fixed order beats reading carefully.",
    body: `
Reading code "carefully" is not a method. It is an intention, and it degrades under
time pressure, fatigue, and — most of all — under the fluency of the text you are
reading. You need something that finds defects by construction.

The method is six passes. You read the same code six times, each time asking exactly
one question and deliberately ignoring everything else.

1. **Contract** — does the name, signature and docstring match the body?
2. **Boundaries** — what happens at empty, one, zero, negative, duplicate, maximum?
3. **Shared state** — is anything mutated that the caller still holds?
4. **Time & concurrency** — what if two run at once, or the clock isn't what you assume?
5. **Silent coercion** — where does a type quietly become a different type?
6. **Failure surface** — when this goes wrong, does it fail loudly or quietly?

## Why six passes rather than one careful read

Because a single read is dominated by whatever you noticed first. Once you have spotted
one defect, your attention collapses onto it and the remaining five families go
unexamined. Every drill in this course has three to six planted defects spanning
several families, for exactly this reason: the common failure of a real reviewer is
not finding nothing, it is finding the first thing and stopping.

Separating the passes also lets you be *shallow* on each one, which is faster than
being deep once. The boundary pass is a mechanical checklist — you are not thinking,
you are substituting values. That is a different and much more reliable cognitive mode
than "look for problems".

## Order matters

Run them in the order above. Contract first, because it tells you what the code is
*supposed* to do, and everything after depends on knowing that. Failure surface last,
because you now know all the ways it can go wrong and can ask whether each of them is
visible.

## The budget

For a function of the size in these drills, thirty seconds a pass is enough once the
passes are habitual. Three minutes total. If you find yourself spending fifteen minutes
on one function, you are debugging, not reviewing — write down the question you cannot
answer and move on; an unanswered question is itself a legitimate review comment.

> **The most useful sentence in a code review is "I could not determine X from this
> diff."** It is not an admission of failure. It says the change is not reviewable as
> submitted, which is a real defect in the change.
`,
    practice: [3],
  },

  {
    id: "pass-contract",
    moduleId: "method",
    title: "Pass 1 — Contract",
    blurb: "Does the name, signature and docstring match what the code does?",
    practice: [1, 6, 12, 15],
    body: `
**The question:** if I only read the name, the signature and the docstring, what would I
expect this to do? Now read the body. Do they agree?

This pass is first because everything else depends on knowing what "correct" means, and
the only statement of intent you have is the prose around the code. It is also the pass
with the best yield on generated code, because the prose and the body are two
independent guesses at the same problem.

## What to look for

- **Index conventions.** "Page number" is 1-indexed by convention; \`page * per_page\` is
  0-indexed. Nothing raises. Every user silently loses the first page.
- **Parameter names that imply semantics the body doesn't have.** \`retries=3\` that
  produces three total attempts. \`timeout\` that is a per-read timeout, not a total one.
- **Docstrings describing absent behaviour.** "Rounds to the nearest cent" above code
  that truncates to whole units. This is a finding *and* a statement of intent — it
  tells you which of the two is the bug.
- **Return types that vary by path.** Returns a list here, None there, raises over there.
  The caller now needs to handle three shapes and the signature mentions one.
- **Functions that both mutate and return.** \`return cache\` after deleting from \`cache\`
  tells the reader the input is untouched. It is not.
- **A deprecated or superseded API used confidently.** \`datetime.utcnow()\`. This is
  cheap to check and reliably productive.
- **Unstated ordering in a list of rules.** A spec that lists four rules has no
  precedence; a chain of early returns invents one. See the shipping-cost drill — the
  code silently decided something nobody agreed to.

## Worked example

\`\`\`sql
SELECT u.id, COUNT(o.id)
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE o.created_at >= '2026-01-01'
GROUP BY u.id;
\`\`\`

The contract question is not "is this valid SQL". It is: *what was the LEFT JOIN written
to accomplish?* It exists to keep users with no matching orders. Does the query still do
that? No — the WHERE clause evaluates \`NULL >= '2026-01-01'\` for exactly those rows,
which is NULL, which is not true, so they are filtered out. The LEFT JOIN has been
silently demoted to an INNER JOIN and the query answers a different question than the
one it was written to answer.

Note the shape of that reasoning. You did not need to spot anything clever. You asked
what a construct was *for*, then checked whether it still does it.
`,
  },

  {
    id: "pass-boundary",
    moduleId: "method",
    title: "Pass 2 — Boundaries",
    blurb: "Empty, one, zero, negative, duplicate, maximum.",
    practice: [2, 8, 10, 14],
    body: `
**The question:** substitute each boundary value and trace what happens. Not "are the
edge cases handled" — actually substitute.

This is the most mechanical pass and it has the highest hit rate on generated code,
because happy-path code is what the training corpus is made of.

## The list

Run every one of these against every input the function takes:

| Value | What it typically breaks |
| --- | --- |
| **empty** | \`[]\`, \`""\`, \`{}\` — sentinel returns, NaN, index errors |
| **one** | single-element collections degenerate; \`mid - 1\` goes negative |
| **zero** | division, modulo, \`size=0\` loops that never terminate a batch |
| **negative** | seeded accumulators, Python's negative slice indices |
| **duplicate** | set/dict collapse, React keys, dedupe that loses data |
| **maximum** | unbounded fan-out, memory, integer overflow, pool exhaustion |
| **missing** | \`None\`/\`null\`/\`undefined\` where the type says otherwise |

## The two highest-value shapes

**The seeded accumulator.** \`let mut max = 0.0\`. For all-negative input this returns
zero — a value that does not appear anywhere in the data. It is completely silent, and
it lands in temperature, delta, and profit-and-loss code constantly. Whenever you see an
accumulator initialised to a literal, ask whether that literal is a possible answer.

**The trailing partial.** A loop that flushes only when \`len(buf) == size\` drops
whatever is left over at the end. Ten items, batches of three, and the tenth item is
silently gone. In an ETL or a bulk-send path that is data loss with no error — the worst
category of defect there is.

## Off-by-one at a threshold

\`> 100\` versus \`>= 100\` looks like a nit and usually is not, because thresholds are
exactly where real values cluster. Prices land on round numbers. TTLs are compared
against their own value. Do not rule it a nit until you have asked whether the boundary
value is common in practice — and either way, **an undocumented boundary is a legitimate
finding on its own**, because it means nobody has decided.

## Why this pass is fast

You are not looking for problems. You are substituting seven values and reading. It is
closer to arithmetic than to insight, which is precisely why it survives fatigue and
time pressure when "read carefully" does not.
`,
  },

  {
    id: "pass-state",
    moduleId: "method",
    title: "Pass 3 — Shared state",
    blurb: "Is anything mutated that the caller still holds a reference to?",
    practice: [2, 3, 10, 11],
    body: `
**The question:** after this returns, which objects does the caller still hold that are
not what they were?

Aliasing is invisible in the text of a program, and text is all a generator has. This is
the pass where a model's strongest cue — naming — actively lies to it.

\`\`\`js
const sorted = times.sort();
\`\`\`

There is nothing in that line to suggest \`sorted\` and \`times\` are the same array. The
name says copy. The semantics say in-place. Both the model and a tired reviewer read the
name.

## What to look for

- **In-place operations on an argument.** \`.sort()\`, \`.reverse()\`, \`.clear()\`,
  \`.append()\`, \`del\`, \`+=\` on a list. The caller's data changed and the signature
  did not say it would.
- **Mutation during iteration.** \`del cache[key]\` inside \`for k in cache.items()\`
  raises — *but only when something is actually stale*. The unit test with fresh entries
  passes cleanly and it detonates the first time the TTL elapses in production. Watch for
  defects whose trigger condition is also the condition the test does not create.
- **Mutable default arguments.** \`def f(items=[])\` — one list shared across every call
  for the lifetime of the process.
- **A reused buffer that is yielded or returned.** The batching generator drill: every
  yielded batch is the same list object, so a consumer that accumulates gets N references
  to one thing. Works perfectly for a consumer that processes immediately, which is how
  it passes review.
- **Shallow copies of nested data.** \`base.copy()\` copies the outer dict and shares every
  nested one. The result and the input are entangled at depth 2.
- **Shared objects handed to multiple callers.** A cache that returns the same object
  reference to everyone: one caller mutating it corrupts what all the others see, in
  memory, with no trace.

## The diagnostic

For every collection the function touches, ask three questions in order:

1. Who else holds a reference to this?
2. Does this function change it?
3. Does the signature say so?

If the answers are *someone*, *yes*, and *no*, you have a finding — regardless of whether
you can name a concrete breakage. "The caller's array is reordered" is itself the defect.
`,
  },

  {
    id: "pass-time",
    moduleId: "method",
    title: "Pass 4 — Time & concurrency",
    blurb: "Two of these at once, and a clock you don't control.",
    practice: [4, 5, 7, 11, 19],
    body: `
**The question:** imagine a second identical call starting three milliseconds after this
one. Now interleave them line by line and find the pair of lines that must not be
separated.

A generated function describes one sequence of events, because one sequence is the only
story the text tells. Nothing in the source says "and now a second caller".

## Check-then-act

The single most common shape, and the most expensive:

\`\`\`js
const seat = await db.seats.findOne({ seatId });
if (seat.reserved) throw new Error("already reserved");
await db.seats.update({ seatId }, { reserved: true });
\`\`\`

Two requests both read \`reserved: false\`, both pass the guard, both write. Two people
are sold the same seat and **both receive a success response**. No error anywhere. Load
testing at low concurrency will never surface it; a ticket on-sale surfaces it in the
first second.

The fix is structural, not a lock: collapse the read and the write into one atomic
conditional operation — \`UPDATE ... WHERE reserved = false\` — and treat *zero rows
affected* as the failure case. Any time you see a read, a decision, and a write to the
same row, you have found this.

## Partial failure

\`await Promise.all(writes)\` followed by \`await cache.invalidate()\`. When the fourth of
fifty writes rejects, the await throws and the invalidation never runs — but the other
writes already landed. The store is partly updated and the cache still serves the old
values, which is the worst available outcome. Ask of every multi-step mutation: **if
this dies halfway, what is the state, and who repairs it?**

## Racing with yourself

An effect keyed on a value that changes faster than the request completes:

\`\`\`jsx
useEffect(() => {
  fetch("/api/search?q=" + query).then(r => r.json()).then(setResults);
}, [query]);
\`\`\`

Responses are not ordered. The response for \`a\` can land after the response for \`ab\`
and overwrite it. Reproduces approximately never on localhost and constantly on a
phone. Every effect that fetches needs a cleanup that cancels or ignores the in-flight
result — and its absence is a finding on sight.

## Clocks

- **Naive vs aware datetimes.** \`datetime.utcnow()\` returns a naive object representing
  UTC. Compared against an aware value it raises; compared against a naive *local* value
  it succeeds and is wrong by the offset. The second case is the dangerous one — tokens
  expire hours early or late with no error at all.
- **No timeout.** \`http.Get\` uses a client whose timeout is zero, meaning never. One
  unresponsive server holds a connection forever and any \`WaitGroup\` behind it never
  returns.
- **Backoff without jitter.** Every client that saw the outage retries at the same
  instants and knocks the recovering service back down.
- **Monotonic vs wall clock.** Durations measured with a wall clock go negative when NTP
  steps the time backwards.
`,
  },

  {
    id: "pass-coercion",
    moduleId: "method",
    title: "Pass 5 — Silent coercion",
    blurb: "Where does a type quietly become a different type?",
    practice: [2, 6, 12, 17],
    body: `
**The question:** for each expression, what is the static type of every subexpression,
and where does the language convert one to another without telling anyone?

These are the places where a language does something *helpful* instead of failing. The
idiom is common precisely because it is short, and it is short because the language is
doing the conversion for you.

## The reliable ones

**Default sort is lexicographic (JS).** \`[10, 9, 100].sort()\` gives \`[10, 100, 9]\`.
Every numeric sort without a comparator is wrong for any data that spans digit counts —
which for latencies, prices and counts is always. Returns a plausible number; never
throws.

**Integer division hiding inside a float expression (Java, C, Go, Rust).**

\`\`\`java
return Math.round((price - discount) * 100) / 100;
\`\`\`

\`Math.round(double)\` returns a **long**. So \`long / 100\` is integer division, the
fraction is discarded, and only then is the result widened back to double by the return
type. \`19.99\` becomes \`19.0\`. The signature says double the whole way through and the
arithmetic is integer in the middle. This is the one to slow down for: **work out the
type of every subexpression, not the type of the expression.**

**Float money.** \`double\` cannot represent most decimal fractions. Errors accumulate
across a basket and the total disagrees with hand arithmetic. Generates accounting
tickets nobody can reproduce. Decimal or integer cents, always.

**NaN comparisons are all false.** \`if v > max\` never fires for a NaN, so invalid input
is silently dropped rather than reported. The function has made a policy decision its
signature does not disclose.

**Truthiness where a falsy value is legitimate.**

\`\`\`ts
const cached = cache.get(id);
if (cached) return cached;
\`\`\`

If \`null\` is a real answer — this user does not exist — then a cached null is falsy and
never hits. The negative case is the one an attacker can generate at will, so the cache
makes the hostile path more expensive rather than less. Same family: \`if (count)\`,
\`if (name)\`, \`if (items.length)\` where 0 and \`""\` are valid.

**Date literal against a timestamp.** \`created_at >= '2026-01-01'\` coerces to midnight
in some timezone decided by the column type and the session. Month-boundary reports
drift by a day.

**Unquoted shell expansion.** \`$BACKUP_DIR\` containing a space becomes two arguments;
containing a glob character, it is expanded against the filesystem. Silent, and in a
\`rm -rf\` it is catastrophic.

## The habit

When a line mixes numeric types, or compares things of different kinds, or tests a value
for truth — stop and write the types down. That is the whole pass.
`,
  },

  {
    id: "pass-failure",
    moduleId: "method",
    title: "Pass 6 — Failure surface",
    blurb: "When this goes wrong, does it fail loudly or quietly?",
    practice: [7, 11, 14, 15, 19],
    body: `
**The question:** enumerate every way this can fail. For each one, ask what the caller
observes, and whether they can do anything about it.

This pass is last because you now know all the ways the code can go wrong, having just
spent four passes finding them.

## The failure taxonomy

For each failure, classify the caller's experience:

- **Loud** — raises, crashes, returns an error. Found by running the code. Low value:
  a machine can find these.
- **Silent** — returns a plausible wrong answer. **This is what the job pays for.** No
  test catches it unless someone already knew to write that test.
- **Invisible** — the failure is swallowed entirely and the caller believes it succeeded.
  Worse than silent, because even the operator has no signal.

## The shapes

**Discarded exceptions.** \`except Exception: pass\` catches the transient failure it was
written for, and also the deterministic one it cannot fix (a response body that is not
JSON), and also the programmer's typo (a NameError, retried three times and reported as
an upstream outage). **Catch only what you intend to handle.**

**\`return None\` where an error belongs.** The caller cannot distinguish "failed after
three attempts" from "the endpoint legitimately returned null" from "404" from "DNS
failure". The exception that explained it has already been destroyed. Every caller will
write \`if x is None:\` and guess.

**Failed and legitimately-empty are the same value.** A pagination helper that returns
\`[]\` past the end, and \`[]\` for an empty result. The UI cannot decide between "no
results" and "end of list".

**Success asserted rather than verified.** \`return { ok: true }\` without inspecting
whether the update matched any rows. The function reports what it attempted, not what
happened.

**Retries that cannot succeed.** Retrying a 400. Retrying a JSON parse error. Retrying a
non-idempotent write — which does not fail, it *duplicates*.

**Non-2xx returned as data.** \`requests.get(...).json()\` with no \`raise_for_status()\`.
A 503 whose body is JSON — typical for APIs — parses cleanly and is returned as the
data, on the first attempt, so the retry logic never engages for the failure it exists
for.

**Which item failed is unrecoverable.** \`Promise.all\` discards every other result once
one rejects. You know something failed; you cannot retry only the failures.

**Destroy-before-create.** A backup script that deletes the old copy, then writes the
new one. Halfway through a failure there is no valid backup at all.

## The verdict question

Finish the pass by answering one sentence: *when this breaks at 3am, what does the
on-call engineer see?* If the honest answer is "nothing", that is a blocker regardless
of how unlikely the failure is.
`,
  },

  /* ------------------------------------------------------------------ */
  {
    id: "reading-a-diff",
    moduleId: "practice",
    title: "Reviewing a change, not a function",
    blurb: "The defect is often in the code that should exist and doesn't.",
    practice: [17, 18],
    body: `
Most of the paid work is diffs, and a diff is harder than a function, because a diff
tells you where to look and *that is the problem*. Your attention is directed at the
changed lines by the tool itself, and the most expensive defects in generated changes
are not on them.

## Three questions, before the six passes

**1. What did this change do to existing callers?**

\`\`\`diff
-    result.update(override)
+    for key, value in override.items():
+        if isinstance(value, dict) and isinstance(result.get(key), dict):
+            result[key] = merge_configs(result[key], value)
+        else:
+            result[key] = value
\`\`\`

Before, an override replaced a whole section. After, it merges into it, so keys the
override deliberately omitted now survive. Both behaviours are defensible; the point is
that every existing caller was written against the first and nothing announces the
second. No docstring change, no version bump, no test. Somewhere there is a caller
passing a reduced section in order to *clear* fields, and it has silently stopped
clearing them.

**A silent compatibility break is a finding in its own right**, separate from whether
the new behaviour is better.

**2. What code should have changed and didn't?**

This is the highest-value question in diff review, and you cannot answer it by reading
the diff. Adding a cache without invalidation. Adding a retry without idempotency.
Adding a column without a backfill. Adding a state without a transition out of it.
Adding a flag without a default.

When a change introduces a *stateful mechanism*, look for its lifecycle: creation,
update, invalidation, expiry, failure. If the diff has one and not the others, the
change is incomplete, and the right review action is to say so rather than to polish the
lines in front of you.

**3. What new failure modes did this introduce?**

Not "is the new code good" — is there something it can now do that it could not do
before? The recursive merge can hit \`RecursionError\` on a self-referential config. The
previous one-liner could not. That is a new failure mode introduced by the change, and
it is a cleaner finding than any critique of the merge logic.

## Introduced versus pre-existing

Always say which. The shallow \`base.copy()\` in that diff aliases the caller's nested
data — but it did so before the change too. Report it, and label it pre-existing.

Reviewers who present pre-existing issues as regressions lose credibility fast.
Reviewers who never mention them miss real bugs. **Mention, and label.**

## Reading order for a diff

1. Read the PR description and the ticket. Write down what the change claims to do.
2. Read the diff once for *scope*: which files, which layers. A one-line description
   attached to a change across four layers is itself a flag.
3. Ask the three questions above.
4. *Now* run the six passes on the changed code.
5. Check the tests. Changed behaviour with unchanged tests means either the tests do not
   cover it or the behaviour change was not intended. Both are findings.
`,
  },

  {
    id: "writing-the-finding",
    moduleId: "practice",
    title: "Writing the finding",
    blurb: "Mechanism, failing input, signal, fix. In that order, every time.",
    practice: [2, 5],
    body: `
A defect you found and cannot communicate scores as a defect you did not find. The
format below is what review rubrics reward, and it is also just the fastest way to be
believed.

## The four parts

**1. Mechanism.** The specific language or system behaviour that causes it. Not what is
wrong — *why* it is wrong.

> \`Array.prototype.sort()\` with no comparator converts elements to strings before
> comparing.

**2. Concrete failing input.** The shortest input that produces a wrong output, with the
actual output written down.

> \`medianResponseTime([10, 9, 100])\` sorts to \`[10, 100, 9]\` and returns 100 instead
> of 10.

**3. Signal.** Loud or silent, and what the operator sees.

> Silent. Returns a plausible number. No exception, no log line, and every dashboard
> built on it is quietly wrong.

**4. Fix.** The smallest correct change.

> \`[...times].sort((a, b) => a - b)\` — the spread also fixes the in-place mutation of
> the caller's array.

## Put them together

> **Median is computed on a lexicographic sort.** \`Array.prototype.sort()\` with no
> comparator coerces elements to strings, so \`[10, 9, 100]\` orders as
> \`[10, 100, 9]\` and the function returns 100 rather than 10. Wrong for any data
> spanning digit counts, which for response times is all of it. Fails silently — a
> plausible number, no exception. Fix: \`[...times].sort((a, b) => a - b)\`.

Four sentences. Checkable by someone who disagrees with you. Directly convertible into
a test case.

## What to cut

- **"Might", "could", "potentially"** — if it is conditional, state the condition:
  "when \`page\` is 0" is precise; "could be a problem" is not.
- **The tour of your reasoning.** Nobody needs to know the order in which you thought
  about it.
- **Restating the code.** "This function sorts the array and then takes the middle
  element" adds nothing; the reader has the code.
- **Stacked hedges.** One clear claim you might be wrong about beats three vague ones you
  cannot be wrong about.

## When you are not sure

Say what you checked and what you could not determine. This is a legitimate and valuable
review comment, not a failure:

> \`cache.get\` returning \`null\` on a miss versus \`undefined\` decides whether the
> falsy check here is a bug. I could not determine which from this diff. If it returns
> \`null\`, every lookup of a nonexistent user misses the cache permanently.

That is better than both guessing and silence. It is precise about the boundary of your
knowledge and it hands the author a specific thing to answer.
`,
  },

  {
    id: "severity",
    moduleId: "practice",
    title: "Severity and the verdict",
    blurb: "Approve, approve with comments, or request changes — and why it matters.",
    practice: [16, 17],
    body: `
The deliverable is usually not a list of findings. It is a *decision*, with the findings
as evidence. A reviewer who files everything at the same urgency has told the reader
nothing.

## Four levels

**Blocker** — merging this causes data loss, corruption, a security hole, or wrong
output that nobody will notice. The dropped trailing batch. The lexicographic sort. The
cache with no invalidation. The unquoted \`rm -rf $VAR/*\`.

**Major** — wrong or unoperable under conditions that will definitely occur, but with a
signal when they do, or a bounded blast radius. Unbounded concurrency. No timeout.
\`Promise.all\` losing which items failed.

**Minor** — real, with a small or unlikely impact, or easily handled downstream. The
undocumented TTL boundary. Non-string input raising instead of returning False.

**Nit** — no behavioural consequence. The shadowed local name. Label these explicitly
and put them last, or leave them out. **A nit filed with the same weight as a blocker
costs you the blocker.**

## Calibrating

Two questions decide the level, in this order:

1. **Will it happen?** Not "can it" — will it, given the real inputs this code sees?
   Round-number prices at a \`> 100\` threshold: yes, constantly. All-negative input to a
   temperature max: yes. A self-referential YAML config: rarely.
2. **Will anyone notice?** A loud failure that happens weekly is usually less expensive
   than a silent one that happens monthly, because the loud one gets fixed. **Silence
   raises severity.**

Those two questions also explain the most common calibration error: rating by how
clever the bug is. The lexicographic sort is not clever. It is a blocker.

## The verdict

**Request changes** if there is at least one blocker, or if the change is *incomplete* —
the missing invalidation, the missing backfill, the behaviour change with no test. State
the single reason first; do not make the author infer it from a list of twelve comments.

**Approve with comments** if everything you found is minor or nit, or if the majors are
genuinely the author's call and you have said which you would pick. Be willing to do
this. A reviewer who never approves is as useless as one who always does, and blocking
on nits is the fastest way to have your review ignored.

**Approve** if you found nothing. This is allowed. But say what you checked — "ran the
six passes; boundaries and concurrency are clean; the error path returns a typed error"
— so the approval carries information rather than just permission.

## On being wrong

You will file findings that turn out not to be defects. The cost is not the mistake, it
is the pattern: a reviewer whose findings are usually wrong gets skimmed, and their real
blocker gets skimmed with everything else.

So: state the mechanism, so a wrong claim can be corrected cheaply rather than argued
about. Mark the uncertain ones as uncertain. And when you are corrected, say so plainly
and move on — the credibility cost of one wrong finding acknowledged is near zero, and
the cost of defending it is large.
`,
  },

  {
    id: "tests-lie",
    moduleId: "practice",
    title: "Reviewing the tests",
    blurb: "Generated tests are written from the implementation, so they pass.",
    practice: [10, 18],
    body: `
When tests arrive in the same change as the implementation, and both were generated,
the tests were written from the implementation rather than from the specification.
They will pass. They will assert the buggy behaviour as the expected behaviour, in
confident prose.

\`\`\`python
def test_paginate_second_page():
    items = list(range(100))
    assert paginate(items, 1) == items[20:40]  # second page
\`\`\`

That test is green, and it is the bug: it has encoded the 0-indexed arithmetic as if it
were the 1-indexed contract the docstring promised. The comment even tells you the
intent it is violating.

**A green suite on generated code means the code is self-consistent. It does not mean
it is correct.**

## Read the test file for its gaps

The implementation's gaps and the test file's gaps have the same author, so they map
onto each other exactly. Go down the boundary list and ask which values appear anywhere
in the tests:

- Is there a test with empty input? Almost never.
- With one element? Rarely.
- With a negative value, when negatives are possible? Almost never.
- With a duplicate?
- With the failure path — not "an error is raised" but "the *right* error, and the state
  afterwards is clean"?
- With two of them concurrently? Effectively never.

**Absent tests are findings.** "No test covers an empty \`times\` array, which currently
returns NaN" is a better review comment than most defect reports, because it is
simultaneously a defect, a severity argument, and the fix.

## Tests that cannot fail

Watch for:

- **Assertions computed the same way as the code.**
  \`assert result == sorted(items)[len(items) // 2]\` re-implements the bug in the test.
- **Over-mocking.** Mock the database and the cache, and the cache-invalidation defect
  becomes untestable by construction. If the mocks are shaped exactly like the
  implementation's calls, the test asserts the implementation, not the behaviour.
- **\`assert result is not None\`** and nothing else. Passes for any wrong answer.
- **try/except around the assertion.** Rare, but it happens, and it is always worth the
  moment it takes to check.
- **A test named for a behaviour it does not exercise.** \`test_handles_empty_input\`
  that passes \`[0]\`.

## The reviewer's move

For the defect you found in the implementation, ask: *what test would have caught this,
and is it here?* Then write that test into the review comment. It costs you one line,
it makes the finding undeniable, and it is the most directly useful thing you can hand
the author.
`,
  },
];

export const LESSON_BY_ID = new Map(LESSONS.map((l) => [l.id, l]));
