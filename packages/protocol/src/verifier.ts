import { canonicalize, sha256Hex, type HashHex } from "./hash.ts";

// Deterministic verification of a delivered compute result, under a policy the
// customer commits in the contract's verification_rule_root before the job runs.
//
// Two signals are scored, never hash-matched:
// - the task output itself, with task-specific checks against the task input
//   (schema, required fields, tool-call validity, fields grounded in the source);
// - canary prompts drawn from a larger hidden pool by a committed seed, scored
//   tolerantly so honest hosts with formatting differences still pass.
// A failed verification supports a dispute. It never moves escrow by itself.

/** Checker identity. Bump the version when scoring rules change. */
export const CHECKER = { name: "mep.task-checker", version: "1.2.0" } as const;

/**
 * Source files whose contents define the checker. Their combined root is committed
 * in every policy, so a verifier can prove it re-ran the same checker code.
 */
export const CHECKER_SOURCE_FILES = [
  "packages/protocol/src/hash.ts",
  "packages/protocol/src/verifier.ts"
] as const;

export const TASK_CHECKS = [
  "output-json",
  "required-fields",
  "tool-calls-valid",
  "fields-in-source",
  "answers-consistent"
] as const;
export type TaskCheckId = (typeof TASK_CHECKS)[number];

const BPS = 10_000;

export type SourceDocument = {
  readonly id: string;
  readonly kind: "invoice" | "agreement" | "exhibit";
  readonly text: string;
};

export type ToolSpec = {
  readonly name: string;
  readonly parameters: Readonly<Record<string, { readonly type: "string" }>>;
  readonly required: readonly string[];
};

/** The job's input. Its root is the `inputRoot` committed in the contract's task terms. */
export type TaskInput = {
  readonly kind: "mep.task-input.v1";
  readonly task: "evidence-summary";
  readonly instructions: string;
  readonly documents: readonly SourceDocument[];
  readonly tools: readonly ToolSpec[];
};

export type CanaryChallenge = {
  readonly id: string;
  readonly prompt: string;
  readonly referenceOutput: string;
};

/** A stock model's hidden canary pool, with its reference build's outputs. */
export type CanaryPool = {
  readonly kind: "mep.canary-pool.v1";
  readonly id: string;
  readonly stockModelId: string;
  readonly challenges: readonly CanaryChallenge[];
};

export type VerificationPolicy = {
  readonly kind: "mep.verification-policy.v1";
  readonly checker: {
    readonly name: string;
    readonly version: string;
    readonly codeRoot: HashHex;
  };
  readonly sampling: {
    readonly poolId: string;
    readonly poolRoot: HashHex;
    readonly canaryCount: number;
    /** Canaries are ranked by sha256(seed, contract, challenge id); the lowest are drawn. */
    readonly draw: "sha256-rank.v1";
    readonly seedCommitment: HashHex;
  };
  readonly taskChecks: readonly TaskCheckId[];
  readonly weightsBps: { readonly task: number; readonly canary: number };
  readonly thresholdBps: number;
};

/** What a provider delivers: the task output plus its answers to the drawn canaries. */
export type ResultDocument = {
  readonly kind: "mep.result.v1";
  readonly contract: string;
  readonly taskOutput: string;
  readonly canaryOutputs: Readonly<Record<string, string>>;
};

export type TaskCheckResult = {
  readonly id: TaskCheckId;
  readonly passed: boolean;
  readonly detail: string;
};

export type CanaryScore = {
  readonly challengeId: string;
  readonly method: "json-fields" | "normalized-text";
  readonly expectedOutputRoot: HashHex;
  readonly observedOutputRoot: HashHex | null;
  readonly scoreBps: number;
};

export type VerificationResult = {
  readonly kind: "mep.verification.v1";
  readonly contract: string;
  readonly policyRoot: HashHex;
  readonly checker: VerificationPolicy["checker"];
  readonly drawnCanaries: readonly string[];
  readonly taskChecks: readonly TaskCheckResult[];
  readonly canaries: readonly CanaryScore[];
  readonly taskScoreBps: number;
  readonly canaryScoreBps: number;
  readonly scoreBps: number;
  readonly thresholdBps: number;
  readonly passed: boolean;
};

