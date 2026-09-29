# Authoring drills, lessons and gotchas

Read this before adding content. The course teaches a method; content that does not serve
the method makes it worse, not bigger.

## The one rule

**A drill is only worth writing if a competent reviewer could plausibly approve the code.**
If the defect is visible at a glance, it teaches nothing — the learner is not practising a
search, they are reading an answer. Generated code is syntactically perfect, idiomatically
plausible, well named and confidently commented. Write it that way, then break it the way a
model actually breaks it: not a typo, a *wrong mental model applied consistently*.

Tests for a drill you are about to write:

- Would this code pass a linter and a type checker? It must.
- Do the names, comments and docstring all describe the *intended* behaviour? They must —
  the gap between the stated contract and the real behaviour is the thing being taught.
- Is at least one defect **silent**? A defect that raises is found by running the code, and
  nobody is paid to find those.
- Would you be embarrassed to be told the answer? Good.

## Where things live

| What | File |
| --- | --- |
| Drills | `src/content/drills/<batch>.ts`, exported into `src/content/drills/index.ts` |
| Code samples | `src/content/samples/NN-name.ext` — real files, loaded with Vite `?raw` |
| Lessons | `src/content/lessons.ts` |
| Language gotchas | `src/content/gotchas.ts` |
| The six passes | `src/content/passes.ts` |
| Type definitions | `src/types.ts` |

**Never edit somebody else's batch module.** Claim an id range in your issue, add one module
for it, and add the two lines to `index.ts`. Ids are permanent — progress is stored against
them, so an id is never reused and never renumbered.

Samples are real files in their real language so that deliberately broken code is never
compiled or linted, and so it reads on its own. Keep the extension honest: the file
extension picks the syntax highlighter, and `.diff` marks a drill whose `shape` is `diff`.

## Filling in a drill

```ts
{
  id: 31,                         // permanent; claim the range first
  slug: "kebab-case-unique",      // appears in the URL
  lang: "Go",
  level: "Warm-up" | "Standard" | "Hard",
  title: "What the code claims to do",
  shape: "function" | "diff",
  code: t(s31),
  brief: "One line of framing, as a review ticket would arrive.",
  hintRegion: "Where to look — never what is wrong.",
  hintFamily: "Which passes find it, by name.",
  defects: [ /* 2 to 6 */ ],
}
```

Each defect carries four graded fields, and they drive the scoring, so they are not
decoration:

- **`family`** — which of the six passes finds it. Exactly one. If you cannot decide, the
  defect is probably two defects.
- **`signal`** — `loud` raises or fails a test; `silent` returns a plausible wrong answer.
  Bias the course silent.
- **`severity`** — `blocker` reaches production and costs money or data; `major` is wrong
  but recoverable; `minor` and `nit` cost nothing to miss. The headline score is *blockers
  missed*, so an inflated severity quietly corrupts the learner's feedback.
- **`body` / `fix`** — say what breaks, for which input, and what the caller sees. "Returns
  the last page instead of an error for `page=-1`" teaches; "bad input handling" does not.

Two to six defects per drill, spanning more than one family. The characteristic failure of
a real reviewer is not finding nothing — it is finding the first thing and stopping.

### Make one defect mask another

The best drills are built so that fixing defect A is what makes defect B visible. The SQL
report drill's `COUNT(*)` bug is invisible until you fix the `LEFT JOIN` that was filtering
those rows out; the Ruby coupon's missing 100% cap is dead code until you notice the `or`
precedence bug above it. This is what a real review runs into and it cannot be practised by
reading.

### Diff-shaped drills

`shape: "diff"` is the shape the paid work actually takes, and it is harder for a reason
worth stating in the drill: the tool points your attention at the changed lines, and the
expensive defect is usually in code that *should* exist and doesn't — a caller not updated,
a migration not written, an error path the new branch never reaches.

Write the diff as a real unified diff with plausible context lines. At least one defect
should be invisible from the changed lines alone.

## Lessons

One idea per lesson, in the course's voice: what the tell is, why generated code trips this
pass *specifically*, then one worked example. Set `practice` to the drill ids that exercise
it — that link is what turns a low score on a pass into a next action. Supported markdown is
a small subset; see `src/components/Markdown.tsx` before using a construct.

## Gotchas

A gotcha is a trap specific to a *language* rather than to logic. Every entry must change
behaviour — no style opinions, no lint rules. Weight toward what generated code lands on
repeatedly. Give `code` and `fix` whenever the trap is easier shown than described.

## Before you open your work for review

```bash
npm run check      # typecheck, build, then 38+ assertions against the built bundle
```

The smoke suite drives headless Chromium over CDP and asserts, among other things, that
every drill renders its sample and every lesson renders a body — so a missing import or a
bad sample path fails there rather than in front of the learner. Add an assertion when you
add a capability. A red check is not a finished change.
