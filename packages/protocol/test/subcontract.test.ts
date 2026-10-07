import { describe, expect, it } from "vitest";

import { calculateAgentMarginLamports } from "../src/index.js";

describe("subcontract economics", () => {
  it("reduces Agent A's gross margin when Agent B's quote rises", () => {
    expect(calculateAgentMarginLamports(15_000_000, 3_000_000, 8_000_000)).toBe(4_000_000n);
    expect(calculateAgentMarginLamports(15_000_000, 4_000_000, 8_000_000)).toBe(3_000_000n);
  });

  it("rejects prices the on-chain subcontract would reject", () => {
    expect(() => calculateAgentMarginLamports(8_000_000, 0, 0)).toThrow("must be positive");
    expect(() => calculateAgentMarginLamports(8_000_000, 9_000_000, 0)).toThrow("no greater");
    expect(() => calculateAgentMarginLamports(Number.MAX_SAFE_INTEGER + 1, 1, 0)).toThrow(
      "safe integer"
    );
  });
});
