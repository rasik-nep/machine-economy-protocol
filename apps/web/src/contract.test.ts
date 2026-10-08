import { describe, expect, it } from "vitest";

import { DEMO_CONTRACT_TERMS } from "@mep/fixtures";
import { canonicalize, sha256Hex } from "@mep/protocol";

import { buildContractFlowScreenModel } from "./index.js";
import { renderContractPage } from "./contract-page.js";

describe("guided contract flow", () => {
  it("uses the selected offer and commits structured off-chain terms", async () => {
    const flow = await buildContractFlowScreenModel();

    expect(flow.offerId).toBe("offer-x-ledger-spot");
    expect(flow.providerId).toBe("provider-x");
    expect(flow.priceLamports).toBe(5_000_000);
    expect(flow.taskRoot).toBe(await sha256Hex(canonicalize(DEMO_CONTRACT_TERMS.task)));
    expect(flow.verificationRuleRoot).toBe(
      await sha256Hex(canonicalize(DEMO_CONTRACT_TERMS.verificationRule))
    );
    expect(flow.liabilityRuleRoot).toBe(
      await sha256Hex(canonicalize(DEMO_CONTRACT_TERMS.liabilityRule))
    );
    expect(flow.steps.map((step) => step.status)).toEqual([
      "Draft",
      "Funded",
      "Running",
      "Submitted",
      "Verified",
      "Settled"
    ]);
    expect(flow.steps.map((step) => step.escrowLamports)).toEqual([
      0, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 0
    ]);

    const page = renderContractPage(flow);
    expect(page).toContain("Work contract and escrow");
    expect(page).toContain(flow.taskRoot);
    expect(page).toContain("released to the provider after the customer review window");
  });
});
