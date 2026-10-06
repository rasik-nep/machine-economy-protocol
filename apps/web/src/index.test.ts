import { describe, expect, it } from "vitest";

import { STOCK_AGENT_MANIFESTS, STOCK_MODEL_MANIFESTS } from "@mep/fixtures";
import { manifestRoot } from "@mep/protocol";

import { buildFoundationRegistryRows } from "./index.js";

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
