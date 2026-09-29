/** The six review passes. Every defect in the course belongs to exactly one. */
export type FamilyId =
  | "contract"
  | "boundary"
  | "state"
  | "time"
  | "coercion"
  | "failure";

export type Lang =
  | "Python"
  | "JavaScript"
  | "TypeScript"
  | "React"
  | "SQL"
  | "Rust"
  | "Go"
  | "Java"
  | "C#"
  | "C++"
  | "Kotlin"
  | "Ruby"
  | "PHP"
  | "Bash";

export type Level = "Warm-up" | "Standard" | "Hard";

export interface Pass {
  id: FamilyId;
  name: string;
  /** The one question this pass asks of any piece of code. */
  ask: string;
  /** Concrete shapes to scan for. */
  tells: string[];
  /** Why AI-generated code trips this pass in particular. */
  whyAi: string;
}

export interface Defect {
  family: FamilyId;
  title: string;
  body: string;
  fix: string;
  /**
   * Does this fail loudly (raises, crashes, red test) or silently (wrong
   * answer, no signal)? Silent defects are the ones the job pays for.
   */
  signal: "loud" | "silent" | "mixed";
  /**
   * How much this should weigh in an approve/reject decision. Used by the
   * severity lesson and by scoring.
   */
  severity: "blocker" | "major" | "minor" | "nit";
}

export interface Drill {
  id: number;
  slug: string;
  lang: Lang;
  level: Level;
  title: string;
  /** "function" = review a whole unit. "diff" = review a change, the real job shape. */
  shape: "function" | "diff";
  code: string;
  files?: { path: string; code: string }[];
  /** One-line framing shown above the code, as a review ticket would. */
  brief?: string;
  hintRegion: string;
  hintFamily: string;
  defects: Defect[];
}

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  /** One line shown in the sidebar and on the module page. */
  blurb: string;
  /** Markdown-ish body. See src/components/Markdown.tsx for the supported subset. */
  body: string;
  /** Drill ids that practise this lesson. */
  practice?: number[];
}

export interface Module {
  id: string;
  title: string;
  blurb: string;
}

/* ---------- the model's own review of each drill ---------- */

export type Verdict =
  | "approve"
  | "approve-with-comments"
  | "request-changes";

/**
 * What a careful reviewer files for a drill, written to the "writing the
 * finding" standard: verdict up front, findings ordered by severity.
 */
export interface ModelReview {
  verdict: Verdict;
  /** The one reason for the verdict, stated up front. */
  reason: string;
  findings: {
    title: string;
    /** Where in the sample, named the way a review would ("line 3, …"). */
    where: string;
    /** Trigger → what the caller sees → the fix, in that order. */
    body: string;
  }[];
}

export interface Gotcha {
  id: string;
  lang: Lang;
  title: string;
  family: FamilyId;
  body: string;
  /** Optional illustrative snippet. */
  code?: string;
  /** The corrected form. */
  fix?: string;
}

/* ---------- persisted progress ---------- */

export interface DrillProgress {
  /** The reviewer's written findings. */
  note: string;
  /** True once answers have been unlocked. */
  revealed: boolean;
  /** 0 = none, 1 = region, 2 = region + families. */
  hintLevel: number;
  /** Index set of defects the reviewer says they caught. */
  caught: Record<number, boolean>;
  /** ms epoch of the reveal, for the review queue. */
  revealedAt?: number;
}

/** One finished timed review, kept for the history on the progress page. */
export interface TimedSession {
  id: string;
  startedAt: number;
  finishedAt: number;
  secondsPerDrill: number;
  /** Drill ids in the order they were presented. */
  drillIds: number[];
  /** Seconds actually spent on each drill. */
  spent: Record<number, number>;
  /** Defect indices ticked at debrief, per drill. */
  caught: Record<number, number[]>;
}

export interface Progress {
  version: 2;
  drills: Record<number, DrillProgress>;
  lessonsRead: Record<string, boolean>;
  sessions: TimedSession[];
}

/* ---------- the timed run in flight ---------- */

/**
 * Held under its own storage key rather than inside Progress, so a run that is
 * abandoned halfway cannot corrupt the course history, and so an exported
 * progress file never carries a half-finished session.
 *
 * Note what is *not* stored: the seconds remaining. Only `drillStartedAt` is,
 * and the countdown is derived from it — otherwise the clock would write to
 * local storage once a second for the length of the session.
 */
export interface TimedRun {
  startedAt: number;
  secondsPerDrill: number;
  drillIds: number[];
  /** Index into drillIds. */
  at: number;
  /** ms epoch at which the current drill was presented. */
  drillStartedAt: number;
  notes: Record<number, string>;
  spent: Record<number, number>;
  phase: "running" | "debrief";
  caught: Record<number, number[]>;
}
