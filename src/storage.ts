import type { Progress, DrillProgress, ReviewAttempt, TimedSession, Verdict } from "./types";

// The key is deliberately still v1: the shape only ever gained fields, and
// normalise() fills them in, so a store written by an earlier build loads
// without losing a single note.
const KEY = "bug-finder:progress:v1";

export const EMPTY_DRILL: DrillProgress = {
  note: "",
  revealed: false,
  hintLevel: 0,
  caught: {},
};

export function empty(): Progress {
  return { version: 3, drills: {}, reviews: {}, lessonsRead: {}, sessions: [] };
}

function normaliseCaught(input: unknown): Record<number, boolean> {
  const caught: Record<number, boolean> = {};
  if (typeof input === "object" && input !== null) {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const id = Number(key);
      if (Number.isInteger(id) && id >= 0 && value === true) caught[id] = true;
    }
  }
  return caught;
}

function normaliseVerdict(value: unknown): Verdict | undefined {
  return value === "approve" || value === "approve-with-comments" || value === "request-changes"
    ? value : undefined;
}

function normaliseFalsePositives(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : undefined;
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
      out.drills[id] = {
        note: typeof d.note === "string" ? d.note : "",
        revealed: d.revealed === true,
        hintLevel:
          typeof d.hintLevel === "number" ? Math.max(0, Math.min(2, d.hintLevel)) : 0,
        caught: normaliseCaught(d.caught),
        revealedAt: typeof d.revealedAt === "number" ? d.revealedAt : undefined,
        verdict: normaliseVerdict(d.verdict),
        falsePositives: normaliseFalsePositives(d.falsePositives),
      };
    }
  }

  // Version 2 exports have no reviews. Their original drill state stays intact.
  if (typeof src.reviews === "object" && src.reviews !== null) {
    for (const [key, value] of Object.entries(src.reviews as Record<string, unknown>)) {
      const id = Number(key);
      if (!Number.isInteger(id) || !Array.isArray(value)) continue;
      const attempts: ReviewAttempt[] = [];
      for (const raw of value) {
        if (typeof raw !== "object" || raw === null) continue;
        const attempt = raw as Record<string, unknown>;
        if (typeof attempt.note !== "string" || attempt.note.trim().length < 25 ||
            typeof attempt.revealedAt !== "number" || !Number.isFinite(attempt.revealedAt)) continue;
        attempts.push({ note: attempt.note, revealedAt: attempt.revealedAt,
          caught: normaliseCaught(attempt.caught), scored: attempt.scored !== false,
          verdict: normaliseVerdict(attempt.verdict),
          falsePositives: normaliseFalsePositives(attempt.falsePositives) });
      }
      if (attempts.length) out.reviews[id] = attempts;
    }
  }

  const read = src.lessonsRead;
  if (typeof read === "object" && read !== null) {
    for (const [k, v] of Object.entries(read as Record<string, unknown>)) {
      if (v === true) out.lessonsRead[k] = true;
    }
  }

  if (Array.isArray(src.sessions)) {
    for (const raw of src.sessions) {
      const s = normaliseSession(raw);
      if (s) out.sessions.push(s);
    }
  }

  return out;
}

function normaliseSession(input: unknown): TimedSession | null {
  if (typeof input !== "object" || input === null) return null;
  const s = input as Record<string, unknown>;
  if (!Array.isArray(s.drillIds)) return null;

  const drillIds = s.drillIds.filter((n): n is number => Number.isInteger(n));
  if (drillIds.length === 0) return null;

  const spent: Record<number, number> = {};
  if (typeof s.spent === "object" && s.spent !== null) {
    for (const [k, v] of Object.entries(s.spent as Record<string, unknown>)) {
      const id = Number(k);
      if (Number.isInteger(id) && typeof v === "number" && v >= 0) spent[id] = v;
    }
  }

  const caught: Record<number, number[]> = {};
  if (typeof s.caught === "object" && s.caught !== null) {
    for (const [k, v] of Object.entries(s.caught as Record<string, unknown>)) {
      const id = Number(k);
      if (Number.isInteger(id) && Array.isArray(v)) {
        caught[id] = v.filter((n): n is number => Number.isInteger(n));
      }
    }
  }

  const startedAt = typeof s.startedAt === "number" ? s.startedAt : 0;
  return {
    id: typeof s.id === "string" ? s.id : String(startedAt),
    startedAt,
    finishedAt: typeof s.finishedAt === "number" ? s.finishedAt : startedAt,
    secondsPerDrill:
      typeof s.secondsPerDrill === "number" && s.secondsPerDrill > 0
        ? s.secondsPerDrill
        : 300,
    drillIds,
    spent,
    caught,
  };
}

export function drillState(p: Progress, id: number): DrillProgress {
  return p.drills[id] ?? EMPTY_DRILL;
}

/** Attempt 1 is the original drill; attempts 2+ are repeats. */
export function updateAttemptAssessment(
  progress: Progress, id: number, attempt: number,
  patch: { verdict?: Verdict; falsePositives?: number },
): Progress {
  const assessment = {
    ...(patch.verdict === undefined ? {} : { verdict: normaliseVerdict(patch.verdict) }),
    ...(patch.falsePositives === undefined ? {} : {
      falsePositives: normaliseFalsePositives(patch.falsePositives),
    }),
  };
  if (attempt === 1) {
    const original = progress.drills[id];
    if (!original) return progress;
    return { ...progress, drills: { ...progress.drills, [id]: { ...original, ...assessment } } };
  }
  const repeats = progress.reviews[id];
  const index = attempt - 2;
  if (!repeats || !Number.isInteger(index) || index < 0 || index >= repeats.length) return progress;
  return { ...progress, reviews: { ...progress.reviews, [id]: repeats.map((item, i) =>
    i === index ? { ...item, ...assessment } : item) } };
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
