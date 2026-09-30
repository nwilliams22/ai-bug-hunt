import type { Drill } from "../../types";
import s60 from "../samples/60-receipt-total.swift?raw";
import s61 from "../samples/61-money-from-json.dart?raw";
import s62 from "../samples/62-terraform-tags.tf?raw";
import s63 from "../samples/63-workflow-release.yml?raw";
import s64 from "../samples/64-docker-health.Dockerfile?raw";
import s65 from "../samples/65-upload-result.cs?raw";
import s66 from "../samples/66-safe-window.rs?raw";
import s67 from "../samples/67-invoice-key.kt?raw";
import s68 from "../samples/68-php-coupon.php?raw";
import s69 from "../samples/69-ruby-export.rb?raw";
import s70 from "../samples/70-swift-slice.swift?raw";
import s71 from "../samples/71-dart-cache-key.dart?raw";
import s72 from "../samples/72-terraform-replicas.tf?raw";
import s73 from "../samples/73-workflow-cache.yml?raw";
import s74 from "../samples/74-docker-user.Dockerfile?raw";
import s75 from "../samples/75-shell-manifest.sh?raw";
import s76 from "../samples/76-cpp-ratio.cpp?raw";
import s77 from "../samples/77-go-decimal.go?raw";
import s78 from "../samples/78-csharp-page.cs?raw";
import s79 from "../samples/79-sql-net-balance.sql?raw";

