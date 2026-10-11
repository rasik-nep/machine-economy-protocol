import { canonicalize, rootBytes, sha256Bytes, sha256Hex, type HashHex } from "./hash.ts";
import { manifestRoot, type DemoContractTerms, type StockModelManifest } from "./index.ts";
import {
  ReceiptReplayGuard,
  verifyReceipt,
  type ExecutionReceipt,
  type SignerKey
} from "./receipt.ts";
import {
  canaryPoolRoot,
  resultRoot,
  runVerification,
  taskInputRoot,
  verificationPolicyRoot,
  type CanaryPool,
  type ResultDocument,
  type TaskInput,
  type VerificationPolicy,
  type VerificationResult
} from "./verifier.ts";

/**
 * The off-chain evidence document. Its root is committed in the on-chain Dispute.
 * It carries everything needed to re-run the verification without trusting its
 * author: the task input, the committed policy, the canary pool and revealed seed,
 * the delivered result, and the provider-signed receipt that binds them.
 */
export type FailureEvidence = {
  kind: "mep.failure.v3";
  contract: string;
  provider: string;
  providerAuthority: string;
  deadlineSlot: number;
  observedSlot: number;
  resultRoot: HashHex;
  result: ResultDocument;
  receipt: ExecutionReceipt;
  taskTerms: DemoContractTerms["task"];
  taskInput: TaskInput;
  policy: VerificationPolicy;
  canaryPool: CanaryPool;
  canarySeed: string;
  verification: VerificationResult;
  reason: "verification-policy-failed";
};

/** Decoded on-chain accounts a precedent reader fetches. `null` means not found. */
export type PrecedentChainFacts = {
  precedent: {
    address: string;
    dispute: string;
    workContract: string;
    rulingRoot: HashHex;
  } | null;
  dispute: {
    address: string;
    /** The dispute public key's 32 bytes, as hashed by the program. */
    key: Uint8Array;
    workContract: string;
    evidenceRoot: HashHex;
    providerBreached: boolean;
    noMajority: boolean;
    breachVotes: number;
    reveals: number;
    finalized: boolean;
  } | null;
  contract: {
    address: string;
    customerAgent: string;
    provider: string;
    /** The key that signs for the provider, decoded from the contract account. */
    providerAuthority: SignerKey;
    taskRoot: HashHex;
    verificationRuleRoot: HashHex;
    resultRoot: HashHex;
    status: string;
    /**
     * Manifest root of the stock model behind the contract's compute offer
     * (compute_offer → model_instance → model_record), or null when the contract
     * names no compute offer.
     */
    modelRoot: HashHex | null;
  } | null;
};

export type VerifiedPrecedent = {
  account: string;
  rulingRoot: HashHex;
  dispute: string;
  contract: string;
  customerAgent: string;
  provider: string;
  providerBreached: boolean;
  breachVotes: number;
  reveals: number;
};

export type PrecedentMemoryEntry = {
  account: string;
  rulingRoot: HashHex;
  provider: string;
  /** "party" if this agent was the disputing customer, "observer" if it only read the record. */
  relation: "party" | "observer";
};

