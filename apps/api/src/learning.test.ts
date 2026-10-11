import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Keypair } from "@solana/web3.js";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DEMO_CANARY_COUNT,
  DEMO_COMPUTE_OFFERS,
  DEMO_COMPUTE_TASK,
  DEMO_MODEL_INSTANCES,
  DEMO_PROVIDERS,
  DEMO_SIMULATED_HARDWARE_TIERS,
  DEMO_TASK_INPUT,
  STOCK_MODEL_MANIFESTS
} from "../../../packages/fixtures/src/index.ts";
import {
  canonicalize,
  manifestRoot,
  sha256Hex,
  type HashHex
} from "../../../packages/protocol/src/index.ts";
import {
  RESERVATION_CLASSES,
  marketFromChain,
  type ChainMarketAccounts
} from "../../../packages/protocol/src/chain-market.ts";
import {
  buildFailureEvidence,
  genesisMemory,
  learnFromPrecedent,
  verifyPrecedent as verifyPrecedentAgainst,
  type ContractCommitments,
  verifyAgainstContract,
  type PrecedentChainFacts,
  type VerificationMaterial
} from "../../../packages/protocol/src/learning.ts";
import { ReceiptReplayGuard } from "../../../packages/protocol/src/receipt.ts";
import {
  buildVerificationPolicy,
  checkerCodeRoot,
  drawCanaries,
  resultRoot,
  seedCommitment,
  verificationPolicyRoot
} from "../../../packages/protocol/src/verifier.ts";
import { poolFor, serveJob, type ServingMode } from "./provider-daemon.ts";
import { policy, rankMarket } from "./scenario.ts";
import { explainRuling, type RulingFacts } from "./summary.ts";

const LEDGER_LITE = (() => {
  const model = STOCK_MODEL_MANIFESTS.find((m) => m.id === "stock-model-ledger-lite");
  if (!model) throw new Error("ledger-lite fixture missing");
  return model;
})();
const verifyPrecedent = (
  facts: PrecedentChainFacts,
  evidence: Parameters<typeof verifyPrecedentAgainst>[1],
  root: HashHex
) => verifyPrecedentAgainst(facts, evidence, root, STOCK_MODEL_MANIFESTS);

// Chain-shaped accounts built from the fixtures, keyed by stand-in addresses, as
// DemoChain.fetchMarket decodes them from the validator.
const address = (kind: string, i: number) => `${kind}-${"xyz"[i] ?? "?"}-address`;
async function chainAccounts(): Promise<ChainMarketAccounts> {
  const roots = await Promise.all(STOCK_MODEL_MANIFESTS.map((m) => manifestRoot(m)));
  return {
    providers: DEMO_PROVIDERS.map((p, i) => ({
      address: address("provider", i),
      evidenceRoot: p.evidenceRoot,
      hardwareTrustBps: p.hardwareTrustBps,
      executionTrustBps: p.executionTrustBps,
      breachCount: 0
    })),
    modelRecords: roots.map((root, i) => ({
      address: `model-record-${String(i)}`,
      manifestRoot: root
    })),
    modelInstances: DEMO_MODEL_INSTANCES.map((instance, i) => ({
      address: address("instance", i),
      provider: address("provider", i),
      modelRecord: `model-record-${String(
        STOCK_MODEL_MANIFESTS.findIndex((m) => m.id === instance.stockModelId)
      )}`,
      executionCommitment: instance.executionCommitment,
      trustScoreBps: instance.modelTrustBps
    })),
    offers: DEMO_COMPUTE_OFFERS.map((offer, i) => ({
      address: address("offer", i),
      provider: address("provider", i),
      modelInstance: address("instance", i),
      priceLamports: offer.priceLamports,
      expectedLatencyMs: offer.expectedLatencyMs,
      failureProbabilityBps: offer.failureProbabilityBps,
      reservationClass: RESERVATION_CLASSES.indexOf(offer.reservationClass)
    }))
  };
}
/** As DemoChain does in fixture mode: only its own providers carry simulated tiers. */
const fixtureMarket = async () =>
  marketFromChain(await chainAccounts(), STOCK_MODEL_MANIFESTS, {
    simulatedHardwareTier: (provider) => {
      const fixture =
        DEMO_PROVIDERS[[0, 1, 2].find((i) => address("provider", i) === provider.address) ?? -1];
      return fixture ? DEMO_SIMULATED_HARDWARE_TIERS[fixture.id] : undefined;
    }
  });
