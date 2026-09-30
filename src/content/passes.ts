import type { Pass, FamilyId } from "../types";

export const PASSES: Pass[] = [
  {
    id: "contract",
    name: "Contract",
    ask: "Does the name, signature and docstring match what the code actually does?",
    tells: [
      "0-indexed vs 1-indexed mismatch",
      "parameter name implies different semantics than the code",
      "docstring describes behavior the code doesn't have",
      "return type varies by path",
      "a function that both mutates and returns",
      "a deprecated API used as if current",
    ],
    whyAi:
      "A model writes the docstring from the function *name*, not from the body it just produced. When the body drifts, the prose does not follow it. The comment is therefore not evidence — it is a second, independent guess at the same problem, and the two guesses disagree more often than a human reviewer expects.",
  },
  {
    id: "boundary",
    name: "Boundaries",
    ask: "What happens at empty, one, zero, negative, duplicate, and maximum?",
    tells: [
      "empty input returns a sentinel instead of raising",
      "accumulator seeded with 0 when values can be negative",
      "off-by-one on a slice or loop bound",
      "single-element case degenerates",
      "the loop's trailing partial batch is dropped",
      "no validation that a size or count argument is positive",
    ],
    whyAi:
      "Training data is overwhelmingly happy-path code. The edge cases that do appear are usually handled by a wrapper somewhere else in the file that the model was not asked to write. So the generated function is the middle of a sandwich with no bread: correct for the inputs anyone would demo it with, undefined for the ones production sends.",
  },
  {
    id: "state",
    name: "Shared state",
    ask: "Is anything mutated that the caller still holds a reference to?",
    tells: [
      "input argument sorted, cleared, or appended to in place",
      "mutable default argument",
      "collection mutated while being iterated",
      "yielded or returned object reused across iterations",
      "a `copy()` that is shallow where the data is nested",
      "module-level mutable state used as a cache",
    ],
    whyAi:
      "Aliasing is invisible in the text of a program. `const sorted = times.sort()` reads like a new array because it was given a new name, and the model is a text model. Naming is the strongest cue it has, and here naming lies.",
  },
  {
    id: "time",
    name: "Time & concurrency",
    ask: "What happens if two of these run at once, or if the clock isn't what you assume?",
    tells: [
      "read-then-write with no atomicity (TOCTOU)",
      "naive vs timezone-aware datetime",
      "partial write with no rollback path",
      "async work started but not awaited",
      "an effect that races itself when its input changes quickly",
      "no timeout on a network call",
    ],
    whyAi:
      "Concurrency bugs are invisible in a single file read top to bottom, and that is exactly the view a model has. It writes the sequence that is correct for one caller, because one caller is the only story the code tells. Nothing in the text says 'and now imagine a second one, three milliseconds later'.",
  },
  {
    id: "coercion",
    name: "Silent coercion",
    ask: "Where does a type quietly become a different type?",
    tells: [
      "float arithmetic on money",
      "default sort comparing as strings",
      "NaN comparisons always false",
      "truthiness check where 0, \"\" or null is a valid value",
      "integer division where a fraction was meant",
      "a date literal compared against a timestamp",
    ],
    whyAi:
      "These are the places where a language does something helpful-looking instead of failing. The model reproduces the idiom that is common in its training data; the idiom is common precisely because it is short, and it is short because the language is doing the conversion for you. Nothing raises, so nothing in the generation process pushes back.",
  },
  {
    id: "failure",
    name: "Failure surface",
    ask: "When this goes wrong, does it fail loudly or quietly?",
    tells: [
      "exception caught and discarded",
      "null or None returned where an error belongs",
      "caller cannot distinguish 'failed' from 'legitimately empty'",
      "retry that can never succeed",
      "success asserted rather than verified",
      "which items in a batch failed is unrecoverable",
    ],
    whyAi:
      "A model optimizes for code that looks finished. A bare `except: pass` and a `return None` both make a function look total — every path returns something, no rough edges. They are the textual signature of completeness and the semantic signature of a system that cannot be operated.",
  },
];

export const PASS_BY_ID: Record<FamilyId, Pass> = Object.fromEntries(
  PASSES.map((p) => [p.id, p]),
) as Record<FamilyId, Pass>;

export function familyName(id: FamilyId): string {
  return PASS_BY_ID[id]?.name ?? id;
}
