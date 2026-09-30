import { DRILLS } from "./content/drills";
import { CLEAN_REVIEW } from "./content/drills/batch-d";
import type { Drill, Progress, Verdict } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const WEIGHT = { blocker: 8, major: 4, minor: 2, nit: 1 } as const;

export interface DueReview {
  drill: Drill;
  attempt: number;
  dueAt: number;
  intervalDays: number;
  score: number;
}

/** A missed blocker always comes back tomorrow. Clean repeats stretch to 56 days. */
export function intervalFor(drill: Drill, caught: Record<number, boolean>, repeats: number,
  falsePositives = 0, verdict?: Verdict): number {
  const total = drill.defects.reduce((sum, defect) => sum + WEIGHT[defect.severity], 0);
  const hit = drill.defects.reduce((sum, defect, i) =>
    sum + (caught[i] ? WEIGHT[defect.severity] : 0), 0);
  const wrongCleanVerdict = !total && verdict !== undefined &&
    verdict !== (CLEAN_REVIEW[drill.id]?.verdict ?? "approve");
  const score = total ? hit / (total + falsePositives * 2) :
    (falsePositives || wrongCleanVerdict ? 0 : 1);
  const missedBlocker = drill.defects.some((defect, i) =>
    defect.severity === "blocker" && !caught[i]);
  if (missedBlocker || score < 0.5) return 1;
  if (score < 0.8) return 3;
  if (score < 1) return 7;
  return Math.min(56, 14 * 2 ** Math.min(repeats, 2));
}

export function reviewSchedule(progress: Progress): DueReview[] {
  return DRILLS.flatMap((drill) => {
    const first = progress.drills[drill.id];
    if (!first?.revealed) return [];
    const repeats = progress.reviews[drill.id] ?? [];
    const last = repeats.at(-1) ?? first;
    if (repeats.length && !repeats[repeats.length - 1].scored) {
      return [{ drill, attempt: repeats.length + 1, dueAt: 0, intervalDays: 0, score: 0 }];
    }
    const falsePositives = last.falsePositives ?? 0;
    const intervalDays = intervalFor(drill, last.caught, repeats.length, falsePositives,
      last.verdict);
    const total = drill.defects.reduce((sum, defect) => sum + WEIGHT[defect.severity], 0);
    const hit = drill.defects.reduce((sum, defect, i) =>
      sum + (last.caught[i] ? WEIGHT[defect.severity] : 0), 0);
    return [{ drill, attempt: repeats.length + 2,
      dueAt: (last.revealedAt ?? 0) + intervalDays * DAY,
      intervalDays, score: total ? Math.round(hit / (total + falsePositives * 2) * 100) :
        (falsePositives || (last.verdict !== undefined &&
          last.verdict !== (CLEAN_REVIEW[drill.id]?.verdict ?? "approve")) ? 0 : 100) }];
  }).sort((a, b) => a.dueAt - b.dueAt || a.drill.id - b.drill.id);
}

export function dueReviews(progress: Progress, now = Date.now()): DueReview[] {
  return reviewSchedule(progress).filter((entry) => entry.dueAt <= now);
}

let memorySeed = 0;

/** A stored seed makes presentation stable without changing permanent drill ids. */
export function practiceOrder(): Drill[] {
  const key = "bug-finder:practice-seed:v1";
  let seed = memorySeed;
  try { seed = Number(localStorage.getItem(key)) || memorySeed; } catch { /* unavailable storage */ }
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff) {
    seed = Math.floor(Math.random() * 0xffffffff) + 1;
    try { localStorage.setItem(key, String(seed)); } catch { /* memory-only fallback */ }
  }
  memorySeed = seed;
  // Rank each id independently so newly added drills preserve existing relative order.
  const rank = (id: number) => {
    let n = (id ^ seed) >>> 0;
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return (n ^ (n >>> 16)) >>> 0;
  };
  return [...DRILLS].sort((a, b) => rank(a.id) - rank(b.id) || a.id - b.id);
}
