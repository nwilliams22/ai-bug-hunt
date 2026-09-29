import { DRILLS, DRILL_BY_ID } from "./content/drills";
import type { Drill, Level, TimedRun, TimedSession } from "./types";

const RUN_KEY = "bug-finder:timed:v1";

export const SECONDS_CHOICES = [180, 300, 420, 600] as const;
export const COUNT_CHOICES = [3, 5, 8, 12] as const;

export interface RunOptions {
  count: number;
  secondsPerDrill: number;
  /** Restrict to these levels. Empty means any level. */
  levels: Level[];
  /** Allow drills whose answers you have already seen. */
  includeSeen: boolean;
}

export const DEFAULT_OPTIONS: RunOptions = {
  count: 5,
  secondsPerDrill: 300,
  levels: [],
  includeSeen: false,
};

/* ------------------------------ persistence ------------------------------ */

export function loadRun(): TimedRun | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    return normaliseRun(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function saveRun(run: TimedRun | null): void {
  try {
    if (run === null) localStorage.removeItem(RUN_KEY);
    else localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    // A blocked or full store costs the resume-after-reload behaviour and
    // nothing else. The session in memory carries on.
  }
}

/**
 * A stored run is only usable if every drill in it still exists — the drill set
 * grows between builds, and a run saved against ids that have since been
 * renumbered would present blank screens. Reject the whole run rather than
 * silently dropping entries, which would corrupt the count the debrief reports.
 */
export function normaliseRun(input: unknown): TimedRun | null {
  if (typeof input !== "object" || input === null) return null;
  const r = input as Record<string, unknown>;
  if (!Array.isArray(r.drillIds)) return null;

  const drillIds = r.drillIds.filter((n): n is number => Number.isInteger(n));
  if (drillIds.length === 0 || !drillIds.every((id) => DRILL_BY_ID.has(id))) return null;

  const at = typeof r.at === "number" ? r.at : 0;
  if (!Number.isInteger(at) || at < 0 || at > drillIds.length) return null;

  const notes: Record<number, string> = {};
  if (typeof r.notes === "object" && r.notes !== null) {
    for (const [k, v] of Object.entries(r.notes as Record<string, unknown>)) {
      const id = Number(k);
      if (Number.isInteger(id) && typeof v === "string") notes[id] = v;
    }
  }

  const spent: Record<number, number> = {};
  if (typeof r.spent === "object" && r.spent !== null) {
    for (const [k, v] of Object.entries(r.spent as Record<string, unknown>)) {
      const id = Number(k);
      if (Number.isInteger(id) && typeof v === "number" && v >= 0) spent[id] = v;
    }
  }

  const caught: Record<number, number[]> = {};
  if (typeof r.caught === "object" && r.caught !== null) {
    for (const [k, v] of Object.entries(r.caught as Record<string, unknown>)) {
      const id = Number(k);
      if (Number.isInteger(id) && Array.isArray(v)) {
        caught[id] = v.filter((n): n is number => Number.isInteger(n));
      }
    }
  }

  const now = Date.now();
  return {
    startedAt: typeof r.startedAt === "number" ? r.startedAt : now,
    secondsPerDrill:
      typeof r.secondsPerDrill === "number" && r.secondsPerDrill > 0
        ? r.secondsPerDrill
        : 300,
    drillIds,
    at,
    drillStartedAt: typeof r.drillStartedAt === "number" ? r.drillStartedAt : now,
    notes,
    spent,
    phase: r.phase === "debrief" ? "debrief" : "running",
    caught,
  };
}

/* -------------------------------- building ------------------------------- */

export function eligible(opts: RunOptions, seen: (id: number) => boolean): Drill[] {
  return DRILLS.filter((d) => {
    if (opts.levels.length > 0 && !opts.levels.includes(d.level)) return false;
    if (!opts.includeSeen && seen(d.id)) return false;
    return true;
  });
}

/**
 * Fisher-Yates over a copy. The order matters more than it looks: presenting
 * drills in id order would let you learn the sequence rather than the skill,
 * and id order is also roughly difficulty order.
 */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function startRun(opts: RunOptions, pool: Drill[]): TimedRun {
  const ids = shuffled(pool)
    .slice(0, Math.max(1, Math.min(opts.count, pool.length)))
    .map((d) => d.id);
  const now = Date.now();
  return {
    startedAt: now,
    secondsPerDrill: opts.secondsPerDrill,
    drillIds: ids,
    at: 0,
    drillStartedAt: now,
    notes: {},
    spent: {},
    phase: "running",
    caught: {},
  };
}

/* -------------------------------- scoring -------------------------------- */

export interface SessionScore {
  drills: number;
  caught: number;
  total: number;
  pct: number;
  blockersCaught: number;
  blockersTotal: number;
  /** Drills that ran out of clock rather than being submitted. */
  timedOut: number;
  secondsUsed: number;
}

export function scoreRun(run: TimedRun): SessionScore {
  let caught = 0;
  let total = 0;
  let blockersCaught = 0;
  let blockersTotal = 0;
  let timedOut = 0;
  let secondsUsed = 0;

  for (const id of run.drillIds) {
    const drill = DRILL_BY_ID.get(id);
    if (!drill) continue;
    const got = new Set(run.caught[id] ?? []);
    drill.defects.forEach((def, i) => {
      total += 1;
      const hit = got.has(i);
      if (hit) caught += 1;
      if (def.severity === "blocker") {
        blockersTotal += 1;
        if (hit) blockersCaught += 1;
      }
    });
    const spent = run.spent[id] ?? 0;
    secondsUsed += spent;
    if (spent >= run.secondsPerDrill) timedOut += 1;
  }

  return {
    drills: run.drillIds.length,
    caught,
    total,
    pct: total ? Math.round((caught / total) * 100) : 0,
    blockersCaught,
    blockersTotal,
    timedOut,
    secondsUsed,
  };
}

export function toSession(run: TimedRun): TimedSession {
  return {
    id: String(run.startedAt),
    startedAt: run.startedAt,
    finishedAt: Date.now(),
    secondsPerDrill: run.secondsPerDrill,
    drillIds: run.drillIds,
    spent: run.spent,
    caught: run.caught,
  };
}

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
