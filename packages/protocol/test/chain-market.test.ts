import { describe, expect, it } from "vitest";

import { STOCK_MODEL_MANIFESTS } from "../../fixtures/src/index.ts";
import { manifestRoot } from "../src/index.js";
import { marketFromChain, type ChainMarketAccounts } from "../src/chain-market.ts";

async function accounts(): Promise<ChainMarketAccounts> {
  return {
    providers: [
      {
        address: "provider-1",
        evidenceRoot: `sha256:${"1".repeat(64)}`,
        hardwareTrustBps: 9_000,
        executionTrustBps: 9_000,
        breachCount: 2
      }
    ],
    modelRecords: [
      { address: "record-1", manifestRoot: await manifestRoot(STOCK_MODEL_MANIFESTS[0]) },
      { address: "record-unknown", manifestRoot: `sha256:${"9".repeat(64)}` }
    ],
    modelInstances: [
      {
        address: "instance-1",
        provider: "provider-1",
        modelRecord: "record-1",
        executionCommitment: `sha256:${"a".repeat(64)}`,
        trustScoreBps: 8_000
      },
      {
        address: "instance-unknown-model",
        provider: "provider-1",
        modelRecord: "record-unknown",
        executionCommitment: `sha256:${"b".repeat(64)}`,
        trustScoreBps: 8_000
      }
    ],
    offers: [
      {
        address: "offer-1",
        provider: "provider-1",
        modelInstance: "instance-1",
        priceLamports: 7_000_000,
        expectedLatencyMs: 1_000,
        failureProbabilityBps: 300,
        reservationClass: 1
      }
    ]
  };
}

describe("market built from on-chain accounts", () => {
  it("maps program fields to router records keyed by account address", async () => {
    const market = await marketFromChain(await accounts(), STOCK_MODEL_MANIFESTS, {
      providerName: () => "Host 1"
    });

    expect(market.offers).toEqual([
      {
        id: "offer-1",
        modelInstanceId: "instance-1",
        priceLamports: 7_000_000,
        expectedLatencyMs: 1_000,
        failureProbabilityBps: 300,
        reservationClass: "reserved"
      }
    ]);
    expect(market.modelInstances[0]).toMatchObject({
      providerId: "provider-1",
      stockModelId: STOCK_MODEL_MANIFESTS[0].id,
      modelTrustBps: 8_000
    });
    expect(market.providers[0]).toMatchObject({ displayName: "Host 1", breachCount: 2 });
    expect(market.stockModels.map((m) => m.id)).toEqual([STOCK_MODEL_MANIFESTS[0].id]);
  });

  it("isolates u64 prices outside the router range without losing valid offers", async () => {
    const base = await accounts();
    const offer = base.offers[0];
    if (!offer) throw new Error("fixture offer missing");
    const market = await marketFromChain(
      {
        ...base,
        offers: [
          { ...offer, priceLamports: 7_000_000n },
          { ...offer, address: "oversized", priceLamports: 9_007_199_254_740_992n },
          { ...offer, address: "max-u64", priceLamports: 18_446_744_073_709_551_615n }
        ]
      },
      STOCK_MODEL_MANIFESTS
    );
    expect(market.offers.map((o) => [o.id, o.priceLamports])).toEqual([["offer-1", 7_000_000]]);
    expect(market.rejected.map((o) => o.offer)).toEqual(["oversized", "max-u64"]);
  });

  it("rejects offers it cannot verify instead of ranking them", async () => {
    const base = await accounts();
    const [offer] = base.offers;
    if (!offer) throw new Error("fixture offer missing");
    const market = await marketFromChain(
      {
        ...base,
        offers: [
          { ...offer, address: "unverified-model", modelInstance: "instance-unknown-model" },
          { ...offer, address: "missing-instance", modelInstance: "instance-missing" },
          { ...offer, address: "wrong-provider", provider: "provider-2" },
          { ...offer, address: "bad-class", reservationClass: 3 }
        ]
      },
      STOCK_MODEL_MANIFESTS
    );

    expect(market.offers).toEqual([]);
    expect(market.rejected).toEqual([
      { offer: "unverified-model", reason: "no verified manifest for the registered model root" },
      { offer: "missing-instance", reason: "model instance account not found" },
      { offer: "wrong-provider", reason: "provider record not found" },
      { offer: "bad-class", reason: "unknown reservation class" }
    ]);
  });

  it("rejects offers whose manifest id resolves to two registered versions", async () => {
    const base = await accounts();
    const [offer] = base.offers;
    const [instance] = base.modelInstances;
    if (!offer || !instance) throw new Error("fixture missing");
    const original = STOCK_MODEL_MANIFESTS[0];
    const v2 = { ...original, version: original.version + 1 };
    const market = await marketFromChain(
      {
        ...base,
        modelRecords: [
          ...base.modelRecords,
          { address: "record-v2", manifestRoot: await manifestRoot(v2) }
        ],
        modelInstances: [
          ...base.modelInstances,
          { ...instance, address: "instance-v2", modelRecord: "record-v2" }
        ],
        offers: [offer, { ...offer, address: "offer-v2", modelInstance: "instance-v2" }]
      },
      [...STOCK_MODEL_MANIFESTS, v2]
    );
    expect(market.offers).toEqual([]);
    expect(market.rejected.map((o) => o.offer)).toEqual(["offer-1", "offer-v2"]);
    expect(market.rejected[0]?.reason).toContain(original.id);
  });
});
