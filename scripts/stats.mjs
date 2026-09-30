/**
 * Counts what is actually in the course, and checks the README against it.
 *
 *   npm run stats            print the counts
 *   npm run stats -- --check exit non-zero if the README disagrees
 *
 * The README is the public landing page, and its numbers went stale the first
 * time two people added drills in one day. `--check` runs inside `npm run
 * check`, so a batch that lands without touching the README fails the build
 * rather than quietly shipping a wrong claim.
 *
 * The content modules import their samples with Vite's `?raw`, which Node
 * cannot resolve, so esbuild bundles them first with `?raw` stubbed out — this
 * script needs the metadata, not the sample text.
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const rawStub = {
  name: "raw-stub",
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: a.path, namespace: "raw" }));
    b.onLoad({ filter: /.*/, namespace: "raw" }, () => ({ contents: "export default ''" }));
  },
};

const bundled = await build({
  stdin: {
    contents: `
      export { DRILLS } from "./src/content/drills/index";
      export { LESSONS } from "./src/content/lessons";
      export { GOTCHAS } from "./src/content/gotchas";
      export { MODEL_REVIEWS } from "./src/content/reviews";
      export { PASSES } from "./src/content/passes";
    `,
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [rawStub],
  logLevel: "silent",
});

const mod = await import(
  "data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64")
);

const { DRILLS, LESSONS, GOTCHAS, MODEL_REVIEWS, PASSES } = mod;

const tally = (items, key) => {
  const out = new Map();
  for (const item of items) out.set(key(item), (out.get(key(item)) ?? 0) + 1);
  return [...out].sort((a, b) => b[1] - a[1]);
};

const defects = DRILLS.flatMap((d) => d.defects);

export const stats = {
  drills: DRILLS.length,
  lessons: LESSONS.length,
  gotchas: GOTCHAS.length,
  passes: PASSES.length,
  defects: defects.length,
  langs: new Set(DRILLS.map((d) => d.lang)).size,
  diffs: DRILLS.filter((d) => d.shape === "diff").length,
  multiFile: DRILLS.filter((d) => d.files?.length).length,
  modelReviews: Object.keys(MODEL_REVIEWS).length,
  blockers: defects.filter((d) => d.severity === "blocker").length,
  silent: defects.filter((d) => d.signal === "silent").length,
};

const byLang = tally(DRILLS, (d) => d.lang);
const byLevel = tally(DRILLS, (d) => d.level);
const byFamily = tally(defects, (d) => d.family);
const bySeverity = tally(defects, (d) => d.severity);

/**
 * Claims in the README that must match the content. The pattern captures one
 * number; a claim whose wording changes fails loudly here rather than drifting.
 */
const CLAIMS = [
  [/\*\*(\d+) drills\.\*\*/, "drills"],
  [/(\d+) lessons\./, "lessons"],
  [/\*\*(\d+) language gotchas\.\*\*/, "gotchas"],
  [/across (\d+) languages/, "langs"],
  [/(\d+) of them presented as \*diffs\*/, "diffs"],
  [/(\d+) of those span several files/, "multiFile"],
  [/model review for (?:the first )?(\d+) drills/, "modelReviews"],
  [/\*\*(\d+) planted defects\*\*/, "defects"],
];

const check = process.argv.includes("--check");
const readme = readFileSync(resolve(ROOT, "README.md"), "utf8");
const problems = [];

for (const [pattern, key] of CLAIMS) {
  const m = readme.match(pattern);
  if (!m) problems.push(`README has no claim matching ${pattern} (expected ${key} = ${stats[key]})`);
  else if (Number(m[1]) !== stats[key]) {
    problems.push(`README says ${m[1]} for ${key}; content has ${stats[key]}`);
  }
}

/**
 * The "Practice this" lists went stale the same way the README counts did: they
 * named drills 1–30 for months while 49 more landed, so every drill added after
 * the lessons were written was reachable only from the index. Requiring full
 * coverage means a new batch cannot land without being taught by something —
 * and a practice id that no longer exists renders as nothing, silently, so it
 * is checked here rather than discovered on the page.
 */
const practiced = new Set(LESSONS.flatMap((l) => l.practice ?? []));
const drillIds = new Set(DRILLS.map((d) => d.id));
const orphans = [...practiced].filter((id) => !drillIds.has(id));
const untaught = DRILLS.filter((d) => !practiced.has(d.id)).map((d) => d.id);

if (orphans.length) {
  problems.push(`lesson practice lists name drills that do not exist: ${orphans.join(", ")}`);
}
if (untaught.length) {
  problems.push(
    `no lesson practices drill${untaught.length > 1 ? "s" : ""} ${untaught.join(", ")} — ` +
      `add each to the practice list of the lesson it exercises in src/content/lessons.ts`,
  );
}

if (!check) {
  console.log(`drills          ${stats.drills}  (${stats.diffs} diffs, ${stats.multiFile} multi-file)`);
  console.log(`languages       ${stats.langs}`);
  console.log(`lessons         ${stats.lessons}`);
  console.log(`gotchas         ${stats.gotchas}`);
  console.log(`model reviews   ${stats.modelReviews} of ${stats.drills} drills`);
  console.log(`defects         ${stats.defects}  (${stats.blockers} blockers, ${stats.silent} silent)`);
  console.log(`\nby language     ${byLang.map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`by level        ${byLevel.map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`by family       ${byFamily.map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`by severity     ${bySeverity.map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`\npracticed       ${practiced.size} of ${stats.drills} drills are on a lesson's practice list`);
}

if (problems.length) {
  console.error(`\nThe content and what is claimed about it disagree:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nFix README.md or src/content/lessons.ts; update CLAIMS in scripts/stats.mjs if the wording changed.`);
  process.exit(1);
}

if (check) {
  console.log(
    `README counts agree with the content (${CLAIMS.length} claims checked); ` +
      `all ${stats.drills} drills are on a lesson's practice list.`,
  );
}
