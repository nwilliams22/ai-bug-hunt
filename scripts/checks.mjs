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
  check("reveal shows every planted defect", defCount === 3, `${defCount} shown`);

  await evalJs(`document.querySelector(".def input[type=checkbox]").click()`);
  await sleep(250);
  check(
    "ticking a defect updates the header score",
    (await evalJs(`document.querySelector(".score")?.textContent ?? ""`)).includes("1/3"),
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
    (await evalJs(`document.querySelectorAll(".def").length`)) === 3,
  );

  /* ------------------------------- routes -------------------------------- */

  for (const [hash, sel, label] of [
    ["#/lesson/reading-a-diff", ".code-row-add", "diff fence in a lesson"],
    ["#/lesson/pass-coercion", ".md h2", "lesson headings"],
    ["#/lesson/pass-boundary", ".md-table td", "markdown table"],
    ["#/gotchas/Go", ".gotcha", "gotcha cards for one language"],
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
    (await evalJs(`document.querySelectorAll(".fam-row").length`)) === 3,
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
