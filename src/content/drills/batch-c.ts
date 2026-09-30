import type { Drill } from "../../types";

// Inline samples keep this batch self-contained within its assigned file scope.
const revenueFiles = [
  { path: "migrations/042-net.sql.diff", code: `--- /dev/null
+++ b/migrations/042-net.sql
@@ -0,0 +1,4 @@
+ALTER TABLE sales ADD COLUMN net_cents BIGINT NOT NULL DEFAULT 0;
+UPDATE sales SET net_cents = gross_cents - refund_cents;
+COMMENT ON COLUMN sales.net_cents IS
+  'Net sale value for revenue reporting';` },
  { path: "reports/revenue.sql.diff", code: `--- a/reports/revenue.sql
+++ b/reports/revenue.sql
@@ -1,4 +1,4 @@
-SELECT COALESCE(SUM(gross_cents - refund_cents), 0) AS revenue_cents
+SELECT COALESCE(SUM(net_cents), 0) AS revenue_cents
 FROM sales
 WHERE sold_at >= :day_start
-  AND sold_at < :next_day_start;
+  AND sold_at <= :next_day_start;` },
  { path: "sales/insert.sql", code: `-- Unchanged. Every sale is written through this statement.
-- All timestamps and daily report boundaries are UTC.
INSERT INTO sales (id, sold_at, gross_cents, refund_cents)
VALUES (:id, :sold_at, :gross_cents, :refund_cents);` },
];

const paginationFiles = [
  { path: "api/orders.py.diff", code: `--- a/api/orders.py
+++ b/api/orders.py
@@ -1,7 +1,9 @@
 def list_orders(db, query):
-    offset = int(query.get("offset", "0"))
+    after = query.get("after", "1970-01-01T00:00:00Z")
     rows = db.fetch_all(
-        "SELECT id, created_at FROM orders ORDER BY created_at LIMIT 100 OFFSET %s",
-        [offset],
+        "SELECT id, created_at FROM orders WHERE created_at > %s "
+        "ORDER BY created_at LIMIT 100",
+        [after],
     )
-    return {"items": rows}
+    cursor = rows[-1]["created_at"] if rows else None
+    return {"items": rows, "after": cursor}` },
  { path: "clients/export.py", code: `# Unchanged. Export all orders using the public endpoint.
def export_orders(http):
    offset = 0
    while True:
        page = http.get("/orders", params={"offset": str(offset)}).json()
        rows = page["items"]
        if not rows:
            break
        yield from rows
        offset += len(rows)` },
  { path: "schema/orders.sql", code: `-- Unchanged. Imports assign one timestamp to the whole batch.
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    total_cents BIGINT NOT NULL
);
CREATE INDEX orders_created_at ON orders (created_at);` },
];

const cacheFiles = [
  { path: "cache.ts.diff", code: `--- a/cache.ts
+++ b/cache.ts
@@ -1,9 +1,9 @@
 type Entry = { value: string; expiresAt: number };
 const entries = new Map<string, Entry>();
-export function put(key: string, value: string, ttlMs: number): void {
-  entries.set(key, { value, expiresAt: Date.now() + ttlMs });
+export function put(key: string, value: string, ttlSeconds: number): void {
+  entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
 }
 export function get(key: string): string | undefined {
   const entry = entries.get(key);
   return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
 }` },
  { path: "search.ts.diff", code: `--- a/search.ts
+++ b/search.ts
@@ -1,7 +1,7 @@
 import { put } from "./cache";
 // SEARCH_TTL_SECONDS is optional; zero disables caching.
 export function cacheSearch(query: string, results: string, env: Record<string, string | undefined>): void {
-  const seconds = env.SEARCH_TTL_SECONDS === undefined ? 60 : Number(env.SEARCH_TTL_SECONDS);
-  put("search:" + query, results, seconds * 1000);
+  const seconds = Number(env.SEARCH_TTL_SECONDS) || 60;
+  put("search:" + query, results, seconds);
 }
 // Results are public and may change between searches.` },
  { path: "sessions.ts", code: `// Unchanged. Signed-in sessions expire after fifteen minutes.
import { get, put } from "./cache";
const SESSION_TTL_MS = 15 * 60 * 1000;
export function rememberSession(token: string, userId: string): void {
  put("session:" + token, userId, SESSION_TTL_MS);
}
export function sessionUser(token: string): string | undefined {
  return get("session:" + token);
}` },
];

