import { Fragment, type ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";

/**
 * A deliberately small Markdown subset, sufficient for the lesson bodies and
 * with no dependency and no HTML pass-through. Supported:
 *
 *   ## / ### headings, paragraphs, - and 1. lists, > blockquotes,
 *   ``` fenced code (with a language), | pipe tables,
 *   and inline `code`, **bold** and *italic*.
 *
 * Anything else is rendered as literal text, which is the safe failure.
 */

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Split on the three inline forms at once so they cannot nest incorrectly.
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("`")) {
      out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ").trim();
    paragraph.length = 0;
    if (text) blocks.push(<p key={key++}>{inline(text, `p${key}`)}</p>);
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (line.trimStart().startsWith("```")) {
      flush();
      const lang = line.trim().slice(3).trim() || undefined;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push(
        <CodeBlock key={key++} code={body.join("\n")} lang={lang} diff={lang === "diff"} />,
      );
      continue;
    }

    // headings
    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      const content = inline(h[2], `h${key}`);
      blocks.push(
        level === 2 ? (
          <h2 key={key++}>{content}</h2>
        ) : level === 3 ? (
          <h3 key={key++}>{content}</h3>
        ) : (
          <h4 key={key++}>{content}</h4>
        ),
      );
      i += 1;
      continue;
    }

    // table
    if (line.trim().startsWith("|") && /^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      flush();
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <table key={key++} className="md-table">
          <thead>
            <tr>
              {head.map((c, n) => (
                <th key={n}>{inline(c, `th${n}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, rn) => (
              <tr key={rn}>
                {r.map((c, cn) => (
                  <td key={cn}>{inline(c, `td${rn}-${cn}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    // blockquote
    if (line.trimStart().startsWith("> ")) {
      flush();
      const body: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        body.push(lines[i].trimStart().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote key={key++}>
          {inline(body.join(" ").trim(), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    // list (a blank line ends it; a continuation line is indented)
    const bullet = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      const ordered = /\d/.test(bullet[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m2 = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (m2) {
          items.push(m2[3]);
          i += 1;
        } else if (/^\s+\S/.test(lines[i]) && items.length > 0) {
          items[items.length - 1] += " " + lines[i].trim();
          i += 1;
        } else {
          break;
        }
      }
      const kids = items.map((it, n) => <li key={n}>{inline(it, `li${n}`)}</li>);
      blocks.push(
        ordered ? <ol key={key++}>{kids}</ol> : <ul key={key++}>{kids}</ul>,
      );
      continue;
    }

    if (line.trim() === "") {
      flush();
      i += 1;
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }
  flush();

  return <div className="md">{blocks.map((b, n) => <Fragment key={n}>{b}</Fragment>)}</div>;
}
