import { test, expect } from "@playwright/test";
import { z } from "zod";
const schema = z.object({
  stage: z.number(),
  run: z.number(),
  busy: z.boolean(),
  before: z.array(z.object({ providerId: z.string() })),
  after: z.array(z.object({ providerId: z.string() })),
  agent: z.object({
    checkpoints: z.number(),
    memoryRoot: z.string(),
    initialMemoryRoot: z.string()
  }),
  contracts: z.array(
    z.object({ escrowLamports: z.number(), priceLamports: z.number(), status: z.string() })
  ),
  providers: z.array(z.object({ id: z.string(), breachCount: z.number() })),
  ruling: z
    .object({ outcome: z.string(), recipient: z.string(), breachVotes: z.number() })
    .optional(),
  votes: z.array(z.object({ revealed: z.boolean() })),
  rulingRoot: z.string().optional(),
  receipts: z.array(z.object({ signature: z.string() }))
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
  const premature = await request.post("/demo/preempt", { data: { run: current.run, stage: 0 } });
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
  expect(current.before[0]?.providerId).toBe("provider-x");
  expect(current.after[0]?.providerId).toBe("provider-z");
  expect(current.agent.checkpoints).toBe(1);
  expect(current.agent.memoryRoot).not.toBe(current.agent.initialMemoryRoot);
  expect(current.contracts).toHaveLength(4);
  expect(current.contracts.every((c) => c.escrowLamports === 0)).toBe(true);
  expect(current.contracts.filter((c) => c.status === "settled")).toHaveLength(3);
  expect(current.votes.filter((v) => v.revealed)).toHaveLength(5);
  expect(current.rulingRoot).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(current.receipts.length).toBeGreaterThan(30);
  await page.screenshot({ path: "test-results/dashboard-complete.png", fullPage: true });
  await page.getByRole("link", { name: /Compute market/ }).click();
  await expect(page.getByRole("heading", { name: "The price of reliability." })).toBeVisible();
  await page.getByText("Inspect every term in the deterministic score").click();
  await expect(page.getByRole("columnheader", { name: "Failure loss", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Agent passports/ }).click();
  await expect(
    page.getByRole("heading", { name: "Identity stays. Experience evolves." })
  ).toBeVisible();
  await page.getByRole("link", { name: /Dispute & precedent/ }).click();
  await expect(page.getByText("Provider breached", { exact: true })).toBeVisible();
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
  // A run can be abandoned mid-dispute-window; the next run starts from fresh accounts.
  current = schema.parse(await (await request.get("/api/state")).json());
  const abandoned = current.run;
  const midReset = await request.post("/demo/reset", {
    data: { run: current.run, stage: current.stage }
  });
  expect(midReset.ok()).toBe(true);
  current = schema.parse(await midReset.json());
  expect(current.stage).toBe(0);
  expect(current.run).not.toBe(abandoned);
  const stale = await request.post("/demo/next", { data: { run: abandoned, stage: 1 } });
  expect(stale.status()).toBe(409);

  await page.reload();
  await page.getByRole("button", { name: "Start first job", exact: true }).click();
  await stage("Work in progress");
  await page.getByRole("button", { name: "Trigger provider failure", exact: true }).click();
  await stage("Provider preempted");
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
    breachVotes: 5
  });
  expect(current.providers.find((p) => p.id === "provider-x")?.breachCount).toBe(
    breachesBefore + 1
  );
  expect(current.contracts[0]?.priceLamports).toBe(15_000_000);
  expect(current.contracts.every((c) => c.escrowLamports === 0)).toBe(true);
  await page.getByRole("link", { name: /Dispute & precedent/ }).click();
  await expect(page.getByText("0.0050 SOL to customer", { exact: true })).toBeVisible();
});
