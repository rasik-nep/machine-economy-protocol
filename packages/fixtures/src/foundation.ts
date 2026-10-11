import type { StockAgentManifest, StockModelManifest } from "@mep/protocol";

export const STOCK_MODEL_MANIFESTS = [
  {
    kind: "mep.stock-model.v1",
    id: "stock-model-ledger-lite",
    displayName: "Ledger Lite Analyst",
    modelFamily: "ledger-lite",
    version: 1,
    artifact: {
      format: "stub",
      hash: "sha256:0f6d4f9b6a9e5b25b8f1bf0d3ee80b1f7c2b95c0d13f6b6873b48d9ed2c4a501",
      parameterCount: "demo-stub",
      contextWindowTokens: 8192
    },
    capabilities: ["invoice-reasoning", "evidence-summary", "contract-drafting"],
    license: "demo-fixture"
  },
  {
    kind: "mep.stock-model.v1",
    id: "stock-model-vision-ocr",
    displayName: "Vision OCR Specialist",
    modelFamily: "vision-ocr",
    version: 1,
    artifact: {
      format: "stub",
      hash: "sha256:8fb2bdb7b0e91781794e631f2f2a44a63dd2e65a5027952815c27f4a73d29d41",
      parameterCount: "demo-stub",
      contextWindowTokens: 4096
    },
    capabilities: ["ocr", "receipt-extraction", "image-evidence", "evidence-summary"],
    license: "demo-fixture"
  }
] as const satisfies readonly StockModelManifest[];

export const STOCK_AGENT_MANIFESTS = [
  {
    kind: "mep.stock-agent.v1",
    id: "stock-agent-procurement",
    displayName: "Procurement Agent",
    version: 1,
    role: "ops",
    policy: {
      maxPriceLamports: 20000000,
      failureLossLamports: 50000000,
      delayLossLamportsPerSecond: 10000,
      privacyWeightBps: 650
    },
    preferredCapabilities: ["invoice-reasoning", "contract-drafting"],
    memoryTemplateHash: "sha256:df08a750a4727e7783d3db20609e2a1f9a13a63496d44b0e3ad8f8c6255f6c2e"
  },
  {
    kind: "mep.stock-agent.v1",
    id: "stock-agent-ocr-specialist",
    displayName: "OCR Specialist Agent",
    version: 1,
    role: "specialist",
    policy: {
      maxPriceLamports: 12000000,
      failureLossLamports: 25000000,
      delayLossLamportsPerSecond: 6000,
      privacyWeightBps: 400
    },
    preferredCapabilities: ["ocr", "receipt-extraction"],
    memoryTemplateHash: "sha256:a0ecf2699f5d739792cde833a2ab0e685248b1e6d95b3f2296e6d084f9a31a27"
  }
] as const satisfies readonly StockAgentManifest[];
