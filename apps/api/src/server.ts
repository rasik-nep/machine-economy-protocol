import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { ActiveEscrowError, DemoChain, describeError } from "./chain.ts";
import { REPLAY_CAPTURE_DIR } from "./replay.ts";
import { explainRuling } from "./summary.ts";
import { pageForPath } from "../../web/src/site.ts";
export const json = (data: unknown) =>
  JSON.stringify(data, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );
type Snapshot = Awaited<ReturnType<DemoChain["snapshot"]>>;
/** Saves a stage of the run so a complete run can be published as a static replay. */
async function captureReplay(s: Snapshot) {
  const dir = `${REPLAY_CAPTURE_DIR}/${s.network}-${String(s.run)}`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/stage-${String(s.stage)}.json`, json({ ...s, busy: false, error: null }));
}
export function createDemoServer(chain: DemoChain) {
  // The run changes only through demo actions, so polls read the snapshot taken after
  // the last change. Re-reading every account on each poll kept devnet's public RPC at
  // its rate limit. `undefined` means the next poll reads the chain.
  let latest: Snapshot | undefined;
  /** Refreshes the cached snapshot; `capture` also saves it as the stage's replay. */
  const record = async (capture: boolean) => {
    try {
      latest = await chain.snapshot();
      if (capture) await captureReplay(latest);
    } catch (error) {
      latest = undefined;
      console.warn(`State snapshot skipped: ${describeError(error)}`);
    }
  };
  void record(true);
  let busy = false;
  let lastError: string | null = null;
  const server = createServer((req, res) => {
    void (async () => {
      const host = req.headers.host;
      if (host !== "127.0.0.1:3000" && host !== "localhost:3000") {
        res.writeHead(403);
        res.end();
        return;
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-store");
      const path = new URL(req.url ?? "/", `http://${host}`).pathname;
      const isPage = pageForPath(path) !== undefined;
      if (
        req.method === "GET" &&
        (isPage || ["/style.css", "/app.js", "/site.js", "/replay-mode.js"].includes(path))
      ) {
        res.setHeader(
          "Content-Type",
          isPage
            ? "text/html; charset=utf-8"
            : path.endsWith("css")
              ? "text/css"
              : "application/javascript"
        );
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-src https://player.vimeo.com; frame-ancestors 'none'"
        );
        try {
          res.end(await readFile(`apps/web/public/${isPage ? "index.html" : path.slice(1)}`));
        } catch {
          res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Dashboard bundle missing. Start the demo with `pnpm dev`, which builds it.");
        }
        return;
      }
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET" && path === "/api/state") {
        latest ??= await chain.snapshot();
        res.end(json({ ...latest, busy, error: lastError }));
        return;
      }
      if (
        req.method !== "POST" ||
        ![
          "/demo/next",
          "/demo/degrade",
          "/demo/resolve",
          "/demo/reset",
          "/demo/run",
          "/demo/summary"
        ].includes(path)
      ) {
        res.writeHead(404);
        res.end(json({ error: "Not found" }));
        return;
      }
      if (req.headers.origin && req.headers.origin !== `http://${host}`) {
        res.writeHead(403);
        res.end(json({ error: "Same-origin requests only" }));
        return;
      }
      if (req.headers["content-type"] !== "application/json") {
        res.writeHead(415);
        res.end(json({ error: "JSON required" }));
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += String(chunk);
        if (body.length > 1024) {
          res.writeHead(413, { Connection: "close" });
          res.end(json({ error: "Request too large" }));
          return;
        }
      }
      const input = z
        .object({ run: z.number().int(), stage: z.number().int().min(0).max(8) })
        .strict()
        .parse(JSON.parse(body));
      if (busy || input.run !== chain.run || input.stage !== chain.stage) {
        res.writeHead(409);
        res.end(
          json({ error: "Another operation is running or this view is stale. Refresh state." })
        );
        return;
      }
      // The controlled provider fault: the selected host's serving is degraded.
      if (path === "/demo/degrade" && chain.stage !== 1) {
        res.writeHead(409);
        res.end(json({ error: "Degraded serving can be triggered only for the first job" }));
        return;
      }
      if (path === "/demo/resolve" && chain.stage !== 2) {
        res.writeHead(409);
        res.end(json({ error: "A failed verification is required" }));
        return;
      }
      if (path === "/demo/summary" && chain.stage < 6) {
        res.writeHead(409);
        res.end(json({ error: "A finalized ruling is required" }));
        return;
      }
      busy = true;
      lastError = null;
      // Every stage is captured, including those a multi-stage action passes through.
      const step = async () => {
        await chain.next();
        await record(true);
      };
      try {
        if (path === "/demo/reset") {
          await chain.reset();
          await record(true);
        } else if (path === "/demo/summary") {
          const facts = await chain.ruling();
          if (!facts) throw new Error("A finalized ruling is required");
          chain.summary = await explainRuling(facts);
          await record(true);
        } else if (path === "/demo/run") {
          while (chain.stage < 8) await step();
        } else if (path === "/demo/resolve") {
          while (chain.stage < 6) await step();
        } else await step();
        latest ??= await chain.snapshot();
        res.end(json({ ...latest, busy: false, error: null }));
      } catch (error) {
        lastError = describeError(error);
        // A failed step may have written some transactions. Refresh the view of the run,
        // but do not save a half-finished step as the stage's replay.
        await record(false);
        res.writeHead(error instanceof ActiveEscrowError ? 409 : 500);
        res.end(json({ error: lastError }));
      } finally {
        busy = false;
      }
    })().catch(() => {
      if (!res.headersSent) res.writeHead(400, { "Content-Type": "application/json" });
      res.end(json({ error: "Invalid request or localnet unavailable" }));
    });
  });
  return server;
}
