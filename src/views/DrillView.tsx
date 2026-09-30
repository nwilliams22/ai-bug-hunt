import { WriteupRubric } from "../components/WriteupRubric";
import { practiceOrder } from "../review";
import { useMemo } from "react";
import { DRILL_BY_ID } from "../content/drills";
import { CLEAN_REVIEW } from "../content/drills/batch-d";
import { PASSES, familyName } from "../content/passes";
import { DrillCode } from "../components/CodeBlock";
import { ModelReviewCard } from "../components/ModelReview";
import { href } from "../route";
import type { Defect, Drill, DrillProgress, Verdict } from "../types";

const MIN_NOTE = 25;

export function expectedVerdict(drill: Drill): Verdict {
  return CLEAN_REVIEW[drill.id]?.verdict ??
    (drill.defects.some((d) => d.severity === "blocker" || d.severity === "major")
      ? "request-changes" : drill.defects.length ? "approve-with-comments" : "approve");
}

export interface Assessment {
  verdict?: Verdict;
  falsePositives?: number;
}

/** Self-assessment, not text matching: a correct verdict starts at 100. */
export function calibrationScore(drill: Drill, assessment: Assessment): number | null {
  if (assessment.verdict === undefined || assessment.falsePositives === undefined) return null;
  return Math.max(0, (assessment.verdict === expectedVerdict(drill) ? 100 : 0)
    - 25 * assessment.falsePositives);
}

export function VerdictChoice({ verdict, disabled, update }: {
  verdict?: Verdict; disabled: boolean; update: (patch: Assessment) => void;
}) {
  return <label className="label">Your verdict
    <select aria-label="Your verdict" value={verdict ?? ""} disabled={disabled}
      onChange={(event) => update({ verdict: event.target.value as Verdict })}>
      <option value="" disabled>Choose a verdict</option>
      <option value="approve">Approve</option>
      <option value="approve-with-comments">Approve with comments</option>
      <option value="request-changes">Request changes</option>
    </select>
  </label>;
}

export function AssessmentResult({ drill, assessment, update }: {
  drill: Drill; assessment: Assessment; update: (patch: Assessment) => void;
}) {
  const score = calibrationScore(drill, assessment);
  return <div className="assessment">
    <p>Committed verdict: {assessment.verdict?.replaceAll("-", " ") ?? "not recorded"}.
      {assessment.verdict && (assessment.verdict === expectedVerdict(drill) ? " Correct." : " Incorrect.")}
      {" "}Expected: {expectedVerdict(drill).replaceAll("-", " ")}.</p>
    <label className="label">False-positive findings
      <input aria-label="False-positive findings" type="number" min="0" step="1"
        value={assessment.falsePositives ?? ""}
        onChange={(event) => {
          const value = event.target.valueAsNumber;
          if (Number.isSafeInteger(value) && value >= 0) update({ falsePositives: value });
        }} />
    </label>
    <p className="note">Count claims in your committed review that the evidence does not support,
      including invented bugs. Enter 0 if none. A question about a missing contract is not
      a false positive unless you asserted an unproven defect.</p>
    <p className="calibration-score">Review calibration: {score === null ? "— (assessment not recorded)" : `${score}/100`}</p>
    <p className="note">A correct verdict earns 100; an incorrect verdict earns 0. Each false
      finding subtracts 25, with a floor of 0. This self-assessed score is separate from
      defect recall. It does not grade your prose automatically.</p>
  </div>;
}

export function ReviewReason({ id }: { id: number }) {
  const review = CLEAN_REVIEW[id];
  if (!review) return null;
  return <div className="review-reason">
    <p className="rev-h">Expected verdict: {review.verdict.replaceAll("-", " ")}</p>
    <p>{review.reason}</p>
    <p className="note">Compare drill {review.mistakenFor}. A false finding costs the author time
      and the reviewer credibility. A familiar shape is a reason to investigate, not proof.</p>
  </div>;
}

const SIGNAL_LABEL: Record<Defect["signal"], string> = {
  loud: "fails loudly",
  silent: "fails silently",
  mixed: "loud here, silent there",
};

function Badge({ kind, children }: { kind: string; children: React.ReactNode }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}

interface Props {
  id: number;
  state: DrillProgress;
  update: (patch: Partial<DrillProgress>) => void;
}

