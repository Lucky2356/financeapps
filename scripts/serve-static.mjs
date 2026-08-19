// Serves the static export for the e2e run.
//
// This used to be `npx serve out`, which streams every file and never caps the
// number of open handles: a full suite (a few thousand requests) exhausted the
// process file table on Windows, the server died with EMFILE halfway through,
// and a dozen tests failed with ERR_CONNECTION_REFUSED — failures that look
// like product bugs and are not. Reading each file into memory instead keeps
// exactly one handle open at a time; the whole export is a few megabytes.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve as resolvePath, sep } from "node:path";

const root = resolvePath(process.argv[2] ?? "out");
const port = Number(process.argv[3] ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** The three shapes a Next static export answers to: file, file.html, dir/index.html. */
async function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  // Keep the lookup inside the export, whatever the request asks for.
  const safe = normalize(decoded)
    .replace(/^([.]{2}[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const base = join(root, safe);
  if (!base.startsWith(root + sep) && base !== root) return null;

  for (const candidate of [base, `${base}.html`, join(base, "index.html")])
    if (await isFile(candidate)) return candidate;
  return null;
}

const server = createServer(async (request, response) => {
  try {
    const path = (await resolveFile(request.url ?? "/")) ?? join(root, "404.html");
    const found = await isFile(path);
    const body = found ? await readFile(path) : Buffer.from("Not found");
    response.writeHead(found && !path.endsWith("404.html") ? 200 : found ? 404 : 404, {
      "content-type": found ? (TYPES[extname(path)] ?? "application/octet-stream") : "text/plain",
      "content-length": body.length,
      "cache-control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end(String(error));
  }
});

server.listen(port, () => console.log(`static export on http://localhost:${port} (${root})`));
