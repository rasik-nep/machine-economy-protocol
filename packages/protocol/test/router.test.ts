import { describe, expect, it } from "vitest";

import {
  DEMO_COMPUTE_OFFERS,
  DEMO_MODEL_INSTANCES,
  DEMO_OFFER_TRUST,
  DEMO_PROVIDERS,
  STOCK_AGENT_MANIFESTS,
  STOCK_MODEL_MANIFESTS
} from "../../fixtures/src/index.ts";

import { raiseRiskAfterBreach } from "../src/learning.ts";

import { rankComputeOffers, tiersOf, type UtilityRouterInput } from "../src/index.js";

const fixtureTiers = Object.fromEntries(
  Object.entries(DEMO_OFFER_TRUST).map(([offer, trust]) => [offer, tiersOf(trust)])
);

const baseInput: UtilityRouterInput = {
  providers: DEMO_PROVIDERS,
  modelInstances: DEMO_MODEL_INSTANCES,
  offers: DEMO_COMPUTE_OFFERS,
  stockModels: STOCK_MODEL_MANIFESTS,
  policy: STOCK_AGENT_MANIFESTS[0].policy,
  requiredCapabilities: ["evidence-summary"],
  trustTiers: fixtureTiers
};

describe("deterministic utility router", () => {
  it("picks the cheapest offer when every provider claims the same reliability", () => {
    const ranked = rankComputeOffers(baseInput);

    expect(ranked.map((score) => [score.offerId, score.totalExpectedCostLamports])).toEqual([
      ["offer-x-ledger-spot", 7_568_000n],
      ["offer-z-vision-dedicated", 12_117_710n],
      ["offer-y-ledger-reserved", 13_592_420n]
    ]);
    const winner = ranked[0];
    expect(winner?.expectedFailureLossLamports).toBe(500_000n);
    expect(winner?.reservationAdjustmentLamports).toBe(1_000_000n);
    expect(winner?.totalExpectedCostLamports).toBe(
      (winner?.priceLamports ?? 0n) +
        (winner?.expectedFailureLossLamports ?? 0n) +
        (winner?.expectedDelayLossLamports ?? 0n) +
        (winner?.trustPenaltyLamports ?? 0n) +
        (winner?.reservationAdjustmentLamports ?? 0n)
    );
  });

  it("never lowers published risk or expected cost after learning a breach", () => {
    const input = {
      ...baseInput,
      offers: baseInput.offers.map((offer) => ({ ...offer, failureProbabilityBps: 9_000 }))
    };
    const before = rankComputeOffers(input);
    const after = rankComputeOffers({
      ...input,
      failureProbabilityOverridesBps: { "provider-x": raiseRiskAfterBreach(undefined) }
    });
    const original = before.find((o) => o.providerId === "provider-x");
    const learned = after.find((o) => o.providerId === "provider-x");
    expect(learned?.effectiveFailureProbabilityBps).toBe(9_000);
    expect(learned?.totalExpectedCostLamports).toBe(original?.totalExpectedCostLamports);
    expect(
      rankComputeOffers({
        ...input,
        failureProbabilityOverridesBps: { "provider-x": 10_000 }
      }).find((o) => o.providerId === "provider-x")?.effectiveFailureProbabilityBps
    ).toBe(10_000);
  });

  it("selects a more expensive offer once the cheapest provider's failure estimate rises", () => {
    const before = rankComputeOffers(baseInput);
    const after = rankComputeOffers({
      ...baseInput,
      failureProbabilityOverridesBps: { "provider-x": 2_500 }
    });
    const cheapest = after.find((score) => score.providerId === "provider-x");
    const winner = after[0];

    expect(before[0]?.offerId).toBe("offer-x-ledger-spot");
    expect(winner?.offerId).toBe("offer-z-vision-dedicated");
    expect(winner?.priceLamports).toBe(11_000_000n);
    expect(cheapest?.priceLamports).toBe(5_000_000n);
    expect(cheapest?.effectiveFailureProbabilityBps).toBe(2_500);
    expect(cheapest?.expectedFailureLossLamports).toBe(12_500_000n);
    expect(after.map((score) => score.totalExpectedCostLamports)).toEqual([
      12_117_710n,
      13_592_420n,
      19_568_000n
    ]);
  });

  it("filters offers that exceed the budget or cannot perform the job", () => {
    const ranked = rankComputeOffers({
      ...baseInput,
      policy: { ...baseInput.policy, maxPriceLamports: 8_000_000 },
      requiredCapabilities: ["invoice-reasoning"]
    });

    expect(ranked.map((score) => score.providerId)).toEqual(["provider-x", "provider-y"]);
  });

  it("prices trust and reservation independently of the nominal offer price", () => {
    const original = rankComputeOffers(baseInput).find(
      (score) => score.providerId === "provider-x"
    );
    const improved = rankComputeOffers({
      ...baseInput,
      trustTiers: {
        ...fixtureTiers,
        "offer-x-ledger-spot": { hardware: "H3", model: "M4", execution: "E4" }
      },
      offers: baseInput.offers.map((offer) =>
        offer.id === "offer-x-ledger-spot"
          ? { ...offer, reservationClass: "dedicated" as const }
          : offer
      )
    }).find((score) => score.providerId === "provider-x");

    expect(improved?.priceLamports).toBe(original?.priceLamports);
    expect(improved?.trustPenaltyLamports).toBe(0n);
    expect(improved?.reservationAdjustmentLamports).toBe(0n);
    expect(improved?.totalExpectedCostLamports).toBeLessThan(
      original?.totalExpectedCostLamports ?? 0n
    );
  });

  it("never scores providers' self-declared trust numbers", () => {
    const claimed = rankComputeOffers({
      ...baseInput,
      providers: baseInput.providers.map((provider) => ({
        ...provider,
        hardwareTrustBps: 10_000,
        executionTrustBps: 10_000
      })),
      modelInstances: baseInput.modelInstances.map((instance) => ({
        ...instance,
        modelTrustBps: 10_000
      }))
    });
    expect(claimed).toEqual(rankComputeOffers(baseInput));
    // An offer with no earned tiers is priced as H0/M0/E0, the maximum trust penalty.
    const unearned = rankComputeOffers({ ...baseInput, trustTiers: {} });
    expect(unearned.every((score) => score.trustDeficitBps === 10_000)).toBe(true);
  });

  it("rejects invalid externally supplied risk values", () => {
    expect(() =>
      rankComputeOffers({
        ...baseInput,
        failureProbabilityOverridesBps: { "provider-y": 10_001 }
      })
    ).toThrow("at most 10000");
    expect(() =>
      rankComputeOffers({
        ...baseInput,
        offers: [{ ...DEMO_COMPUTE_OFFERS[0], priceLamports: Number.MAX_SAFE_INTEGER + 1 }]
      })
    ).toThrow("safe integer");
    expect(() =>
      rankComputeOffers({
        ...baseInput,
        trustTiers: {
          "offer-x-ledger-spot": { hardware: "H9", model: "M2", execution: "E0" } as never
        }
      })
    ).toThrow("Unknown hardware trust tier");
  });
});
