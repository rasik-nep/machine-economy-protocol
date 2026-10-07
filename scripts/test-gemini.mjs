import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
for (const file of [".env.local", ".env"]) if (existsSync(file)) loadEnvFile(file);
const { explainRuling } = await import("../apps/api/src/summary.ts");
try {
  const result = await explainRuling({
    provider: "Provider X",
    refundLamports: 5000000,
    breachVotes: 5
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
