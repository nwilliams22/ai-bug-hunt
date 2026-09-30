-- PostgreSQL. Amounts are signed integer cents; refunds are negative rows.
SELECT account_id, COALESCE(SUM(amount_cents), 0) AS balance_cents
FROM ledger_entries
WHERE posted_at >= :start_at AND posted_at <= :end_at
  AND status = 'posted'
GROUP BY account_id;
