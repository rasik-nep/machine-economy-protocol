import {
  offerTrust,
  type ComputeOfferMarketRecord,
  type HardwareTier,
  type ModelInstanceMarketRecord,
  type OfferTrust,
  type ProviderMarketRecord
} from "@mep/protocol";

export const DEMO_PROVIDERS = [
  {
    id: "provider-x",
    displayName: "Provider X · Spot",
    evidenceRoot: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    hardwareTrustBps: 7200,
    executionTrustBps: 7000,
    breachCount: 0
  },
  {
    id: "provider-y",
    displayName: "Provider Y · Reserved",
    evidenceRoot: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    hardwareTrustBps: 9100,
    executionTrustBps: 9300,
    breachCount: 0
  },
  {
    id: "provider-z",
    displayName: "Provider Z · Dedicated",
    evidenceRoot: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    hardwareTrustBps: 9800,
    executionTrustBps: 9700,
    breachCount: 0
  }
] as const satisfies readonly ProviderMarketRecord[];

export const DEMO_MODEL_INSTANCES = [
  {
    id: "instance-x-ledger",
    providerId: "provider-x",
    stockModelId: "stock-model-ledger-lite",
    executionCommitment: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    modelTrustBps: 7600
  },
  {
    id: "instance-y-ledger",
    providerId: "provider-y",
    stockModelId: "stock-model-ledger-lite",
    executionCommitment: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    modelTrustBps: 9200
  },
  {
    id: "instance-z-vision",
    providerId: "provider-z",
    stockModelId: "stock-model-vision-ocr",
    executionCommitment: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    modelTrustBps: 9600
  }
] as const satisfies readonly ModelInstanceMarketRecord[];

export const DEMO_COMPUTE_OFFERS = [
  {
    id: "offer-x-ledger-spot",
    modelInstanceId: "instance-x-ledger",
    priceLamports: 5_000_000,
    expectedLatencyMs: 2800,
    failureProbabilityBps: 100,
    reservationClass: "spot"
  },
  {
    id: "offer-y-ledger-reserved",
    modelInstanceId: "instance-y-ledger",
    priceLamports: 8_000_000,
    expectedLatencyMs: 1900,
    failureProbabilityBps: 900,
    reservationClass: "reserved"
  },
  {
    id: "offer-z-vision-dedicated",
    modelInstanceId: "instance-z-vision",
    priceLamports: 11_000_000,
    expectedLatencyMs: 1100,
    failureProbabilityBps: 100,
    reservationClass: "dedicated"
  }
] as const satisfies readonly ComputeOfferMarketRecord[];

/**
 * Fixture mode only. The demo daemon simulates these providers, so their hardware
 * tiers are simulated too, and every surface labels them "simulated". Nothing here
 * is verified, and a provider outside the fixtures is always H0.
 */
export const DEMO_SIMULATED_HARDWARE_TIERS: Readonly<Record<string, HardwareTier>> = {
  "provider-x": "H0",
  "provider-y": "H1",
  "provider-z": "H3"
};

/**
 * Fixture-mode trust for each demo offer: M2 (fixture manifests are the registered
 * ones), the simulated hardware tier, and E0 until a job earns more.
 */
export const DEMO_OFFER_TRUST: Readonly<Record<string, OfferTrust>> = Object.fromEntries(
  DEMO_COMPUTE_OFFERS.map((offer) => {
    const instance = DEMO_MODEL_INSTANCES.find((i) => i.id === offer.modelInstanceId);
    return [
      offer.id,
      offerTrust({
        manifestVerified: true,
        simulatedHardwareTier: instance && DEMO_SIMULATED_HARDWARE_TIERS[instance.providerId]
      })
    ];
  })
);
