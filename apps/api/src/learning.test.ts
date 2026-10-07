import { describe, it, expect, vi, afterEach } from "vitest";
import { scores, policy } from "./scenario.ts";
import { learnFromBreach, type FailureEvidence } from "../../../packages/protocol/src/learning.ts";
import { sha256Hex, canonicalize } from "../../../packages/protocol/src/index.ts";
import { explainRuling } from "./summary.ts";
const evidence: FailureEvidence = {
  kind: "mep.failure.v1",
  contract: "localnet-contract-1",
  providerId: "provider-x",
  deadlineSlot: 100,
  observedSlot: 101,
  reason: "controlled-preemption",
  resultSubmitted: false
};
afterEach(() => vi.unstubAllEnvs());
describe("Phase 10 economic learning regression", () => {
  it("commits experience and changes X to Z without changing price or policy", async () => {
    const before = scores();
    const originalPolicy = canonicalize(policy);
    const previous = await sha256Hex("genesis");
    const ruling = await sha256Hex("finalized ruling");
    const learned = await learnFromBreach(previous, ruling, evidence, true);
    const after = scores(learned.memory.failureProbabilityOverridesBps);
    expect(before[0]?.providerId).toBe("provider-x");
    expect(after[0]?.providerId).toBe("provider-z");
    expect(after[0]?.priceLamports).toBeGreaterThan(before[0]?.priceLamports ?? 0n);
    expect(canonicalize(policy)).toBe(originalPolicy);
    expect(learned.root).toBe(await sha256Hex(canonicalize(learned.memory)));
    expect(learned.root).not.toBe(previous);
    expect(learned.memory.previousRoot).toBe(previous);
    expect(learned.memory.precedentRoot).toBe(ruling);
    expect(await learnFromBreach(previous, ruling, evidence, true)).toEqual(learned);
    for (const initial of before)
      expect(after.find((r) => r.providerId === initial.providerId)?.priceLamports).toBe(
        initial.priceLamports
      );
  });
  it("rejects unfinalized non-breach or evidence before the deadline", async () => {
    const root = await sha256Hex("memory");
    await expect(learnFromBreach(root, root, evidence, false)).rejects.toThrow("finalized");
    await expect(
      learnFromBreach(root, root, { ...evidence, observedSlot: 100 }, true)
    ).rejects.toThrow("deadline");
  });
});
describe("Gemini advisory boundary", () => {
  it("honors the configured model and excludes thought text", async () => {
    vi.stubEnv("GEMINI_API_KEY", "unit-test-not-a-real-key");
    vi.stubEnv("GEMINI_MODEL", "custom-model");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "Internal reasoning", thought: true },
                  { text: "Final explanation" }
                ]
              }
            }
          ]
        })
      )
    );
    const result = await explainRuling(
      { provider: "X", refundLamports: 1, breachVotes: 5 },
      fetcher
    );
    expect(result).toEqual({ text: "Final explanation", model: "custom-model", advisory: true });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/custom-model:generateContent"
    );
  });
  it("rejects malformed and blocked responses and reports HTTP failures safely", async () => {
    vi.stubEnv("GEMINI_API_KEY", "unit-test-not-a-real-key");
    for (const [body, status, message] of [
      [{ candidates: "invalid" }, 200, "malformed"],
      [{ promptFeedback: { blockReason: "SAFETY" } }, 200, "no summary"],
      ["upstream secret details", 403, "authentication or permission denied"]
    ] as const) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify(body), { status }));
      await expect(
        explainRuling({ provider: "X", refundLamports: 1, breachVotes: 5 }, fetcher)
      ).rejects.toThrow(message);
    }
  });
  it("extracts text without executing model content or changing settlement", async () => {
    vi.stubEnv("GEMINI_API_KEY", "unit-test-not-a-real-key");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "Five votes confirmed the breach." }] }
            }
          ]
        }),
        { status: 200 }
      )
    );
    const input = { provider: "Provider X", refundLamports: 5000000, breachVotes: 5 };
    const result = await explainRuling(input, fetcher);
    expect(result.advisory).toBe(true);
    expect(result.text).toContain("Five votes");
    expect(input.refundLamports).toBe(5000000);
    const body = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe("string");
    expect(body).toContain('"maxOutputTokens":1024');
    expect(body).toContain('"systemInstruction"');
    expect(fetcher.mock.calls[0]?.[0]).toContain("generativelanguage.googleapis.com");
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-goog-api-key": "unit-test-not-a-real-key"
    });
  });
  it("reports quota failures, malformed responses, and missing keys", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(
      explainRuling({ provider: "X", refundLamports: 1, breachVotes: 5 })
    ).rejects.toThrow("not configured");
    vi.stubEnv("GEMINI_API_KEY", "unit-test-not-a-real-key");
    const quota = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 })
      );
    await expect(
      explainRuling({ provider: "X", refundLamports: 1, breachVotes: 5 }, quota)
    ).rejects.toThrow("quota or rate limit");
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ candidates: [] })));
    await expect(
      explainRuling({ provider: "X", refundLamports: 1, breachVotes: 5 }, malformed)
    ).rejects.toThrow("no summary");
  });
});
