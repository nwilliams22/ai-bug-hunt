import type { Drill } from "../../types";
import { DRILLS_CORE } from "./core";

/**
 * Drills live in per-batch modules so that several people can add drills at the
 * same time without editing the same file. Adding a batch is two lines here —
 * an import and an entry in the spread below — and one new module beside this
 * one. Do not append to somebody else's batch.
 *
 * Ids are permanent: progress is stored against them, so a drill's id must
 * never be reused or renumbered. Each batch owns a fixed id range.
 *
 *   core.ts      1–30
 *   (next batch) claim the next ten in the issue before you start
 */
export const DRILLS: Drill[] = [...DRILLS_CORE];

const seen = new Set<number>();
for (const d of DRILLS) {
  if (seen.has(d.id)) throw new Error(`Duplicate drill id ${d.id}`);
  seen.add(d.id);
}

export const DRILL_BY_ID = new Map(DRILLS.map((d) => [d.id, d]));
