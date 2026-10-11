import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
for (const file of [".env.local", ".env"]) if (existsSync(file)) loadEnvFile(file);
const { explainRuling } = await import("../apps/api/src/summary.ts");
try {
  // Same shape as the dashboard's finalized ruling (RulingFacts in apps/api/src/summary.ts).
  const result = await explainRuling({
    provider: "Provider X",
    outcome: "provider-breached",
    recipient: "customer",
    amountLamports: 5_000_000,
    breachVotes: 4,
    reveals: 5
  });
  console.log(
    JSON.stringify({
      passed: true,
      model: result.model,
      advisory: result.advisory,
      summary: result.text
    })
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
