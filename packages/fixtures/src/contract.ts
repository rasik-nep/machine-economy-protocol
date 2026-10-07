import type { DemoContractTerms } from "@mep/protocol";

export const DEMO_CONTRACT_TERMS = {
  task: {
    kind: "evidence-summary",
    inputRoot: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  },
  verificationRule: {
    kind: "customer-attested-result-root"
  },
  liabilityRule: {
    kind: "missed-deadline-provider-liability",
    limitLamports: 8_000_000
  }
} as const satisfies DemoContractTerms;

export const DEMO_RESULT_ROOT =
  "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
