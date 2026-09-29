/**
 * The assertions themselves. Driven by smoke.mjs, which owns the static server
 * and the browser; this file only speaks the DevTools protocol.
 *
 * Returns the number of failed checks.
 */
export async function run(cdpBase) {
  const targets = await (await fetch(`${cdpBase}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 0;
  const pending = new Map();
  const logs = [];

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (
      msg.method === "Runtime.consoleAPICalled" &&
      ["error", "warning"].includes(msg.params.type)
    ) {
      logs.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    }
    if (msg.method === "Runtime.exceptionThrown") {
      logs.push("EXCEPTION: " + (msg.params.exceptionDetails.exception?.description ?? ""));
    }
  };

  const send = (method, params = {}) =>
    new Promise((res) => {
      const n = ++id;
      pending.set(n, res);
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error("eval threw: " + JSON.stringify(r.result.exceptionDetails.exception));
    }
    return r.result?.result?.value;
  };

  await send("Runtime.enable");
  await send("Page.enable");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  };

  /* --------------------- drill 8: gate, hints, reveal -------------------- */

  await evalJs(`localStorage.clear(); location.hash = "#/drill/8"`);
  await send("Page.reload");
  await sleep(1200);

  check(
    "drill renders its title",
    (await evalJs(`document.querySelector(".card-h")?.textContent ?? ""`)).includes(
      "Maximum value",
    ),
  );
  check(
    "reveal is gated before a review is written",
    (await evalJs(`document.querySelector(".btn")?.disabled`)) === true,
  );
  check(
    "planted defects are hidden before reveal",
    (await evalJs(`document.querySelectorAll(".def").length`)) === 0,
  );
  check(
    "the model's review is hidden before reveal",
    (await evalJs(`document.querySelectorAll(".model-review").length`)) === 0,
  );

  await evalJs(
    `[...document.querySelectorAll("button")].find(b => b.textContent.includes("Hint")).click()`,
  );
  await sleep(200);
  check(
    "first hint shows the region",
    (await evalJs(`document.querySelector(".hint")?.textContent ?? ""`)).includes(
      "compiler is happy",
    ),
  );

  // Set the textarea the way React expects, so onChange actually fires.
  await evalJs(`
    (() => {
      const ta = document.querySelector(".ta");
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(ta, "Accumulator seeded at 0.0 so an all-negative slice returns 0.0, a value not in the input. Silent.");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()
  `);
  await sleep(250);
  check(
    "reveal unlocks once the review is long enough",
    (await evalJs(`document.querySelector(".btn")?.disabled`)) === false,
  );

  await evalJs(`document.querySelector(".btn").click()`);
  await sleep(300);
  const defCount = await evalJs(`document.querySelectorAll(".def").length`);
  check("reveal shows every planted defect", defCount === 2, `${defCount} shown`);
  check(
    "the model's review appears after reveal",
    (await evalJs(`document.querySelectorAll(".model-review").length`)) === 1 &&
      (await evalJs(`document.querySelector(".model-review .verdict")?.textContent ?? ""`))
        .includes("request changes"),
  );

  await evalJs(`document.querySelector(".def input[type=checkbox]").click()`);
  await sleep(250);
  check(
    "ticking a defect updates the header score",
    (await evalJs(`document.querySelector(".score")?.textContent ?? ""`)).includes("1/2"),
  );

  /* ------------------------ persistence across reload -------------------- */

  await send("Page.reload");
  await sleep(1200);
  check(
    "notes survive a reload",
    (await evalJs(`document.querySelector(".ta")?.value ?? ""`)).includes("Accumulator seeded"),
  );
  check(
    "reveal state survives a reload",
    (await evalJs(`document.querySelectorAll(".def").length`)) === 2,
  );

  /* ------------------------------- routes -------------------------------- */

  for (const [hash, sel, label] of [
    ["#/lesson/reading-a-diff", ".code-row-add", "diff fence in a lesson"],
    ["#/lesson/pass-coercion", ".md h2", "lesson headings"],
    ["#/lesson/pass-boundary", ".md-table td", "markdown table"],
    ["#/gotchas/Go", ".gotcha", "gotcha cards for one language"],
    ["#/gotchas/C%2B%2B", ".gotcha", "gotcha cards for a language whose name needs escaping"],
    ["#/gotchas/Kotlin", ".gotcha", "gotcha cards for Kotlin"],
    ["#/gotchas", ".gotcha", "all gotcha cards"],
    ["#/drills", ".drill-table tr", "drill index table"],
    ["#/nope/nope", ".card", "unknown route falls back to the overview"],
    ["#/progress", ".tile", "progress tiles"],
  ]) {
    await evalJs(`location.hash = ${JSON.stringify(hash)}`);
    await sleep(450);
    const n = await evalJs(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
    check(`${label} render (${hash})`, n > 0, `${n} nodes`);
  }

  // Still on #/progress. Drill 8 has one blocker and it was left unticked.
  check(
    "progress view reports missed blockers",
    (await evalJs(`document.body.textContent`)).includes("blockers missed of"),
  );
  check(
    "weakest-pass breakdown covers the reviewed families",
    (await evalJs(`document.querySelectorAll(".fam-row").length`)) === 2,
  );

  /* ---------------------- every drill and lesson loads -------------------- */

  const drillHashes = [
    ...new Set(
      await evalJs(`[...document.querySelectorAll('a[href^="#/drill/"]')].map(a => a.hash)`),
    ),
  ];
  let drillFailures = 0;
  for (const hash of drillHashes) {
    await evalJs(`location.hash = ${JSON.stringify(hash)}`);
    await sleep(160);
    const ok = await evalJs(
      `!!document.querySelector(".code-row") && !!document.querySelector(".ta")`,
    );
    if (!ok) {
      drillFailures += 1;
      console.log(`      ${hash} did not render a code sample`);
    }
  }
  check(
    "every drill renders a code sample",
    drillFailures === 0 && drillHashes.length > 0,
    `${drillHashes.length} drills`,
  );

  const lessonHashes = [
    ...new Set(
      await evalJs(`[...document.querySelectorAll('a[href^="#/lesson/"]')].map(a => a.hash)`),
    ),
  ];
  let lessonFailures = 0;
  for (const hash of lessonHashes) {
    await evalJs(`location.hash = ${JSON.stringify(hash)}`);
    await sleep(160);
    const ok = await evalJs(`(document.querySelector(".md")?.textContent ?? "").length > 400`);
    if (!ok) {
      lessonFailures += 1;
      console.log(`      ${hash} rendered no body`);
    }
  }
  check(
    "every lesson renders a body",
    lessonFailures === 0 && lessonHashes.length > 0,
    `${lessonHashes.length} lessons`,
  );

  /* --------------------- a newly added grammar highlights ----------------- */

  await evalJs(`location.hash = "#/drill/20"`);
  await sleep(300);
  check(
    "a language added after the first build highlights (C++)",
    (await evalJs(`document.querySelectorAll(".code .token").length`)) > 10,
  );

  /* ------------------------- timed mode, end to end ---------------------- */

  const click = (text) =>
    evalJs(
      `(() => {
        const b = [...document.querySelectorAll("button")]
          .find(el => el.textContent.trim().startsWith(${JSON.stringify(text)}));
        if (!b) return false;
        b.click();
        return true;
      })()`,
    );

  const type = (value) =>
    evalJs(`
      (() => {
        const ta = document.querySelector(".ta");
        if (!ta) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(ta, ${JSON.stringify(value)});
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()
    `);

  // A fresh store, so the untimed drill-8 state above cannot affect the session.
  await evalJs(`localStorage.clear(); location.hash = "#/timed"`);
  await send("Page.reload");
  await sleep(1200);
  // Both confirm() dialogs in this view would otherwise block the page.
  await evalJs(`window.confirm = () => true`);

  check(
    "timed setup offers its options",
    (await evalJs(`document.querySelectorAll(".chip").length`)) >= 10,
  );

  await evalJs(
    `[...document.querySelectorAll(".chip")].find(c => c.textContent.trim() === "3").click()`,
  );
  await sleep(150);
  check("starting a session is offered", (await click("Start")) === true);
  await sleep(400);

  check(
    "the clock is running and the position is shown",
    /^\d+:\d\d$/.test(await evalJs(`document.querySelector(".timer-clock")?.textContent ?? ""`)) &&
      (await evalJs(`document.querySelector(".timer-pos")?.textContent ?? ""`)).includes(
        "Sample 1 of 3",
      ),
  );
  check(
    "hints and the defect count are withheld during a timed run",
    (await evalJs(`document.querySelectorAll(".passes, .hint").length`)) === 0 &&
      (await evalJs(`document.querySelector(".meta-note")?.textContent ?? ""`)).includes(
        "withheld",
      ),
  );

  await type("Line 2 — accumulator seeded at zero, so all-negative input returns zero.");
  await sleep(200);
  await click("Submit and next");
  await sleep(400);
  check(
    "submitting advances to the next sample",
    (await evalJs(`document.querySelector(".timer-pos")?.textContent ?? ""`)).includes(
      "Sample 2 of 3",
    ),
  );

  await send("Page.reload");
  await sleep(1200);
  await evalJs(`window.confirm = () => true`);
  check(
    "an in-flight session survives a reload at the same position",
    (await evalJs(`document.querySelector(".timer-pos")?.textContent ?? ""`)).includes(
      "Sample 2 of 3",
    ),
  );

  await type("Mutates its argument in place; the caller still holds the reference.");
  await sleep(200);
  await click("Submit and next");
  await sleep(400);
  await type("Every rejection returns the same null, so the caller cannot tell them apart.");
  await sleep(200);
  await click("Submit and score");
  await sleep(500);

  check(
    "the last submission opens the debrief",
    (await evalJs(`document.body.textContent`)).includes("Debrief"),
  );
  check(
    "the debrief shows what you wrote for every sample",
    (await evalJs(`document.querySelectorAll("blockquote.wrote").length`)) === 3,
  );
  const debriefDefs = await evalJs(`document.querySelectorAll(".def").length`);
  check("the debrief reveals the planted defects", debriefDefs >= 6, `${debriefDefs} shown`);

  await evalJs(`document.querySelector(".def input[type=checkbox]").click()`);
  await sleep(250);
  await click("Record this session");
  await sleep(500);
  check(
    "recording the session confirms and summarises it",
    (await evalJs(`document.body.textContent`)).includes("Session recorded"),
  );
  check(
    "the timed run is cleared from storage once recorded",
    (await evalJs(`localStorage.getItem("bug-finder:timed:v1") === null`)) === true,
  );
  check(
    "the session feeds the ordinary drill score",
    /\b3\/\d+ reviewed/.test(
      await evalJs(`document.querySelector(".score")?.textContent ?? ""`),
    ),
  );

  await evalJs(`location.hash = "#/progress"`);
  await sleep(450);
  check(
    "the progress page lists the session",
    (await evalJs(`document.body.textContent`)).includes("blockers missed"),
  );

  /* ---------------------- multi-file PR reviews ------------------------- */

  const fileSets = {
    46: ["migrations/042-net.sql.diff", "reports/revenue.sql.diff", "sales/insert.sql"],
    47: ["api/orders.py.diff", "clients/export.py", "schema/orders.sql"],
    48: ["cache.ts.diff", "search.ts.diff", "sessions.ts"],
    49: ["config.ts.diff", "worker.ts.diff", "ledger.ts"],
  };
  const visibleFiles = () => evalJs(`
    [...document.querySelectorAll('.drill-file')].map(section => ({
      path: section.getAttribute('aria-label'),
      visible: section.getBoundingClientRect().height > 0 &&
        !section.closest('details:not([open]), [hidden]'),
      highlighted: section.querySelectorAll('.token').length > 0,
      language: section.querySelector('pre').getAttribute('aria-label'),
    }))
  `);
  for (const [id, paths] of Object.entries(fileSets)) {
    await evalJs(`location.hash = "#/drill/${id}"`);
    await sleep(250);
    const files = await visibleFiles();
    const inventory = await evalJs(`[...document.querySelectorAll('[aria-label="Review files"] li')].map(el => el.textContent)`);
    check(`ordinary multi-file drill ${id} exposes all paths and blocks without clicks`,
      JSON.stringify(inventory) === JSON.stringify(paths) &&
      files.length === paths.length && files.every((f, i) => f.visible && f.path === paths[i]));
    check(`multi-file drill ${id} highlights changed and unchanged files`,
      files.length === paths.length && files.every(f => f.highlighted) &&
      (id !== "47" || JSON.stringify(files.map(f => f.language)) ===
        JSON.stringify(["py sample", "py sample", "sql sample"])));
  }

  // Seed a deterministic in-flight run through the same persisted resume path
  // used after a reload; random selection must not decide capability coverage.
  await evalJs(`
    localStorage.setItem("bug-finder:timed:v1", JSON.stringify({
      startedAt: Date.now() - 10000, secondsPerDrill: 60,
      drillIds: [46, 47, 48, 49], at: 0, drillStartedAt: Date.now() - 10000,
      notes: {}, spent: {}, phase: "running", caught: {},
    }));
    location.hash = "#/timed";
  `);
  await send("Page.reload");
  await sleep(1200);
  const clockSeconds = () => evalJs(`(() => {
    const parts = document.querySelector('.timer-clock').textContent.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  })()`);
  const clockBefore = await clockSeconds();
  await type("Check all writers, including the unchanged insert statement.");
  await sleep(250);
  const startedBefore = await evalJs(`JSON.parse(localStorage.getItem("bug-finder:timed:v1")).drillStartedAt`);
  await send("Page.reload");
  await sleep(1200);
  const clockAfter = await clockSeconds();
  check("multi-file resume preserves notes, position and the original deadline",
    (await evalJs(`document.querySelector('.ta').value`)).includes("unchanged insert") &&
    (await evalJs(`JSON.parse(localStorage.getItem("bug-finder:timed:v1")).drillStartedAt`)) === startedBefore &&
    (await evalJs(`document.querySelector('.timer-pos').textContent`)).includes("Sample 1 of 4") &&
    clockBefore <= 50 && clockAfter < clockBefore && clockAfter > 0);

  for (const [id, paths] of Object.entries(fileSets)) {
    const files = await visibleFiles();
    check(`timed multi-file drill ${id} shows every highlighted file without clicks`,
      files.length === paths.length && files.every((f, i) => f.path === paths[i] && f.visible && f.highlighted));
    if (id === "46") {
      await evalJs(`(() => {
        const run = JSON.parse(localStorage.getItem("bug-finder:timed:v1"));
        run.drillStartedAt = Date.now() - 61000;
        localStorage.setItem("bug-finder:timed:v1", JSON.stringify(run));
      })()`);
      await send("Page.reload");
      await sleep(1200);
      check("an expired multi-file review advances exactly once on resume",
        (await evalJs(`document.querySelector('.timer-pos').textContent`)).includes("Sample 2 of 4") &&
        (await evalJs(`JSON.parse(localStorage.getItem("bug-finder:timed:v1")).spent[46]`)) === 60);
    } else {
      await click(id === "49" ? "Submit and score" : "Submit and next");
      await sleep(350);
    }
  }
  check("multi-file timed run reaches debrief with all four reviews",
    (await evalJs(`document.querySelectorAll('blockquote.wrote').length`)) === 4 &&
    (await evalJs(`document.querySelectorAll('.def').length`)) === 8);

  /* ------------------------------ console -------------------------------- */

  await sleep(300);
  const noisy = logs.filter((l) => !/favicon|DevTools|Download the React/i.test(l));
  check(
    "no console errors or uncaught exceptions",
    noisy.length === 0,
    noisy.join(" | ").slice(0, 400),
  );

  ws.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  return failed;
}
