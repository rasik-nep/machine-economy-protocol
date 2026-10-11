import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  DEMO_CANARY_COUNT,
  DEMO_CANARY_POOLS,
  DEMO_COMPUTE_TASK,
  DEMO_DEGRADED_CANARY_OUTPUTS,
  DEMO_DEGRADED_TASK_OUTPUT,
  DEMO_TASK_INPUT,
  DEMO_TASK_OUTPUT
} from "../../fixtures/src/index.ts";
import {
  buildVerificationPolicy,
  checkerCodeRoot,
  drawCanaries,
  resultRoot,
  runTaskChecks,
  runVerification,
  seedCommitment,
  taskInputRoot,
  verificationPolicyRoot,
  type ResultDocument,
  type VerificationPolicy
} from "../src/verifier.ts";

const pool = DEMO_CANARY_POOLS[0];
const CONTRACT = "job-contract";
const SEED = "a1".repeat(32);
const codeRoot = await checkerCodeRoot((path) => readFile(path, "utf8"));

async function policy(overrides: Partial<VerificationPolicy> = {}): Promise<VerificationPolicy> {
  return {
    ...(await buildVerificationPolicy({
      codeRoot,
      pool,
      canaryCount: DEMO_CANARY_COUNT,
      seedCommitment: await seedCommitment(SEED)
    })),
    ...overrides
  };
}

/** A result whose canary answers are the reference build's (or a degraded host's). */
async function result(taskOutput: string, mode: "reference" | "degraded" = "reference") {
  const drawn = await drawCanaries(pool, SEED, CONTRACT, DEMO_CANARY_COUNT);
  const drift = mode === "degraded" ? (DEMO_DEGRADED_CANARY_OUTPUTS[pool.id] ?? {}) : {};
  return {
    kind: "mep.result.v1",
    contract: CONTRACT,
    taskOutput,
    canaryOutputs: Object.fromEntries(drawn.map((c) => [c.id, drift[c.id] ?? c.referenceOutput]))
  } satisfies ResultDocument;
}

async function verify(delivered: ResultDocument, committed?: VerificationPolicy) {
  return runVerification({
    policy: committed ?? (await policy()),
    runningCodeRoot: codeRoot,
    pool,
    seed: SEED,
    contract: CONTRACT,
    taskInput: DEMO_TASK_INPUT,
    result: delivered
  });
}

