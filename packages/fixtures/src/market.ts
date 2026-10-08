import type {
  ComputeOfferMarketRecord,
  ModelInstanceMarketRecord,
  ProviderMarketRecord
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
    failureProbabilityBps: 1600,
    reservationClass: "spot"
  },
  {
    id: "offer-y-ledger-reserved",
    modelInstanceId: "instance-y-ledger",
    priceLamports: 8_000_000,
    expectedLatencyMs: 1900,
    failureProbabilityBps: 500,
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

// The procurement agent's genesis memory: its own failure estimates per provider,
// which override the providers' self-published offer risk when it ranks offers.
export const DEMO_AGENT_GENESIS_RISK_BPS: Readonly<Record<string, number>> = {
  "provider-x": 100,
  "provider-y": 900,
  "provider-z": 100
};
