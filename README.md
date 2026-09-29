# Bug Finder

A self-hosted course and drill set for finding the subtle defects that AI-generated code
characteristically contains.

The premise: generated code is syntactically perfect, idiomatically plausible, well named
and commented — and wrong in specific, learnable places. Reviewing it is a different skill
from writing it, because the text arrives before your mental model does and supplies you a
confident, fluent, wrong one. This trains the skill deliberately.

## What's in it

**A method.** Six passes run in a fixed order — Contract, Boundaries, Shared state,
Time & concurrency, Silent coercion, Failure surface — so defects are found by
construction rather than by inspiration. One lesson per pass, plus four on working the
review: reading a diff, writing the finding, severity and the verdict, and reviewing the
tests. 13 lessons.

**19 drills.** Plausible, confident, defective code across Python, JavaScript,
TypeScript, React, SQL, Rust, Go, Java, C# and Bash — including two presented as *diffs*,
which is the shape the paid work actually takes. Between two and six planted defects each,
spanning several families, because the common failure of a real reviewer is not finding
nothing: it is finding the first thing and stopping.

Each drill is **gated**. You must write your review before the answers unlock. Recognition
feels like learning and isn't.

**74 language gotchas.** Traps specific to a language rather than to logic, weighted
toward the ones generated code lands on repeatedly. Every entry changes behaviour; none of
them are style opinions. Use it as a checklist when reviewing a language you touch rarely.

**Scoring that points somewhere.** Progress is tracked per pass, so a low rate on one
family tells you which pass you are not running. The headline number is *blockers missed* —
a missed nit costs nothing, and a missed blocker is the defect that reaches production.

## Running it

Requires Node 20+.

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

To host it:

```bash
npm run build        # everything lands in dist/
```

`dist/` is a static bundle with a relative base, so it works from any path on any static
host — nginx, Caddy, a GitHub Pages subdirectory, or:

```bash
cd dist && python3 -m http.server 8080
```

There is no server, no account and no network call. Progress lives in the browser's local
storage and never leaves the machine; export it from the Progress page to move it or back
it up.

### Verifying a change

```bash
npm run check        # typecheck, build, then 22 end-to-end assertions
```

`npm run smoke` drives a headless Chromium over the DevTools protocol — it needs a
Chromium binary but no test framework and no browser-automation dependency. It looks in
the usual system paths and in the Playwright and Puppeteer caches; set `CHROME_PATH` if
that fails.

## Adding a drill

1. Drop the code in `src/content/samples/` with its real extension. It is loaded as text
   via Vite's `?raw`, so it is never compiled and never linted — write it exactly as the
   model would have. `.diff` files are rendered with the marker column peeled off and the
   rows tinted.
2. Add an entry to `src/content/drills.ts`: `lang`, `level`, `shape`, the two hint levels,
   and one `Defect` per planted bug.
3. Each defect needs a `family` (one of the six passes), a `signal` (loud / silent /
   mixed) and a `severity` (blocker / major / minor / nit). Those three fields drive the
   scoring, so they are not decoration.

The defect `body` is the part that teaches. State the mechanism, give a concrete failing
input, and say what the operator sees — the same four-part shape the *Writing the finding*
lesson asks the reader to produce.

`src/content/gotchas.ts` and `src/content/lessons.ts` take new entries the same way.
Lesson bodies use the small Markdown subset in `src/components/Markdown.tsx`: headings,
lists, fenced code with a language, blockquotes, pipe tables, and inline `code` / **bold**
/ *italic*.

## Layout

```
src/
  content/
    samples/      the drill code, as real files in their real languages
    drills.ts     drill metadata and the planted-defect analysis
    lessons.ts    course text
    gotchas.ts    language-specific reference
    passes.ts     the six passes
  components/     CodeBlock (Prism + diff rendering), Markdown
  views/          one file per route
  storage.ts      localStorage, with import/export and a defensive normaliser
  route.ts        hash routing, so it hosts from any path
scripts/          smoke checks
```

## Desktop

Not built, and probably not needed: the static bundle runs offline from any local server
and keeps its state locally. If a desktop binary is ever wanted, wrapping `dist/` in Tauri
is a small job that needs no change to the app itself.

## Credits

The drill format, the six-pass framing and the first ten samples come from a prototype
generated in a Claude Code chat; this expands it into a full course with lessons, a
language reference, diff-review drills, scoring by pass and severity, and persistence.
