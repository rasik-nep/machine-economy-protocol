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
export async function learnFromBreach(
  previousRoot: HashHex,
  precedentRoot: HashHex,
  evidence: FailureEvidence,
  providerBreached: boolean
): Promise<{ memory: AgentMemory; root: HashHex }> {
  if (!providerBreached || evidence.observedSlot <= evidence.deadlineSlot)
    throw new Error("A finalized missed-deadline breach is required");
  const memory: AgentMemory = {
    kind: "mep.memory.v1",
    checkpoint: 1,
    previousRoot,
    precedentRoot,
    failureProbabilityOverridesBps: { [evidence.providerId]: 2500 }
  };
  return { memory, root: await sha256Hex(canonicalize(memory)) };
}
