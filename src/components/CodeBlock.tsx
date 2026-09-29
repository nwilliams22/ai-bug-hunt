import { useMemo } from "react";
import Prism from "prismjs";

// Order matters: each component file registers against the global Prism that
// the main import above installs, and some build on others (typescript needs
// javascript, csharp needs clike, jsx needs markup).
import "prismjs/components/prism-python";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-php";
import "prismjs/components/prism-bash";

import type { Drill, Lang } from "../types";

const PRISM_LANG: Record<string, string> = {
  Python: "python",
  JavaScript: "javascript",
  TypeScript: "typescript",
  React: "jsx",
  SQL: "sql",
  Rust: "rust",
  Go: "go",
  Java: "java",
  "C#": "csharp",
  "C++": "cpp",
  Kotlin: "kotlin",
  Ruby: "ruby",
  PHP: "php",
  Bash: "bash",
  py: "python",
  rs: "rust",
  tsx: "tsx",
  c: "c",
  h: "c",
  hpp: "cpp",
  python: "python",
  js: "javascript",
  javascript: "javascript",
  jsx: "jsx",
  ts: "typescript",
  typescript: "typescript",
  sql: "sql",
  rust: "rust",
  go: "go",
  java: "java",
  csharp: "csharp",
  cs: "csharp",
  cpp: "cpp",
  "c++": "cpp",
  kotlin: "kotlin",
  kt: "kotlin",
  ruby: "ruby",
  rb: "ruby",
  php: "php",
  bash: "bash",
  sh: "bash",
  diff: "diff",
};

function highlight(code: string, lang: string | undefined): string {
  const key = lang ? PRISM_LANG[lang] : undefined;
  const grammar = key ? Prism.languages[key] : undefined;
  if (!grammar || !key) return escapeHtml(code);
  try {
    return Prism.highlight(code, grammar, key);
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface Props {
  code: string;
  lang?: Lang | string;
  /** Render as a unified diff: strip the marker column and tint the rows. */
  diff?: boolean;
  /** Show a gutter of line numbers. Drill hints refer to line numbers. */
  numbers?: boolean;
}

/**
 * A diff sample is highlighted as its underlying language rather than as a
 * diff, because the interesting reading is the code, not the markers. The
 * marker column is peeled off first and re-attached as a row class.
 */
export function CodeBlock({ code, lang, diff = false, numbers = false }: Props) {
  const rows = useMemo(() => {
    const lines = code.split("\n");
    if (!diff) {
      return lines.map((line) => ({ kind: "ctx" as const, html: highlight(line, lang) }));
    }
    return lines.map((line) => {
      if (/^(--- |\+\+\+ |@@|diff --git |index )/.test(line)) {
        return { kind: "ctx" as const, html: escapeHtml(line) };
      }
      const marker = line[0];
      const rest = line.slice(1);
      const kind = marker === "+" ? "add" : marker === "-" ? "del" : "ctx";
      return { kind, html: highlight(rest, lang) };
    });
  }, [code, lang, diff]);

  return (
    <pre className="code" aria-label={`${lang ?? "code"} sample`}>
      <code>
        {rows.map((row, i) => (
          <span key={i} className={`code-row code-row-${row.kind}`}>
            {numbers && <span className="code-n">{i + 1}</span>}
            {diff && (
              <span className="code-mark">
                {row.kind === "add" ? "+" : row.kind === "del" ? "-" : " "}
              </span>
            )}
            <span
              className="code-src"
              // Highlighted markup is produced by Prism from static, bundled
              // course content. No user input reaches this.
              dangerouslySetInnerHTML={{ __html: row.html || "​" }}
            />
          </span>
        ))}
      </code>
    </pre>
  );
}

/** Keep the complete file inventory visible; unchanged context is review material too. */
export function DrillCode({ drill }: { drill: Drill }) {
  if (!drill.files?.length) {
    return <CodeBlock code={drill.code} lang={drill.lang} diff={drill.shape === "diff"} numbers />;
  }
  return (
    <div className="drill-files">
      <p className="label">Files in this review</p>
      <ul aria-label="Review files">
        {drill.files.map((file) => <li key={file.path}><code>{file.path}</code></li>)}
      </ul>
      {drill.files.map((file) => {
        const extension = file.path.split(".").pop()?.toLowerCase();
        // A diff file names its underlying extension: handler.ts.diff.
        const diff = extension === "diff";
        const lang = diff ? file.path.split(".").at(-2) : extension;
        return (
          <section className="drill-file" key={file.path} aria-label={file.path}>
            <h3>{file.path}</h3>
            <CodeBlock code={file.code} lang={lang} diff={diff} numbers />
          </section>
        );
      })}
    </div>
  );
}
