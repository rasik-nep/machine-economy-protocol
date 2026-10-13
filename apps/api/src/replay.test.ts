import { describe, expect, it } from "vitest";

import { prepareReplay, REPLAY_BUNDLE_FILE } from "./replay.ts";

const stages = Array.from({ length: 9 }, (_, i) => `Stage ${String(i)}`);
const run = (network = "devnet") =>
  stages.map((_, stage) => ({
    stage,
    run: 1_791_000_000_000,
    network,
    stages,
    busy: stage === 3,
    error: null,
    canAbandon: true,
    ...(stage >= 6
      ? { evidenceBundle: ".anchor/runs/devnet-1791000000000/evidence-bundle.json" }
      : {})
  }));

describe("replay export", () => {
  it("publishes a complete devnet run in stage order without transient state", () => {
    const replay = prepareReplay(run().reverse(), { bundlePublished: true });

    expect(replay.map((s) => s.stage)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(replay.every((s) => !s.busy && s.error === null && !s.canAbandon)).toBe(true);
    expect(replay[8]?.evidenceBundle).toBe(REPLAY_BUNDLE_FILE);
    expect(replay[5]).not.toHaveProperty("evidenceBundle");
  });

  it("never publishes a local evidence path", () => {
    const replay = prepareReplay(run(), { bundlePublished: false });

    expect(replay.some((s) => "evidenceBundle" in s)).toBe(false);
  });

  it("shows an advisory summary on every finalized stage", () => {
    const summary = { text: "The jury found a breach.", model: "gemini", advisory: true };
    const captured = run().map((s) => (s.stage === 8 ? { ...s, summary } : s));
    const replay = prepareReplay(captured, { bundlePublished: true });

    expect(replay.slice(6).every((s) => s.summary?.text === summary.text)).toBe(true);
    expect(replay.slice(0, 6).some((s) => s.summary)).toBe(false);
  });

  it("rejects incomplete, mixed, or localnet runs", () => {
    expect(() => prepareReplay(run().slice(1), { bundlePublished: true })).toThrow(/each of/);
    const mixed = run().map((s) => (s.stage === 4 ? { ...s, run: 2 } : s));
    expect(() => prepareReplay(mixed, { bundlePublished: true })).toThrow(/same run/);
    expect(() => prepareReplay(run("localnet"), { bundlePublished: true })).toThrow(/devnet/);
    expect(
      prepareReplay(run("localnet"), { allowLocalnet: true, bundlePublished: true })
    ).toHaveLength(9);
  });
});
