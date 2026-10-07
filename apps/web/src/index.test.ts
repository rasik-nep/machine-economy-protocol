import { describe, expect, it } from "vitest";

import { STOCK_AGENT_MANIFESTS, STOCK_MODEL_MANIFESTS } from "@mep/fixtures";
import { manifestRoot } from "@mep/protocol";

import {
  buildDemoAgentPassportRows,
  buildFoundationRegistryRows,
  buildMarketScreenModel,
  buildRouterScreenModel
} from "./index.js";
import { renderMarketPage } from "./market-page.js";

describe("foundation registry screen model", () => {
  it("shows stock manifests with locally verified roots", async () => {
    const rows = await buildFoundationRegistryRows();
    const manifests = [...STOCK_MODEL_MANIFESTS, ...STOCK_AGENT_MANIFESTS];

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.id)).toEqual(manifests.map((manifest) => manifest.id));

    for (const manifest of manifests) {
      const row = rows.find((candidate) => candidate.id === manifest.id);

      expect(row).toBeDefined();
      expect(row?.manifestRoot).toBe(await manifestRoot(manifest));
      expect(row?.stockOrigin).toBe("canonical-demo-fixture");
      expect(row?.verificationStatus).toBe("verified");
    }
  });
});

describe("provider and model market screen model", () => {
  it("keeps providers, model instances, and offers distinct and linked", async () => {
    const market = await buildMarketScreenModel();

    expect(market.providers).toHaveLength(3);
    expect(market.modelInstances).toHaveLength(3);
    expect(market.offers).toHaveLength(3);
    expect(new Set(market.offers.map((offer) => offer.reservationClass)).size).toBe(3);
    expect(new Set(market.offers.map((offer) => offer.priceLamports)).size).toBe(3);

    for (const offer of market.offers) {
      const instance = market.modelInstances.find((item) => item.id === offer.modelInstanceId);
      expect(instance).toBeDefined();
      expect(market.providers.some((provider) => provider.id === instance?.providerId)).toBe(true);
      expect(instance?.stockModelRoot).toBeDefined();
    }

    expect(market.modelInstances[0]?.stockModelRoot).toBe(market.modelInstances[1]?.stockModelRoot);
    expect(market.modelInstances[0]?.providerId).not.toBe(market.modelInstances[1]?.providerId);

    const page = renderMarketPage(market, buildRouterScreenModel());
    expect(page).toContain("01 / Compute providers");
    expect(page).toContain("02 / Model instances");
    expect(page).toContain("03 / Compute offers");
    expect(page).toContain("offer-z-vision-dedicated");
    expect(page).toContain("Risk adjusted choice");
    expect(page).toContain("Expected failure loss");
  });
});

describe("agent passport screen model", () => {
  it("shows two agents from the same stock root with different memory roots", async () => {
    const rows = await buildDemoAgentPassportRows();

    expect(rows).toHaveLength(2);
    expect(rows[0]?.stockAgentRoot).toBe(rows[1]?.stockAgentRoot);
    expect(rows[0]?.currentMemoryRoot).not.toBe(rows[1]?.currentMemoryRoot);
    expect(rows.every((row) => row.checkpointCount === 1)).toBe(true);
  });
});
