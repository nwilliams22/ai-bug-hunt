import { useCallback, useEffect, useMemo, useState } from "react";
import { LESSONS, MODULES } from "./content/lessons";
import { DRILLS } from "./content/drills";
import { GOTCHA_LANGS } from "./content/gotchas";
import { href, useRoute } from "./route";
import { drillState, load, save } from "./storage";
import type { DrillProgress, Progress } from "./types";
import { HomeView, DrillTable } from "./views/HomeView";
import { LessonView } from "./views/LessonView";
import { DrillView } from "./views/DrillView";
import { GotchasView } from "./views/GotchasView";
import { TimedView } from "./views/TimedView";
import { ProgressView, computeStats } from "./views/ProgressView";
import { toSession } from "./timed";
import { dueReviews } from "./review";
import { ReviewView } from "./views/ReviewView";
import type { TimedRun } from "./types";

export default function App() {
  const route = useRoute();
  const [progress, setProgress] = useState<Progress>(() => load());

  useEffect(() => {
    save(progress);
  }, [progress]);

  const stats = useMemo(() => computeStats(progress), [progress]);
  const dueCount = dueReviews(progress).length;

  const completeReview = useCallback((id: number, note: string) => {
    if (note.trim().length < 25) return;
    setProgress((p) => {
      if (!dueReviews(p).some((entry) => entry.drill.id === id)) return p;
      if (p.reviews[id]?.at(-1)?.scored === false) return p;
      return { ...p, reviews: { ...p.reviews,
        [id]: [...(p.reviews[id] ?? []), { note, revealedAt: Date.now(), caught: {}, scored: false }] } };
    });
  }, []);

  const finishReview = useCallback((id: number) => {
    setProgress((p) => {
      const attempts = p.reviews[id];
      if (!attempts?.length) return p;
      return { ...p, reviews: { ...p.reviews, [id]: [
        ...attempts.slice(0, -1), { ...attempts[attempts.length - 1], scored: true },
      ] } };
    });
  }, []);

  const markReview = useCallback((id: number, index: number, caught: boolean) => {
    setProgress((p) => {
      const attempts = p.reviews[id];
      if (!attempts?.length) return p;
      return { ...p, reviews: { ...p.reviews, [id]: [
        ...attempts.slice(0, -1),
        { ...attempts[attempts.length - 1], caught: {
          ...attempts[attempts.length - 1].caught, [index]: caught } },
      ] } };
    });
  }, []);

  const updateDrill = useCallback((id: number, patch: Partial<DrillProgress>) => {
    setProgress((p) => ({
      ...p,
      drills: {
        ...p.drills,
        [id]: {
          ...(p.drills[id] ?? { note: "", revealed: false, hintLevel: 0, caught: {} }),
          ...patch,
        },
      },
    }));
  }, []);

  const addSession = useCallback((run: TimedRun) => {
    const session = toSession(run);
    setProgress((p) => ({
      ...p,
      // Recording the same session twice — a double-clicked button — must not
      // duplicate the history row.
      sessions: [...p.sessions.filter((s) => s.id !== session.id), session],
    }));
  }, []);

  const setLessonRead = useCallback((id: string, v: boolean) => {
    setProgress((p) => {
      const next = { ...p.lessonsRead };
      if (v) next[id] = true;
      else delete next[id];
      return { ...p, lessonsRead: next };
    });
  }, []);

  return (
    <div className="app">
      <header className="head">
        <div className="head-in">
          <a className="brand" href={href({ view: "home" })}>
            Bug&nbsp;Finder
            <span className="brand-sub">finding subtle defects in generated code</span>
          </a>
          <a className="score" href={href({ view: "progress" })}>
            <b>{stats.total ? `${stats.pct}%` : "—"}</b>
            {stats.total
              ? `${stats.hit}/${stats.total} caught · ${stats.reviewed}/${DRILLS.length} reviewed`
              : "no drills reviewed yet"}
          </a>
          <a className="score" href={href({ view: "review" })}><b>{dueCount}</b>due reviews</a>
        </div>
      </header>

      <div className="cols">
        <Sidebar route={route} progress={progress} />
        <main className="main">
          {route.view === "home" && <HomeView progress={progress} />}

          {route.view === "lesson" && (
            <LessonView
              id={route.id}
              read={!!progress.lessonsRead[route.id]}
              setRead={(v) => setLessonRead(route.id, v)}
            />
          )}

          {route.view === "drill" && (
            <DrillView
              id={route.id}
              state={drillState(progress, route.id)}
              update={(patch) => updateDrill(route.id, patch)}
            />
          )}

          {route.view === "drills" && (
            <div className="card">
              <h2 className="card-h">Drills</h2>
              <p className="note">
                Write your review before unlocking the answers. Recognition feels like
                learning and isn't.
              </p>
              <DrillTable progress={progress} />
            </div>
          )}

          {route.view === "gotchas" && <GotchasView lang={route.lang} />}

          {route.view === "timed" && (
            <TimedView
              progress={progress}
              commitDrill={updateDrill}
              addSession={addSession}
            />
          )}

          {route.view === "review" && <ReviewView key={route.id ?? "queue"}
            id={route.id} progress={progress} complete={completeReview} mark={markReview}
            finish={finishReview} />}

          {route.view === "progress" && (
            <ProgressView progress={progress} stats={stats} replace={setProgress} />
          )}
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  route,
  progress,
}: {
  route: ReturnType<typeof useRoute>;
  progress: Progress;
}) {
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes, so a tap on a link on a phone
  // does not leave the menu covering the content it navigated to.
  useEffect(() => setOpen(false), [route]);

  return (
    <>
      <button className="drawer-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "Close" : "Menu"}
      </button>
      <nav className="side" data-open={open ? "1" : "0"}>
        <a className="side-link side-top" data-on={route.view === "review" ? "1" : "0"}
          href={href({ view: "review" })}>Review queue · {dueReviews(progress).length} due</a>
        <a
          className="side-link side-top"
          data-on={route.view === "home" ? "1" : "0"}
          href={href({ view: "home" })}
        >
          Overview
        </a>

        {MODULES.map((m) => (
          <section key={m.id} className="side-sec">
            <p className="side-h">{m.title}</p>
            {LESSONS.filter((l) => l.moduleId === m.id).map((l) => (
              <a
                key={l.id}
                className="side-link"
                data-on={route.view === "lesson" && route.id === l.id ? "1" : "0"}
                href={href({ view: "lesson", id: l.id })}
              >
                <span className="side-mark">{progress.lessonsRead[l.id] ? "●" : "○"}</span>
                {l.title}
              </a>
            ))}
          </section>
        ))}

        <section className="side-sec">
          <p className="side-h">Drills</p>
          {DRILLS.map((d) => {
            const st = drillState(progress, d.id);
            return (
              <a
                key={d.id}
                className="side-link"
                data-on={route.view === "drill" && route.id === d.id ? "1" : "0"}
                href={href({ view: "drill", id: d.id })}
              >
                <span className="side-mark">
                  {st.revealed ? "●" : st.note ? "◐" : "○"}
                </span>
                <span className="side-n">{d.id}</span>
                {d.title}
              </a>
            );
          })}
        </section>

        <section className="side-sec">
          <p className="side-h">Reference</p>
          <a
            className="side-link"
            data-on={route.view === "gotchas" && !route.lang ? "1" : "0"}
            href={href({ view: "gotchas" })}
          >
            <span className="side-mark">·</span>
            All gotchas
          </a>
          {GOTCHA_LANGS.map((l) => (
            <a
              key={l}
              className="side-link"
              data-on={route.view === "gotchas" && route.lang === l ? "1" : "0"}
              href={href({ view: "gotchas", lang: l })}
            >
              <span className="side-mark">·</span>
              {l}
            </a>
          ))}
        </section>

        <section className="side-sec">
          <a
            className="side-link"
            data-on={route.view === "timed" ? "1" : "0"}
            href={href({ view: "timed" })}
          >
            <span className="side-mark">·</span>
            Timed review
          </a>
          <a
            className="side-link"
            data-on={route.view === "progress" ? "1" : "0"}
            href={href({ view: "progress" })}
          >
            <span className="side-mark">·</span>
            Progress &amp; export
          </a>
        </section>
      </nav>
    </>
  );
}
