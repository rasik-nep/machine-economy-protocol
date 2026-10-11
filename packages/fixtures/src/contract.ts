import type { DemoContractTerms, VerificationPolicy } from "@mep/protocol";

// The compute job's task. inputRoot is the root of DEMO_TASK_INPUT; a fixture test
// recomputes it, so editing the input without updating this root fails the tests.
export const DEMO_COMPUTE_TASK = {
  kind: "evidence-summary",
  inputRoot: "sha256:641835d5070491a547639c849edce6cdf68f33e4db434bccb20c4bb7e5a266fc"
} as const satisfies DemoContractTerms["task"];

export const DEMO_COMPUTE_LIABILITY = {
  kind: "verifier-breach-provider-liability",
  limitLamports: 5_000_000
} as const satisfies DemoContractTerms["liabilityRule"];

/**
 * Compute jobs commit a fresh verification policy (its canary seed commitment is per
 * job). A result that fails the policy supports a dispute; the jury rules on it.
 */
export function demoComputeTerms(policy: VerificationPolicy): DemoContractTerms {
  return {
    task: DEMO_COMPUTE_TASK,
    verificationRule: policy,
    liabilityRule: DEMO_COMPUTE_LIABILITY
  };
}

// The client's evidence report from the procurement agent, attested by the client.
export const DEMO_PARENT_CONTRACT_TERMS = {
  task: DEMO_COMPUTE_TASK,
  verificationRule: {
    kind: "customer-attested-result-root"
  },
  liabilityRule: {
    kind: "missed-deadline-provider-liability",
    limitLamports: 15_000_000
  }
} as const satisfies DemoContractTerms;

export const DEMO_RESULT_ROOT =
  "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
