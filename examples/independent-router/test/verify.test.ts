import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  DEMO_CANARY_COUNT,
  DEMO_CANARY_POOLS,
  DEMO_COMPUTE_OFFERS,
  DEMO_COMPUTE_TASK,
  DEMO_DEGRADED_CANARY_OUTPUTS,
  DEMO_DEGRADED_TASK_OUTPUT,
  DEMO_MODEL_INSTANCES,
  DEMO_PROVIDERS,
  DEMO_TASK_INPUT,
  STOCK_MODEL_MANIFESTS
} from "../../../packages/fixtures/src/index.ts";
import {
  canonicalize,
  manifestRoot,
  sha256Hex,
  type HashHex
} from "../../../packages/protocol/src/index.ts";
import { RESERVATION_CLASSES } from "../../../packages/protocol/src/chain-market.ts";
import {
  buildFailureEvidence,
  type PrecedentChainFacts
} from "../../../packages/protocol/src/learning.ts";
import { signReceipt } from "../../../packages/protocol/src/receipt.ts";
import {
  buildVerificationPolicy,
  checkerCodeRoot,
  drawCanaries,
  resultRoot,
  seedCommitment,
  verificationPolicyRoot,
  type ResultDocument
} from "../../../packages/protocol/src/verifier.ts";
import { decide, type ChainReader } from "../src/verify.ts";

const PROGRAM = "2jRt4n86GVHaW7Ebm1eoKYUBdqyrs3Zie3rwQnvA23uE";
const PRECEDENT = Keypair.generate().publicKey.toBase58();
const DISPUTE = Keypair.generate().publicKey;
const CONTRACT = Keypair.generate().publicKey.toBase58();
const AUTHORITY = Keypair.generate();
const SEED = "d1".repeat(32);
const codeRoot = await checkerCodeRoot((path) => readFile(path, "utf8"));
const at = (kind: string, i: number) => `${kind}-${String(i)}`;

/** A published breach, built only from protocol functions and fixtures. */
async function published() {
  const pool = DEMO_CANARY_POOLS[0];
  const policy = await buildVerificationPolicy({
    codeRoot,
    pool,
    canaryCount: DEMO_CANARY_COUNT,
    seedCommitment: await seedCommitment(SEED)
  });
  const drift = DEMO_DEGRADED_CANARY_OUTPUTS[pool.id] ?? {};
  const result: ResultDocument = {
    kind: "mep.result.v1",
    contract: CONTRACT,
    taskOutput: DEMO_DEGRADED_TASK_OUTPUT,
    canaryOutputs: Object.fromEntries(
      (await drawCanaries(pool, SEED, CONTRACT, DEMO_CANARY_COUNT)).map((c) => [
        c.id,
        drift[c.id] ?? c.referenceOutput
      ])
    )
  };
  const receipt = await signReceipt(
    {
      kind: "mep.receipt.v1",
      signerRole: "provider",
      signer: AUTHORITY.publicKey.toBase58(),
      contract: CONTRACT,
      sequence: 0,
      modelInstance: at("instance", 0),
      requestHash: `sha256:${"0".repeat(64)}`,
      resultRoot: await resultRoot(result),
      startedAt: 1,
      finishedAt: 2,
      tokensIn: 10,
      tokensOut: 20,
      hardwareClaim: "simulated demo daemon"
    },
    AUTHORITY.secretKey
  );
  const contract = {
    address: CONTRACT,
    customerAgent: "agent",
    provider: at("provider", 0),
    providerAuthority: {
      address: AUTHORITY.publicKey.toBase58(),
      publicKey: AUTHORITY.publicKey.toBytes()
    },
    taskRoot: await sha256Hex(canonicalize(DEMO_COMPUTE_TASK)),
    verificationRuleRoot: await verificationPolicyRoot(policy),
    resultRoot: await resultRoot(result),
    status: "breached",
    modelRoot: await manifestRoot(
      STOCK_MODEL_MANIFESTS.find((m) => m.id === pool.stockModelId) ?? STOCK_MODEL_MANIFESTS[0]
    )
  };
  const { evidence, root } = await buildFailureEvidence({
    contract,
    provider: contract.provider,
    deadlineSlot: 10,
    observedSlot: 11,
    material: {
      result,
      receipt,
      taskTerms: DEMO_COMPUTE_TASK,
      taskInput: DEMO_TASK_INPUT,
      policy,
      canaryPool: pool,
      canarySeed: SEED
    },
    runningCodeRoot: codeRoot
  });
  // The program's ruling root, computed independently: domain ‖ dispute ‖ evidence ‖ tally.
  const rulingRoot: HashHex = `sha256:${createHash("sha256")
    .update(Buffer.from("mep.precedent.v1"))
    .update(DISPUTE.toBytes())
    .update(Buffer.from(root.slice(7), "hex"))
    .update(Uint8Array.from([1, 4, 5, 0]))
    .digest("hex")}`;
  const facts: { [K in keyof PrecedentChainFacts]: NonNullable<PrecedentChainFacts[K]> } = {
    precedent: {
      address: PRECEDENT,
      dispute: DISPUTE.toBase58(),
      workContract: CONTRACT,
      rulingRoot
    },
    dispute: {
      address: DISPUTE.toBase58(),
      key: DISPUTE.toBytes(),
      workContract: CONTRACT,
      evidenceRoot: root,
      providerBreached: true,
      noMajority: false,
      breachVotes: 4,
      reveals: 5,
      finalized: true
    },
    contract
  };
  const bundle = {
    kind: "mep.evidence-bundle.v1",
    cluster: "localnet",
    programId: PROGRAM,
    precedent: PRECEDENT,
    evidence,
    stockModels: STOCK_MODEL_MANIFESTS
  };
  return { bundle, facts };
}