export const DRILLS_BATCH_E: Drill[] = [
  {
  "id": 60,
  "slug": "receipt-total",
  "lang": "Swift",
  "level": "Hard",
  "title": "Receipt total",
  "shape": "function",
  "code": s60.trim(),
  "brief": "Quantities and unit prices are nonnegative; discounts are integer percentages 0...100. Discounts are rounded down on each line to whole cents before totals are summed.",
  "hintRegion": "Try large but valid order values and a one-cent discount.",
  "hintFamily": "Use contract and coercion passes.",
  "defects": [
    {
      "family": "coercion",
      "title": "Intermediate multiplication can overflow",
      "body": "For a line with unitCents near Int.max and quantity 2, multiplication traps before the caller gets a total, though both fields satisfy the stated contract.",
      "fix": "Use checked arithmetic and return an explicit overflow error.",
      "severity": "major",
      "signal": "loud"
    },
    {
      "family": "contract",
      "title": "Per-line discount differs from invoice discount",
      "body": "For two one-cent lines at 50%, the function returns one cent; a per-line discount contract would return two. The ticket requires per-line rounding, so the caller sees one cent less than the two-cent total.",
      "fix": "Calculate each line discount separately before summing the payable cents.",
      "severity": "minor",
      "signal": "silent"
    }
  ]
},
  {
  "id": 61,
  "slug": "money-from-json",
  "lang": "Dart",
  "level": "Standard",
  "title": "Money from json",
  "shape": "function",
  "code": s61.trim(),
  "brief": "Partner sends decimal major units. Currency may use a zero- or three-decimal minor unit.",
  "hintRegion": "Trace JPY and KWD alongside USD.",
  "hintFamily": "Use contract and coercion passes.",
  "defects": [
    {
      "family": "contract",
      "title": "Hard-coded two minor digits corrupts JPY and KWD",
      "body": "For JPY amount 250, the decoder records 25000 minor units, while a zero-decimal currency needs 250. KWD needs three digits. The caller stores a plausible but wrong amount.",
      "fix": "Resolve the currency exponent from the currency code and scale with that exponent.",
      "severity": "blocker",
      "signal": "silent"
    },
    {
      "family": "coercion",
      "title": "Binary float rounds a boundary differently",
      "body": "Decimal amount 1.005 can become a binary value just under the half-cent and round to 100 rather than 101 for a two-decimal currency.",
      "fix": "Parse a decimal string or use a decimal package and an explicit rounding mode.",
      "severity": "major",
      "signal": "silent"
    }
  ]
},
  {
  "id": 62,
  "slug": "terraform-tags",
  "lang": "Terraform",
  "level": "Standard",
  "title": "Terraform tags",
  "shape": "function",
  "code": s62.trim(),
  "brief": "The account owns the bucket name. Environment and team are validated nonempty identifiers; only these three tags are required.",
  "hintRegion": "Trace tag precedence and the exact resource name.",
  "hintFamily": "Use contract and state passes; require a failing case before filing.",
  "defects": []
},
  {
  "id": 63,
  "slug": "workflow-release",
  "lang": "YAML",
  "level": "Hard",
  "title": "Workflow release",
  "shape": "function",
  "code": s63.trim(),
  "brief": "Publish should run only after a passing main-branch push from this repository.",
  "hintRegion": "Compare the two event kinds and the trust boundary of the ref.",
  "hintFamily": "Use contract and failure passes.",
  "defects": [
    {
      "family": "contract",
      "title": "Pull requests also run publish",
      "body": "A pull request targeting main meets the job trigger, so its release step executes. With a token available to trusted PRs, an unmerged package can be published.",
      "fix": "Gate release on github.event_name == push and the expected ref.",
      "severity": "blocker",
      "signal": "silent"
    },
    {
      "family": "failure",
      "title": "Publish can run without a token",
      "body": "For forked PRs the secret is withheld, yet the release step still runs and fails after tests, turning an otherwise valid PR red.",
      "fix": "Use the same release event guard on the publish step.",
      "severity": "minor",
      "signal": "loud"
    }
  ]
},
  {
  "id": 64,
  "slug": "docker-health",
  "lang": "Dockerfile",
  "level": "Standard",
  "title": "Docker health",
  "shape": "function",
  "code": s64.trim(),
  "brief": "The app binds port 3000 before its database connection completes; readiness requires that connection. Its build output lives in dist and is ignored by Docker context.",
  "hintRegion": "Inventory which artifacts enter the image and what command starts.",
  "hintFamily": "Use contract and failure passes.",
  "defects": [
    {
      "family": "contract",
      "title": "Runtime build artifact never enters image",
      "body": "With dist excluded from the context and only production dependencies installed, server.js cannot import its dist bundle. The image builds but fails at startup.",
      "fix": "Build in a stage with dev dependencies, then copy dist into the runtime stage.",
      "severity": "major",
      "signal": "loud"
    },
    {
      "family": "failure",
      "title": "Port probe reports success before readiness",
      "body": "The probe exits successfully as soon as port 3000 accepts a connection, even while the required database connection is still pending. The orchestrator marks an unusable instance healthy.",
      "fix": "Probe an endpoint that returns success only after the database connection is ready.",
      "severity": "major",
      "signal": "silent"
    }
  ]
},
  {
  "id": 65,
  "slug": "upload-result",
  "lang": "C#",
  "level": "Hard",
  "title": "Upload result",
  "shape": "function",
  "code": s65.trim(),
  "brief": "Put can throw after committing its write; callers retry when All throws. On a rejected path, the API contract requires false rather than an exception.",
  "hintRegion": "Follow a timeout after a committed write and the next retry.",
  "hintFamily": "Use contract and failure passes.",
  "defects": [
    {
      "family": "failure",
      "title": "Retry can duplicate a committed write",
      "body": "If Put commits then times out, All throws and its caller retries the entire list. A non-idempotent store receives the first path twice.",
      "fix": "Supply a stable idempotency key or reconciliation before retry.",
      "severity": "blocker",
      "signal": "silent"
    },
    {
      "family": "contract",
      "title": "Boolean result never represents partial failure",
      "body": "All returns only true or throws; callers promised a false result for a rejected path cannot inspect which paths succeeded.",
      "fix": "Return a structured per-path result or document exception-only failure.",
      "severity": "minor",
      "signal": "silent"
    }
  ]
},
  {
  "id": 66,
  "slug": "safe-window",
  "lang": "Rust",
  "level": "Standard",
  "title": "Safe window",
  "shape": "function",
  "code": s66.trim(),
  "brief": "Indices are unsigned. None means the requested interval is outside the slice.",
  "hintRegion": "Try overflow, zero count, and the end boundary.",
  "hintFamily": "Use boundary and coercion passes; distinguish checked arithmetic from a wrap.",
  "defects": []
},
  {
  "id": 67,
  "slug": "invoice-key",
  "lang": "Kotlin",
  "level": "Standard",
  "title": "Invoice key",
  "shape": "function",
  "code": s67.trim(),
  "brief": "Invoice numbers are case insensitive within an account; different accounts can reuse them.",
  "hintRegion": "Compare same number across two accounts and distinct amounts within one account.",
  "hintFamily": "Use contract and state passes.",
  "defects": [
    {
      "family": "contract",
      "title": "Key drops account identity",
      "body": "For accounts A and B both with invoice 12, the second invoice is removed despite both being valid. The caller silently loses a payable invoice.",
      "fix": "Use accountId plus normalized number as the key.",
      "severity": "blocker",
      "signal": "silent"
    },
    {
      "family": "state",
      "title": "Conflicting duplicate amounts are silently accepted",
      "body": "Two rows for one account and number but different amount leave only the first. The caller cannot tell that source data conflicts.",
      "fix": "Reject conflicting duplicates or report them for reconciliation.",
      "severity": "major",
      "signal": "silent"
    }
  ]
},
  {
  "id": 68,
  "slug": "php-coupon",
  "lang": "PHP",
  "level": "Standard",
  "title": "Php coupon",
  "shape": "function",
  "code": s68.trim(),
  "brief": "Coupons specify an integer percentage from 0 through 100 and a maximum discount of 500 cents. Missing coupons are represented by an empty array; callers need a coupon-applied flag for checkout analytics.",
  "hintRegion": "Trace a missing coupon and the meaning of an absent minimum.",
  "hintFamily": "Use contract and coercion passes.",
  "defects": [
    {
      "family": "contract",
      "title": "Missing coupon is treated as a zero-percent coupon",
      "body": "For an absent coupon, the function returns subtotal, but callers requiring a coupon-applied flag cannot distinguish it from an explicit zero-percent coupon.",
      "fix": "Return an application flag with the amount as required by the checkout contract.",
      "severity": "minor",
      "signal": "silent"
    },
    {
      "family": "coercion",
      "title": "String percentage is accepted and truncated",
      "body": "For percent \"12.9\", casting to int silently applies 12%, although the stated contract requires an integer.",
      "fix": "Validate the input type and range before arithmetic.",
      "severity": "major",
      "signal": "silent"
    }
  ]
},
  {
  "id": 69,
  "slug": "ruby-export",
  "lang": "Ruby",
  "level": "Hard",
  "title": "Ruby export",
  "shape": "function",
  "code": s69.trim(),
  "brief": "Labels can contain commas, quotes, and newlines. The consumer reads standard CSV.",
  "hintRegion": "Try a label with a comma and one with a newline.",
  "hintFamily": "Use contract and coercion passes.",
  "defects": [
    {
      "family": "contract",
      "title": "Comma in label shifts columns",
      "body": "A label \"West, Inc\" becomes two CSV fields, so the consumer reads amount in the wrong column.",
      "fix": "Use CSV.generate_line for each record.",
      "severity": "major",
      "signal": "silent"
    },
    {
      "family": "coercion",
      "title": "Newline in label creates a phantom record",
      "body": "A label containing a newline is emitted unquoted and read as an extra record. Counts and following data silently drift.",
      "fix": "Let a CSV encoder quote and escape field values.",
      "severity": "major",
      "signal": "silent"
    }
  ]
},
  {
  "id": 70,
  "slug": "swift-slice",
  "lang": "Swift",
  "level": "Standard",
  "title": "Swift slice",
  "shape": "function",
  "code": s70.trim(),
  "brief": "Callers guarantee nonnegative offset and limit. An offset beyond the end returns an empty page.",
  "hintRegion": "Trace an offset above count and a huge limit.",
  "hintFamily": "Use boundary and coercion passes with the stated input domain.",
  "defects": []
},
  {
  "id": 71,
  "slug": "dart-cache-key",
  "lang": "Dart",
  "level": "Hard",
  "title": "Dart cache key",
  "shape": "function",
  "code": s71.trim(),
  "brief": "Fetch returns current integer minor units for the requested currency; SKUs are reused across currencies and prices can change between calls.",
  "hintRegion": "Request the same SKU in USD then JPY.",
  "hintFamily": "Use state and contract passes.",
  "defects": [
    {
      "family": "state",
      "title": "Currency omitted from cache key",
      "body": "After quote(\"hat\", \"USD\") returns 1200, quote(\"hat\", \"JPY\") returns 1200 without calling its fetch. The value has the wrong unit but looks valid.",
      "fix": "Key by both SKU and currency.",
      "severity": "blocker",
      "signal": "silent"
    },
    {
      "family": "contract",
      "title": "Fetcher can be stale indefinitely",
      "body": "If pricing changes, repeated requests keep the first value for the process lifetime; no freshness contract or invalidation exists.",
      "fix": "Specify a snapshot lifetime and invalidate or version the key.",
      "severity": "major",
      "signal": "silent"
    }
  ]
},
  {
  "id": 72,
  "slug": "terraform-replicas",
  "lang": "Terraform",
  "level": "Hard",
  "title": "Terraform replicas",
  "shape": "function",
  "code": s72.trim(),
  "brief": "Production must retain at least two serving instances during a deploy; replica input can be zero in a preview environment.",
  "hintRegion": "Compare min, max and desired values for zero and one.",
  "hintFamily": "Use contract and boundary passes.",
  "defects": [
    {
      "family": "boundary",
      "title": "Zero replicas conflicts with min size",
      "body": "Preview with replicas=0 sets max and desired to zero but min to one. Apply rejects the group instead of creating a scaled-to-zero preview.",
      "fix": "Set min according to environment or validate replicas >= 1.",
      "severity": "major",
      "signal": "loud"
    },
    {
      "family": "contract",
      "title": "Production allows one instance",
      "body": "With production replicas=1, all size values satisfy Terraform but violate the two-instance availability guarantee.",
      "fix": "Validate production replicas >= 2 and set min_size accordingly.",
      "severity": "major",
      "signal": "silent"
    }
  ]
},
  {
  "id": 73,
  "slug": "workflow-cache",
  "lang": "YAML",
  "level": "Hard",
  "title": "Workflow cache",
  "shape": "function",
  "code": s73.trim(),
  "brief": "The lockfile is committed. CI must test exactly those dependency versions.",
  "hintRegion": "Follow cache restoration and install semantics when package.json changes.",
  "hintFamily": "Use contract and state passes.",
  "defects": [
    {
      "family": "contract",
      "title": "npm install may rewrite lockfile",
      "body": "If package.json and lockfile disagree, npm install can resolve a different dependency set and update the lockfile in CI. Tests pass against code that will not reproduce from the committed lock.",
      "fix": "Use npm ci so a mismatch fails.",
      "severity": "major",
      "signal": "silent"
    },
    {
      "family": "state",
      "title": "Failed tests do not fail the job",
      "body": "For a failing test, continue-on-error makes the step nonfatal, so CI reports a successful job and a broken change can merge.",
      "fix": "Remove continue-on-error from the test step.",
      "severity": "major",
      "signal": "silent"
    }
  ]
},
  {
  "id": 74,
  "slug": "docker-user",
  "lang": "Dockerfile",
  "level": "Standard",
  "title": "Docker user",
  "shape": "function",
  "code": s74.trim(),
  "brief": "server.js is self-contained and binds 3000. Runtime writes only to /tmp; dependencies are production dependencies.",
  "hintRegion": "Trace ownership, runtime user, and required files.",
  "hintFamily": "Use contract and failure passes; identify an actual missing dependency.",
  "defects": [{
    "family": "contract",
    "title": "Build comment names the wrong user",
    "body": "The comment says dependencies install as node, but USER node appears after RUN npm ci, so the install executes as root. Runtime still uses node and reads the installed files; the mistake is in the comment, not the runtime behavior.",
    "fix": "Correct the comment to say installation runs during the root build stage; approve with this nonblocking correction.",
    "severity": "nit",
    "signal": "silent"
  }]
},
  {
  "id": 75,
  "slug": "shell-manifest",
  "lang": "Bash",
  "level": "Standard",
  "title": "Shell manifest",
  "shape": "function",
  "code": s75.trim(),
  "brief": "Manifest paths may contain spaces and the last line may lack a newline. Blank lines are ignored.",
  "hintRegion": "Try a final path without a line terminator and a filename beginning with dash.",
  "hintFamily": "Use contract and boundary passes.",
  "defects": [
    {
      "family": "boundary",
      "title": "Final unterminated path is skipped",
      "body": "With a one-line manifest lacking a newline, read returns nonzero after filling path and the loop body never runs. The last file is absent from the digest output.",
      "fix": "Use while IFS= read -r path || [[ -n $path ]]; do.",
      "severity": "major",
      "signal": "silent"
    },
    {
      "family": "contract",
      "title": "Option-like filename is interpreted as a flag",
      "body": "A relative path -b is passed as an option to sha256sum, producing an error or a different mode rather than hashing that file.",
      "fix": "Pass -- before the path.",
      "severity": "minor",
      "signal": "loud"
    }
  ]
},
  {
  "id": 76,
  "slug": "cpp-ratio",
  "lang": "C++",
  "level": "Standard",
  "title": "Cpp ratio",
  "shape": "function",
  "code": s76.trim(),
  "brief": "Counts are nonnegative, done <= total. Return the fraction in [0, 1]; an empty task is complete and returns 1.0.",
  "hintRegion": "Try one completed item out of two and an empty total.",
  "hintFamily": "Use coercion and contract passes.",
  "defects": [
    {
      "family": "coercion",
      "title": "Integer division discards fractions",
      "body": "For done=1 and total=2, integer division produces 0 before conversion to double. Caller sees 0.0 rather than 0.5.",
      "fix": "Convert an operand before division.",
      "severity": "major",
      "signal": "silent"
    },
    {
      "family": "contract",
      "title": "Empty total loses an agreed display value",
      "body": "For total=0, the dashboard contract requires 1.0 to mean complete; nullopt instead displays an unknown state.",
      "fix": "Specify empty-total semantics in the caller contract, then implement it.",
      "severity": "minor",
      "signal": "silent"
    }
  ]
},
  {
  "id": 77,
  "slug": "go-decimal",
  "lang": "Go",
  "level": "Hard",
  "title": "Go decimal",
  "shape": "function",
  "code": s77.trim(),
  "brief": "Gateway sends a decimal amount string for USD. Amounts can be negative for refunds.",
  "hintRegion": "Trace a half-cent and a large amount.",
  "hintFamily": "Use coercion and contract passes.",
  "defects": [
    {
      "family": "coercion",
      "title": "Float conversion can truncate a cent",
      "body": "A decimal such as 0.29 may become a binary value whose product by 100 is just below 29, so int64 truncates to 28.",
      "fix": "Parse decimal digits as integer cents with explicit rounding.",
      "severity": "blocker",
      "signal": "silent"
    },
    {
      "family": "contract",
      "title": "Fractional cents are silently truncated",
      "body": "For 1.005 the function returns a whole-cent amount without rejecting or documenting the gateway precision.",
      "fix": "Reject more than two fractional digits or apply an explicit rounding rule.",
      "severity": "major",
      "signal": "silent"
    }
  ]
},
  {
  "id": 78,
  "slug": "csharp-page",
  "lang": "C#",
  "level": "Standard",
  "title": "Csharp page",
  "shape": "function",
  "code": s78.trim(),
  "brief": "The input list is stable during the call. Out-of-range positive offsets return an empty page.",
  "hintRegion": "Try int.MaxValue for offset and limit.",
  "hintFamily": "Use boundary and coercion passes with the actual arithmetic.",
  "defects": []
},
  {
  "id": 79,
  "slug": "sql-net-balance",
  "lang": "SQL",
  "level": "Hard",
  "title": "Sql net balance",
  "shape": "function",
  "code": s79.trim(),
  "brief": "Adjacent windows must partition posted rows. Accounts with no entries should have zero balance in the report.",
  "hintRegion": "Put a row at the shared endpoint and consider an empty account.",
  "hintFamily": "Use boundary and contract passes.",
  "defects": [
    {
      "family": "boundary",
      "title": "Inclusive end counts boundary twice",
      "body": "A row at the next window start satisfies both windows because each uses <= end_at. Aggregate totals double count at the boundary.",
      "fix": "Use posted_at < :end_at for half-open windows.",
      "severity": "major",
      "signal": "silent"
    },
    {
      "family": "contract",
      "title": "Accounts without entries disappear",
      "body": "For an account with no rows in the interval, GROUP BY emits no row; COALESCE cannot invent it. The consumer does not receive its required zero balance.",
      "fix": "Start from accounts and left join eligible ledger rows before grouping.",
      "severity": "major",
      "signal": "silent"
    }
  ]
},
];
