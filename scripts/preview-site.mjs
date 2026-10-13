// Serves dist/site locally the way Vercel does (clean URLs), to check the static
// replay before publishing: http://127.0.0.1:4173
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { URL } from "node:url";

const ROOT = resolve("dist/site");
const PORT = 4173;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json"
};
if (!existsSync(ROOT)) {
  console.error("dist/site is missing. Run `pnpm site:build` first.");
  process.exit(1);
}
const isFile = (path) => existsSync(path) && statSync(path).isFile();

createServer((req, res) => {
  void (async () => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
    const base = join(ROOT, path);
    const file = [base, `${base}.html`, join(base, "index.html")].find(isFile);
    if (req.method !== "GET" || !file || !file.startsWith(ROOT)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(await readFile(file));
  })().catch(() => {
    if (!res.headersSent) res.writeHead(400);
    res.end();
  });
}).listen(PORT, "127.0.0.1", () => console.log(`Static replay: http://127.0.0.1:${String(PORT)}`));