export async function resultRoot(result: ResultDocument): Promise<HashHex> {
  return sha256Hex(canonicalize(result));
}

export async function taskInputRoot(input: TaskInput): Promise<HashHex> {
  return sha256Hex(canonicalize(input));
}

export async function canaryPoolRoot(pool: CanaryPool): Promise<HashHex> {
  return sha256Hex(canonicalize(pool));
}

/** Equals the contract's verification_rule_root when the policy is the committed rule. */
export async function verificationPolicyRoot(policy: VerificationPolicy): Promise<HashHex> {
  return sha256Hex(canonicalize(policy));
}

export async function seedCommitment(seed: string): Promise<HashHex> {
  if (!/^[0-9a-f]{64}$/.test(seed)) throw new Error("Canary seed must be 32 bytes of hex");
  return sha256Hex(`mep.canary-seed.v1:${seed}`);
}

/** Combined root of the checker's source files. Line endings are normalized to LF. */
export async function checkerCodeRoot(read: (path: string) => Promise<string>): Promise<HashHex> {
  const files = [];
  for (const path of CHECKER_SOURCE_FILES)
    files.push({ path, root: await sha256Hex((await read(path)).replace(/\r\n/g, "\n")) });
  return sha256Hex(canonicalize({ kind: "mep.checker-code.v1", files }));
}

export async function buildVerificationPolicy(input: {
  codeRoot: HashHex;
  pool: CanaryPool;
  canaryCount: number;
  seedCommitment: HashHex;
  thresholdBps?: number;
  weightsBps?: VerificationPolicy["weightsBps"];
  taskChecks?: readonly TaskCheckId[];
}): Promise<VerificationPolicy> {
  const policy: VerificationPolicy = {
    kind: "mep.verification-policy.v1",
    checker: { ...CHECKER, codeRoot: input.codeRoot },
    sampling: {
      poolId: input.pool.id,
      poolRoot: await canaryPoolRoot(input.pool),
      canaryCount: input.canaryCount,
      draw: "sha256-rank.v1",
      seedCommitment: input.seedCommitment
    },
    taskChecks: input.taskChecks ?? TASK_CHECKS,
    weightsBps: input.weightsBps ?? { task: 7_000, canary: 3_000 },
    thresholdBps: input.thresholdBps ?? 9_000
  };
  validatePolicy(policy, input.pool);
  return policy;
}

function validatePolicy(policy: VerificationPolicy, pool: CanaryPool) {
  const bps = (value: number, label: string) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > BPS)
      throw new Error(`${label} must be an integer from 0 to 10000`);
  };
  // Policies arrive in evidence from other parties, so check the kind at runtime.
  const kind: string = policy.kind;
  if (kind !== "mep.verification-policy.v1") throw new Error(`Unknown policy kind: ${kind}`);
  bps(policy.thresholdBps, "thresholdBps");
  bps(policy.weightsBps.task, "task weight");
  bps(policy.weightsBps.canary, "canary weight");
  if (policy.weightsBps.task + policy.weightsBps.canary !== BPS)
    throw new Error("Policy weights must sum to 10000");
  const count = policy.sampling.canaryCount;
  if (!Number.isSafeInteger(count) || count < 1 || count > pool.challenges.length)
    throw new Error(
      `canaryCount must be from 1 to the pool size (${String(pool.challenges.length)})`
    );
  if (new Set(pool.challenges.map((c) => c.id)).size !== pool.challenges.length)
    throw new Error("Canary pool has duplicate challenge ids");
  if (
    policy.taskChecks.length === 0 ||
    new Set(policy.taskChecks).size !== policy.taskChecks.length ||
    !policy.taskChecks.every((id) => (TASK_CHECKS as readonly string[]).includes(id))
  )
    throw new Error("Policy task checks must be a non-empty set of known checks");
}

