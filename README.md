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
construction rather than by inspiration. One lesson per pass, plus five on working the
review: reading a diff, writing the finding, severity and the verdict, reviewing the tests,
and pacing under a clock. 14 lessons.

**30 drills.** Plausible, confident, defective code across Python, JavaScript, TypeScript,
React, SQL, Rust, Go, Java, C#, C++, Kotlin, Ruby, PHP and Bash — including four presented
as *diffs*, which is the shape the paid work actually takes. Between two and six planted
defects each, spanning several families, because the common failure of a real reviewer is
not finding nothing: it is finding the first thing and stopping.

Each drill is **gated**. You must write your review before the answers unlock. Recognition
feels like learning and isn't.

**A timed mode.** The paid version of this work has a clock on it, so the real question is
not *can you find this defect* but *can you find it in six minutes, reliably, on the ninth
one of the day*. Pick a sample count and a time limit; hints and the defect count are
withheld, the next sample appears whether you were finished or not, and self-scoring
happens at the end all at once. Sessions fold into the ordinary drill progress, so there
is one score for the course rather than two that disagree.

**107 language gotchas.** Traps specific to a language rather than to logic, weighted
toward the ones generated code lands on repeatedly. Every entry changes behaviour; none of
them are style opinions. Use it as a checklist when reviewing a language you touch rarely.

**Scoring that points somewhere.** Progress is tracked per pass, so a low rate on one
family tells you which pass you are not running. The headline number is *blockers missed* —
a missed nit costs nothing, and a missed blocker is the defect that reaches production.
The other number worth watching is how often you *ran out of clock*: if the untimed
percentage is high and the timed one is not, the gap is pacing rather than knowledge.

## Running it

Requires Node 20+.

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

### Always on, on this machine

Installs a systemd **user** service that serves the built bundle on loopback and comes
back after a reboot. No root, nothing written outside `~/.config/systemd/user`.

```bash
npm run install-service          # port 8787
npm run install-service -- 9000  # or pick one
```

Then it is at <http://127.0.0.1:8787/> permanently.

```bash
systemctl --user status bug-finder   # check on it
npm run redeploy                     # rebuild and restart after a change
npm run uninstall-service            # remove it; your progress is untouched
```

The installer builds first, bakes the absolute path of the `node` in use into the unit
(systemd does not run a login shell, so a version-manager shim would resolve to nothing at
boot), attempts `loginctl enable-linger` so it is up without anyone logging in, and then
verifies with an actual request before reporting success.

`scripts/serve.mjs` is the server it runs: dependency-free, so it does not need
`node_modules` to be present or intact. It binds `127.0.0.1` by default because the course
holds your review notes and nothing here authenticates anyone; `HOST=0.0.0.0` opts in to
the LAN deliberately.

### Any other host

```bash
npm run build        # everything lands in dist/
```

`dist/` is a static bundle with a relative base, so it works from any path on any static
host — nginx, Caddy, a GitHub Pages subdirectory, or `cd dist && python3 -m http.server`.

There is no server, no account and no network call. Progress lives in the browser's local
storage and never leaves the machine; export it from the Progress page to move it or back
it up.

### Desktop

A Tauri v2 shell around the same `dist/`, so the desktop build and the hosted page can
never drift.

```bash
npm run desktop          # dev window against the Vite server
npm run desktop:build    # .deb and .AppImage in src-tauri/target/release/bundle/
```

Needs a Rust toolchain and, on Linux, `webkit2gtk-4.1` and `libsoup-3` development
packages. `src-tauri/src/lib.rs` is deliberately empty of logic — no command, no
filesystem access, no network. Progress lives in the webview's local storage exactly as it
does in a browser, which does mean the desktop app and your browser keep **separate**
progress; the export/import on the Progress page is how you move between them.

### Verifying a change

```bash
npm run check        # typecheck, build, then 38 end-to-end assertions
```

`npm run smoke` drives a headless Chromium over the DevTools protocol — it needs a
Chromium binary but no test framework and no browser-automation dependency. It looks in
the usual system paths and in the Playwright and Puppeteer caches; set `CHROME_PATH` if
that fails. The assertions cover the reveal gate, progressive hints, scoring, persistence
across reload, every route, every drill rendering its sample, every lesson rendering a
body, a full timed session from setup through debrief to recording, and a clean console.

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

A new language needs three lines: the name in `Lang` (`src/types.ts`), the Prism grammar
import and its mapping in `src/components/CodeBlock.tsx` (mind the order — `cpp` needs `c`,
`php` needs `markup-templating`), and the name in `GOTCHA_LANGS`.

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
  timed.ts        timed-session state, scoring and its own storage key
  route.ts        hash routing, so it hosts from any path
scripts/
  serve.mjs       the dependency-free static server the service runs
  *-service.sh    install, restart and remove the systemd user unit
  user-bus.sh     locates the systemd user session from a non-login shell
  smoke.mjs       static server + headless browser
  checks.mjs      the assertions
src-tauri/        the desktop shell
```

## Credits

The drill format, the six-pass framing and the first ten samples come from a prototype
generated in a Claude Code chat; this expands it into a full course with lessons, a
language reference, diff-review drills, a timed mode, scoring by pass and severity,
always-on local hosting and a desktop build.
