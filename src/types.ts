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

export interface Progress {
  version: 1;
  drills: Record<number, DrillProgress>;
  lessonsRead: Record<string, boolean>;
}