async function reader(facts: Awaited<ReturnType<typeof published>>["facts"]): Promise<ChainReader> {
  const roots = await Promise.all(STOCK_MODEL_MANIFESTS.map((m) => manifestRoot(m)));
  return {
    precedent: (address) =>
      Promise.resolve(address === facts.precedent.address ? facts.precedent : null),
    dispute: (address) => Promise.resolve(address === facts.dispute.address ? facts.dispute : null),
    contract: (address) =>
      Promise.resolve(address === facts.contract.address ? facts.contract : null),
    market: () =>
      Promise.resolve({
        providers: DEMO_PROVIDERS.map((p, i) => ({
          address: at("provider", i),
          evidenceRoot: p.evidenceRoot,
          hardwareTrustBps: p.hardwareTrustBps,
          executionTrustBps: p.executionTrustBps,
          breachCount: i === 0 ? 1 : 0
        })),
        modelRecords: roots.map((root, i) => ({ address: at("record", i), manifestRoot: root })),
        modelInstances: DEMO_MODEL_INSTANCES.map((instance, i) => ({
          address: at("instance", i),
          provider: at("provider", i),
          modelRecord: at(
            "record",
            STOCK_MODEL_MANIFESTS.findIndex((m) => m.id === instance.stockModelId)
          ),
          executionCommitment: instance.executionCommitment,
          trustScoreBps: instance.modelTrustBps
        })),
        offers: DEMO_COMPUTE_OFFERS.map((offer, i) => ({
          address: at("offer", i),
          provider: at("provider", i),
          modelInstance: at("instance", i),
          priceLamports: offer.priceLamports,
          expectedLatencyMs: offer.expectedLatencyMs,
          failureProbabilityBps: offer.failureProbabilityBps,
          reservationClass: RESERVATION_CLASSES.indexOf(offer.reservationClass)
        }))
      })
  };
}

describe("independent precedent consumer", () => {
  it("verifies the evidence against the chain and switches its own choice", async () => {
    const { bundle, facts } = await published();
    const decision = await decide(bundle, await reader(facts), PROGRAM, codeRoot);

    expect(decision.precedent).toMatchObject({ providerBreached: true, breachVotes: 4 });
    expect(decision.choiceBefore).toBe(at("offer", 0));
    expect(decision.choiceAfter).toBe(at("offer", 2));
    expect(decision.learnedOverridesBps).toEqual({ [at("provider", 0)]: 2_500 });
    // Not in fixture mode: no simulated tiers, so every offer is H0 with a verified M2.
    expect(decision.before.every((r) => r.trust.hardware === "H0" && r.trust.model === "M2")).toBe(
      true
    );
  });

  it("fails clearly when the evidence is missing, altered, or off-chain roots differ", async () => {
    const { bundle, facts } = await published();
    const chain = await reader(facts);
    await expect(
      decide({ ...bundle, evidence: undefined }, chain, PROGRAM, codeRoot)
    ).rejects.toThrow("Evidence bundle is malformed: evidence");
    await expect(
      decide(
        { ...bundle, evidence: { ...bundle.evidence, observedSlot: 99 } },
        chain,
        PROGRAM,
        codeRoot
      )
    ).rejects.toThrow("Evidence does not match the dispute's evidence root");
    await expect(
      decide(
        bundle,
        await reader({
          ...facts,
          contract: { ...facts.contract, resultRoot: `sha256:${"e".repeat(64)}` }
        }),
        PROGRAM,
        codeRoot
      )
    ).rejects.toThrow("result root");
    await expect(
      decide(
        { ...bundle, precedent: Keypair.generate().publicKey.toBase58() },
        chain,
        PROGRAM,
        codeRoot
      )
    ).rejects.toThrow("not found on-chain");
    await expect(
      decide(bundle, chain, Keypair.generate().publicKey.toBase58(), codeRoot)
    ).rejects.toThrow("this router trusts");
    await expect(decide(bundle, chain, PROGRAM, `sha256:${"f".repeat(64)}`)).rejects.toThrow(
      "Checker code root mismatch"
    );
  });

  it("does not import the demo API", async () => {
    for (const file of ["verify.ts", "rpc.ts", "main.ts"]) {
      const source = await readFile(`examples/independent-router/src/${file}`, "utf8");
      expect(source).not.toMatch(/apps\/api|localhost:3000|127\.0\.0\.1:3000/);
    }
  });
});
