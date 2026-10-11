import { test, expect } from "@playwright/test";
import { z } from "zod";
const schema = z.object({
  stage: z.number(),
  run: z.number(),
  busy: z.boolean(),
  network: z.string(),
  before: z.array(z.object({ providerId: z.string(), providerSlug: z.string().optional() })),
  after: z.array(z.object({ providerId: z.string(), providerSlug: z.string().optional() })),
  choices: z.object({
    agent: z.object({ before: z.string().nullable(), after: z.string().nullable() }),
    twin: z.object({ before: z.string().nullable(), after: z.string().nullable() })
  }),
  agent: z.object({
    checkpoints: z.number(),
    memoryRoot: z.string(),
    initialMemoryRoot: z.string(),
    twinCheckpoints: z.number(),
    twinMemoryRoot: z.string(),
    twinInitialMemoryRoot: z.string()
  }),
  pnl: z.object({ totalLamports: z.string(), withoutRefundsLamports: z.string() }),
  verifications: z.object({
    first: z
      .object({
        result: z.object({ passed: z.boolean(), scoreBps: z.number() }),
        receipt: z.object({ label: z.string(), signerRole: z.string() }),
        executionTrust: z.object({ tier: z.string() })
      })
      .optional(),
    second: z
      .object({
        result: z.object({ passed: z.boolean(), scoreBps: z.number() }),
        receipt: z.object({ label: z.string(), signerRole: z.string() }),
        executionTrust: z.object({ tier: z.string() })
      })
      .optional()
  }),
  evidenceBundle: z.string().optional(),
  precedent: z.object({ rulingRoot: z.string(), url: z.string() }).optional(),
  contracts: z.array(
    z.object({ escrowLamports: z.number(), priceLamports: z.number(), status: z.string() })
  ),
  providers: z.array(
    z.object({
      id: z.string(),
      breachCount: z.number(),
      trust: z.object({
        hardware: z.object({ tier: z.string(), status: z.string() }),
        model: z.object({ tier: z.string(), status: z.string() }),
        execution: z.object({ tier: z.string(), status: z.string() })
      })
    })
  ),
  ruling: z
    .object({ outcome: z.string(), recipient: z.string(), breachVotes: z.number() })
    .optional(),
  votes: z.array(z.object({ revealed: z.boolean(), vote: z.string().nullable() })),
  rulingRoot: z.string().optional(),
  receipts: z.array(z.object({ signature: z.string(), url: z.string() }))
});
test("real localnet loop, repeatability, API guards, and responsive navigation", async ({
  page,
  request
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let current = schema.parse(await (await request.get("/api/state")).json());
  if (current.stage === 8) {
    const reset = await request.post("/demo/reset", { data: { run: current.run, stage: 8 } });
    expect(reset.ok()).toBe(true);
    current = schema.parse(await reset.json());
  }
  expect(current.stage).toBe(0);
  const premature = await request.post("/demo/degrade", { data: { run: current.run, stage: 0 } });
  expect(premature.status()).toBe(409);
  const crossOrigin = await request.post("/demo/run", {
    headers: { Origin: "https://untrusted.example" },
    data: { run: current.run, stage: 0 }
  });
  expect(crossOrigin.status()).toBe(403);
  const malformed = await request.post("/demo/run", {
    data: { run: current.run, stage: 0, extra: "reject" }
  });
  expect(malformed.status()).toBe(400);
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "An economy that learns." })).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard-before.png", fullPage: true });
  await page.getByRole("button", { name: "Run full demo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Second job settled", exact: true })).toBeVisible({
    timeout: 150000
  });
  current = schema.parse(await (await request.get("/api/state")).json());
  expect(current.stage).toBe(8);
  // Ranked from on-chain offers; the precedent, not the fixtures, changes the choice.
  expect(current.before[0]?.providerSlug).toBe("provider-x");
  expect(current.after[0]?.providerSlug).toBe("provider-z");
  expect(current.agent.checkpoints).toBe(1);
  expect(current.agent.memoryRoot).not.toBe(current.agent.initialMemoryRoot);
  // The twin was never party to the dispute, yet it verified the precedent and switched.
  expect(current.choices.twin).toEqual({ before: "Provider X", after: "Provider Z" });
  expect(current.choices.agent).toEqual({ before: "Provider X", after: "Provider Z" });
  expect(current.agent.twinCheckpoints).toBe(1);
  expect(current.agent.twinMemoryRoot).not.toBe(current.agent.twinInitialMemoryRoot);
  expect(current.agent.twinMemoryRoot).not.toBe(current.agent.memoryRoot);
  // Item 1/2: the degraded result fails its committed policy with a provider-signed
  // receipt (E1); the second job passes (E2).
  expect(current.verifications.first?.result.passed).toBe(false);
  expect(current.verifications.first?.receipt).toMatchObject({
    label: "provider-signed",
    signerRole: "provider"
  });
  expect(current.verifications.first?.executionTrust.tier).toBe("E1");
  expect(current.verifications.second?.result.passed).toBe(true);
  expect(current.verifications.second?.executionTrust.tier).toBe("E2");
  expect(current.evidenceBundle).toMatch(/evidence-bundle\.json$/);
  // Item 4: fixture hardware tiers are labeled simulated; model identity is earned.
  expect(current.providers.find((p) => p.id === "provider-z")?.trust.hardware).toMatchObject({
    tier: "H3",
    status: "simulated"
  });
  expect(current.providers.find((p) => p.id === "provider-x")?.trust.hardware.status).toBe(
    "unverified"
  );
  expect(current.providers.every((p) => p.trust.model.tier === "M2")).toBe(true);
  expect(current.contracts).toHaveLength(4);
  expect(current.contracts.every((c) => c.escrowLamports === 0)).toBe(true);
  expect(current.contracts.map((c) => c.status)).toEqual([
    "settled",
    "settled",
    "breached",
    "settled"
  ]);
  expect(current.pnl).toEqual({
    ...current.pnl,
    totalLamports: "1000000",
    withoutRefundsLamports: "-4000000"
  });
  expect(current.votes.filter((v) => v.revealed)).toHaveLength(5);
  expect(current.votes.map((v) => v.vote)).toEqual([
    "breach",
    "breach",
    "breach",
    "breach",
    "no breach"
  ]);
  expect(current.rulingRoot).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(current.precedent?.rulingRoot).toBe(current.rulingRoot);
  expect(current.receipts.length).toBeGreaterThan(30);
  expect(current.receipts.every((r) => r.url.startsWith("https://explorer.solana.com/tx/"))).toBe(
    true
  );
  await page.screenshot({ path: "test-results/dashboard-complete.png", fullPage: true });
  await page.getByRole("link", { name: /Compute market/ }).click();
  await expect(page.getByRole("heading", { name: "The price of reliability." })).toBeVisible();
  await page.getByText("Inspect every term in the deterministic score").click();
  await expect(page.getByRole("columnheader", { name: "Failure loss", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Agent passports/ }).click();
  await expect(
    page.getByRole("heading", { name: "Identity stays. Experience evolves." })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent A′’s memory" })).toBeVisible();
  await page.getByRole("link", { name: /Dispute & precedent/ }).click();
  await expect(page.getByText("Provider breached", { exact: true })).toBeVisible();
  await expect(page.getByText("Revealed · no breach")).toBeVisible();
  await expect(page.getByRole("link", { name: "Precedent account on Explorer ↗" })).toBeVisible();
  await expect(page.getByText("provider-signed ·").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check it without this server" })).toBeVisible();
  await page.screenshot({ path: "test-results/dispute-complete.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: /Overview/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: "test-results/dashboard-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
  const replay = await request.post("/demo/run", { data: { run: current.run - 1, stage: 0 } });
  expect(replay.status()).toBe(409);
});

test("guided steps, mid-run reset, and stale requests", async ({ page, request }) => {
  let current = schema.parse(await (await request.get("/api/state")).json());
  if (current.stage !== 0) {
    const reset = await request.post("/demo/reset", {
      data: { run: current.run, stage: current.stage }
    });
    expect(reset.ok()).toBe(true);
    current = schema.parse(await reset.json());
  }
  const breachesBefore =
    current.providers.find((p) => p.id === "provider-x")?.breachCount ?? Number.NaN;
  await page.goto("/demo");
  const stage = (name: string) =>
    expect(page.getByRole("heading", { name, exact: true })).toBeVisible({ timeout: 120000 });

  await page.getByRole("button", { name: "Start first job", exact: true }).click();
  await stage("Work in progress");
  // Active escrow prevents a reset from abandoning the current run.
  current = schema.parse(await (await request.get("/api/state")).json());
  const abandoned = current.run;
  const midReset = await request.post("/demo/reset", {
    data: { run: current.run, stage: current.stage }
  });
  expect(midReset.status()).toBe(409);
  current = schema.parse(await (await request.get("/api/state")).json());
  expect(current.stage).toBe(1);
  expect(current.run).toBe(abandoned);
  const stale = await request.post("/demo/next", { data: { run: abandoned - 1, stage: 1 } });
  expect(stale.status()).toBe(409);

  await page.reload();
  await stage("Work in progress");
  await page.getByRole("button", { name: "Trigger degraded serving", exact: true }).click();
  await stage("Verification failed");
  await page.getByRole("button", { name: "Resolve with jury", exact: true }).click();
  await stage("Ruling finalized");
  await page.getByRole("button", { name: "Publish & update memory", exact: true }).click();
  await stage("Memory checkpointed");
  await page.getByRole("button", { name: "Run second job", exact: true }).click();
  await stage("Second job settled");

  current = schema.parse(await (await request.get("/api/state")).json());
  expect(current.ruling).toMatchObject({
    outcome: "provider-breached",
    recipient: "customer",
    breachVotes: 4
  });
  expect(current.providers.find((p) => p.id === "provider-x")?.breachCount).toBe(
    breachesBefore + 1
  );
  expect(current.contracts[0]?.priceLamports).toBe(15_000_000);
  expect(current.contracts.every((c) => c.escrowLamports === 0)).toBe(true);
  await page.getByRole("link", { name: /Dispute & precedent/ }).click();
  await expect(page.getByText("0.005 SOL to customer", { exact: true })).toBeVisible();
});
