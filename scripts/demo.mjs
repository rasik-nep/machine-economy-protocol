import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
for (const file of [".env.local", ".env"]) if (existsSync(file)) loadEnvFile(file);
const { DemoChain } = await import("../apps/api/src/chain.ts");
const { createDemoServer } = await import("../apps/api/src/server.ts");
const endpoint = "http://127.0.0.1:8899";
let validator;
try {
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getVersion" }),
    signal: AbortSignal.timeout(1000)
  });
} catch {
  validator = spawn(
    "solana-test-validator",
    [
      "--ledger",
      `.anchor/validator-${Date.now()}`,
      "--bind-address",
      "127.0.0.1",
      "--bpf-program",
      "2jRt4n86GVHaW7Ebm1eoKYUBdqyrs3Zie3rwQnvA23uE",
      "target/deploy/machine_economy_protocol.so",
      "--quiet"
    ],
    { stdio: ["ignore", "ignore", "inherit"] }
  );
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" })
      });
      if ((await r.json()).result === "ok") break;
    } catch {
      /* Validator may still be starting. */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}
const chain = new DemoChain();
try {
  await chain.initialize();
  const server = createDemoServer(chain);
  server.listen(3000, "127.0.0.1", () =>
    console.log("Machine Economy Protocol ready: http://127.0.0.1:3000")
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      server.close();
      validator?.kill("SIGTERM");
      process.exit(0);
    });
} catch (error) {
  console.error(error.message);
  validator?.kill("SIGTERM");
  process.exitCode = 1;
}
