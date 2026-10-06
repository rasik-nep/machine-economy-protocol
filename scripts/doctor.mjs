import { spawnSync } from "node:child_process";

const checks = [
  ["solana", ["--version"]],
  ["anchor", ["--version"]],
  ["rustc", ["--version"]],
  ["cargo", ["--version"]],
  ["node", ["--version"]],
  ["pnpm", ["--version"]]
];

let failed = false;

for (const [command, args] of checks) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status === 0) {
    const output = result.stdout.trim() || result.stderr.trim();
    console.log(`${command}: ${output}`);
    continue;
  }

  failed = true;
  const reason = result.error?.message ?? result.stderr.trim() ?? "not available";
  console.error(`${command}: ${reason}`);
}

if (failed) {
  process.exitCode = 1;
}
