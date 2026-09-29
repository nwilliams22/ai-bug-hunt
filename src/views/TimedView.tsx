import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DRILL_BY_ID } from "../content/drills";
import { familyName } from "../content/passes";
import { DrillCode } from "../components/CodeBlock";
import { href } from "../route";
import { drillState } from "../storage";
import {
  COUNT_CHOICES,
  DEFAULT_OPTIONS,
  SECONDS_CHOICES,
  eligible,
  loadRun,
  mmss,
  saveRun,
  scoreRun,
  startRun,
} from "../timed";
import type { RunOptions } from "../timed";
import type { DrillProgress, Level, Progress, TimedRun } from "../types";

const LEVELS: Level[] = ["Warm-up", "Standard", "Hard"];

interface Props {
  progress: Progress;
  /** Fold the debrief back into the ordinary per-drill progress. */
  commitDrill: (id: number, patch: Partial<DrillProgress>) => void;
  addSession: (run: TimedRun) => void;
}

export function TimedView({ progress, commitDrill, addSession }: Props) {
  const [run, setRun] = useState<TimedRun | null>(() => loadRun());

  const update = useCallback((next: TimedRun | null) => {
    setRun(next);
    saveRun(next);
  }, []);

  if (run === null) {
    return <Setup progress={progress} onStart={update} />;
  }
  if (run.phase === "debrief") {
    return (
      <Debrief
        run={run}
        update={update}
        commitDrill={commitDrill}
        addSession={addSession}
      />
    );
  }
  return <Running run={run} update={update} />;
}

/* --------------------------------- setup --------------------------------- */

