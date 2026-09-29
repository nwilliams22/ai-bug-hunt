import { LESSONS, MODULES } from "../content/lessons";
import { DRILLS } from "../content/drills";
import { GOTCHAS } from "../content/gotchas";
import { href } from "../route";
import type { Progress } from "../types";
import { drillState } from "../storage";

export function HomeView({ progress }: { progress: Progress }) {
  const nextLesson = LESSONS.find((l) => !progress.lessonsRead[l.id]);
  const nextDrill = DRILLS.find((d) => !drillState(progress, d.id).revealed);

  return (
    <>
      <div className="card">
        <h2 className="card-h">Reviewing AI-generated code</h2>
        <p className="lede">
          Generated code is syntactically perfect, idiomatically plausible, well named and
          commented — and wrong in specific, learnable places. This is a course in finding
          those places on purpose rather than by luck.
        </p>
        <p className="note">
          Three parts. A <b>method</b>: six passes you run in a fixed order, so defects
          are found by construction rather than by inspiration. A set of{" "}
          <b>{DRILLS.length} drills</b> of plausible, confident, defective code, gated so
          you must write your review before the answers unlock. And a{" "}
          <b>reference</b> of {GOTCHAS.length} language-specific traps for the languages
          you review rarely.
        </p>

        <div className="bar">
          {nextLesson && (
            <a className="btn" href={href({ view: "lesson", id: nextLesson.id })}>
              {progress.lessonsRead[LESSONS[0].id] ? "Continue" : "Start"}: {nextLesson.title}
            </a>
          )}
          {nextDrill && (
            <a className="btn btn-2" href={href({ view: "drill", id: nextDrill.id })}>
              Next drill: {nextDrill.title}
            </a>
          )}
        </div>
      </div>

      {MODULES.map((m) => (
        <div key={m.id} className="card">
          <h3 className="sec-h sec-h-first">{m.title}</h3>
          <p className="note">{m.blurb}</p>
          <ol className="lesson-list">
            {LESSONS.filter((l) => l.moduleId === m.id).map((l) => (
              <li key={l.id}>
                <a href={href({ view: "lesson", id: l.id })}>{l.title}</a>
                <span className="lesson-blurb">{l.blurb}</span>
                {progress.lessonsRead[l.id] && <span className="tick">read</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}

      <div className="card">
        <h3 className="sec-h sec-h-first">Drills</h3>
        <p className="note">
          Every drill has between two and six planted defects across several families. The
          common failure is not finding nothing — it is finding the first thing and
          stopping.
        </p>
        <DrillTable progress={progress} />
      </div>
    </>
  );
}

export function DrillTable({ progress }: { progress: Progress }) {
  return (
    <table className="drill-table">
      <thead>
        <tr>
          <th />
          <th>Drill</th>
          <th>Language</th>
          <th>Level</th>
          <th className="num">Defects</th>
          <th className="num">Caught</th>
        </tr>
      </thead>
      <tbody>
        {DRILLS.map((d) => {
          const st = drillState(progress, d.id);
          const caught = Object.values(st.caught).filter(Boolean).length;
          return (
            <tr key={d.id} data-done={st.revealed ? "1" : "0"}>
              <td className="num dim">{d.id}</td>
              <td>
                <a href={href({ view: "drill", id: d.id })}>{d.title}</a>
                {d.shape === "diff" && <span className="mini-tag">diff</span>}
              </td>
              <td className="dim">{d.lang}</td>
              <td className="dim">{d.level}</td>
              <td className="num dim">{d.defects.length}</td>
              <td className="num">
                {st.revealed ? (
                  <b data-low={caught < d.defects.length / 2 ? "1" : "0"}>
                    {caught}/{d.defects.length}
                  </b>
                ) : st.note ? (
                  <span className="dim">in progress</span>
                ) : (
                  <span className="dim">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