/** The canaries a job must answer. Deterministic in the seed, contract, and pool. */
export async function drawCanaries(
  pool: CanaryPool,
  seed: string,
  contract: string,
  count: number
): Promise<readonly CanaryChallenge[]> {
  if (!/^[0-9a-f]{64}$/.test(seed)) throw new Error("Canary seed must be 32 bytes of hex");
  if (!Number.isSafeInteger(count) || count < 1 || count > pool.challenges.length)
    throw new Error("Canary count is outside the pool size");
  const ranked = await Promise.all(
    pool.challenges.map(async (challenge) => ({
      challenge,
      rank: await sha256Hex(canonicalize({ seed, contract, challenge: challenge.id }))
    }))
  );
  ranked.sort((left, right) =>
    left.rank < right.rank
      ? -1
      : left.rank > right.rank
        ? 1
        : left.challenge.id < right.challenge.id
          ? -1
          : 1
  );
  return ranked.slice(0, count).map((entry) => entry.challenge);
}

// Formatting differences that must not fail an honest host: case, Unicode forms,
// curly quotes, repeated whitespace, and trailing sentence punctuation.
export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();
}

/** "418.20" and "418.2" are the same amount; "5,000,000" is 5000000. */
function normalizeDecimal(value: string): string | undefined {
  const compact = value.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(compact)) return undefined;
  const [whole = "0", fraction = ""] = compact.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return `${whole.replace(/^(-?)0+(?=\d)/, "$1")}${trimmed ? `.${trimmed}` : ""}`;
}

function sameValue(left: string, right: string): boolean {
  const a = normalizeDecimal(left);
  const b = normalizeDecimal(right);
  if (a !== undefined && b !== undefined) return a === b;
  return normalizeText(left) === normalizeText(right);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

// Keys are JSON-quoted so {"a.b":1} cannot alias {"a":{"b":1}} or an array index, and
// empty containers are leaves so they count as fields and a path set is never empty.
function leaves(value: unknown, path = "$", into = new Map<string, string>()) {
  if (Array.isArray(value)) {
    if (value.length === 0) into.set(path, "[]");
    value.forEach((item, i) => leaves(item, `${path}[${String(i)}]`, into));
  } else if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) into.set(path, "{}");
    for (const [key, item] of entries) leaves(item, `${path}[${JSON.stringify(key)}]`, into);
  } else into.set(path, String(value));
  return into;
}

async function scoreCanary(
  challenge: CanaryChallenge,
  observed: string | undefined
): Promise<CanaryScore> {
  const expectedOutputRoot = await sha256Hex(challenge.referenceOutput);
  const observedOutputRoot = observed === undefined ? null : await sha256Hex(observed);
  const reference = parseJson(challenge.referenceOutput);
  const structured =
    reference.ok && reference.value !== null && typeof reference.value === "object";
  let scoreBps = 0;
  if (observed !== undefined && structured) {
    // Field-level partial credit: a dropped tool argument costs one field, not the canary.
    const parsed = parseJson(observed);
    if (parsed.ok) {
      const want = leaves(reference.value);
      const got = leaves(parsed.value);
      const paths = new Set([...want.keys(), ...got.keys()]);
      let matched = 0;
      for (const path of paths) {
        const a = want.get(path);
        const b = got.get(path);
        if (a !== undefined && b !== undefined && sameValue(a, b)) matched++;
      }
      scoreBps = Math.floor((BPS * matched) / paths.size);
    }
  } else if (observed !== undefined) {
    scoreBps = normalizeText(observed) === normalizeText(challenge.referenceOutput) ? BPS : 0;
  }
  return {
    challengeId: challenge.id,
    method: structured ? "json-fields" : "normalized-text",
    expectedOutputRoot,
    observedOutputRoot,
    scoreBps
  };
}

type Record_ = Readonly<Record<string, unknown>>;
const isRecord = (value: unknown): value is Record_ =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

