import { WRITEUP_CRITERIA, writeupScore } from "../components/WriteupRubric";
import { practiceOrder } from "../review";
import { useRef } from "react";
import { DRILLS } from "../content/drills";
import { LESSONS } from "../content/lessons";
import { PASSES } from "../content/passes";
import { drillState, empty, exportFile, normalise } from "../storage";
import { mmss, scoreRun } from "../timed";
import { calibrationScore, expectedVerdict } from "./DrillView";
import { href } from "../route";
import type { FamilyId, Progress } from "../types";

export interface Stats {
  reviewed: number;
  hit: number;
  total: number;
  pct: number | null;
  byFamily: Record<FamilyId, { hit: number; total: number }>;
  blockersMissed: number;
  blockersTotal: number;
  verdicts: number;
  correctVerdicts: number;
  assessed: number;
  calibration: number | null;
  falsePositives: number;
}

export function computeStats(p: Progress): Stats {
  const byFamily = Object.fromEntries(
    PASSES.map((f) => [f.id, { hit: 0, total: 0 }]),
  ) as Stats["byFamily"];

  let reviewed = 0;
  let hit = 0;
  let total = 0;
  let blockersMissed = 0;
  let blockersTotal = 0;
  let verdicts = 0;
  let correctVerdicts = 0;
  let assessed = 0;
  let calibration = 0;
  let falsePositives = 0;

  for (const d of DRILLS) {
    const st = drillState(p, d.id);
    if (!st.revealed) continue;
    reviewed += 1;
    for (const attempt of [st, ...(p.reviews[d.id] ?? [])]) {
      if (attempt.verdict !== undefined) {
        verdicts += 1;
        if (attempt.verdict === expectedVerdict(d)) correctVerdicts += 1;
      }
      falsePositives += attempt.falsePositives ?? 0;
      const score = calibrationScore(d, attempt);
      if (score !== null) { assessed += 1; calibration += score; }
    }
    d.defects.forEach((def, i) => {
      const got = !!st.caught[i];
      total += 1;
      byFamily[def.family].total += 1;
      if (got) {
        hit += 1;
        byFamily[def.family].hit += 1;
      }
      if (def.severity === "blocker") {
        blockersTotal += 1;
        if (!got) blockersMissed += 1;
      }
    });
  }

  return {
    reviewed,
    hit,
    total,
    pct: total ? Math.round((hit / total) * 100) : null,
    byFamily,
    blockersMissed,
    blockersTotal,
    verdicts,
    correctVerdicts,
    assessed,
    calibration: assessed ? Math.round(calibration / assessed) : null,
    falsePositives,
  };
}

interface Props {
  progress: Progress;
  stats: Stats;
  replace: (p: Progress) => void;
}