describe("task-output verification under a committed policy", () => {
  it("keeps the fixture task root in sync with the task input", async () => {
    expect(await taskInputRoot(DEMO_TASK_INPUT)).toBe(DEMO_COMPUTE_TASK.inputRoot);
  });

  it("passes the reference build's output and records the committed policy root", async () => {
    const committed = await policy();
    const check = await verify(await result(DEMO_TASK_OUTPUT), committed);

    expect(check.passed).toBe(true);
    expect(check.taskScoreBps).toBe(10_000);
    expect(check.canaryScoreBps).toBe(10_000);
    expect(check.policyRoot).toBe(await verificationPolicyRoot(committed));
    expect(check.drawnCanaries).toHaveLength(DEMO_CANARY_COUNT);
    expect(await verify(await result(DEMO_TASK_OUTPUT), committed)).toEqual(check);
  });

  it("fails correct canaries paired with a fabricated task output", async () => {
    const fabricated = JSON.stringify({
      schema: "mep.evidence-summary.v1",
      invoice: { id: "INV-1042", total: "999.99", currency: "USD" },
      liability: { clause: "7", capLamports: "5,000,000" },
      exhibits: [{ id: "E-9", finding: "A forged exhibit." }],
      toolCalls: [{ tool: "sum_invoice", arguments: { invoice_id: "INV-1042", currency: "USD" } }],
      summary: "Invoice INV-1042 totals 999.99 USD."
    });
    const check = await verify(await result(fabricated));

    expect(check.canaryScoreBps).toBe(10_000);
    expect(check.passed).toBe(false);
    expect(check.taskChecks.filter((c) => !c.passed).map((c) => c.id)).toEqual([
      "fields-in-source",
      "answers-consistent"
    ]);
    expect(check.taskChecks.find((c) => c.id === "fields-in-source")?.detail).toContain(
      "invoice.total"
    );
  });

  it.each([
    ["line-item total", { invoice: { id: "INV-1042", total: "300.00", currency: "USD" } }],
    ["clause number as cap", { liability: { clause: "7", capLamports: "9" } }],
    ["wrong liability clause", { liability: { clause: "9", capLamports: "5000000" } }],
    ["fabricated finding", { exhibits: [{ id: "E-3", finding: "No damage occurred" }] }],
    ["fabricated summary", { summary: "No liability exists" }]
  ])("rejects %s even when all canaries pass", async (_name, change) => {
    const output: Record<string, unknown> = JSON.parse(DEMO_TASK_OUTPUT) as Record<string, unknown>;
    const check = await verify(await result(JSON.stringify({ ...output, ...change })));
    expect(check.canaryScoreBps).toBe(10_000);
    expect(check.passed).toBe(false);
  });

  it("passes an honest output with formatting differences", async () => {
    // Reordered keys, indentation, lowercase currency, a trailing-zero-free total,
    // and canary answers with different case, spacing, and final punctuation.
    const reformatted = JSON.stringify(
      {
        toolCalls: [
          { arguments: { currency: "usd", invoice_id: "INV-1042" }, tool: "sum_invoice" }
        ],
        summary:
          "Invoice INV-1042 totals 418.2 USD. Clause 7 caps liability at 5000000 lamports per job. Exhibit E-3 shows a damaged pallet; the shipping label is intact.",
        schema: "mep.evidence-summary.v1",
        exhibits: [{ finding: "Damaged pallet, the shipping label is intact", id: "e-3" }],
        liability: { capLamports: "5000000", clause: "7" },
        invoice: { currency: "usd", id: "inv-1042", total: "418.2" }
      },
      null,
      2
    );
    const delivered = await result(reformatted);
    const canaryOutputs = Object.fromEntries(
      Object.entries(delivered.canaryOutputs).map(([id, output]) => [
        id,
        output.startsWith("{")
          ? JSON.stringify(JSON.parse(output) as unknown, null, 1)
          : `  ${output.replace(/\.$/, "").toUpperCase()}  `
      ])
    );
    const check = await verify({ ...delivered, canaryOutputs });

    expect(check.taskChecks.every((c) => c.passed)).toBe(true);
    expect(check.canaryScoreBps).toBe(10_000);
    expect(check.passed).toBe(true);
  });

  it("fails the degraded host on both task checks and drifted canaries", async () => {
    const check = await verify(await result(DEMO_DEGRADED_TASK_OUTPUT, "degraded"));

    expect(check.passed).toBe(false);
    expect(check.taskScoreBps).toBe(2_000);
    // Six of eight pool canaries drift, so every draw of three includes one.
    expect(check.canaries.some((c) => c.scoreBps < 10_000)).toBe(true);
    expect(runTaskChecks(DEMO_TASK_INPUT, DEMO_DEGRADED_TASK_OUTPUT).map((c) => c.passed)).toEqual([
      true,
      false,
      false,
      false,
      false
    ]);
  });

  it("gives field-level credit on a structured canary instead of exact hash match", async () => {
    const drawn = await drawCanaries(pool, SEED, CONTRACT, pool.challenges.length);
    const everything = {
      kind: "mep.result.v1",
      contract: CONTRACT,
      taskOutput: DEMO_TASK_OUTPUT,
      canaryOutputs: {
        ...Object.fromEntries(drawn.map((c) => [c.id, c.referenceOutput])),
        "invoice-tool-call": '{"tool":"sum_invoice","arguments":{"invoice_id":"INV-1042"}}'
      }
    } satisfies ResultDocument;
    const check = await verify(
      everything,
      await policy({
        sampling: { ...(await policy()).sampling, canaryCount: pool.challenges.length }
      })
    );
    // Three reference fields, two delivered: 2 of 3 field paths match.
    expect(check.canaries.find((c) => c.challengeId === "invoice-tool-call")?.scoreBps).toBe(6_666);
  });

  it("does not credit flattened keys or ignore empty containers in structured canaries", async () => {
    const challenges = [
      { id: "nested", prompt: "nested", referenceOutput: '{"a":{"b":"1"}}' },
      { id: "empty", prompt: "empty", referenceOutput: "{}" },
      { id: "list", prompt: "list", referenceOutput: '{"a":"1","b":[]}' }
    ];
    const custom = { ...pool, challenges };
    const committed = {
      ...(await buildVerificationPolicy({
        codeRoot,
        pool: custom,
        canaryCount: challenges.length,
        seedCommitment: await seedCommitment(SEED)
      }))
    };
    const delivered = {
      ...(await result(DEMO_TASK_OUTPUT)),
      canaryOutputs: { nested: '{"a.b":"1"}', empty: "{}", list: '{"a":"1"}' }
    } satisfies ResultDocument;
    const check = await runVerification({
      policy: committed,
      runningCodeRoot: codeRoot,
      pool: custom,
      seed: SEED,
      contract: CONTRACT,
      taskInput: DEMO_TASK_INPUT,
      result: delivered
    });
    const score = (id: string) => check.canaries.find((c) => c.challengeId === id)?.scoreBps;
    expect(score("nested")).toBe(0);
    expect(score("empty")).toBe(10_000);
    expect(score("list")).toBe(5_000);
    expect(Number.isFinite(check.scoreBps)).toBe(true);
  });

  it("passes a score exactly at the threshold and fails one basis point above it", async () => {
    // One canary fully wrong: canary score 6666, total 7000 + floor(6666 * 0.3) = 8999.
    const delivered = await result(DEMO_TASK_OUTPUT);
    const [first = ""] = Object.keys(delivered.canaryOutputs);
    const wrong = { ...delivered, canaryOutputs: { ...delivered.canaryOutputs, [first]: "?" } };
    const scored = await verify(wrong);
    expect(scored.scoreBps).toBe(8_999);
    expect(scored.passed).toBe(false);

    const atThreshold = await verify(wrong, await policy({ thresholdBps: 8_999 }));
    expect(atThreshold).toMatchObject({ scoreBps: 8_999, thresholdBps: 8_999, passed: true });
    const above = await verify(wrong, await policy({ thresholdBps: 9_000 }));
    expect(above.passed).toBe(false);
  });

  it("draws canaries deterministically from the hidden pool", async () => {
    const a = await drawCanaries(pool, SEED, CONTRACT, 3);
    expect(await drawCanaries(pool, SEED, CONTRACT, 3)).toEqual(a);
    expect(new Set(a.map((c) => c.id)).size).toBe(3);
    const others = await Promise.all(
      ["b2", "c3", "d4", "e5"].map((byte) => drawCanaries(pool, byte.repeat(32), CONTRACT, 3))
    );
    expect(others.some((draw) => canon(draw) !== canon(a))).toBe(true);
  });

  it("rejects a seed, pool, or checker that differs from the committed policy", async () => {
    const delivered = await result(DEMO_TASK_OUTPUT);
    const committed = await policy();
    const base = {
      policy: committed,
      runningCodeRoot: codeRoot,
      pool,
      seed: SEED,
      contract: CONTRACT,
      taskInput: DEMO_TASK_INPUT,
      result: delivered
    };
    await expect(runVerification({ ...base, seed: "ff".repeat(32) })).rejects.toThrow(
      "seed commitment"
    );
    await expect(runVerification({ ...base, pool: DEMO_CANARY_POOLS[1] })).rejects.toThrow(
      "pool root"
    );
    await expect(
      runVerification({ ...base, runningCodeRoot: `sha256:${"0".repeat(64)}` })
    ).rejects.toThrow("Checker code root mismatch");
    await expect(
      runVerification({ ...base, result: { ...delivered, contract: "other" } })
    ).rejects.toThrow("another contract");
    await expect(
      runVerification({ ...base, policy: { ...committed, thresholdBps: 10_001 } })
    ).rejects.toThrow("thresholdBps");
  });

  it("binds result roots to every field", async () => {
    const delivered = await result(DEMO_TASK_OUTPUT);
    expect(await resultRoot(delivered)).not.toBe(
      await resultRoot({ ...delivered, taskOutput: "other summary" })
    );
  });
});

const canon = (value: unknown) => JSON.stringify(value);