/** Fields an evidence summary must contain, as dotted paths for readable failures. */
const REQUIRED_FIELDS = [
  "invoice.id",
  "invoice.total",
  "invoice.currency",
  "liability.clause",
  "liability.capLamports",
  "summary"
] as const;

function field(output: Record_, path: string): string | undefined {
  let value: unknown = output;
  for (const key of path.split(".")) value = isRecord(value) ? value[key] : undefined;
  return text(value);
}

/** Formatting tolerance only: preserve negation and every substantive word. */
function normalizedFinding(value: string): string {
  return normalizeText(value)
    .replace(/\d[\d,]*(?:\.\d+)?/g, (amount) => normalizeDecimal(amount) ?? amount)
    .replace(/\b(?:a|an|the|is)\b/g, " ")
    .replace(/[;,:.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * This checker supports the labeled invoice/agreement format used by the task.
 * Unsupported or ambiguous source layouts fail closed instead of accepting any
 * number that happens to occur in the document. This is not semantic NLP.
 */
function sourceFacts(input: TaskInput) {
  const invoices = input.documents.filter((d) => d.kind === "invoice");
  const agreements = input.documents.filter((d) => d.kind === "agreement");
  const invoice = invoices.length === 1 ? invoices[0] : undefined;
  const agreement = agreements.length === 1 ? agreements[0] : undefined;
  const ids = [...(invoice?.text ?? "").matchAll(/^Invoice\s+(\S+)\s*$/gim)];
  const totals = [
    ...(invoice?.text ?? "").matchAll(/^Total due:\s*([\d,]+(?:\.\d+)?)\s+([A-Z]{3})\s*$/gim)
  ];
  const liabilities = [
    ...(agreement?.text ?? "").matchAll(
      /^Clause\s+(\d+)\.\s*Liability:\s*each party's liability is capped at\s+([\d,]+(?:\.\d+)?)\s+lamports per job\.\s*$/gim
    )
  ];
  const fields: Record<string, string | undefined> = {
    "invoice.id": ids.length === 1 ? ids[0]?.[1] : undefined,
    "invoice.total": totals.length === 1 ? totals[0]?.[1] : undefined,
    "invoice.currency": totals.length === 1 ? totals[0]?.[2] : undefined,
    "liability.clause": liabilities.length === 1 ? liabilities[0]?.[1] : undefined,
    "liability.capLamports": liabilities.length === 1 ? liabilities[0]?.[2] : undefined
  };
  const exhibits = input.documents
    .filter((d) => d.kind === "exhibit")
    .map((doc) => {
      const match = /^Exhibit\s+(\S+)\s*\([^\n)]+\):\s*(.+)$/i.exec(doc.text);
      return {
        id: doc.id,
        finding: match && sameValue(match[1] ?? "", doc.id) ? match[2] : undefined
      };
    });
  const complete =
    Object.values(fields).every((v) => v !== undefined) &&
    exhibits.length > 0 &&
    exhibits.every((e) => e.finding !== undefined) &&
    new Set(exhibits.map((e) => normalizeText(e.id))).size === exhibits.length;
  const summary = complete
    ? `Invoice ${fields["invoice.id"] ?? ""} totals ${fields["invoice.total"] ?? ""} ${fields["invoice.currency"] ?? ""}. Clause ${fields["liability.clause"] ?? ""} caps liability at ${fields["liability.capLamports"] ?? ""} lamports per job. ${exhibits.map((e) => `Exhibit ${e.id} shows ${e.finding ?? ""}`).join(" ")}`
    : undefined;
  return { fields, exhibits, summary };
}

/** Deterministic checks of an evidence-summary task output against its task input. */
export function runTaskChecks(
  input: TaskInput,
  taskOutput: string,
  checks: readonly TaskCheckId[] = TASK_CHECKS
): readonly TaskCheckResult[] {
  const kind: string = input.kind;
  const task: string = input.task;
  if (kind !== "mep.task-input.v1" || task !== "evidence-summary")
    throw new Error("The checker supports only evidence-summary task inputs");
  const parsed = parseJson(taskOutput);
  const output: Record_ =
    parsed.ok && isRecord(parsed.value) && parsed.value.schema === "mep.evidence-summary.v1"
      ? parsed.value
      : {};
  const exhibits = Array.isArray(output.exhibits) ? (output.exhibits as unknown[]) : [];
  const toolCalls = Array.isArray(output.toolCalls) ? (output.toolCalls as unknown[]) : [];
  const facts = sourceFacts(input);

  const results: Record<TaskCheckId, () => TaskCheckResult> = {
    "output-json": () => {
      const passed = parsed.ok && isRecord(parsed.value) && output === parsed.value;
      return {
        id: "output-json",
        passed,
        detail: passed
          ? "Output is a mep.evidence-summary.v1 JSON object"
          : "Output is not a mep.evidence-summary.v1 JSON object"
      };
    },
    "required-fields": () => {
      const missing: string[] = REQUIRED_FIELDS.filter((path) => !field(output, path));
      if (
        exhibits.length === 0 ||
        !exhibits.every((e) => isRecord(e) && text(e.id) && text(e.finding))
      )
        missing.push("exhibits[].id/finding");
      if (toolCalls.length === 0) missing.push("toolCalls[]");
      return {
        id: "required-fields",
        passed: missing.length === 0,
        detail: missing.length ? `Missing: ${missing.join(", ")}` : "All required fields present"
      };
    },
    "tool-calls-valid": () => {
      const problems: string[] = [];
      if (toolCalls.length === 0) problems.push("no tool calls");
      for (const [i, call] of toolCalls.entries()) {
        const spec = isRecord(call) ? input.tools.find((t) => t.name === call.tool) : undefined;
        const args = isRecord(call) && isRecord(call.arguments) ? call.arguments : undefined;
        if (!spec || !args) {
          problems.push(`call ${String(i)}: unknown tool or malformed arguments`);
          continue;
        }
        for (const name of spec.required)
          if (!text(args[name])) problems.push(`${spec.name}: missing ${name}`);
        for (const [name, value] of Object.entries(args))
          if (!Object.hasOwn(spec.parameters, name) || typeof value !== "string")
            problems.push(`${spec.name}: invalid argument ${name}`);
      }
      return {
        id: "tool-calls-valid",
        passed: problems.length === 0,
        detail: problems.length ? problems.join("; ") : "Every tool call matches its tool schema"
      };
    },
    "fields-in-source": () => {
      const ungrounded: string[] = [];
      for (const [path, expected] of Object.entries(facts.fields)) {
        const value = field(output, path);
        if (!value || expected === undefined || !sameValue(value, expected)) ungrounded.push(path);
      }
      for (const exhibit of exhibits) {
        const id = isRecord(exhibit) ? text(exhibit.id) : undefined;
        const finding = isRecord(exhibit) ? text(exhibit.finding) : undefined;
        const source = facts.exhibits.find((e) => id !== undefined && sameValue(e.id, id));
        if (
          !source?.finding ||
          !finding ||
          normalizedFinding(finding) !== normalizedFinding(source.finding)
        )
          ungrounded.push(`exhibit ${id ?? "?"} finding`);
      }
      return {
        id: "fields-in-source",
        passed: ungrounded.length === 0,
        detail: ungrounded.length
          ? `Not found in the task input: ${ungrounded.join(", ")}`
          : "Every extracted field appears in the source documents"
      };
    },
    "answers-consistent": () => {
      const problems: string[] = [];
      const invoiceId = field(output, "invoice.id");
      const currency = field(output, "invoice.currency");
      for (const call of toolCalls) {
        const args = isRecord(call) && isRecord(call.arguments) ? call.arguments : {};
        const id = text(args.invoice_id);
        const cur = text(args.currency);
        if (id !== undefined && (!invoiceId || !sameValue(id, invoiceId)))
          problems.push("tool call invoice_id differs from the extracted invoice");
        if (cur !== undefined && (!currency || !sameValue(cur, currency)))
          problems.push("tool call currency differs from the extracted currency");
      }
      for (const doc of facts.exhibits)
        if (!exhibits.some((e) => isRecord(e) && sameValue(String(e.id), doc.id)))
          problems.push(`exhibit ${doc.id} is not summarized`);
      const summary = field(output, "summary");
      if (
        !summary ||
        !facts.summary ||
        normalizedFinding(summary) !== normalizedFinding(facts.summary)
      )
        problems.push(
          "summary must state the source invoice, liability terms, and exhibit findings without additional claims"
        );
      return {
        id: "answers-consistent",
        passed: problems.length === 0 && invoiceId !== undefined,
        detail: problems.length
          ? problems.join("; ")
          : invoiceId
            ? "Tool calls and exhibits agree with the extracted fields"
            : "No extracted invoice to check against"
      };
    }
  };
  return checks.map((id) => results[id]());
}

/**
 * Scores a delivered result under a committed policy. Throws when the inputs do not
 * match the policy's commitments, so a verifier cannot score with a different pool,
 * seed, or checker than the one the contract committed.
 */
export async function runVerification(input: {
  policy: VerificationPolicy;
  /** Root of the checker code actually running, from `checkerCodeRoot`. */
  runningCodeRoot: HashHex;
  pool: CanaryPool;
  seed: string;
  contract: string;
  taskInput: TaskInput;
  result: ResultDocument;
}): Promise<VerificationResult> {
  const { policy, pool, result } = input;
  validatePolicy(policy, pool);
  if (policy.checker.name !== CHECKER.name || policy.checker.version !== CHECKER.version)
    throw new Error(
      `Policy names checker ${policy.checker.name}@${policy.checker.version}; this is ${CHECKER.name}@${CHECKER.version}`
    );
  if (policy.checker.codeRoot !== input.runningCodeRoot)
    throw new Error(
      `Checker code root mismatch: the policy commits ${policy.checker.codeRoot}, this checker is ${input.runningCodeRoot}. Check out the commit that produced the policy.`
    );
  if (
    pool.id !== policy.sampling.poolId ||
    (await canaryPoolRoot(pool)) !== policy.sampling.poolRoot
  )
    throw new Error("Canary pool does not match the policy's pool root");
  if ((await seedCommitment(input.seed)) !== policy.sampling.seedCommitment)
    throw new Error("Canary seed does not match the policy's seed commitment");
  if (result.contract !== input.contract) throw new Error("Result belongs to another contract");

  const drawn = await drawCanaries(pool, input.seed, input.contract, policy.sampling.canaryCount);
  const canaries: CanaryScore[] = [];
  for (const challenge of drawn)
    canaries.push(
      await scoreCanary(
        challenge,
        Object.hasOwn(result.canaryOutputs, challenge.id)
          ? result.canaryOutputs[challenge.id]
          : undefined
      )
    );
  const taskChecks = runTaskChecks(input.taskInput, result.taskOutput, policy.taskChecks);
  const taskScoreBps = Math.floor(
    (BPS * taskChecks.filter((c) => c.passed).length) / taskChecks.length
  );
  const canaryScoreBps = Math.floor(
    canaries.reduce((sum, canary) => sum + canary.scoreBps, 0) / canaries.length
  );
  const scoreBps = Math.floor(
    (taskScoreBps * policy.weightsBps.task + canaryScoreBps * policy.weightsBps.canary) / BPS
  );
  return {
    kind: "mep.verification.v1",
    contract: input.contract,
    policyRoot: await verificationPolicyRoot(policy),
    checker: policy.checker,
    drawnCanaries: drawn.map((challenge) => challenge.id),
    taskChecks,
    canaries,
    taskScoreBps,
    canaryScoreBps,
    scoreBps,
    thresholdBps: policy.thresholdBps,
    passed: scoreBps >= policy.thresholdBps
  };
}
