import { DRILLS } from "./content/drills";
import type { Drill, Progress } from "./types";

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
export function intervalFor(drill: Drill, caught: Record<number, boolean>, repeats: number): number {
  const total = drill.defects.reduce((sum, defect) => sum + WEIGHT[defect.severity], 0);
  const hit = drill.defects.reduce((sum, defect, i) =>
    sum + (caught[i] ? WEIGHT[defect.severity] : 0), 0);
  const missedBlocker = drill.defects.some((defect, i) =>
    defect.severity === "blocker" && !caught[i]);
  if (missedBlocker || !total || hit / total < 0.5) return 1;
  if (hit / total < 0.8) return 3;
  if (hit < total) return 7;
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
    const intervalDays = intervalFor(drill, last.caught, repeats.length);
    const total = drill.defects.reduce((sum, defect) => sum + WEIGHT[defect.severity], 0);
    const hit = drill.defects.reduce((sum, defect, i) =>
      sum + (last.caught[i] ? WEIGHT[defect.severity] : 0), 0);
    return [{ drill, attempt: repeats.length + 2,
      dueAt: (last.revealedAt ?? 0) + intervalDays * DAY,
      intervalDays, score: total ? Math.round(hit / total * 100) : 0 }];
  }).sort((a, b) => a.dueAt - b.dueAt || a.drill.id - b.drill.id);
}

export function dueReviews(progress: Progress, now = Date.now()): DueReview[] {
  return reviewSchedule(progress).filter((entry) => entry.dueAt <= now);
}
