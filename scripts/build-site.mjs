// Builds the public static site: the website plus a replay of a recorded devnet run.
// It needs no demo server, wallet, or RPC. Output: dist/site (served by Vercel).
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

await import("./build-dashboard.mjs");
const { pages } = await import("../apps/web/src/site.ts");
const OUT = "dist/site";
// --replay lets a local check build from a scratch export instead of the published data.
const REPLAY = parseArgs({ options: { replay: { type: "string", default: "apps/web/replay" } } })
  .values.replay;

const stages = Array.from({ length: 9 }, (_, i) => `stage-${String(i)}.json`);
const missing = stages.filter((f) => !existsSync(`${REPLAY}/${f}`));
if (missing.length) {
  console.error(
    `${REPLAY} is missing ${missing.join(", ")}. Run the full devnet demo, then \`pnpm replay:export\`.`
  );
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/replay`, { recursive: true });
for (const file of ["style.css", "app.js", "site.js", "replay-mode.js"])
  await copyFile(`apps/web/public/${file}`, `${OUT}/${file}`);
for (const file of await readdir(REPLAY))
  if (file.endsWith(".json")) await copyFile(`${REPLAY}/${file}`, `${OUT}/replay/${file}`);

// The same page shell serves every route; replay mode makes the dashboard read the
// recorded snapshots instead of the live demo API.
const shell = await readFile("apps/web/public/index.html", "utf8");
if (!shell.includes('<html lang="en">')) throw new Error("index.html shell has changed.");
const html = shell.replace('<html lang="en">', '<html lang="en" data-mode="replay">');
// One file per route, so /demo serves demo.html (Vercel cleanUrls) and a reload works.
for (const { path } of Object.values(pages))
  await writeFile(`${OUT}/${path === "/" ? "index" : path.slice(1)}.html`, html);
console.log(`Built ${OUT}.`);
