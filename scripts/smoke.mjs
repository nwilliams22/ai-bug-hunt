/**
 * End-to-end smoke check for the built app.
 *
 *   npm run build && npm run smoke
 *
 * Serves dist/ on a loopback port, drives a headless Chromium over the DevTools
 * protocol, and runs the assertions in checks.mjs. No test framework and no
 * browser-automation dependency: it needs only Node and a Chromium binary.
 *
 * Point it at a browser with CHROME_PATH if the default search fails.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { homedir } from "node:os";

const DIST = resolve(import.meta.dirname, "..", "dist");
const PORT = Number(process.env.SMOKE_PORT ?? 8731);
const CDP_PORT = Number(process.env.SMOKE_CDP_PORT ?? 9222);

if (!existsSync(join(DIST, "index.html"))) {
  console.error("dist/index.html is missing — run `npm run build` first.");
  process.exit(1);
}

/* ---------------------------- find a browser ---------------------------- */

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  for (const p of [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    if (existsSync(p)) return p;
  }

  // Playwright and Puppeteer caches, newest build first.
  for (const root of [
    join(homedir(), ".cache", "ms-playwright"),
    join(homedir(), ".cache", "puppeteer"),
  ]) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root)
      .filter((d) => d.startsWith("chromium") || d.startsWith("chrome"))
      .sort()
      .reverse();
    for (const d of dirs) {
      for (const rel of [
        ["chrome-headless-shell-linux64", "chrome-headless-shell"],
        ["chrome-linux", "chrome"],
        ["chrome-linux64", "chrome"],
      ]) {
        const p = join(root, d, ...rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.error("No Chromium found. Set CHROME_PATH to a Chrome or Chromium binary.");
  process.exit(1);
}

/* ------------------------------ static server --------------------------- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0].split("#")[0];
  // normalize() collapses any ../ before the join, so a crafted path cannot
  // escape dist/ — this server is loopback-only but it costs one line.
  const rel = normalize(decodeURIComponent(url)).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

/* -------------------------------- browser ------------------------------- */

const proc = spawn(
  chrome,
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${join(process.env.TMPDIR ?? "/tmp", `bug-finder-smoke-${process.pid}`)}`,
    `http://127.0.0.1:${PORT}/index.html`,
  ],
  { stdio: "ignore" },
);

const shutdown = () => {
  proc.kill();
  server.close();
};
process.on("exit", shutdown);

// Wait for the DevTools endpoint rather than sleeping a fixed amount.
let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    ready = r.ok;
  } catch {
    await new Promise((r) => setTimeout(r, 250));
  }
}
if (!ready) {
  console.error("Chromium did not expose a DevTools endpoint.");
  shutdown();
  process.exit(1);
}

const { run } = await import("./checks.mjs");
const failed = await run(`http://127.0.0.1:${CDP_PORT}`);
shutdown();
process.exit(failed ? 1 : 0);
