import { canonicalize, sha256Hex, type HashHex } from "./index.ts";

export type FailureEvidence = {
  kind: "mep.failure.v1";
  contract: string;
  providerId: string;
  deadlineSlot: number;
  observedSlot: number;
  reason: "controlled-preemption";
  resultSubmitted: false;
};
export type AgentMemory = {
  kind: "mep.memory.v1";
  checkpoint: number;
  previousRoot: HashHex;
  precedentRoot: HashHex;
  failureProbabilityOverridesBps: Record<string, number>;
};

/** A first finalized breach raises the agent's estimate to 25%; each further one adds 25 points. */
export const BREACH_RISK_STEP_BPS = 2_500;

export function raiseRiskAfterBreach(currentBps: number | undefined): number {
  const current = currentBps ?? 0;
  return Math.min(
    10_000,
    current < BREACH_RISK_STEP_BPS ? BREACH_RISK_STEP_BPS : current + BREACH_RISK_STEP_BPS
  );
}

export async function learnFromBreach(
  previousRoot: HashHex,
  precedentRoot: HashHex,
  evidence: FailureEvidence,
  providerBreached: boolean,
  previous?: AgentMemory
): Promise<{ memory: AgentMemory; root: HashHex }> {
  if (!providerBreached || evidence.observedSlot <= evidence.deadlineSlot)
    throw new Error("A finalized missed-deadline breach is required");
  const overrides = { ...previous?.failureProbabilityOverridesBps };
  overrides[evidence.providerId] = raiseRiskAfterBreach(overrides[evidence.providerId]);
  const memory: AgentMemory = {
    kind: "mep.memory.v1",
    checkpoint: (previous?.checkpoint ?? 0) + 1,
    previousRoot,
    precedentRoot,
    failureProbabilityOverridesBps: overrides
  };
  return { memory, root: await sha256Hex(canonicalize(memory)) };
}
