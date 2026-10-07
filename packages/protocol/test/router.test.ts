import { describe, expect, it } from "vitest";

import {
  DEMO_COMPUTE_OFFERS,
  DEMO_MODEL_INSTANCES,
  DEMO_PROVIDERS,
  STOCK_AGENT_MANIFESTS,
  STOCK_MODEL_MANIFESTS
} from "../../fixtures/src/index.ts";

import { rankComputeOffers, type UtilityRouterInput } from "../src/index.js";

const baseInput: UtilityRouterInput = {
  providers: DEMO_PROVIDERS,
  modelInstances: DEMO_MODEL_INSTANCES,
  offers: DEMO_COMPUTE_OFFERS,
  stockModels: STOCK_MODEL_MANIFESTS,
  policy: STOCK_AGENT_MANIFESTS[0].policy,
  requiredCapabilities: ["evidence-summary"]
};

describe("deterministic utility router", () => {
  it("selects a more expensive offer when the cheapest has greater expected risk", () => {
    const ranked = rankComputeOffers(baseInput);
    const cheapest = ranked.find((score) => score.offerId === "offer-x-ledger-spot");
    const winner = ranked[0];

    expect(ranked).toHaveLength(3);
    expect(winner?.offerId).toBe("offer-y-ledger-reserved");
    expect(winner?.priceLamports).toBe(8_000_000n);
    expect(cheapest?.priceLamports).toBe(5_000_000n);
    expect(winner?.totalExpectedCostLamports).toBeLessThan(
      cheapest?.totalExpectedCostLamports ?? 0n
    );
    expect(cheapest?.expectedFailureLossLamports).toBe(8_000_000n);
    expect(cheapest?.reservationAdjustmentLamports).toBe(1_000_000n);
    expect(winner?.totalExpectedCostLamports).toBe(
      (winner?.priceLamports ?? 0n) +
        (winner?.expectedFailureLossLamports ?? 0n) +
        (winner?.expectedDelayLossLamports ?? 0n) +
        (winner?.trustPenaltyLamports ?? 0n) +
        (winner?.reservationAdjustmentLamports ?? 0n)
    );
  });

  it("changes the winner after a provider failure estimate rises", () => {
    const before = rankComputeOffers(baseInput);
    const after = rankComputeOffers({
      ...baseInput,
      failureProbabilityOverridesBps: { "provider-y": 2_500 }
    });

    expect(before[0]?.offerId).toBe("offer-y-ledger-reserved");
    expect(after[0]?.offerId).toBe("offer-z-vision-dedicated");
    expect(
      after.find((score) => score.providerId === "provider-y")?.effectiveFailureProbabilityBps
    ).toBe(2_500);
  });

  it("filters offers that exceed the budget or cannot perform the job", () => {
    const ranked = rankComputeOffers({
      ...baseInput,
      policy: { ...baseInput.policy, maxPriceLamports: 8_000_000 },
      requiredCapabilities: ["invoice-reasoning"]
    });

    expect(ranked.map((score) => score.providerId)).toEqual(["provider-y", "provider-x"]);
  });

  it("prices trust and reservation independently of the nominal offer price", () => {
    const original = rankComputeOffers(baseInput).find(
      (score) => score.providerId === "provider-x"
    );
    const improved = rankComputeOffers({
      ...baseInput,
      providers: baseInput.providers.map((provider) =>
        provider.id === "provider-x"
          ? { ...provider, hardwareTrustBps: 10_000, executionTrustBps: 10_000 }
          : provider
      ),
      modelInstances: baseInput.modelInstances.map((instance) =>
        instance.providerId === "provider-x" ? { ...instance, modelTrustBps: 10_000 } : instance
      ),
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
  });
});
