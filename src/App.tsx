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
import { ProgressView, computeStats } from "./views/ProgressView";

export default function App() {
  const route = useRoute();
  const [progress, setProgress] = useState<Progress>(() => load());

  useEffect(() => {
    save(progress);
  }, [progress]);

  const stats = useMemo(() => computeStats(progress), [progress]);

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
