import { describe, expect, it } from "vitest";

import { agentProfitAndLoss } from "../src/index.js";

describe("agent profit and loss", () => {
  it("nets +1M with the breach refund and -4M without it", () => {
    const pnl = agentProfitAndLoss([
      { label: "Parent revenue", role: "revenue", priceLamports: 15_000_000, status: "settled" },
      { label: "OCR subcontract", role: "cost", priceLamports: 3_000_000, status: "settled" },
      { label: "Job 1", role: "cost", priceLamports: 5_000_000, status: "breached" },
      { label: "Job 2", role: "cost", priceLamports: 11_000_000, status: "settled" }
    ]);

    expect(pnl.lines.map((line) => line.lamports)).toEqual([
      15_000_000n,
      -3_000_000n,
      -5_000_000n,
      5_000_000n,
      -11_000_000n
    ]);
    expect(pnl.totalLamports).toBe(1_000_000n);
    expect(pnl.refundedLamports).toBe(5_000_000n);
    expect(pnl.withoutRefundsLamports).toBe(-4_000_000n);
  });

  it("books revenue only on settlement and costs only once escrow is funded", () => {
    const pnl = agentProfitAndLoss([
      { label: "Parent revenue", role: "revenue", priceLamports: 15_000_000, status: "running" },
      { label: "Draft job", role: "cost", priceLamports: 5_000_000, status: "draft" },
      { label: "Running job", role: "cost", priceLamports: 5_000_000, status: "running" }
    ]);

    expect(pnl.totalLamports).toBe(-5_000_000n);
    expect(() =>
      agentProfitAndLoss([{ label: "Bad", role: "cost", priceLamports: -1, status: "settled" }])
    ).toThrow("non-negative");
  });
});
