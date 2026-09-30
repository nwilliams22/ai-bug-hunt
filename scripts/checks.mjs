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
  await evalJs(`(() => { const select = document.querySelector('select[aria-label="Your verdict"]');
    select.value = 'request-changes'; select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
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
  for (const [id, language] of [[60, "Swift"], [61, "Dart"], [62, "Terraform"],
    [63, "YAML"], [64, "Dockerfile"]]) {
    await evalJs(`location.hash = "#/drill/${id}"`);
    await sleep(200);
    check(`${language} drill uses its Prism grammar`,
      (await evalJs(`document.querySelectorAll(".code .token").length`)) > 0);
  }

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
  await evalJs(`(() => {
    const run = JSON.parse(localStorage.getItem("bug-finder:timed:v1"));
    run.drillIds = [1, 2, 8];
    localStorage.setItem("bug-finder:timed:v1", JSON.stringify(run));
  })()`);
  await send("Page.reload");
  await sleep(1200);
  await evalJs(`window.confirm = () => true`);

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
    (await evalJs(`document.querySelectorAll('.def').length`)) === 7);

  /* --------------------------- repeat review queue ------------------------ */

  // A v2 export has no reviews; the normaliser must retain the original answer.
  await evalJs(`(() => {
    const old = { version: 2, drills: {
      1: { note: "Original review with enough detail to score", revealed: true,
        hintLevel: 0, caught: { 0: true, 1: true }, revealedAt: Date.now() - 5 * 86400000 },
      8: { note: "Missed both blockers in the original review", revealed: true,
        hintLevel: 0, caught: {}, revealedAt: Date.now() - 2 * 86400000 },
      50: { note: "I checked each boundary and found no defect", revealed: true,
        hintLevel: 0, caught: {}, verdict: "approve", falsePositives: 0,
        revealedAt: Date.now() - 2 * 86400000 },
      51: { note: "I reported two findings that were not defects", revealed: true,
        hintLevel: 0, caught: {}, verdict: "request-changes", falsePositives: 2,
        revealedAt: Date.now() - 2 * 86400000 },
    }, lessonsRead: {}, sessions: [] };
    localStorage.setItem("bug-finder:progress:v1", JSON.stringify(old));
    location.hash = "#/";
  })()`);
  await send("Page.reload");
  await sleep(1200);
  check("old progress imports with its first attempt intact",
    (await evalJs(`JSON.parse(localStorage.getItem("bug-finder:progress:v1")).version`)) === 3 &&
    (await evalJs(`JSON.parse(localStorage.getItem("bug-finder:progress:v1")).drills[1].caught[0]`)) === true);
  check("attempt assessment survives import normalization",
    (await evalJs(`(() => { const p = JSON.parse(localStorage.getItem("bug-finder:progress:v1"));
      return p.drills[50].verdict === "approve" && p.drills[51].falsePositives === 2;
    })()`)) === true);
  check("due count is visible on the landing page",
    (await evalJs(`document.querySelector('.bar a[href="#/review"]')?.textContent ?? ""`)).includes("2 due"));
  check("unreviewed drill counts stay hidden in the index",
    (await evalJs(`(() => { const row = document.querySelector('.drill-table tr[data-done="0"]');
      return row?.querySelectorAll('td')[4]?.textContent.trim() === '—'; })()`)) === true &&
    !(await evalJs(`document.body.textContent`)).includes('Every drill has between two and six'));

  await evalJs(`location.hash = "#/review"`);
  await sleep(300);
  check("bad outcomes become due sooner than clean outcomes",
    (await evalJs(`document.querySelectorAll('.lesson-list a[href="#/review/8"]').length`)) === 1 &&
    (await evalJs(`document.querySelectorAll('.lesson-list a[href="#/review/1"]').length`)) === 0);
  check("clean drills avoid an automatic one-day interval while false positives return",
    (await evalJs(`document.querySelectorAll('.lesson-list a[href="#/review/50"]').length`)) === 0 &&
    (await evalJs(`document.querySelectorAll('.lesson-list a[href="#/review/51"]').length`)) === 1);

  await evalJs(`location.hash = "#/review/8"`);
  await sleep(350);
  check("repeat answer is hidden before writing",
    (await evalJs(`document.querySelectorAll('.def').length`)) === 0 &&
    (await evalJs(`document.querySelector('button.btn')?.disabled`)) === true &&
    (await evalJs(`document.body.textContent`)).includes("Attempt history") === false);
  await type("I found both blockers this time, with a concrete failing input for each.");
  await evalJs(`(() => { const select = document.querySelector('select[aria-label="Your verdict"]');
    select.value = 'request-changes'; select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(200);
  check("writing unlocks repeat reveal",
    (await evalJs(`document.querySelector('button.btn')?.disabled`)) === false);
  await click("Lock in and reveal");
  await sleep(350);
  check("repeat reveal exposes independent scoring",
    (await evalJs(`document.querySelectorAll('.def').length`)) > 0 &&
    (await evalJs(`JSON.parse(localStorage.getItem("bug-finder:progress:v1")).reviews[8].length`)) === 1 &&
    (await evalJs(`JSON.parse(localStorage.getItem("bug-finder:progress:v1")).reviews[8][0].verdict`)) === "request-changes");
  await evalJs(`document.querySelector('.def input[type=checkbox]').click()`);
  await sleep(250);
  check("repeat score does not overwrite first attempt",
    (await evalJs(`(() => { const p = JSON.parse(localStorage.getItem("bug-finder:progress:v1"));
      return p.drills[8].caught[0] !== true && p.reviews[8][0].caught[0] === true;
    })()`)) === true);
  await send("Page.reload");
  await sleep(1200);
  check("unfinished scoring resumes after reload",
    (await evalJs(`document.querySelectorAll('.def').length`)) > 0 &&
    (await evalJs(`document.querySelector('button.btn')?.textContent ?? ""`)).includes("Finish scoring"));
  check("unassessed repeat cannot finish as a perfect score",
    (await evalJs(`document.querySelector('button.btn')?.disabled`)) === true);
  await evalJs(`(() => { const input = document.querySelector('input[aria-label="False-positive findings"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '0'); input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(200);
  await click("Finish scoring");
  await sleep(250);
  await evalJs(`location.hash = "#/review"`);
  await sleep(300);
  check("due set recomputes from stored attempts after reload",
    (await evalJs(`document.body.textContent`)).includes("1 due now"));

  await evalJs(`(() => {
    localStorage.setItem('bug-finder:progress:v1', JSON.stringify({ version: 3, drills: {
      8: { note: 'Original reviewed answer with a finding', revealed: true,
        caught: {0: true}, hintLevel: 0, verdict: 'request-changes', falsePositives: 2,
        revealedAt: Date.now() - 86400000 }
    }, reviews: {}, lessonsRead: {}, sessions: [] }));
    localStorage.setItem('bug-finder:timed:v1', JSON.stringify({
      startedAt: Date.now() - 10000, secondsPerDrill: 60, drillIds: [8], at: 1,
      drillStartedAt: Date.now(), notes: {8: 'Short timed note'}, spent: {8: 10},
      phase: 'debrief', caught: {8: [1]}
    }));
    location.hash = '#/timed';
  })()`);
  await send('Page.reload');
  await sleep(900);
  await click('Record this session');
  await sleep(200);
  await send('Page.reload');
  await sleep(900);
  check('timed repeat preserves the assessed original after reload',
    (await evalJs(`(() => { const p = JSON.parse(localStorage.getItem('bug-finder:progress:v1'));
      return p.drills[8].caught[0] === true && p.drills[8].verdict === 'request-changes' &&
        p.drills[8].falsePositives === 2 && p.reviews[8]?.length === 1 &&
        p.reviews[8][0].caught[1] === true && p.reviews[8][0].source === 'timed' &&
        p.reviews[8][0].verdict === undefined && p.reviews[8][0].falsePositives === undefined;
    })()`)) === true);

  /* --------------------- clean and proportionate reviews ------------------ */

  const chooseVerdict = (value) => evalJs(`(() => {
    const select = document.querySelector('select[aria-label="Your verdict"]');
    if (!select) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  const falseFindings = (value) => evalJs(`(() => {
    const input = document.querySelector('input[aria-label="False-positive findings"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const progressKey = 'bug-finder:progress:v1';
  await evalJs(`localStorage.clear(); location.hash = '#/drill/50'`);
  await send('Page.reload');
  await sleep(900);
  check('clean drill renders without disclosing its answer',
    (await evalJs(`document.querySelector('.card-h').textContent`)).includes('Validate token expiry') &&
    (await evalJs(`document.querySelectorAll('.review-reason, .assessment, .def').length`)) === 0 &&
    !(await evalJs(`document.querySelector('.meta-note').textContent`)).includes('0'));
  check('clean reveal starts gated', (await evalJs(`document.querySelector('button.btn').disabled`)) === true);
  await click('Hint');
  await sleep(100);
  await click('Hint');
  await sleep(100);
  check('clean hints describe investigation without inventing defects',
    (await evalJs(`document.querySelectorAll('.hint').length`)) === 2 &&
    (await evalJs(`document.querySelectorAll('.hint')[1].textContent`)).includes('establish whether'));
  await type('Both instants are aware and compared in UTC; equality expires the token.');
  await sleep(150);
  check('a written clean review still requires a verdict', (await evalJs(`document.querySelector('button.btn').disabled`)) === true);
  await chooseVerdict('approve');
  await sleep(150);
  check('explicit approval unlocks a clean reveal', (await evalJs(`document.querySelector('button.btn').disabled`)) === false);
  await click('Lock in and reveal');
  await sleep(200);
  check('zero-defect reveal has reasoning and no caught boxes',
    (await evalJs(`document.querySelectorAll('.def input').length`)) === 0 &&
    (await evalJs(`document.body.textContent`)).includes('No findings to tick') &&
    (await evalJs(`document.querySelector('.review-reason').textContent`)).includes('Expected verdict: approve'));
  check('reveal locks verdict and the evidence used for self-assessment',
    (await evalJs(`document.querySelector('select[aria-label="Your verdict"]').disabled`)) === true &&
    (await evalJs(`document.querySelector('.ta').readOnly`)) === true);
  check('unrecorded false-positive assessment is not a perfect score',
    (await evalJs(`document.querySelector('.calibration-score').textContent`)).includes('assessment not recorded'));
  await falseFindings(3);
  await sleep(150);
  check('three false findings lower a correct verdict to 25 points',
    (await evalJs(`document.querySelector('.calibration-score').textContent`)).includes('25/100'));
  await send('Page.reload');
  await sleep(900);
  check('verdict and false-positive cost survive reload',
    (await evalJs(`JSON.parse(localStorage.getItem('${progressKey}')).drills[50].verdict`)) === 'approve' &&
    (await evalJs(`document.querySelector('input[aria-label="False-positive findings"]').value`)) === '3' &&
    (await evalJs(`document.querySelector('.calibration-score').textContent`)).includes('25/100'));
  await evalJs(`location.hash = '#/progress'`);
  await sleep(200);
  check('clean-only progress has no missed blocker or fabricated 0% family',
    (await evalJs(`document.querySelector('.tile b').textContent`)) === '—' &&
    (await evalJs(`document.querySelectorAll('.fam-row').length`)) === 0 &&
    (await evalJs(`document.body.textContent`)).includes('blockers missed of 0') &&
    (await evalJs(`document.querySelectorAll('.tile b')[3].textContent`)) === '0');
  check('progress retains the false-positive cost separately from recall',
    (await evalJs(`document.querySelector('[aria-label="Review calibration"]').textContent`)).includes('25/100') &&
    (await evalJs(`document.querySelector('[aria-label="Review calibration"]').textContent`)).includes('3self-assessed false positives'));

  // Exercise every answer, including the two proportionate comments.
  for (let id = 51; id <= 59; id++) {
    await evalJs(`location.hash = '#/drill/${id}'`);
    await sleep(150);
    await type('I traced the contract, ownership, boundary and failure cases before deciding.');
    await chooseVerdict(id >= 58 ? 'approve-with-comments' : id === 51 ? 'request-changes' : 'approve');
    await sleep(100);
    await click('Lock in and reveal');
    await sleep(100);
    await falseFindings(0);
    await sleep(100);
    check(`drill ${id} reveals its expected verdict and proportionate findings`,
      (await evalJs(`document.querySelectorAll('.def').length`)) === (id >= 58 ? 1 : 0) &&
      (await evalJs(`document.querySelector('.review-reason').textContent`)).includes(
        id >= 58 ? 'Expected verdict: approve with comments' : 'Expected verdict: approve'));
    if (id === 51) check('requesting changes on clean code earns zero calibration',
      (await evalJs(`document.querySelector('.calibration-score').textContent`)).includes('0/100'));
    if (id === 56) check('clean multi-file diff exposes the unchanged caller',
      (await evalJs(`document.querySelectorAll('.drill-file').length`)) === 3 &&
      (await evalJs(`document.querySelector('[aria-label="reader.ts"]').textContent`)).includes('get('));
    if (id === 59) check('unstated precondition is taught as a question, not an asserted bug',
      (await evalJs(`document.querySelector('.def-t').textContent`)).startsWith('Question:') &&
      (await evalJs(`document.querySelector('.review-reason').textContent`)).includes('no evidence of an unsorted production input'));
  }

  // A clean review must leave every defect-based aggregate unchanged.
  const aggregateTiles = () => evalJs(`JSON.stringify({
    tiles: [...document.querySelectorAll('.tiles:first-of-type .tile')].filter((_, i) => i !== 1).map(el => el.textContent),
    families: [...document.querySelectorAll('.fam-row')].map(el => el.textContent)
  })`);
  await evalJs(`localStorage.setItem('${progressKey}', JSON.stringify({version: 3,
    drills: {8: {note: 'A prior defective review with missed blockers', revealed: true, hintLevel: 0, caught: {}}},
    reviews: {}, lessonsRead: {}, sessions: []})); location.hash = '#/progress'`);
  await send('Page.reload');
  await sleep(900);
  const beforeClean = await aggregateTiles();
  await evalJs(`(() => { const p = JSON.parse(localStorage.getItem('${progressKey}'));
    p.drills[50] = {note: 'Both timestamps were checked and converted', revealed: true, hintLevel: 0, caught: {}, verdict: 'approve', falsePositives: 0};
    localStorage.setItem('${progressKey}', JSON.stringify(p)); })()`);
  await send('Page.reload');
  await sleep(900);
  check('adding clean review neither dilutes nor inflates recall, families or missed blockers',
    beforeClean === await aggregateTiles());

  await evalJs(`localStorage.clear(); localStorage.setItem('bug-finder:timed:v1', JSON.stringify({
    startedAt: Date.now() - 20000, secondsPerDrill: 60, drillIds: [50, 51], at: 2,
    drillStartedAt: Date.now(), notes: {50: 'Approved after checking UTC conversion', 51: 'Approved after tracing copy ownership'},
    spent: {50: 10, 51: 10}, phase: 'debrief', caught: {}
  })); location.hash = '#/timed'`);
  await send('Page.reload');
  await sleep(900);
  check('all-clean timed debrief has no ticks, misses, or 0% recall',
    (await evalJs(`document.querySelector('.tile b').textContent`)) === '—' &&
    (await evalJs(`document.querySelectorAll('.def').length`)) === 0 &&
    (await evalJs(`document.querySelectorAll('.review-reason').length`)) === 2 &&
    (await evalJs(`document.body.textContent`)).includes('blockers missed of 0'));
  await click('Record this session');
  await sleep(200);
  check('recorded clean timed session still displays no recall denominator',
    (await evalJs(`document.querySelector('.tile b').textContent`)) === '—');
  await evalJs(`location.hash = '#/progress'`);
  await sleep(200);
  check('clean timed history displays a dash and remains unassessed for verdicts',
    (await evalJs(`document.querySelector('.plain-list li b').textContent`)) === '—' &&
    (await evalJs(`document.querySelector('[aria-label="Review calibration"]').textContent`)).includes('0 recorded verdicts') &&
    (await evalJs(`document.querySelectorAll('.fam-row').length`)) === 0);

  await evalJs(`location.hash = '#/drills'`);
  await sleep(200);
  check('drill index conceals answer counts for unreviewed samples',
    (await evalJs(`document.querySelector('.drill-table a[href="#/drill/52"]').closest('tr').children[4].textContent.trim()`)) === '—');

  await evalJs(`localStorage.setItem('${progressKey}', JSON.stringify({version: 3,
    drills: {50: {note: 'Original committed evidence', revealed: true, hintLevel: 0,
      caught: {}, verdict: 'approve', falsePositives: 3}}, reviews: {}, lessonsRead: {}, sessions: []}));
    localStorage.setItem('bug-finder:timed:v1', JSON.stringify({
      startedAt: Date.now() - 10000, secondsPerDrill: 60, drillIds: [50], at: 1,
      drillStartedAt: Date.now(), notes: {50: 'Different timed review evidence'},
      spent: {50: 10}, phase: 'debrief', caught: {}
    })); location.hash = '#/timed'`);
  await send('Page.reload');
  await sleep(900);
  await click('Record this session');
  await sleep(200);
  check('timed repetition preserves the original verdict and false-positive cost',
    (await evalJs(`(() => { const p = JSON.parse(localStorage.getItem('${progressKey}'));
      return p.drills[50].note === 'Original committed evidence' && p.drills[50].falsePositives === 3 &&
        p.drills[50].verdict === 'approve' && p.reviews[50]?.length === 1 &&
        p.reviews[50][0].note === 'Different timed review evidence' &&
        p.reviews[50][0].verdict === undefined && p.reviews[50][0].falsePositives === undefined;
    })()`)) === true);

  /* ---------------- write-up rubric and practice order ------------------- */
  await evalJs(`localStorage.clear(); location.hash = '#/drills'`);
  await send('Page.reload');
  await sleep(900);
  const practiceIds = () => evalJs(`Array.from(document.querySelectorAll('.drill-table tbody a')).map(a => a.hash).join(',')`);
  const practiceBefore = await practiceIds();
  check('practice order is not ascending id order', practiceBefore !== practiceBefore.split(',').sort((a, b) => Number(a.split('/').at(-1)) - Number(b.split('/').at(-1))).join(','));
  await send('Page.reload');
  await sleep(900);
  check('practice order survives reload', practiceBefore === await practiceIds());
  // The order is not id order, so a list that printed ids would print noise.
  const seq = (n) => Array.from({ length: n }, (_, i) => String(i + 1)).join(',');
  const tableNums = await evalJs(`Array.from(document.querySelectorAll('.drill-table tbody tr'))
    .map(r => r.children[0].textContent.trim()).join(',')`);
  check('drill table numbers its rows by position, not by id',
    tableNums === seq(tableNums.split(',').length), tableNums.slice(0, 40));
  const sideNums = await evalJs(`Array.from(document.querySelectorAll('.side-n'))
    .map(e => e.textContent.trim()).join(',')`);
  check('sidebar numbers drills by position, not by id',
    sideNums === seq(sideNums.split(',').length), sideNums.slice(0, 40));
  check('every drill appears in both lists',
    sideNums.split(',').length === tableNums.split(',').length);
  // A lesson's practice link must name the number the sidebar shows for it.
  const firstHref = practiceBefore.split(',')[0];
  await evalJs(`location.hash = '#/lesson/the-job'`);
  await sleep(300);
  check('lesson practice links carry the position and say nothing is gated', await evalJs(`
    /^\\d+\\. /.test(document.querySelector('.practice a').textContent.trim()) &&
    document.querySelector('.practice-note').textContent.includes('nothing is gated')`));
  check('lesson practice position matches the sidebar', await evalJs(`
    (() => { const a = document.querySelector('.practice a');
      const n = a.textContent.trim().split('.')[0];
      const side = document.querySelector('.side-sec a[href="' + a.getAttribute('href') + '"]');
      return side !== null && side.querySelector('.side-n').textContent.trim() === n; })()`));
  await evalJs(`location.hash = '${firstHref}'`);
  await sleep(300);
  // Measured, not asserted from the stylesheet: the text must not touch the select.
  check('the verdict label leaves a gap before its control', await evalJs(`
    (() => { const l = document.querySelector('label.label');
      const sel = l.querySelector('select');
      const r = document.createRange();
      r.selectNodeContents(l.firstChild);
      return sel.getBoundingClientRect().left - r.getBoundingClientRect().right >= 6; })()`));
  await evalJs(`location.hash = '#/drill/8'`);
  await sleep(200);
  check('write-up rubric stays hidden before reveal', await evalJs(`document.querySelector('.writeup-rubric') === null`));
  await evalJs(`localStorage.setItem('${progressKey}', JSON.stringify({version: 3,
    drills: {8: {note: 'The mechanism has a concrete failing input.', revealed: true, hintLevel: 0, caught: {}, revealedAt: 1}},
    reviews: {}, lessonsRead: {}, sessions: []}));`);
  await send('Page.reload');
  await sleep(900);
  check('reveal shows four lesson-derived criteria and cutting guidance', await evalJs(`
    document.querySelectorAll('.writeup-rubric input').length === 4 &&
    document.querySelector('.writeup-rubric').textContent.includes('actual output written down') &&
    document.querySelector('.writeup-rubric').textContent.includes('The tour of your reasoning')`));
  await evalJs(`document.querySelector('.writeup-rubric input').click()`);
  await sleep(200);
  check('one criterion records a 25 percent write-up', await evalJs(`document.querySelector('.writeup-score').textContent.includes('25%')`));
  await send('Page.reload');
  await sleep(900);
  check('write-up reload preserves optional version-three fields', await evalJs(`
    JSON.parse(localStorage.getItem('${progressKey}')).version === 3 &&
    document.querySelector('.writeup-rubric input').checked &&
    document.querySelector('.writeup-score').textContent.includes('25%')`));
  await evalJs(`(() => { const p = JSON.parse(localStorage.getItem('${progressKey}'));
    p.reviews[8] = [{note: 'A fresh independent review with specific evidence.', revealedAt: 2,
      caught: {}, scored: false, writeup: {mechanism: true, input: true, signal: true, fix: true}}];
    localStorage.setItem('${progressKey}', JSON.stringify(p)); location.hash = '#/review/8'; })()`);
  await send('Page.reload');
  await sleep(900);
  check('repeat rubric and trend use the repeat score', await evalJs(`
    document.querySelector('.writeup-score').textContent.includes('100%') &&
    document.body.textContent.includes('write-up 25%') && document.body.textContent.includes('write-up 100%')`));
  await evalJs(`location.hash = '#/progress'`);
  await sleep(200);
  check('weakest write-up criterion comes first and counts repeats', await evalJs(`
    document.querySelector('[aria-label="Write-up progress"] .fam-name').textContent === 'Concrete failing input' &&
    document.querySelector('[aria-label="Write-up progress"] .fam-num').textContent === '1/2' &&
    document.querySelector('[aria-label="Write-up progress"] a').hash === '#/lesson/writing-the-finding'`));
  await evalJs(`localStorage.setItem('${progressKey}', JSON.stringify({version: 3,
    drills: {50: {note: 'Approved after checking the contract.', revealed: true, hintLevel: 0, caught: {}, writeup: {mechanism: false, input: false, signal: false, fix: false}}},
    reviews: {}, lessonsRead: {}, sessions: []})); location.hash = '#/drill/50'`);
  await send('Page.reload');
  await sleep(900);
  check('clean reveal has no write-up checkboxes or zero percent', await evalJs(`
    document.querySelector('.writeup-rubric') === null && document.querySelector('.writeup-empty').textContent.includes('no findings to score')`));
  await evalJs(`location.hash = '#/progress'`);
  await sleep(200);
  check('clean progress excludes fabricated criterion scores', await evalJs(`
    document.querySelectorAll('[aria-label="Write-up progress"] .fam-row').length === 0 &&
    !document.querySelector('[aria-label="Write-up progress"]').textContent.includes('0%')`));
  await evalJs(`localStorage.setItem('bug-finder:timed:v1', JSON.stringify({
    startedAt: Date.now(), secondsPerDrill: 600, drillIds: [8], at: 0,
    drillStartedAt: Date.now(), notes: {8: 'A timed review with concrete evidence.'},
    spent: {}, phase: 'running', caught: {}
  })); location.hash = '#/timed'`);
  await send('Page.reload');
  await sleep(900);
  check('timed run contains no write-up rubric', await evalJs(`document.querySelector('.writeup-rubric') === null`));
  await click('Submit and score');
  await sleep(200);
  check('timed debrief shows write-up rubric', await evalJs(`document.querySelectorAll('.writeup-rubric input').length === 4`));
  await evalJs(`document.querySelector('.writeup-rubric input').click()`);
  await sleep(200);
  await send('Page.reload');
  await sleep(900);
  check('timed debrief reload preserves write-up score', await evalJs(`document.querySelector('.writeup-score').textContent.includes('25%')`));
  await click('Record this session');
  await sleep(200);
  check('timed write-up is recorded on the attempt', await evalJs(`JSON.parse(localStorage.getItem('${progressKey}')).drills[8].writeup.mechanism === true`));

  await evalJs(`localStorage.setItem('${progressKey}', JSON.stringify({version: 3,
    drills: {60: {note: 'A review compared against the answer key.', revealed: true, hintLevel: 0, caught: {},
      writeup: {mechanism: 'true', input: 1, signal: null, fix: false, unknown: true}}},
    reviews: {}, lessonsRead: {}, sessions: []})); location.hash = '#/drill/60'`);
  await send('Page.reload');
  await sleep(900);
  // Drill 60 had no model review when this fixture was written; every drill has one now,
  // so the assertion moved from the empty fallback to the populated case beside it.
  check('a drill renders its model review beside the answer prose and write-up standard', await evalJs(`
    document.querySelector('.model-review') !== null && document.querySelector('.def-b').textContent.length > 0 &&
    document.querySelectorAll('.writeup-rubric input').length === 4`));
  check('malformed optional rubric values do not fabricate a score', await evalJs(`
    document.querySelector('.writeup-score').textContent.includes('not scored') &&
    JSON.stringify(JSON.parse(localStorage.getItem('${progressKey}')).drills[60].writeup) === '{"fix":false}'`));
  await click('Record no criteria met');
  await sleep(200);
  check('an explicit zero score is distinct from an unscored review', await evalJs(`
    document.querySelector('.writeup-score').textContent.includes('0%')`));
  await evalJs(`localStorage.setItem('bug-finder:timed:v1', JSON.stringify({
    startedAt: Date.now(), secondsPerDrill: 60, drillIds: [60], at: 1,
    drillStartedAt: Date.now(), notes: {60: 'A different timed review.'}, spent: {60: 10},
    phase: 'debrief', caught: {}, writeups: {60: {mechanism: true, input: true, signal: true, fix: true}}
  })); location.hash = '#/timed'`);
  await send('Page.reload');
  await sleep(900);
  await click('Record this session');
  await sleep(200);
  check('timed repeat keeps its write-up separate from the original', await evalJs(`
    (() => {const p = JSON.parse(localStorage.getItem('${progressKey}'));
      return p.drills[60].writeup.mechanism === false && p.reviews[60][0].writeup.mechanism === true;})()`));

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
