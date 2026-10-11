import { describe, expect, it } from "vitest";

import {
  DEMO_COMPUTE_OFFERS,
  DEMO_MODEL_INSTANCES,
  DEMO_OFFER_TRUST,
  DEMO_PROVIDERS,
  STOCK_AGENT_MANIFESTS,
  STOCK_MODEL_MANIFESTS
} from "../../fixtures/src/index.ts";
import { manifestRoot, rankComputeOffers, tiersOf } from "../src/index.js";
import { marketFromChain, type ChainMarketAccounts } from "../src/chain-market.ts";
import { jobExecutionTrust } from "../src/trust.ts";

// A provider that committed an attestation document's hash in its evidence_root.
const ATTESTATION_HASH = `sha256:${"a7".repeat(32)}` as const;

async function realOffer(): Promise<ChainMarketAccounts> {
  return {
    providers: [
      {
        address: "real-provider",
        evidenceRoot: ATTESTATION_HASH,
        hardwareTrustBps: 9_900,
        executionTrustBps: 9_900,
        breachCount: 0
      }
    ],
    modelRecords: [
      { address: "record-1", manifestRoot: await manifestRoot(STOCK_MODEL_MANIFESTS[0]) }
    ],
    modelInstances: [
      {
        address: "instance-1",
        provider: "real-provider",
        modelRecord: "record-1",
        executionCommitment: `sha256:${"b".repeat(64)}`,
        trustScoreBps: 9_900
      }
    ],
    offers: [
      {
        address: "real-offer",
        provider: "real-provider",
        modelInstance: "instance-1",
        priceLamports: 6_000_000,
        expectedLatencyMs: 1_000,
        failureProbabilityBps: 100,
        reservationClass: 2
      }
    ]
  };
}

describe("honest H/M/E trust labels", () => {
  it("labels a real offer with an attestation hash H0 unverified, with an earned M2", async () => {
    const market = await marketFromChain(await realOffer(), STOCK_MODEL_MANIFESTS, {
      // Fixture mode only names the demo's own providers; this one is not among them.
      simulatedHardwareTier: () => undefined
    });
    const trust = market.trust["real-offer"];
    expect(trust?.hardware).toMatchObject({ tier: "H0", status: "unverified" });
    expect(trust?.model).toMatchObject({ tier: "M2", status: "verified" });
    expect(trust?.execution).toMatchObject({ tier: "E0", status: "unverified" });
    // Without fixture mode at all, the result is the same.
    const plain = await marketFromChain(await realOffer(), STOCK_MODEL_MANIFESTS);
    expect(plain.trust["real-offer"]?.hardware.tier).toBe("H0");
  });

  it("shows Provider Z's H3 only as a simulated fixture tier", () => {
    const z = DEMO_OFFER_TRUST["offer-z-vision-dedicated"];
    expect(z?.hardware).toMatchObject({ tier: "H3", status: "simulated" });
    expect(z?.hardware.basis).toContain("simulated");
    expect(DEMO_OFFER_TRUST["offer-x-ledger-spot"]?.hardware).toMatchObject({
      tier: "H0",
      status: "unverified"
    });
  });

  it("changes expected cost, not price, when a tier changes", () => {
    const input = {
      providers: DEMO_PROVIDERS,
      modelInstances: DEMO_MODEL_INSTANCES,
      offers: DEMO_COMPUTE_OFFERS,
      stockModels: STOCK_MODEL_MANIFESTS,
      policy: STOCK_AGENT_MANIFESTS[0].policy,
      requiredCapabilities: ["evidence-summary"],
      trustTiers: Object.fromEntries(
        Object.entries(DEMO_OFFER_TRUST).map(([offer, trust]) => [offer, tiersOf(trust)])
      )
    };
    const z = (ranked: ReturnType<typeof rankComputeOffers>) =>
      ranked.find((score) => score.offerId === "offer-z-vision-dedicated");
    const simulated = z(rankComputeOffers(input));
    const unverified = z(
      rankComputeOffers({
        ...input,
        trustTiers: {
          ...input.trustTiers,
          "offer-z-vision-dedicated": { hardware: "H0", model: "M2", execution: "E0" }
        }
      })
    );
    expect(simulated?.trust.hardware).toBe("H3");
    expect(unverified?.priceLamports).toBe(simulated?.priceLamports);
    expect(unverified?.trustPenaltyLamports).toBeGreaterThan(simulated?.trustPenaltyLamports ?? 0n);
    expect(unverified?.totalExpectedCostLamports).toBe(
      (simulated?.totalExpectedCostLamports ?? 0n) +
        (unverified?.trustPenaltyLamports ?? 0n) -
        (simulated?.trustPenaltyLamports ?? 0n)
    );
  });

  it("earns job execution tiers only from checked receipts and verification", () => {
    expect(jobExecutionTrust({ receiptVerified: false }).tier).toBe("E0");
    expect(jobExecutionTrust({ receiptRole: "observer", receiptVerified: true })).toMatchObject({
      tier: "E0",
      basis: expect.stringContaining("Observer-signed") as unknown
    });
    expect(
      jobExecutionTrust({
        receiptRole: "provider",
        receiptVerified: true,
        verificationPassed: false
      }).tier
    ).toBe("E1");
    expect(
      jobExecutionTrust({
        receiptRole: "provider",
        receiptVerified: true,
        verificationPassed: true
      })
    ).toMatchObject({ tier: "E2", status: "verified" });
  });
});