const retryFiles = [
  { path: "config.ts.diff", code: `--- a/config.ts
+++ b/config.ts
@@ -1,5 +1,6 @@
 export function config(env: Record<string, string | undefined>) {
   return {
     region: env.REGION ?? "local",
+    retryWrites: Boolean(env.RETRY_WRITES ?? "false"),
   };
 }` },
  { path: "worker.ts.diff", code: `--- a/worker.ts
+++ b/worker.ts
@@ -1,6 +1,13 @@
 import { debit } from "./ledger";
 // Retry transient ledger transport errors when the rollout flag is enabled.
 export async function charge(account: string, cents: number, retryWrites: boolean): Promise<void> {
-  await debit(account, cents);
+  try {
+    await debit(account, cents);
+  } catch (error) {
+    if (!retryWrites || !(error instanceof TypeError)) {
+      throw error;
+    }
+    await debit(account, cents);
+  }
 }
 // The queue acknowledges a charge only when this promise resolves.` },
  { path: "ledger.ts", code: `// Unchanged. POST applies one debit per request; no deduplication is provided.
// A network failure may arrive after the server commits the debit.
export async function debit(account: string, cents: number): Promise<void> {
  const response = await fetch("/ledger/debits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, cents }),
  });
  if (!response.ok) throw new Error("Ledger rejected debit");
}` },
];

