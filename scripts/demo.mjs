import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { URL } from "node:url";
for (const file of [".env.local", ".env"]) if (existsSync(file)) loadEnvFile(file);
const { DemoChain, RPC_URL, loadDemoWallets } = await import("../apps/api/src/chain.ts");
const { createDemoServer } = await import("../apps/api/src/server.ts");
const PROGRAM_ID = "2jRt4n86GVHaW7Ebm1eoKYUBdqyrs3Zie3rwQnvA23uE";
const PROGRAM_SO = "target/deploy/machine_economy_protocol.so";
const LEDGER = ".anchor/demo-ledger";
const local = /\/\/(127\.0\.0\.1|localhost)[:/]/.test(RPC_URL);
// A remote RPC's first request includes DNS and TLS setup, so allow it longer.
const rpc = (method) =>
  fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method }),
    signal: AbortSignal.timeout(local ? 1000 : 5000)
  });
let validator;
try {
  await rpc("getVersion");
} catch {
  if (!local) {
    // Only the host: a private RPC URL may embed an API key.
    console.error(`Solana RPC at ${new URL(RPC_URL).host} is unreachable.`);
    process.exit(1);
  }
  if (!existsSync(PROGRAM_SO)) {
    console.error(`${PROGRAM_SO} is missing. Run \`pnpm anchor:build\` first.`);
    process.exit(1);
  }
  // A fresh, isolated ledger on every start keeps the demo repeatable. The demo
  // owner wallet is the program's upgrade authority, so it may initialize the protocol.
  const [owner] = await loadDemoWallets();
  validator = spawn(
    "solana-test-validator",
    [
      "--ledger",
      LEDGER,
      "--reset",
      "--bind-address",
      "127.0.0.1",
      "--upgradeable-program",
      PROGRAM_ID,
      PROGRAM_SO,
      owner.publicKey.toBase58(),
      "--quiet"
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  // The validator reports fatal startup errors (for example a port it cannot bind)
  // on stdout and exits, so keep its recent output to explain a failed start.
  let output = "";
  const keep = (chunk) => (output = (output + chunk).slice(-4000));
  validator.stdout.on("data", keep);
  validator.stderr.on("data", keep);
  let exited = null;
  validator.on("exit", (code, signal) => (exited = signal ?? `code ${code}`));
  validator.on("error", (error) => {
    console.error(
      error.code === "ENOENT"
        ? "solana-test-validator was not found. Install the Solana CLI and run `pnpm doctor`."
        : `Could not start solana-test-validator: ${error.message}`
    );
    process.exit(1);
  });
  let healthy = false;
  for (let i = 0; i < 60 && !healthy && !exited; i++) {
    try {
      healthy = (await (await rpc("getHealth")).json()).result === "ok";
    } catch {
      /* Validator may still be starting. */
    }
    if (!healthy) await new Promise((r) => setTimeout(r, 500));
  }
  if (!healthy) {
    console.error(
      exited
        ? `solana-test-validator exited during startup (${exited}).`
        : "solana-test-validator did not become healthy within 30 seconds."
    );
    if (output.trim()) console.error(output.trim());
    const log = `${LEDGER}/validator.log`;
    if (existsSync(log)) {
      const errors = readFileSync(log, "utf8")
        .split("\n")
        .filter((line) => / (ERROR|WARN) /.test(line))
        .slice(-10);
      if (errors.length) console.error(`Last errors in ${log}:\n${errors.join("\n")}`);
    }
    if (/Operation not permitted|os error 1\b/.test(output))
      console.error(
        "The OS refused to let the validator bind its local ports (RPC 8899/8900, faucet 9900). " +
          "This happens inside sandboxes that block listening sockets; run the command outside the sandbox."
      );
    validator.kill("SIGTERM");
    process.exit(1);
  }
}
const chain = new DemoChain();
try {
  await chain.initialize();
  const server = createDemoServer(chain);
  server.on("error", (error) => {
    console.error(`Cannot listen on 127.0.0.1:3000: ${error.message}`);
    validator?.kill("SIGTERM");
    process.exit(1);
  });
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