export function DrillView({ id, state, update }: Props) {
  const drill = DRILL_BY_ID.get(id);
  const DRILLS = practiceOrder();
  const index = DRILLS.findIndex((d) => d.id === id);
  const prev = index > 0 ? DRILLS[index - 1] : undefined;
  const next = index >= 0 && index < DRILLS.length - 1 ? DRILLS[index + 1] : undefined;

  const caughtCount = useMemo(
    () => Object.values(state.caught).filter(Boolean).length,
    [state.caught],
  );

  if (!drill) {
    return (
      <div className="card">
        <h2>No such drill</h2>
        <p>
          <a href={href({ view: "drills" })}>Back to the drill list</a>
        </p>
      </div>
    );
  }

  const noteLen = state.note.trim().length;
  const canReveal = noteLen >= MIN_NOTE && state.verdict !== undefined;

  return (
    <>
      <div className="card">
        <div className="meta">
          <Badge kind="lang">{drill.lang}</Badge>
          <Badge kind="level">{drill.level}</Badge>
          {drill.shape === "diff" && <Badge kind="shape">diff review</Badge>}
          <span className="meta-note">
            {state.revealed ? `${drill.defects.length} findings in the answer` : "Approve or identify justified findings"}
          </span>
          <span className="meta-id" title="The left number is where this sits in your practice order. The id never changes — quote it when you report a wrong answer key.">
            {index + 1} of {DRILLS.length} · id {drill.id}
          </span>
        </div>

        <h2 className="card-h">
          <span className="card-n">{index + 1}</span>
          {drill.title}
        </h2>

        {drill.brief && <p className="brief">{drill.brief}</p>}

        <DrillCode drill={drill} />

        {!state.revealed && (
          <details className="passes">
            <summary>Run the six passes</summary>
            <ol className="passes-list">
              {PASSES.map((p) => (
                <li key={p.id}>
                  <b>{p.name}.</b> {p.ask}
                </li>
              ))}
            </ol>
          </details>
        )}

        <p className="label">What did you find?</p>
        <p className="note">
          For each finding, name the mechanism and evidence. If you approve, explain how
          you discharged your suspicions. Ask a question when a necessary contract is unknown.
        </p>
        <textarea
          className="ta"
          value={state.note}
          readOnly={state.revealed}
          onChange={(e) => update({ note: e.target.value })}
          placeholder={
            state.revealed
              ? "Your notes for this sample."
              : "e.g. Line 2 — the accumulator starts at 0, so an all-negative input returns 0.0, a value not present in the data. Silent."
          }
        />

        <VerdictChoice verdict={state.verdict} disabled={state.revealed} update={update} />
        <div className="bar">
          <button
            className="btn"
            disabled={!canReveal || state.revealed}
            onClick={() => update({ revealed: true, revealedAt: Date.now() })}
          >
            {state.revealed ? "Answers shown" : "Lock in and reveal"}
          </button>
          {!state.revealed && state.hintLevel < 2 && (
            <button
              className="btn btn-2"
              onClick={() => update({ hintLevel: Math.min(2, state.hintLevel + 1) })}
            >
              {state.hintLevel === 0 ? "Hint: where to look" : "Hint: which families"}
            </button>
          )}
          {!canReveal && !state.revealed && (
            <span className="gate">
              {noteLen < MIN_NOTE ? `Write your review first — ${MIN_NOTE - noteLen} more characters.` : "Choose a verdict before reveal."}
            </span>
          )}
          {state.revealed && (
            <span className="gate">
              {drill.defects.length ? `${caughtCount} of ${drill.defects.length} ticked` : "No findings to tick"}
            </span>
          )}
        </div>

        {state.hintLevel >= 1 && !state.revealed && (
          <div className="hint">
            <b>Where to look.</b> {drill.hintRegion}
          </div>
        )}
        {state.hintLevel >= 2 && !state.revealed && (
          <div className="hint">
            <b>Passes to consider.</b> {drill.hintFamily}
          </div>
        )}

        {state.revealed && (
          <div className="rev">
            <AssessmentResult drill={drill} assessment={state} update={update} />
            <ReviewReason id={id} />
            <p className="rev-h">{drill.defects.length ? "Answer findings" : "No defects to file"}</p>
            {drill.defects.length > 0 && <p className="rev-n">
              Tick the ones you actually named in your notes. Partial credit doesn't help
              you — if you gestured at the area without identifying the mechanism, leave it
              unticked.
            </p>}
            {drill.defects.map((d, i) => (
              <div key={i} className="def" data-got={state.caught[i] ? "1" : "0"}>
                <div className="def-top">
                  <span className="def-fam">
                    {familyName(d.family)}
                    <span className="def-sep">·</span>
                    <span className={`def-sig def-sig-${d.signal}`}>
                      {SIGNAL_LABEL[d.signal]}
                    </span>
                    <span className="def-sep">·</span>
                    <span className={`def-sev def-sev-${d.severity}`}>{d.severity}</span>
                  </span>
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={!!state.caught[i]}
                      onChange={() =>
                        update({ caught: { ...state.caught, [i]: !state.caught[i] } })
                      }
                    />
                    I caught this
                  </label>
                </div>
                <p className="def-t">{d.title}</p>
                <p className="def-b">{d.body}</p>
                <div className="def-f">{d.fix}</div>
              </div>
            ))}
            <ModelReviewCard id={id} />
            <WriteupRubric drill={drill} value={state.writeup} update={(writeup) => update({ writeup })} />
          </div>
        )}
      </div>

      <nav className="pager">
        {prev ? (
          <a href={href({ view: "drill", id: prev.id })}>← {prev.title}</a>
        ) : (
          <span />
        )}
        {next ? (
          <a href={href({ view: "drill", id: next.id })}>{next.title} →</a>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
