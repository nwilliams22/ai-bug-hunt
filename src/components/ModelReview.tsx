import { modelReview } from "../content/reviews";
import type { Verdict } from "../types";

const VERDICT_LABEL: Record<Verdict, string> = {
  approve: "approve",
  "approve-with-comments": "approve with comments",
  "request-changes": "request changes",
};

/**
 * The model's own review of the sample in front of you: the verdict with its
 * one reason, then the findings ordered by severity. Rendered only after the
 * reviewer has written their own review and unlocked the answer, and collapsed
 * by default — it is the second opinion you read, not the one you copy.
 */
export function ModelReviewCard({ id }: { id: number }) {
  const review = modelReview(id);
  if (!review) return null;
  return (
    <details className="model-review">
      <summary>
        <span className={`verdict verdict-${review.verdict}`}>
          {VERDICT_LABEL[review.verdict]}
        </span>
        <span className="model-review-n">
          The model's review — {review.findings.length} finding
          {review.findings.length === 1 ? "" : "s"}
        </span>
      </summary>
      <p className="verdict-reason">{review.reason}</p>
      {review.findings.map((f, i) => (
        <div key={i} className="mrv-f">
          <p className="mrv-t">
            <span className="mrv-n">{i + 1}.</span> {f.title}
          </p>
          <p className="mrv-where">{f.where}</p>
          <p className="mrv-b">{f.body}</p>
        </div>
      ))}
    </details>
  );
}