export type AgentMemory = {
  kind: "mep.memory.v2";
  agent: string;
  checkpoint: number;
  previousRoot: HashHex;
  failureProbabilityOverridesBps: Record<string, number>;
  precedents: PrecedentMemoryEntry[];
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

export async function memoryRoot(memory: AgentMemory): Promise<HashHex> {
  return sha256Hex(canonicalize(memory));
}

/** A new agent trusts providers' published failure claims until a precedent says otherwise. */
export async function genesisMemory(
  agent: string,
  stockAgentRoot: HashHex
): Promise<{ memory: AgentMemory; root: HashHex }> {
  const memory: AgentMemory = {
    kind: "mep.memory.v2",
    agent,
    checkpoint: 0,
    previousRoot: stockAgentRoot,
    failureProbabilityOverridesBps: {},
    precedents: []
  };
  return { memory, root: await memoryRoot(memory) };
}

export async function evidenceRoot(evidence: FailureEvidence): Promise<HashHex> {
  return sha256Hex(canonicalize(evidence));
}

/** The commitments a contract account holds, as checked by evidence builders and readers. */
export type ContractCommitments = {
  address: string;
  providerAuthority: SignerKey;
  taskRoot: HashHex;
  verificationRuleRoot: HashHex;
  resultRoot: HashHex;
};

/** Off-chain material a customer holds for one job. */
export type VerificationMaterial = {
  result: ResultDocument;
  receipt: unknown;
  taskTerms: DemoContractTerms["task"];
  taskInput: TaskInput;
  policy: VerificationPolicy;
  canaryPool: CanaryPool;
  canarySeed: string;
};

/**
 * Checks off-chain material against a contract's on-chain commitments, verifies the
 * provider-signed receipt, and only then scores the result under the committed policy.
 * A customer passes one long-lived guard so a receipt can be accepted only once.
 */
export async function verifyAgainstContract(
  contract: ContractCommitments,
  material: VerificationMaterial,
  runningCodeRoot: HashHex,
  guard: ReceiptReplayGuard = new ReceiptReplayGuard()
): Promise<{ receipt: ExecutionReceipt; verification: VerificationResult }> {
  if ((await sha256Hex(canonicalize(material.taskTerms))) !== contract.taskRoot)
    throw new Error("Task terms do not match the contract's task root");
  if ((await taskInputRoot(material.taskInput)) !== material.taskTerms.inputRoot)
    throw new Error("Task input does not match the committed input root");
  if ((await verificationPolicyRoot(material.policy)) !== contract.verificationRuleRoot)
    throw new Error("Verification policy does not match the contract's verification rule root");
  if ((await canaryPoolRoot(material.canaryPool)) !== material.policy.sampling.poolRoot)
    throw new Error("Canary pool does not match the committed pool root");
  if ((await resultRoot(material.result)) !== contract.resultRoot)
    throw new Error("Delivered result does not match the on-chain result root");
  if (material.result.contract !== contract.address)
    throw new Error("Delivered result belongs to another contract");
  const receipt = await verifyReceipt(
    material.receipt,
    {
      contract: contract.address,
      role: "provider",
      signer: contract.providerAuthority,
      resultRoot: contract.resultRoot
    },
    // Checked now, claimed only after scoring succeeds: a step that fails on a
    // policy or seed mismatch can be retried without tripping the replay guard.
    {
      claim: (r) => {
        guard.assertUnused(r);
      }
    }
  );
  const verification = await runVerification({
    policy: material.policy,
    runningCodeRoot,
    pool: material.canaryPool,
    seed: material.canarySeed,
    contract: contract.address,
    taskInput: material.taskInput,
    result: material.result
  });
  guard.claim(receipt);
  return { receipt, verification };
}

/**
 * Assembles evidence for a submitted result that failed its committed verification
 * policy. The evidence supports a dispute; only the jury's ruling moves escrow.
 */
export async function buildFailureEvidence(input: {
  contract: ContractCommitments;
  provider: string;
  deadlineSlot: number;
  observedSlot: number;
  material: VerificationMaterial;
  runningCodeRoot: HashHex;
}): Promise<{ evidence: FailureEvidence; root: HashHex }> {
  if (input.observedSlot <= input.deadlineSlot)
    throw new Error("A dispute can be opened only after the contract deadline");
  const { receipt, verification } = await verifyAgainstContract(
    input.contract,
    input.material,
    input.runningCodeRoot
  );
  if (verification.passed) throw new Error("The result passed its verification policy");
  const evidence: FailureEvidence = {
    kind: "mep.failure.v3",
    contract: input.contract.address,
    provider: input.provider,
    providerAuthority: input.contract.providerAuthority.address,
    deadlineSlot: input.deadlineSlot,
    observedSlot: input.observedSlot,
    resultRoot: input.contract.resultRoot,
    result: input.material.result,
    receipt,
    taskTerms: input.material.taskTerms,
    taskInput: input.material.taskInput,
    policy: input.material.policy,
    canaryPool: input.material.canaryPool,
    canarySeed: input.material.canarySeed,
    verification,
    reason: "verification-policy-failed"
  };
  return { evidence, root: await evidenceRoot(evidence) };
}

/** Mirrors `publish_precedent`: sha256("mep.precedent.v1" ‖ dispute ‖ evidence ‖ tally). */
export async function computeRulingRoot(
  disputeKey: Uint8Array,
  evidenceRoot: HashHex,
  tally: { providerBreached: boolean; breachVotes: number; reveals: number; noMajority: boolean }
): Promise<HashHex> {
  if (disputeKey.length !== 32) throw new Error("Dispute key must be 32 bytes");
  const domain = new TextEncoder().encode("mep.precedent.v1");
  const tallyBytes = Uint8Array.from([
    tally.providerBreached ? 1 : 0,
    tally.breachVotes,
    tally.reveals,
    tally.noMajority ? 1 : 0
  ]);
  const message = new Uint8Array(domain.length + 32 + 32 + tallyBytes.length);
  message.set(domain, 0);
  message.set(disputeKey, domain.length);
  message.set(rootBytes(evidenceRoot), domain.length + 32);
  message.set(tallyBytes, domain.length + 64);
  return sha256Bytes(message);
}

/**
 * Checks a published precedent against the chain before an agent may learn from it:
 * the record must exist, its ruling root must recompute from the finalized dispute,
 * the evidence must match the dispute's commitment and the contract's roots, the
 * receipt must carry the provider authority's signature, and the committed checker,
 * re-run here, must reproduce the recorded verification result.
 */
export async function verifyPrecedent(
  facts: PrecedentChainFacts,
  evidence: FailureEvidence,
  runningCodeRoot: HashHex,
  stockModels: readonly StockModelManifest[]
): Promise<VerifiedPrecedent> {
  const { precedent, dispute, contract } = facts;
  if (!precedent) throw new Error("Precedent record is missing on-chain");
  if (!dispute) throw new Error("Dispute account is missing on-chain");
  if (!contract) throw new Error("Work contract account is missing on-chain");
  if (!dispute.finalized) throw new Error("Dispute is not finalized");
  if (precedent.dispute !== dispute.address || precedent.workContract !== dispute.workContract)
    throw new Error("Precedent does not reference this dispute");
  if (dispute.workContract !== contract.address)
    throw new Error("Dispute does not reference this work contract");
  const expected = await computeRulingRoot(dispute.key, dispute.evidenceRoot, dispute);
  if (expected !== precedent.rulingRoot)
    throw new Error(
      `ruling_root mismatch: chain has ${precedent.rulingRoot}, recomputed ${expected}`
    );
  if (dispute.providerBreached !== (contract.status === "breached"))
    throw new Error("Contract status disagrees with the ruling");

  if ((await evidenceRoot(evidence)) !== dispute.evidenceRoot)
    throw new Error("Evidence does not match the dispute's evidence root");
  if (
    evidence.contract !== contract.address ||
    evidence.provider !== contract.provider ||
    evidence.providerAuthority !== contract.providerAuthority.address
  )
    throw new Error("Evidence names a different contract or provider");
  if (evidence.resultRoot !== contract.resultRoot)
    throw new Error("Evidence result root differs from the on-chain result root");
  // Canaries only test the hired model if they come from that model's pool. Otherwise a
  // customer could commit another model's pool and fail an honest provider.
  if (!contract.modelRoot) throw new Error("The disputed contract names no contracted model");
  let contracted: StockModelManifest | undefined;
  for (const model of stockModels)
    if ((await manifestRoot(model)) === contract.modelRoot) contracted = model;
  if (!contracted)
    throw new Error("No supplied stock model manifest matches the contracted model root");
  if (evidence.canaryPool.stockModelId !== contracted.id)
    throw new Error(
      `Canary pool is for ${evidence.canaryPool.stockModelId}, but the contract hired ${contracted.id}`
    );
  const { verification } = await verifyAgainstContract(contract, evidence, runningCodeRoot);
  if (canonicalize(verification) !== canonicalize(evidence.verification))
    throw new Error("Recorded verification does not replay from the delivered result");
  if (verification.passed) throw new Error("The delivered result passes its verification policy");

  return {
    account: precedent.address,
    rulingRoot: precedent.rulingRoot,
    dispute: dispute.address,
    contract: contract.address,
    customerAgent: contract.customerAgent,
    provider: contract.provider,
    providerBreached: dispute.providerBreached,
    breachVotes: dispute.breachVotes,
    reveals: dispute.reveals
  };
}

/** Applies a verified breach precedent to an agent's memory. Deterministic and order-preserving. */
export async function learnFromPrecedent(
  previous: AgentMemory,
  precedent: VerifiedPrecedent
): Promise<{ memory: AgentMemory; root: HashHex }> {
  if (!precedent.providerBreached)
    throw new Error("A finalized precedent that finds a provider breach is required");
  if (previous.precedents.some((entry) => entry.rulingRoot === precedent.rulingRoot))
    throw new Error("This precedent is already in the agent's memory");
  const memory: AgentMemory = {
    kind: "mep.memory.v2",
    agent: previous.agent,
    checkpoint: previous.checkpoint + 1,
    previousRoot: await memoryRoot(previous),
    failureProbabilityOverridesBps: {
      ...previous.failureProbabilityOverridesBps,
      [precedent.provider]: raiseRiskAfterBreach(
        previous.failureProbabilityOverridesBps[precedent.provider]
      )
    },
    precedents: [
      ...previous.precedents,
      {
        account: precedent.account,
        rulingRoot: precedent.rulingRoot,
        provider: precedent.provider,
        relation: precedent.customerAgent === previous.agent ? "party" : "observer"
      }
    ]
  };
  return { memory, root: await memoryRoot(memory) };
}