const PROVIDER_X = address("provider", 0);
const PROVIDER_Z = address("provider", 2);
const CONTRACT = "job-1-contract-address";
const AGENT = "agent-a-passport";
const TWIN = "agent-a-twin-passport";
const STOCK_ROOT: HashHex = `sha256:${"a".repeat(64)}`;
const DISPUTE_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
// Disposable key standing in for Provider X's on-chain provider authority.
const PROVIDER_AUTHORITY = Keypair.generate();
const SEED = "c0".repeat(32);
const codeRoot = await checkerCodeRoot((path) => readFile(path, "utf8"));

/** The program's ruling root, computed independently with node:crypto. */
function programRulingRoot(evidenceRoot: HashHex, tally: number[]): HashHex {
  return `sha256:${createHash("sha256")
    .update(Buffer.from("mep.precedent.v1"))
    .update(DISPUTE_KEY)
    .update(Buffer.from(evidenceRoot.slice(7), "hex"))
    .update(Uint8Array.from(tally))
    .digest("hex")}`;
}

/** One served job: the committed contract roots and the customer's off-chain material. */
async function servedJob(mode: ServingMode, signer = PROVIDER_AUTHORITY) {
  const pool = poolFor("stock-model-ledger-lite");
  const committedPolicy = await buildVerificationPolicy({
    codeRoot,
    pool,
    canaryCount: DEMO_CANARY_COUNT,
    seedCommitment: await seedCommitment(SEED)
  });
  const drawn = await drawCanaries(pool, SEED, CONTRACT, DEMO_CANARY_COUNT);
  const { result, receipt } = await serveJob(
    {
      kind: "mep.job-request.v1",
      contract: CONTRACT,
      modelInstance: address("instance", 0),
      taskInputRoot: DEMO_COMPUTE_TASK.inputRoot,
      prompts: drawn.map(({ id, prompt }) => ({ id, prompt }))
    },
    "stock-model-ledger-lite",
    mode,
    { address: signer.publicKey.toBase58(), secretKey: signer.secretKey },
    () => 1_791_130_000_000
  );
  const contract: ContractCommitments = {
    address: CONTRACT,
    providerAuthority: {
      address: PROVIDER_AUTHORITY.publicKey.toBase58(),
      publicKey: PROVIDER_AUTHORITY.publicKey.toBytes()
    },
    taskRoot: await sha256Hex(canonicalize(DEMO_COMPUTE_TASK)),
    verificationRuleRoot: await verificationPolicyRoot(committedPolicy),
    resultRoot: await resultRoot(result)
  };
  const material: VerificationMaterial = {
    result,
    receipt,
    taskTerms: DEMO_COMPUTE_TASK,
    taskInput: DEMO_TASK_INPUT,
    policy: committedPolicy,
    canaryPool: pool,
    canarySeed: SEED
  };
  return { contract, material };
}

/** Provider X's degraded serving fails verification; the jury finds a breach 4–1. */
async function breachScenario() {
  const { contract, material } = await servedJob("degraded");
  const { evidence, root } = await buildFailureEvidence({
    contract,
    provider: PROVIDER_X,
    deadlineSlot: 100,
    observedSlot: 101,
    material,
    runningCodeRoot: codeRoot
  });
  const facts: { [K in keyof PrecedentChainFacts]: NonNullable<PrecedentChainFacts[K]> } = {
    precedent: {
      address: "precedent-address",
      dispute: "dispute-address",
      workContract: CONTRACT,
      rulingRoot: programRulingRoot(root, [1, 4, 5, 0])
    },
    dispute: {
      address: "dispute-address",
      key: DISPUTE_KEY,
      workContract: CONTRACT,
      evidenceRoot: root,
      providerBreached: true,
      noMajority: false,
      breachVotes: 4,
      reveals: 5,
      finalized: true
    },
    contract: {
      ...contract,
      customerAgent: AGENT,
      provider: PROVIDER_X,
      status: "breached",
      modelRoot: await manifestRoot(LEDGER_LITE)
    }
  };
  return { evidence, facts, contract, material };
}

