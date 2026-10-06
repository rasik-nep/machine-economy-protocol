import { describe, expect, it } from "vitest";

import {
  canonicalize,
  DEFAULT_CLUSTER,
  manifestRoot,
  MVP_DEMO_LOOP,
  PROTOCOL_NAME,
  verifyManifest,
  type StockModelManifest
} from "../src/index.js";

describe("protocol foundation", () => {
  it("uses localnet as the default development cluster", () => {
    expect(DEFAULT_CLUSTER).toBe("localnet");
  });

  it("keeps the complete MVP learning loop in order", () => {
    expect(PROTOCOL_NAME).toBe("Machine Economy Protocol");
    expect(MVP_DEMO_LOOP).toEqual([
      "foundation-registry",
      "agent-passport",
      "provider-marketplace",
      "risk-router",
      "work-contract",
      "subcontract",
      "controlled-failure",
      "dispute",
      "precedent",
      "memory-update",
      "second-job"
    ]);
  });

  it("canonicalizes manifests independent of object key insertion order", () => {
    expect(canonicalize({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it("recomputes and verifies stock model manifest roots", async () => {
    const manifest = {
      kind: "mep.stock-model.v1",
      id: "stock-model-test",
      displayName: "Test Model",
      modelFamily: "test-family",
      version: 1,
      artifact: {
        format: "stub",
        hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        parameterCount: "demo-stub",
        contextWindowTokens: 2048
      },
      capabilities: ["test"],
      license: "demo-fixture"
    } satisfies StockModelManifest;

    const root = await manifestRoot(manifest);
    const verified = await verifyManifest(manifest, root);

    expect(root).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(verified).toEqual({
      manifest,
      manifestRoot: root,
      isVerified: true
    });
    await expect(
      verifyManifest(
        manifest,
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      )
    ).rejects.toThrow("Manifest root mismatch");
  });
});
