/**
 * The always-on server for the built course.
 *
 *   node scripts/serve.mjs            # 127.0.0.1:8787
 *   PORT=9000 node scripts/serve.mjs
 *   HOST=0.0.0.0 node scripts/serve.mjs   # opt in to the LAN, deliberately
 *
 * Dependency-free on purpose: this is what the systemd user unit runs, so it
 * must not need node_modules to be present or intact. Loopback by default —
 * the course holds your review notes, and nothing here authenticates anyone.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const DIST = resolve(import.meta.dirname, "..", "dist");
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";

if (!existsSync(join(DIST, "index.html"))) {
  console.error(`No build at ${DIST}. Run \`npm run build\` first.`);
  process.exit(1);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0].split("#")[0];

  let rel;
  try {
    rel = decodeURIComponent(path);
  } catch {
    // A malformed percent-escape is a bad request, not a 404.
    res.writeHead(400).end("bad request");
    return;
  }

  // normalize() collapses any ../ before the join, and the startsWith check
  // below is the belt to that braces.
  rel = normalize(rel);
  let file = join(DIST, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");

  // Routing is entirely in the fragment, so a path that is not a real file is a
  // genuine 404 rather than something to rewrite to index.html.
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
    return;
  }

  const body = readFileSync(file);
  // Vite fingerprints the asset filenames, so assets are immutable and the
  // entry document must never be cached — otherwise a rebuild is invisible
  // until a hard reload.
  const cache = file.includes(`${DIST}/assets/`)
    ? "public, max-age=31536000, immutable"
    : "no-cache";

  res.writeHead(200, {
    "content-type": MIME[extname(file)] ?? "application/octet-stream",
    "content-length": body.length,
    "cache-control": cache,
  });
  res.end(req.method === "HEAD" ? undefined : body);
});

server.listen(PORT, HOST, () => {
  console.log(`Bug Finder on http://${HOST}:${PORT}/  (serving ${DIST})`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