export function ProgressView({ progress, stats, replace }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const lessonsRead = LESSONS.filter((l) => progress.lessonsRead[l.id]).length;

  // Weakest first, ignoring families with nothing reviewed yet.
  const families = PASSES.map((f) => ({
    ...f,
    ...stats.byFamily[f.id],
    rate: stats.byFamily[f.id].total
      ? stats.byFamily[f.id].hit / stats.byFamily[f.id].total
      : null,
  }))
    .filter((f) => f.total > 0)
    .sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1));

  const criteria = WRITEUP_CRITERIA.map((criterion) => {
    let hit = 0, total = 0;
    for (const drill of DRILLS) {
      const first = progress.drills[drill.id];
      if (!first?.revealed) continue;
      for (const attempt of [first, ...(progress.reviews[drill.id] ?? [])]) {
        if (writeupScore(drill, attempt.writeup) === null) continue;
        total += 1;
        if (attempt.writeup?.[criterion.id]) hit += 1;
      }
    }
    return { ...criterion, hit, total, rate: total ? hit / total : null };
  }).filter((item) => item.total > 0).sort((a, b) => a.rate! - b.rate!);

  const unreviewed = practiceOrder().filter((d) => !drillState(progress, d.id).revealed);

  const onImport = async (file: File) => {
    try {
      replace(normalise(JSON.parse(await file.text())));
    } catch {
      alert("That file could not be read as saved progress.");
    }
  };

  return (
    <div className="card">
      <h2 className="card-h">Progress</h2>

      <div className="tiles">
        <div className="tile">
          <b>{stats.total ? `${stats.pct}%` : "—"}</b>
          <span>
            {stats.hit} of {stats.total} defects caught
          </span>
        </div>
        <div className="tile">
          <b>
            {stats.reviewed}/{DRILLS.length}
          </b>
          <span>drills reviewed</span>
        </div>
        <div className="tile">
          <b>
            {lessonsRead}/{LESSONS.length}
          </b>
          <span>lessons read</span>
        </div>
        <div className="tile" data-warn={stats.blockersMissed > 0 ? "1" : "0"}>
          <b>{stats.blockersMissed}</b>
          <span>blockers missed of {stats.blockersTotal}</span>
        </div>
      </div>

      <div className="tiles" aria-label="Review calibration">
        <div className="tile"><b>{stats.verdicts ? `${Math.round(100 * stats.correctVerdicts / stats.verdicts)}%` : "—"}</b>
          <span>{stats.correctVerdicts} of {stats.verdicts} recorded verdicts correct</span></div>
        <div className="tile"><b>{stats.calibration === null ? "—" : `${stats.calibration}/100`}</b>
          <span>calibration across {stats.assessed} assessed attempts</span></div>
        <div className="tile"><b>{stats.falsePositives}</b><span>self-assessed false positives</span></div>
      </div>
      <p className="note">Original and repeat verdicts are scored per attempt. Older and timed attempts
        without a verdict or false-positive assessment are not recorded, not counted as successes.</p>
      <p className="note">
        A missed blocker can reach production. A false finding costs the author time and
        the reviewer credibility. Clean samples add no defects or blockers to the denominators.
      </p>

      {families.length === 0 && <p className="note">Pass hit rates: — (no findings to score).</p>}
      {families.length > 0 && (
        <>
          <h3 className="sec-h">By pass — weakest first</h3>
          <div className="fam-rows">
            {families.map((f) => {
              const pct = Math.round((f.rate ?? 0) * 100);
              return (
                <div key={f.id} className="fam-row">
                  <span className="fam-name">{f.name}</span>
                  <span className="fam-bar">
                    <span className="fam-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="fam-num">
                    {f.hit}/{f.total}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="note">
            A low rate on one pass usually means you are not running that pass at all,
            rather than running it badly.{" "}
            <a href={href({ view: "lesson", id: `pass-${families[0].id}` })}>
              Re-read the {families[0].name} pass
            </a>
            .
          </p>
        </>
      )}

      <section aria-label="Write-up progress">
        <h3 className="sec-h">Write-up criteria — weakest first</h3>
        {criteria.length ? <div className="fam-rows">{criteria.map((item) =>
          <div className="fam-row" key={item.id}>
            <a className="fam-name" href={href({ view: "lesson", id: "writing-the-finding" })}>{item.label}</a>
            <span className="fam-bar"><span className="fam-fill" style={{ width: `${Math.round(item.rate! * 100)}%` }} /></span>
            <span className="fam-num">{item.hit}/{item.total}</span>
          </div>)}</div> : <p className="note">Write-up: — (no assessed findings).</p>}
        <p className="note">Originals and repeats count separately. Clean drills and unscored write-ups do not count.</p>
      </section>

      <h3 className="sec-h">Timed sessions</h3>
      {progress.sessions.length === 0 ? (
        <p className="note">
          None yet. An untimed drill measures whether you <em>can</em> find a defect; a{" "}
          <a href={href({ view: "timed" })}>timed session</a> measures whether you find it
          at the pace the work is paid at, which is the thing being hired for.
        </p>
      ) : (
        <>
          <ul className="plain-list">
            {[...progress.sessions]
              .reverse()
              .slice(0, 8)
              .map((s) => {
                const sc = scoreRun({
                  ...s,
                  at: s.drillIds.length,
                  drillStartedAt: s.startedAt,
                  notes: {},
                  phase: "debrief",
                });
                return (
                  <li key={s.id}>
                    {new Date(s.startedAt).toLocaleDateString()} —{" "}
                    {s.drillIds.length} samples at {mmss(s.secondsPerDrill)},{" "}
                    <b>{sc.total ? `${sc.pct}%` : "—"}</b>{" "}
                    <span className="practice-lang">
                      {sc.blockersTotal - sc.blockersCaught} of {sc.blockersTotal} blockers
                      missed
                      {sc.timedOut > 0 ? `, ${sc.timedOut} ran out of clock` : ""}
                    </span>
                  </li>
                );
              })}
          </ul>
          <p className="note">
            <a href={href({ view: "timed" })}>Run another session</a>. If the untimed
            percentage is high and the timed one is not, the gap is pacing rather than
            knowledge, and the fix is to write each finding the moment you see it.
          </p>
        </>
      )}

      {unreviewed.length > 0 && (
        <>
          <h3 className="sec-h">Not yet reviewed</h3>
          <ul className="plain-list">
            {unreviewed.map((d) => (
              <li key={d.id}>
                <a href={href({ view: "drill", id: d.id })}>
                  {d.id}. {d.title}
                </a>{" "}
                <span className="practice-lang">
                  {d.lang} · {d.level}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="sec-h">Your data</h3>
      <p className="note">
        Everything is stored in this browser's local storage and never leaves the machine.
        Export it if you want it on another device or in a backup.
      </p>
      <div className="bar">
        <button className="btn btn-2" onClick={() => exportFile(progress)}>
          Export progress
        </button>
        <button className="btn btn-2" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
        <button
          className="btn btn-danger"
          onClick={() => {
            if (confirm("Erase all notes, reveals and scores? This cannot be undone.")) {
              replace(empty());
            }
          }}
        >
          Reset everything
        </button>
      </div>
    </div>
  );
}
