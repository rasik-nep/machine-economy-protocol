import { describe, expect, it } from "vitest";

import { DEMO_SUBCONTRACT_TERMS, STOCK_AGENT_MANIFESTS } from "@mep/fixtures";
import { canonicalize, sha256Hex } from "@mep/protocol";

import { buildSubcontractScreenModel } from "./index.js";
import { renderSubcontractPage } from "./subcontract-page.js";

describe("subcontract dependency view", () => {
  it("shows Agent A hiring Agent B with a lower gross margin at a higher child price", async () => {
    const model = await buildSubcontractScreenModel();

    expect(model.agentAName).toBe(STOCK_AGENT_MANIFESTS[0].displayName);
    expect(model.supplierAgentName).toBe(STOCK_AGENT_MANIFESTS[1].displayName);
    expect(model.computeProviderId).toBe("provider-y");
    expect(model.parentRevenueLamports).toBe(15_000_000);
    expect(model.computeCostLamports).toBe(8_000_000);
    expect(model.childCostLamports).toBe(3_000_000);
    expect(model.marginLamports).toBe(4_000_000n);
    expect(model.alternateMarginLamports).toBe(3_000_000n);
    expect(model.childDeadlineOffsetSlots).toBeLessThan(model.parentDeadlineOffsetSlots);
    expect(model.childTaskRoot).toBe(await sha256Hex(canonicalize(DEMO_SUBCONTRACT_TERMS.task)));

    const page = renderSubcontractPage(model);
    expect(page).toContain("Dependency graph");
    expect(page).toContain(model.parentId);
    expect(page).toContain(model.childId);
    expect(page).toContain("4,000,000");
    expect(page).toContain("3,000,000");
  });
});