function Setup({
  progress,
  onStart,
}: {
  progress: Progress;
  onStart: (run: TimedRun) => void;
}) {
  const [opts, setOpts] = useState<RunOptions>(DEFAULT_OPTIONS);

  const pool = useMemo(
    () => eligible(opts, (id) => drillState(progress, id).revealed),
    [opts, progress],
  );

  const sessions = [...progress.sessions].reverse();

  return (
    <>
      <div className="card">
        <h2 className="card-h">Timed review</h2>
        <p className="lede">
          The paid work has a clock on it. A queue of diffs and a rate per review means
          the question is not <em>can you find this defect</em> but <em>can you find it
          in six minutes, reliably, on the ninth one of the day</em>.
        </p>
        <p className="note">
          No hints, no pass checklist, no going back. When the clock runs out the next
          sample appears whether you were finished or not. Self-scoring happens at the
          end, all at once, which is also how you will find out what you skip when you
          are rushed.
        </p>

        <p className="label">Samples per session</p>
        <div className="chips">
          {COUNT_CHOICES.map((n) => (
            <button
              key={n}
              className="chip"
              data-on={opts.count === n ? "1" : "0"}
              onClick={() => setOpts((o) => ({ ...o, count: n }))}
            >
              {n}
            </button>
          ))}
        </div>

        <p className="label">Time per sample</p>
        <div className="chips">
          {SECONDS_CHOICES.map((s) => (
            <button
              key={s}
              className="chip"
              data-on={opts.secondsPerDrill === s ? "1" : "0"}
              onClick={() => setOpts((o) => ({ ...o, secondsPerDrill: s }))}
            >
              {mmss(s)}
            </button>
          ))}
        </div>

        <p className="label">Difficulty</p>
        <div className="chips">
          <button
            className="chip"
            data-on={opts.levels.length === 0 ? "1" : "0"}
            onClick={() => setOpts((o) => ({ ...o, levels: [] }))}
          >
            Any
          </button>
          {LEVELS.map((l) => (
            <button
              key={l}
              className="chip"
              data-on={opts.levels.includes(l) ? "1" : "0"}
              onClick={() =>
                setOpts((o) => ({
                  ...o,
                  levels: o.levels.includes(l)
                    ? o.levels.filter((x) => x !== l)
                    : [...o.levels, l],
                }))
              }
            >
              {l}
            </button>
          ))}
        </div>

        <p className="label">Repeats</p>
        <div className="chips">
          <button
            className="chip"
            data-on={opts.includeSeen ? "0" : "1"}
            onClick={() => setOpts((o) => ({ ...o, includeSeen: false }))}
          >
            Unseen only
          </button>
          <button
            className="chip"
            data-on={opts.includeSeen ? "1" : "0"}
            onClick={() => setOpts((o) => ({ ...o, includeSeen: true }))}
          >
            Allow ones I've done
          </button>
        </div>

        <div className="bar">
          <button
            className="btn"
            disabled={pool.length === 0}
            onClick={() => onStart(startRun(opts, pool))}
          >
            Start — {Math.min(opts.count, pool.length)} ×{" "}
            {mmss(opts.secondsPerDrill)}
          </button>
          <span className="gate">
            {pool.length === 0
              ? "No drills match. Widen the difficulty, or allow repeats."
              : `${pool.length} eligible`}
          </span>
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="card">
          <h3 className="sec-h sec-h-first">Past sessions</h3>
          <table className="drill-table">
            <thead>
              <tr>
                <th>When</th>
                <th className="num">Samples</th>
                <th className="num">Per sample</th>
                <th className="num">Caught</th>
                <th className="num">Blockers</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const sc = scoreRun({
                  ...s,
                  at: s.drillIds.length,
                  drillStartedAt: s.startedAt,
                  notes: {},
                  phase: "debrief",
                });
                return (
                  <tr key={s.id}>
                    <td>{new Date(s.startedAt).toLocaleString()}</td>
                    <td className="num dim">{s.drillIds.length}</td>
                    <td className="num dim">{mmss(s.secondsPerDrill)}</td>
                    <td className="num">
                      {sc.caught}/{sc.total}
                    </td>
                    <td className="num">
                      <b data-low={sc.blockersCaught < sc.blockersTotal ? "1" : "0"}>
                        {sc.blockersCaught}/{sc.blockersTotal}
                      </b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* -------------------------------- running -------------------------------- */

function Running({
  run,
  update,
}: {
  run: TimedRun;
  update: (run: TimedRun | null) => void;
}) {
  const id = run.drillIds[run.at];
  const drill = DRILL_BY_ID.get(id);

  // The clock is derived from drillStartedAt rather than counted down, so a
  // reload, a suspended laptop or a backgrounded tab cannot give back time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(h);
  }, []);

  const elapsed = (now - run.drillStartedAt) / 1000;
  const remaining = run.secondsPerDrill - elapsed;

  const advance = useCallback(
    (fromTimeout: boolean) => {
      const spentNow = Math.min(
        run.secondsPerDrill,
        (Date.now() - run.drillStartedAt) / 1000,
      );
      const spent = {
        ...run.spent,
        [id]: fromTimeout ? run.secondsPerDrill : Math.round(spentNow),
      };
      const nextAt = run.at + 1;
      update({
        ...run,
        spent,
        at: nextAt,
        drillStartedAt: Date.now(),
        phase: nextAt >= run.drillIds.length ? "debrief" : "running",
      });
    },
    [run, id, update],
  );

  // One ref, so a re-render between the tick and the effect cannot fire the
  // advance twice and skip a sample.
  const advancing = useRef(false);
  useEffect(() => {
    advancing.current = false;
  }, [run.at]);

  useEffect(() => {
    if (remaining > 0 || advancing.current) return;
    advancing.current = true;
    advance(true);
  }, [remaining, advance]);

  if (!drill) {
    return (
      <div className="card">
        <h2 className="card-h">That drill no longer exists</h2>
        <p className="note">The session cannot continue. Nothing has been recorded.</p>
        <button className="btn btn-danger" onClick={() => update(null)}>
          Discard session
        </button>
      </div>
    );
  }

  const note = run.notes[id] ?? "";
  const frac = Math.max(0, Math.min(1, remaining / run.secondsPerDrill));
  const urgency = remaining <= 30 ? "out" : remaining <= 60 ? "low" : "ok";

  return (
    <div className="card">
      <div className="timer" data-urgency={urgency}>
        <div className="timer-top">
          <span className="timer-clock">{mmss(remaining)}</span>
          <span className="timer-pos">
            Sample {run.at + 1} of {run.drillIds.length}
          </span>
        </div>
        <div className="timer-track">
          <div className="timer-fill" style={{ width: `${frac * 100}%` }} />
        </div>
      </div>

      <div className="meta">
        <span className="badge badge-lang">{drill.lang}</span>
        <span className="badge badge-level">{drill.level}</span>
        {drill.shape === "diff" && <span className="badge badge-shape">diff review</span>}
        <span className="meta-note">defect count withheld</span>
      </div>

      {drill.brief && <p className="brief">{drill.brief}</p>}

      <DrillCode drill={drill} />

      <p className="label">Your review</p>
      <textarea
        className="ta"
        autoFocus
        value={note}
        onChange={(e) => update({ ...run, notes: { ...run.notes, [id]: e.target.value } })}
        placeholder="One line per finding: where, the mechanism, a failing input, loud or silent."
      />

      <div className="bar">
        <button className="btn" onClick={() => advance(false)}>
          {run.at + 1 >= run.drillIds.length ? "Submit and score" : "Submit and next"}
        </button>
        <button
          className="btn btn-danger"
          onClick={() => {
            if (confirm("Abandon this session? Nothing will be recorded.")) update(null);
          }}
        >
          Abandon
        </button>
        <span className="gate">
          Answers and hints are unavailable until every sample is submitted.
        </span>
      </div>
    </div>
  );
}

/* -------------------------------- debrief -------------------------------- */

function Debrief({
  run,
  update,
  commitDrill,
  addSession,
}: {
  run: TimedRun;
  update: (run: TimedRun | null) => void;
  commitDrill: (id: number, patch: Partial<DrillProgress>) => void;
  addSession: (run: TimedRun) => void;
}) {
  const score = useMemo(() => scoreRun(run), [run]);
  const [saved, setSaved] = useState(false);

  const toggle = (id: number, index: number) => {
    const current = new Set(run.caught[id] ?? []);
    if (current.has(index)) current.delete(index);
    else current.add(index);
    update({ ...run, caught: { ...run.caught, [id]: [...current].sort((a, b) => a - b) } });
  };

  const finish = () => {
    // Fold the session into the ordinary progress so there is one score for the
    // course rather than two that disagree.
    for (const id of run.drillIds) {
      const caught = Object.fromEntries((run.caught[id] ?? []).map((i) => [i, true]));
      commitDrill(id, {
        note: run.notes[id] ?? "",
        revealed: true,
        revealedAt: Date.now(),
        caught,
      });
    }
    addSession(run);
    setSaved(true);
    saveRun(null);
  };

  if (saved) {
    return (
      <div className="card">
        <h2 className="card-h">Session recorded</h2>
        <div className="tiles">
          <div className="tile">
            <b>{score.pct}%</b>
            <span>
              {score.caught} of {score.total} defects
            </span>
          </div>
          <div className="tile" data-warn={score.blockersCaught < score.blockersTotal ? "1" : "0"}>
            <b>
              {score.blockersTotal - score.blockersCaught}
            </b>
            <span>blockers missed of {score.blockersTotal}</span>
          </div>
          <div className="tile">
            <b>{score.timedOut}</b>
            <span>of {score.drills} ran out of clock</span>
          </div>
          <div className="tile">
            <b>{mmss(score.secondsUsed)}</b>
            <span>spent reviewing</span>
          </div>
        </div>
        <p className="note">
          {score.timedOut > score.drills / 2
            ? "You ran out of clock on more than half of them. That usually means you are reading the whole sample before writing anything — write each finding the moment you see it, because an unwritten finding scores zero."
            : "Your notes and ticks are now part of the ordinary drill progress."}
        </p>
        <div className="bar">
          <a className="btn" href={href({ view: "progress" })}>
            See the pass breakdown
          </a>
          <button className="btn btn-2" onClick={() => update(null)}>
            Another session
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h2 className="card-h">Debrief</h2>
        <p className="note">
          Tick only what you actually named. Gesturing at the right area without the
          mechanism is what an author rejects, so it does not count here either. The
          time you spent on each sample is shown — a sample you rushed and got right is
          worth more attention than one you got wrong slowly.
        </p>
        <div className="tiles">
          <div className="tile">
            <b>{score.pct}%</b>
            <span>
              {score.caught} of {score.total} ticked
            </span>
          </div>
          <div className="tile" data-warn={score.blockersCaught < score.blockersTotal ? "1" : "0"}>
            <b>{score.blockersTotal - score.blockersCaught}</b>
            <span>blockers missed of {score.blockersTotal}</span>
          </div>
          <div className="tile">
            <b>{score.timedOut}</b>
            <span>of {score.drills} ran out of clock</span>
          </div>
        </div>
      </div>

      {run.drillIds.map((id) => {
        const drill = DRILL_BY_ID.get(id);
        if (!drill) return null;
        const got = new Set(run.caught[id] ?? []);
        const spent = run.spent[id] ?? 0;
        return (
          <div key={id} className="card">
            <div className="meta">
              <span className="badge badge-lang">{drill.lang}</span>
              <span className="badge badge-level">{drill.level}</span>
              <span className="meta-note">
                {mmss(spent)} spent
                {spent >= run.secondsPerDrill ? " — ran out" : ""}
              </span>
            </div>
            <h3 className="sec-h sec-h-first">
              <span className="card-n">{drill.id}</span>
              {drill.title}
            </h3>

            <p className="label">What you wrote</p>
            <blockquote className="wrote">
              {(run.notes[id] ?? "").trim() || "— nothing —"}
            </blockquote>

            <p className="label">Planted defects</p>
            {drill.defects.map((d, i) => (
              <div key={i} className="def" data-got={got.has(i) ? "1" : "0"}>
                <div className="def-top">
                  <span className="def-fam">
                    {familyName(d.family)}
                    <span className="def-sep">·</span>
                    <span className={`def-sev def-sev-${d.severity}`}>{d.severity}</span>
                  </span>
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={got.has(i)}
                      onChange={() => toggle(id, i)}
                    />
                    I caught this
                  </label>
                </div>
                <p className="def-t">{d.title}</p>
                <p className="def-b">{d.body}</p>
                <div className="def-f">{d.fix}</div>
              </div>
            ))}

            <p className="note">
              <a href={href({ view: "drill", id: drill.id })}>Open this drill on its own</a>{" "}
              to re-read it without the clock.
            </p>
          </div>
        );
      })}

      <div className="card">
        <div className="bar">
          <button className="btn" onClick={finish}>
            Record this session
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm("Discard this session without recording it?")) update(null);
            }}
          >
            Discard
          </button>
        </div>
      </div>
    </>
  );
}
