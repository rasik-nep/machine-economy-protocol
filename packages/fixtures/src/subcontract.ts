import type { DemoContractTerms } from "@mep/protocol";

export const DEMO_SUBCONTRACT_TERMS = {
  task: {
    kind: "ocr-extraction",
    inputRoot: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  },
  verificationRule: {
    kind: "customer-attested-result-root"
  },
  liabilityRule: {
    kind: "missed-deadline-provider-liability",
    limitLamports: 3_000_000
  }
} as const satisfies DemoContractTerms;

export const DEMO_SUBCONTRACT_PRICE_LAMPORTS = 3_000_000;
export const DEMO_SUBCONTRACT_ALTERNATE_PRICE_LAMPORTS = 4_000_000;
export const DEMO_PARENT_AGENT_SERVICE_PRICE_LAMPORTS = 15_000_000;
