import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { DemoChain, describeError } from "./chain.ts";
import { explainRuling } from "./summary.ts";
import { pageForPath } from "../../web/src/site.ts";
export const json = (data: unknown) =>
  JSON.stringify(data, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );
export function createDemoServer(chain: DemoChain) {
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
        (isPage || ["/style.css", "/app.js", "/site.js"].includes(path))
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
          "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
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
        res.end(json({ ...(await chain.snapshot()), busy, error: lastError }));
        return;
      }
      if (
        req.method !== "POST" ||
        ![
          "/demo/next",
          "/demo/preempt",
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
          res.writeHead(413);
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
      if (path === "/demo/preempt" && chain.stage !== 1) {
        res.writeHead(409);
        res.end(json({ error: "Only running work can be preempted" }));
        return;
      }
      if (path === "/demo/resolve" && chain.stage !== 2) {
        res.writeHead(409);
        res.end(json({ error: "Failure evidence is required" }));
        return;
      }
      if (path === "/demo/summary" && chain.stage < 6) {
        res.writeHead(409);
        res.end(json({ error: "A finalized ruling is required" }));
        return;
      }
      busy = true;
      lastError = null;
      try {
        if (path === "/demo/reset") await chain.reset();
        else if (path === "/demo/summary") {
          const facts = await chain.ruling();
          if (!facts) throw new Error("A finalized ruling is required");
          chain.summary = await explainRuling(facts);
        } else if (path === "/demo/run") {
          while (chain.stage < 8) await chain.next();
        } else if (path === "/demo/resolve") {
          while (chain.stage < 6) await chain.next();
        } else await chain.next();
        res.end(json({ ...(await chain.snapshot()), busy: false, error: null }));
      } catch (error) {
        lastError = describeError(error);
        res.writeHead(500);
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
