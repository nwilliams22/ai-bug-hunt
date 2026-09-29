import { GOTCHAS, GOTCHA_LANGS } from "../content/gotchas";
import { familyName } from "../content/passes";
import { CodeBlock } from "../components/CodeBlock";
import { href } from "../route";
import type { Lang } from "../types";

export function GotchasView({ lang }: { lang?: string }) {
  const active = GOTCHA_LANGS.find((l) => l.toLowerCase() === (lang ?? "").toLowerCase());
  const shown = active ? GOTCHAS.filter((g) => g.lang === active) : GOTCHAS;

  return (
    <div className="card">
      <h2 className="card-h">Language gotchas</h2>
      <p className="note">
        Traps that are specific to a language rather than to logic, weighted toward the
        ones generated code lands on repeatedly. Every entry changes behaviour — none of
        these are style opinions. Use it as a checklist when the code is in a language you
        review rarely.
      </p>

      <div className="chips">
        <a
          className="chip"
          data-on={active ? "0" : "1"}
          href={href({ view: "gotchas" })}
        >
          All ({GOTCHAS.length})
        </a>
        {GOTCHA_LANGS.map((l: Lang) => (
          <a
            key={l}
            className="chip"
            data-on={active === l ? "1" : "0"}
            href={href({ view: "gotchas", lang: l })}
          >
            {l} ({GOTCHAS.filter((g) => g.lang === l).length})
          </a>
        ))}
      </div>

      <div className="gotchas">
        {shown.map((g) => (
          <section key={g.id} className="gotcha">
            <div className="gotcha-top">
              <span className="badge badge-lang">{g.lang}</span>
              <span className="gotcha-fam">{familyName(g.family)}</span>
            </div>
            <h3 className="gotcha-t">{g.title}</h3>
            <p className="gotcha-b">{g.body}</p>
            {g.code && <CodeBlock code={g.code} lang={g.lang} />}
            {g.fix && (
              <div className="gotcha-fix">
                <span className="gotcha-fix-l">Fix</span>
                <code>{g.fix}</code>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
