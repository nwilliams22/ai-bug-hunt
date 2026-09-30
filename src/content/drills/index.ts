import type { Drill } from "../../types";
import { DRILLS_CORE } from "./core";
import { DRILLS_BATCH_B } from "./batch-b";
import { DRILLS_BATCH_C } from "./batch-c";
import { DRILLS_BATCH_D } from "./batch-d";
import { DRILLS_BATCH_E } from "./batch-e";

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
 *   batch-b.ts   31–45
 *   batch-c.ts   46–49
 *   (next batch) claim the next ten in the issue before you start
 */
export const DRILLS: Drill[] = [...DRILLS_CORE, ...DRILLS_BATCH_B, ...DRILLS_BATCH_C, ...DRILLS_BATCH_D, ...DRILLS_BATCH_E];

const seen = new Set<number>();
for (const d of DRILLS) {
  if (seen.has(d.id)) throw new Error(`Duplicate drill id ${d.id}`);
  seen.add(d.id);
}

export const DRILL_BY_ID = new Map(DRILLS.map((d) => [d.id, d]));
