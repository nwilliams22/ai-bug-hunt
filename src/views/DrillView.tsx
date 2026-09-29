import { useMemo } from "react";
import { DRILLS, DRILL_BY_ID } from "../content/drills";
import { PASSES, familyName } from "../content/passes";
import { DrillCode } from "../components/CodeBlock";
import { ModelReviewCard } from "../components/ModelReview";
import { href } from "../route";
import type { Defect, DrillProgress } from "../types";

const MIN_NOTE = 25;

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
  const canReveal = noteLen >= MIN_NOTE;

  return (
    <>
      <div className="card">
        <div className="meta">
          <Badge kind="lang">{drill.lang}</Badge>
          <Badge kind="level">{drill.level}</Badge>
          {drill.shape === "diff" && <Badge kind="shape">diff review</Badge>}
          <span className="meta-note">
            {drill.defects.length} defect{drill.defects.length === 1 ? "" : "s"} planted
          </span>
        </div>

        <h2 className="card-h">
          <span className="card-n">{drill.id}</span>
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
          For each defect: name the mechanism, give a concrete failing input, and say
          whether it fails loudly or silently.
        </p>
        <textarea
          className="ta"
          value={state.note}
          onChange={(e) => update({ note: e.target.value })}
          placeholder={
            state.revealed
              ? "Your notes for this sample."
              : "e.g. Line 2 — the accumulator starts at 0, so an all-negative input returns 0.0, a value not present in the data. Silent."
          }
        />

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
              Write your review first — {Math.max(0, MIN_NOTE - noteLen)} more characters.
            </span>
          )}
          {state.revealed && (
            <span className="gate">
              {caughtCount} of {drill.defects.length} ticked
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
            <b>Families in play.</b> {drill.hintFamily}
          </div>
        )}

        {state.revealed && (
          <div className="rev">
            <p className="rev-h">Planted defects</p>
            <p className="rev-n">
              Tick the ones you actually named in your notes. Partial credit doesn't help
              you — if you gestured at the area without identifying the mechanism, leave it
              unticked.
            </p>
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
