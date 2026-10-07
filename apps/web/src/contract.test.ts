import { describe, expect, it } from "vitest";

import { DEMO_CONTRACT_TERMS } from "@mep/fixtures";
import { canonicalize, sha256Hex } from "@mep/protocol";

import { buildContractFlowScreenModel } from "./index.js";
import { renderContractPage } from "./contract-page.js";

describe("guided contract flow", () => {
  it("uses the selected offer and commits structured off-chain terms", async () => {
    const flow = await buildContractFlowScreenModel();

    expect(flow.offerId).toBe("offer-y-ledger-reserved");
    expect(flow.providerId).toBe("provider-y");
    expect(flow.priceLamports).toBe(8_000_000);
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
      0, 8_000_000, 8_000_000, 8_000_000, 8_000_000, 0
    ]);

    const page = renderContractPage(flow);
    expect(page).toContain("Work contract and escrow");
    expect(page).toContain(flow.taskRoot);
    expect(page).toContain("funds in an unfinished contract have no recovery instruction yet");
  });
});
