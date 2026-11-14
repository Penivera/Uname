// Serves the built web app (apps/web/dist) for hosts like Heroku that need a
// running web process. No dependencies: Node's built-in http server only.
//
//   pnpm build:web && PORT=8080 node apps/web/server.mjs
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const port = Number(process.env.PORT) || 8080;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function fileFor(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const path = normalize(join(root, decoded));
  if (!path.startsWith(root + sep) && path !== root) return null; // no escaping dist/
  try {
    const stat = statSync(path);
    if (stat.isFile()) return path;
    if (stat.isDirectory()) return fileFor(join(decoded, "index.html"));
  } catch {
    /* not found */
  }
  return null;
}

createServer((req, res) => {
  let path = null;
  try {
    path = fileFor(req.url ?? "/");
  } catch {
    /* malformed URL */
  }
  // Anything that is not a built file gets the app's page.
  path ??= join(root, "index.html");
  const hashed = path.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    "content-type": TYPES[extname(path)] ?? "application/octet-stream",
    // Built assets have content hashes in their names and never change.
    "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
  });
  createReadStream(path).pipe(res);
}).listen(port, () => console.log(`web app on port ${port}`));
