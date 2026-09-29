import { useState } from "react";
import { DrillCode } from "../components/CodeBlock";
import { familyName } from "../content/passes";
import { dueReviews, reviewSchedule } from "../review";
import { href } from "../route";
import type { Progress } from "../types";

interface Props {
  progress: Progress;
  id?: number;
  complete: (id: number, note: string) => void;
  mark: (id: number, index: number, caught: boolean) => void;
  finish: (id: number) => void;
}

export function ReviewView({ progress, id, complete, mark, finish }: Props) {
  const [note, setNote] = useState("");
  const [opened, setOpened] = useState(false);
  const due = dueReviews(progress);
  const entry = due.find((item) => item.drill.id === id);
  const last = id === undefined ? undefined : progress.reviews[id]?.at(-1);
  const active = entry || (opened && id !== undefined
    ? reviewSchedule(progress).find((item) => item.drill.id === id) : undefined);

  if (!active) return (
    <div className="card">
      <h2 className="card-h">Review queue</h2>
      <p className="note">{due.length} due now. Repeat a sample only after its scheduled date.</p>
      {due.length ? <ol className="lesson-list">
        {due.map((item) => <li key={item.drill.id}>
          <a href={href({ view: "review", id: item.drill.id })}>
            Drill {item.drill.id}: {item.drill.title}
          </a>
          <span className="lesson-blurb">Attempt {item.attempt} · previous score {item.score}%</span>
        </li>)}
      </ol> : <p>Nothing is due. Keep working through new drills or timed practice.</p>}
      {id !== undefined && <p><a href={href({ view: "review" })}>Back to queue</a></p>}
    </div>
  );

  const drill = active.drill;
  const attempts = progress.reviews[drill.id] ?? [];
  const revealed = !!last && (opened || !last.scored);
  return <div className="card">
    <p><a href={href({ view: "review" })}>← Review queue</a></p>
    <h2 className="card-h">Drill {drill.id}: {drill.title} · attempt {revealed ? attempts.length + 1 : active.attempt}</h2>
    <p className="note">Write a new review from the code. The answer stays hidden until you lock it in.</p>
    {drill.brief && <p className="brief">{drill.brief}</p>}
    <DrillCode drill={drill} />
    <p className="label">What did you find this time?</p>
    {!revealed ? <>
      <textarea className="ta" value={note} onChange={(event) => setNote(event.target.value)}
        placeholder="Name the mechanism, a failing input, and its effect." />
      <div className="bar">
        <button className="btn" disabled={note.trim().length < 25}
          onClick={() => { complete(drill.id, note.trim()); setOpened(true); }}>
          Lock in and reveal
        </button>
        {note.trim().length < 25 && <span className="gate">Write your review first — {25 - note.trim().length} more characters.</span>}
      </div>
    </> : <>
      <blockquote className="wrote">{last.note}</blockquote>
      <div className="rev">
        <p className="rev-h">Planted defects</p>
        <p className="rev-n">Tick only the findings you named before reveal. This score belongs to this attempt.</p>
        {drill.defects.map((defect, index) => <div className="def" key={index}
          data-got={last.caught[index] ? "1" : "0"}>
          <div className="def-top"><span className="def-fam">{familyName(defect.family)} · {defect.severity}</span>
            <label className="chk"><input type="checkbox" checked={!!last.caught[index]}
              onChange={(event) => mark(drill.id, index, event.target.checked)} />I caught this</label>
          </div>
          <p className="def-t">{defect.title}</p><p className="def-b">{defect.body}</p>
          <div className="def-f">{defect.fix}</div>
        </div>)}
      </div>
      <button className="btn" onClick={() => { finish(drill.id); setOpened(false); }}>
        Finish scoring
      </button>
    </>}
    {revealed && <>
      <h3 className="sec-h">Attempt history</h3>
      <ol className="lesson-list">
        {[progress.drills[drill.id], ...attempts].map((attempt, index) => {
          const caught = drill.defects.filter((_, i) => attempt.caught[i]).length;
          return <li key={index}>Attempt {index + 1}: {caught}/{drill.defects.length} caught
            {attempt.revealedAt ? ` · ${new Date(attempt.revealedAt).toLocaleDateString()}` : ""}
            <span className="lesson-blurb">{attempt.note}</span>
          </li>;
        })}
      </ol>
      <p className="note">Score the findings you caught, then finish to set the next interval.</p>
    </>}
  </div>;
}
