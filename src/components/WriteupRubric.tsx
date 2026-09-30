import { LESSONS } from "../content/lessons";
import { Markdown } from "./Markdown";
import { href } from "../route";
import type { Drill, Writeup } from "../types";

const lesson = LESSONS.find((item) => item.id === "writing-the-finding")!;
const keys = ["mechanism", "input", "signal", "fix"] as const;
// The lesson owns both the wording and the order; no second prose standard.
export const WRITEUP_CRITERIA = [...lesson.body.matchAll(
  /\*\*\d\. ([^*]+)\*\* ([\s\S]*?)(?=\n\n)/g,
)].map((match, index) => ({ id: keys[index], label: match[1].replace(/\.$/, ""),
  description: match[2].replace(/\n/g, " ") }));
const cuts = lesson.body.split("## What to cut\n")[1]?.split("\n## ")[0] ?? "";

export function writeupScore(drill: Drill, writeup?: Writeup): number | null {
  if (!drill.defects.length || !writeup ||
      !WRITEUP_CRITERIA.every(({ id }) => typeof writeup[id] === "boolean")) return null;
  return Math.round(100 * WRITEUP_CRITERIA.filter(({ id }) => writeup[id]).length /
    WRITEUP_CRITERIA.length);
}

export function WriteupRubric({ drill, value, update }: {
  drill: Drill; value?: Writeup; update: (value: Writeup) => void;
}) {
  if (!drill.defects.length) return <p className="note writeup-empty">
    Write-up: — (clean drill; no findings to score). A short approval note is enough.
  </p>;
  const score = writeupScore(drill, value);
  return <section className="writeup-rubric" aria-label="Write-up rubric">
    <h3 className="sec-h">Score your write-up</h3>
    <p className="note">Compare your locked review with the model review or answer findings above.
      Tick each part only if it is present in every finding you filed. Leave missing parts unticked.</p>
    {WRITEUP_CRITERIA.map(({ id, label, description }) => <div key={id}>
      <label className="chk"><input type="checkbox" checked={value?.[id] === true}
        onChange={(event) => update({ ...Object.fromEntries(keys.map((key) => [key, false])),
          ...value, [id]: event.target.checked })} />{label}</label>
      <Markdown source={description} />
    </div>)}
    <p className="writeup-score">Write-up: {score === null ? "— (not scored)" : `${score}%`}</p>
    {score === null && <button className="btn-2" onClick={() =>
      update(Object.fromEntries(keys.map((key) => [key, false])))}>Record no criteria met</button>}
    <details><summary>What to cut</summary><Markdown source={cuts} /></details>
    <p><a href={href({ view: "lesson", id: lesson.id })}>Writing the finding</a></p>
  </section>;
}
