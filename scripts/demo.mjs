import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
for (const file of [".env.local", ".env"]) if (existsSync(file)) loadEnvFile(file);
const { DemoChain, RPC_URL, loadDemoWallets } = await import("../apps/api/src/chain.ts");
const { createDemoServer } = await import("../apps/api/src/server.ts");
const PROGRAM_ID = "2jRt4n86GVHaW7Ebm1eoKYUBdqyrs3Zie3rwQnvA23uE";
const rpc = (method) =>
  fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method }),
    signal: AbortSignal.timeout(1000)
  });
let validator;
try {
  await rpc("getVersion");
} catch {
  if (!/\/\/(127\.0\.0\.1|localhost)[:/]/.test(RPC_URL)) {
    console.error(`Solana RPC ${RPC_URL} is unreachable.`);
    process.exit(1);
  }
  // A fresh, isolated ledger on every start keeps the demo repeatable. The demo
  // owner wallet is the program's upgrade authority, so it may initialize the protocol.
  const [owner] = await loadDemoWallets();
  validator = spawn(
    "solana-test-validator",
    [
      "--ledger",
      ".anchor/demo-ledger",
      "--reset",
      "--bind-address",
      "127.0.0.1",
      "--upgradeable-program",
      PROGRAM_ID,
      "target/deploy/machine_economy_protocol.so",
      owner.publicKey.toBase58(),
      "--quiet"
    ],
    { stdio: ["ignore", "ignore", "inherit"] }
  );
  validator.on("error", (error) => {
    console.error(
      error.code === "ENOENT"
        ? "solana-test-validator was not found. Install the Solana CLI and run `pnpm doctor`."
        : `Could not start solana-test-validator: ${error.message}`
    );
    process.exit(1);
  });
  let healthy = false;
  for (let i = 0; i < 60 && !healthy; i++) {
    try {
      healthy = (await (await rpc("getHealth")).json()).result === "ok";
    } catch {
      /* Validator may still be starting. */
    }
    if (!healthy) await new Promise((r) => setTimeout(r, 500));
  }
  if (!healthy) {
    console.error("solana-test-validator did not become healthy within 30 seconds.");
    validator.kill("SIGTERM");
    process.exit(1);
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
