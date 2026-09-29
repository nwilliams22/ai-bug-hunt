import type { Progress, DrillProgress } from "./types";

const KEY = "bug-finder:progress:v1";

export const EMPTY_DRILL: DrillProgress = {
  note: "",
  revealed: false,
  hintLevel: 0,
  caught: {},
};

function empty(): Progress {
  return { version: 1, drills: {}, lessonsRead: {} };
}

export function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as unknown;
    return normalise(parsed);
  } catch {
    // A corrupt or unreadable store must not take the app down; the course is
    // still usable with no history.
    return empty();
  }
}

export function save(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Quota or a privacy mode that blocks writes. Nothing useful to do here,
    // and failing loudly would interrupt a drill mid-review.
  }
}

/**
 * Accept anything and produce a valid Progress. Used for both localStorage
 * reads and user-supplied import files, so it has to assume nothing.
 */
export function normalise(input: unknown): Progress {
  const out = empty();
  if (typeof input !== "object" || input === null) return out;
  const src = input as Record<string, unknown>;

  const drills = src.drills;
  if (typeof drills === "object" && drills !== null) {
    for (const [k, v] of Object.entries(drills as Record<string, unknown>)) {
      const id = Number(k);
      if (!Number.isInteger(id) || typeof v !== "object" || v === null) continue;
      const d = v as Record<string, unknown>;
      const caught: Record<number, boolean> = {};
      if (typeof d.caught === "object" && d.caught !== null) {
        for (const [ck, cv] of Object.entries(d.caught as Record<string, unknown>)) {
          const ci = Number(ck);
          if (Number.isInteger(ci) && cv === true) caught[ci] = true;
        }
      }
      out.drills[id] = {
        note: typeof d.note === "string" ? d.note : "",
        revealed: d.revealed === true,
        hintLevel:
          typeof d.hintLevel === "number" ? Math.max(0, Math.min(2, d.hintLevel)) : 0,
        caught,
        revealedAt: typeof d.revealedAt === "number" ? d.revealedAt : undefined,
      };
    }
  }

  const read = src.lessonsRead;
  if (typeof read === "object" && read !== null) {
    for (const [k, v] of Object.entries(read as Record<string, unknown>)) {
      if (v === true) out.lessonsRead[k] = true;
    }
  }

  return out;
}

export function drillState(p: Progress, id: number): DrillProgress {
  return p.drills[id] ?? EMPTY_DRILL;
}

export function exportFile(p: Progress): void {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bug-finder-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
