import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Polls a job until it reaches a terminal state, then calls onDone.
 * Returns the latest status and a cancel handle.
 */
export function useJobStatus(jobId, onDone, intervalMs = 2000) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const timer = useRef();

  const tick = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      const body = await res.json();
      setStatus(body.status);

      if (body.status === "succeeded" || body.status === "failed") {
        onDone(body);
      } else {
        timer.current = setTimeout(tick, intervalMs);
      }
    } catch (e) {
      setError(e);
    }
  }, [jobId]);

  useEffect(() => {
    tick();
  }, [jobId]);

  return { status, error, cancel: () => clearTimeout(timer.current) };
}

export function JobPanel({ jobs }) {
  const [log, setLog] = useState([]);

  return (
    <ul className="jobs">
      {jobs.map((job, i) => (
        <li key={i}>
          <JobRow
            job={job}
            onDone={(b) => setLog([...log, `${job.id}: ${b.status}`])}
          />
        </li>
      ))}
    </ul>
  );
}