export const DRILLS_BATCH_C: Drill[] = [
  {
    id: 46, slug: "materialized-net-revenue", lang: "SQL", level: "Hard",
    title: "Materialize net revenue for daily reports", shape: "diff",
    code: revenueFiles[0].code, files: revenueFiles,
    brief: "PR: replace repeated subtraction with a stored net value. The migration runs once before deployment; the unchanged insert path is included for review.",
    hintRegion: "Trace a sale inserted after the migration, then a sale exactly at the next day's start.",
    hintFamily: "Contract and Boundaries — follow every writer, then partition time.",
    defects: [
      { family: "contract", signal: "silent", severity: "blocker",
        title: "The unchanged writer never populates net revenue",
        body: "sales/insert.sql still writes only gross_cents and refund_cents. A new 10000-cent sale with no refund receives net_cents=0 from the migration's default. The backfill makes historical reports look correct, but every post-deployment sale silently disappears from revenue totals.",
        fix: "Use a generated net column, or update every insert/update path to maintain it transactionally and backfill existing rows. Test a sale created after migration, not only migrated fixtures." },
      { family: "boundary", signal: "silent", severity: "major",
        title: "Adjacent reports both include midnight",
        body: "revenue.sql includes next_day_start with <=. A migrated sale at exactly 2026-01-02 00:00 UTC appears in both January 1 and January 2 totals. Fixing the new-write path exposes this for future sales too.",
        fix: "Keep the half-open interval sold_at >= day_start AND sold_at < next_day_start. Verify adjacent daily totals against their combined interval." },
    ],
  },
  {
    id: 47, slug: "cursor-orders-rollout", lang: "Python", level: "Hard",
    title: "Move order listing to cursor pagination", shape: "diff",
    code: paginationFiles[0].code, files: paginationFiles,
    brief: "PR: remove deep OFFSET scans without changing the /orders URL. The exporter and schema are unchanged; orders are static during an export and all dates are after 1970.",
    hintRegion: "Follow the exporter's second request, then a page boundary inside one imported batch.",
    hintFamily: "Contract and Boundaries — compare the wire protocol and the cursor's ordering key.",
    defects: [
      { family: "contract", signal: "silent", severity: "major",
        title: "The existing exporter loops over the first page",
        body: "clients/export.py sends offset and never reads after. The new handler ignores offset, so a nonempty dataset returns the first page forever; the export silently emits duplicate orders instead of terminating. Keeping items unchanged preserved the response shape but not the pagination contract.",
        fix: "Migrate the exporter to the new cursor protocol with an explicit completion rule, or version the endpoint and retain offset support for existing clients. Test two successive requests through the actual exporter." },
      { family: "boundary", signal: "silent", severity: "major",
        title: "A timestamp cursor skips tied orders",
        body: "schema/orders.sql permits repeated created_at values and says imports share timestamps. With 101 orders at one timestamp, LIMIT 100 returns only 100; the next created_at > cursor request skips the remaining order. Updating the exporter alone does not make the export complete.",
        fix: "Order by (created_at, id), carry both values in the cursor, and filter lexicographically after that pair. Test a tied batch larger than one page." },
    ],
  },
  {
    id: 48, slug: "cache-ttl-units", lang: "TypeScript", level: "Hard",
    title: "Align cache durations with deployment settings", shape: "diff",
    code: cacheFiles[0].code, files: cacheFiles,
    brief: "PR: make the shared cache accept seconds, matching search configuration. Session code is included unchanged; all configuration values are valid nonnegative integers.",
    hintRegion: "Track units at both call sites and try the documented zero setting.",
    hintFamily: "Time & concurrency and Silent coercion — units and defaults are part of the interface.",
    defects: [
      { family: "time", signal: "silent", severity: "blocker",
        title: "Session expiry becomes a thousand times longer",
        body: "sessions.ts still supplies SESSION_TTL_MS=900000 to put. The changed helper multiplies it by 1000, so a fifteen-minute session stays valid for about 10.4 days. Both arguments are numbers, so the type checker accepts the security regression; reviewing only the updated search caller misses it.",
        fix: "Migrate every caller atomically, or introduce putSeconds as a distinct API while preserving the old contract. Give durations distinct types and verify the session is absent after fifteen minutes." },
    ],
  },
  {
    id: 49, slug: "flagged-ledger-retries", lang: "TypeScript", level: "Hard",
    title: "Gate ledger retries behind a rollout flag", shape: "diff",
    code: retryFiles[0].code, files: retryFiles,
    brief: "PR: retry one transient network failure during charging. Operations sets RETRY_WRITES to 'true' or 'false'; omission must disable it. The ledger client is unchanged.",
    hintRegion: "Evaluate the disabled configuration and locate the ledger's commit relative to a lost response.",
    hintFamily: "Silent coercion and Time & concurrency — a string flag and an uncertain write outcome.",
    defects: [
      { family: "coercion", signal: "silent", severity: "major",
        title: "The disabled flag enables the new branch",
        body: "Boolean('false') is true because the string is nonempty. Both RETRY_WRITES='false' and an omitted setting enable retries. Operators cannot keep the previous behavior with the documented off setting, so the supposedly gated path runs before rollout approval.",
        fix: "Parse the explicit string values, default absent to false, and reject unsupported settings. Verify false, true and absent configurations." },
      { family: "time", signal: "silent", severity: "blocker",
        title: "Retrying a committed debit charges twice",
        body: "ledger.ts documents one debit per POST with no deduplication. If the first request commits but its response is lost, fetch rejects with TypeError; worker.ts issues another POST. A 2500-cent charge can debit 5000 cents while charge resolves successfully. Correct flag parsing only postpones this defect until retries are intentionally enabled.",
        fix: "Give the logical charge a stable idempotency key and enforce deduplication at the ledger across all attempts, or reconcile uncertain outcomes before retrying. Test a committed first request followed by a lost response." },
    ],
  },
];
