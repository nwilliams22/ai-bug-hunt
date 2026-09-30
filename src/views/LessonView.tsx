import { LESSONS, LESSON_BY_ID, MODULES } from "../content/lessons";
import { DRILL_BY_ID } from "../content/drills";
import { Markdown } from "../components/Markdown";
import { practicePosition } from "../review";
import { href } from "../route";

interface Props {
  id: string;
  read: boolean;
  setRead: (v: boolean) => void;
}

export function LessonView({ id, read, setRead }: Props) {
  const lesson = LESSON_BY_ID.get(id);
  const index = LESSONS.findIndex((l) => l.id === id);
  const prev = index > 0 ? LESSONS[index - 1] : undefined;
  const next = index >= 0 && index < LESSONS.length - 1 ? LESSONS[index + 1] : undefined;

  if (!lesson) {
    return (
      <div className="card">
        <h2>No such lesson</h2>
        <p>
          <a href={href({ view: "home" })}>Back to the course</a>
        </p>
      </div>
    );
  }

  const mod = MODULES.find((m) => m.id === lesson.moduleId);

  return (
    <>
      <article className="card lesson">
        <div className="meta">
          <span className="meta-note">{mod?.title}</span>
        </div>
        <h2 className="card-h">{lesson.title}</h2>
        <Markdown source={lesson.body} />

        {lesson.practice && lesson.practice.length > 0 && (
          <div className="practice">
            <p className="practice-h">Practice this</p>
            <p className="practice-note">
              Optional, and nothing is gated on it — the next lesson is open whether
              you do these or not. They are ordinary drills from the Drills list in the
              sidebar, at the numbers shown below, picked because they exercise this lesson
              and ordered easiest first. Being listed here is <em>not</em> a hint: some of
              these samples are correct, and some hide their defect in another pass
              entirely.
            </p>
            <ul>
              {lesson.practice.map((n) => {
                const d = DRILL_BY_ID.get(n);
                if (!d) return null;
                return (
                  <li key={n}>
                    <a href={href({ view: "drill", id: n })}>
                      {practicePosition(n)}. {d.title}
                    </a>{" "}
                    <span className="practice-lang">
                      {d.lang} · {d.level}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <label className="readmark">
          <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
          Mark this lesson as read
        </label>
      </article>

      <nav className="pager">
        {prev ? <a href={href({ view: "lesson", id: prev.id })}>← {prev.title}</a> : <span />}
        {next ? <a href={href({ view: "lesson", id: next.id })}>{next.title} →</a> : <span />}
      </nav>
    </>
  );
}