afterEach(() => vi.unstubAllEnvs());
describe("on-chain ranking, precedent, and memory regression", () => {
  it("ranks fetched offers on published claims, so the cheaper X wins first", async () => {
    const market = await fixtureMarket();
    const ranked = rankMarket(market);
    expect(market.rejected).toEqual([]);
    expect(ranked.map((r) => [r.providerId, r.totalExpectedCostLamports])).toEqual([
      [PROVIDER_X, 7_568_000n],
      [PROVIDER_Z, 12_117_710n],
      [address("provider", 1), 13_592_420n]
    ]);
  });

  it("switches the harmed agent and an uninvolved twin from X to Z after a verified precedent", async () => {
    const market = await fixtureMarket();
    const originalPolicy = canonicalize(policy);
    const { evidence, facts } = await breachScenario();
    const precedent = await verifyPrecedent(facts, evidence, codeRoot);
    const agent = await genesisMemory(AGENT, STOCK_ROOT);
    const twin = await genesisMemory(TWIN, STOCK_ROOT);
    expect(rankMarket(market, agent.memory.failureProbabilityOverridesBps)[0]?.providerId).toBe(
      PROVIDER_X
    );
    expect(rankMarket(market, twin.memory.failureProbabilityOverridesBps)[0]?.providerId).toBe(
      PROVIDER_X
    );

    const learned = await learnFromPrecedent(agent.memory, precedent);
    const twinLearned = await learnFromPrecedent(twin.memory, precedent);
    const after = rankMarket(market, learned.memory.failureProbabilityOverridesBps);
    expect(after[0]?.providerId).toBe(PROVIDER_Z);
    expect(after[0]?.priceLamports).toBeGreaterThan(5_000_000n);
    expect(
      rankMarket(market, twinLearned.memory.failureProbabilityOverridesBps)[0]?.providerId
    ).toBe(PROVIDER_Z);
    expect(learned.memory.failureProbabilityOverridesBps).toEqual({ [PROVIDER_X]: 2_500 });
    expect(learned.memory.precedents[0]?.relation).toBe("party");
    expect(twinLearned.memory.precedents[0]?.relation).toBe("observer");
    expect(learned.memory.previousRoot).toBe(agent.root);
    expect(twinLearned.root).not.toBe(twin.root);
    expect(twinLearned.root).not.toBe(learned.root);
    expect(await learnFromPrecedent(agent.memory, precedent)).toEqual(learned);
    expect(canonicalize(policy)).toBe(originalPolicy);
  });

  it("refuses to learn when the precedent is missing or its ruling root does not match", async () => {
    const { evidence, facts } = await breachScenario();
    await expect(
      verifyPrecedent({ ...facts, precedent: null }, evidence, codeRoot)
    ).rejects.toThrow("Precedent record is missing");
    await expect(
      verifyPrecedent(
        { ...facts, precedent: { ...facts.precedent, rulingRoot: `sha256:${"0".repeat(64)}` } },
        evidence,
        codeRoot
      )
    ).rejects.toThrow("ruling_root mismatch");
    // A precedent that claims a different tally than the dispute recorded.
    await expect(
      verifyPrecedent(
        { ...facts, dispute: { ...facts.dispute, breachVotes: 5 } },
        evidence,
        codeRoot
      )
    ).rejects.toThrow("ruling_root mismatch");
    await expect(
      verifyPrecedent(
        { ...facts, dispute: { ...facts.dispute, finalized: false } },
        evidence,
        codeRoot
      )
    ).rejects.toThrow("not finalized");
    await expect(
      verifyPrecedent(facts, { ...evidence, observedSlot: 102 }, codeRoot)
    ).rejects.toThrow("evidence root");
  });

  it("rejects evidence whose policy, receipt signer, or checker differs from the contract's", async () => {
    const { evidence, facts } = await breachScenario();
    // The evidence carries the committed policy; a contract committing another policy rejects it.
    expect(evidence.verification.policyRoot).toBe(facts.contract.verificationRuleRoot);
    await expect(
      verifyPrecedent(
        {
          ...facts,
          contract: { ...facts.contract, verificationRuleRoot: `sha256:${"1".repeat(64)}` }
        },
        evidence,
        codeRoot
      )
    ).rejects.toThrow("verification rule root");
    const impostor = Keypair.generate();
    await expect(
      verifyPrecedent(
        {
          ...facts,
          contract: {
            ...facts.contract,
            providerAuthority: {
              address: impostor.publicKey.toBase58(),
              publicKey: impostor.publicKey.toBytes()
            }
          }
        },
        evidence,
        codeRoot
      )
    ).rejects.toThrow("different contract or provider");
    await expect(verifyPrecedent(facts, evidence, `sha256:${"2".repeat(64)}`)).rejects.toThrow(
      "Checker code root mismatch"
    );
    // Canaries must come from the pool of the model the contract actually hired.
    const vision = STOCK_MODEL_MANIFESTS.find((m) => m.id !== LEDGER_LITE.id);
    if (!vision) throw new Error("second stock model fixture missing");
    await expect(
      verifyPrecedent(
        { ...facts, contract: { ...facts.contract, modelRoot: await manifestRoot(vision) } },
        evidence,
        codeRoot
      )
    ).rejects.toThrow(`but the contract hired ${vision.id}`);
    await expect(
      verifyPrecedent(
        { ...facts, contract: { ...facts.contract, modelRoot: null } },
        evidence,
        codeRoot
      )
    ).rejects.toThrow("names no contracted model");
  });

  it("raises risk again for a second breach and rejects replaying one precedent", async () => {
    const { evidence, facts } = await breachScenario();
    const precedent = await verifyPrecedent(facts, evidence, codeRoot);
    const first = await learnFromPrecedent(
      (await genesisMemory(AGENT, STOCK_ROOT)).memory,
      precedent
    );
    await expect(learnFromPrecedent(first.memory, precedent)).rejects.toThrow("already");
    const second = await learnFromPrecedent(first.memory, {
      ...precedent,
      account: "precedent-2",
      rulingRoot: `sha256:${"b".repeat(64)}`
    });
    expect(second.memory.checkpoint).toBe(2);
    expect(second.memory.previousRoot).toBe(first.root);
    expect(second.memory.failureProbabilityOverridesBps).toEqual({ [PROVIDER_X]: 5_000 });
    await expect(
      learnFromPrecedent(first.memory, {
        ...precedent,
        providerBreached: false,
        rulingRoot: `sha256:${"c".repeat(64)}`
      })
    ).rejects.toThrow("breach");
  });

  it("claims a receipt only after verification succeeds, so a failed step can be retried", async () => {
    const { contract, material } = await servedJob("reference");
    const guard = new ReceiptReplayGuard();
    await expect(
      verifyAgainstContract(contract, material, `sha256:${"2".repeat(64)}`, guard)
    ).rejects.toThrow("code root");
    const { verification } = await verifyAgainstContract(contract, material, codeRoot, guard);
    expect(verification.passed).toBe(true);
    await expect(verifyAgainstContract(contract, material, codeRoot, guard)).rejects.toThrow(
      "Receipt replay"
    );
  });

  it("builds evidence only for a provider-signed result that fails its policy", async () => {
    const degraded = await servedJob("degraded");
    const reference = await servedJob("reference");
    const base = {
      provider: PROVIDER_X,
      deadlineSlot: 100,
      observedSlot: 101,
      runningCodeRoot: codeRoot
    };
    const { evidence } = await buildFailureEvidence({ ...base, ...degraded });
    expect(evidence.verification.passed).toBe(false);
    expect(evidence.receipt.signerRole).toBe("provider");
    expect(evidence.verification.taskChecks.filter((c) => !c.passed).map((c) => c.id)).toEqual([
      "required-fields",
      "tool-calls-valid",
      "fields-in-source",
      "answers-consistent"
    ]);
    await expect(buildFailureEvidence({ ...base, ...reference })).rejects.toThrow(
      "passed its verification policy"
    );
    await expect(
      buildFailureEvidence({
        ...base,
        ...degraded,
        contract: { ...degraded.contract, resultRoot: reference.contract.resultRoot }
      })
    ).rejects.toThrow("on-chain result root");
    await expect(buildFailureEvidence({ ...base, ...degraded, observedSlot: 100 })).rejects.toThrow(
      "deadline"
    );
    // A result signed by a key other than the contract's provider authority is not evidence.
    const forged = await servedJob("degraded", Keypair.generate());
    await expect(buildFailureEvidence({ ...base, ...forged })).rejects.toThrow(
      "not the contract's provider authority"
    );
  });
});
const facts: RulingFacts = {
  provider: "Provider X",
  outcome: "provider-breached",
  recipient: "customer",
  amountLamports: 1,
  breachVotes: 5,
  reveals: 5
};
describe("Gemini advisory boundary", () => {
  it("honors the configured model and excludes thought text", async () => {
    vi.stubEnv("GEMINI_API_KEY", "unit-test-not-a-real-key");
    vi.stubEnv("GEMINI_MODEL", "custom-model");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "Internal reasoning", thought: true },
                  { text: "Final explanation" }
                ]
              }
            }
          ]
        })
      )
    );
    const result = await explainRuling(facts, fetcher);
    expect(result).toEqual({ text: "Final explanation", model: "custom-model", advisory: true });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/custom-model:generateContent"
    );
  });
  it("rejects malformed and blocked responses and reports HTTP failures safely", async () => {
    vi.stubEnv("GEMINI_API_KEY", "unit-test-not-a-real-key");
    for (const [body, status, message] of [
      [{ candidates: "invalid" }, 200, "malformed"],
      [{ promptFeedback: { blockReason: "SAFETY" } }, 200, "no summary"],
      ["upstream secret details", 403, "authentication or permission denied"]
    ] as const) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify(body), { status }));
      await expect(explainRuling(facts, fetcher)).rejects.toThrow(message);
    }
  });
  it("extracts text without executing model content or changing settlement", async () => {
    vi.stubEnv("GEMINI_API_KEY", "unit-test-not-a-real-key");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "Five votes confirmed the breach." }] }
            }
          ]
        }),
        { status: 200 }
      )
    );
    const input = { ...facts, amountLamports: 5000000 };
    const result = await explainRuling(input, fetcher);
    expect(result.advisory).toBe(true);
    expect(result.text).toContain("Five votes");
    expect(input.amountLamports).toBe(5000000);
    const body = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe("string");
    expect(body).toContain('\\"outcome\\":\\"provider-breached\\"');
    expect(body).toContain('"maxOutputTokens":1024');
    expect(body).toContain('"systemInstruction"');
    expect(fetcher.mock.calls[0]?.[0]).toContain("generativelanguage.googleapis.com");
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-goog-api-key": "unit-test-not-a-real-key"
    });
  });
  it("reports quota failures, malformed responses, and missing keys", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(explainRuling(facts)).rejects.toThrow("not configured");
    vi.stubEnv("GEMINI_API_KEY", "unit-test-not-a-real-key");
    const quota = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 })
      );
    await expect(explainRuling(facts, quota)).rejects.toThrow("quota or rate limit");
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ candidates: [] })));
    await expect(explainRuling(facts, malformed)).rejects.toThrow("no summary");
  });
});
