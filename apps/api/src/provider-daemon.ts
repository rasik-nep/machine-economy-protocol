import {
  DEMO_CANARY_POOLS,
  DEMO_DEGRADED_CANARY_OUTPUTS,
  DEMO_DEGRADED_TASK_OUTPUT,
  DEMO_TASK_OUTPUT
} from "../../../packages/fixtures/src/index.ts";
import { canonicalize, sha256Hex, type HashHex } from "../../../packages/protocol/src/hash.ts";
import { signReceipt, type ExecutionReceipt } from "../../../packages/protocol/src/receipt.ts";
import {
  resultRoot,
  type CanaryPool,
  type ResultDocument
} from "../../../packages/protocol/src/verifier.ts";

/**
 * "reference": the host serves the registered stock model as published.
 * "degraded": the controlled demo fault. The host's serving is degraded (for example
 * a broken tool-call parser or a misconfigured runtime); the cause is left generic.
 * Nothing here is random.
 */
export type ServingMode = "reference" | "degraded";

/** What the customer sends: the task and the drawn canary prompts, unlabeled. */
export type JobRequest = {
  readonly kind: "mep.job-request.v1";
  readonly contract: string;
  readonly modelInstance: string;
  readonly taskInputRoot: HashHex;
  readonly prompts: readonly { readonly id: string; readonly prompt: string }[];
};

/** The key the daemon signs with. In fixture mode it is the provider's authority key. */
export type DaemonSigner = { readonly address: string; readonly secretKey: Uint8Array };

export function poolFor(stockModelId: string): CanaryPool {
  const pool = DEMO_CANARY_POOLS.find((candidate) => candidate.stockModelId === stockModelId);
  if (!pool) throw new Error(`No canary pool for stock model ${stockModelId}`);
  return pool;
}

export async function requestHash(request: JobRequest): Promise<HashHex> {
  return sha256Hex(canonicalize(request));
}

/** Rough token count for the receipt: four characters per token. */
const tokens = (text: string) => Math.ceil(text.length / 4);

/**
 * The demo provider daemon. It serves a request deterministically for its serving
 * mode and signs a mep.receipt.v1 as the provider. `now` is injectable for tests.
 */
export async function serveJob(
  request: JobRequest,
  stockModelId: string,
  mode: ServingMode,
  signer: DaemonSigner,
  now: () => number = Date.now
): Promise<{ result: ResultDocument; receipt: ExecutionReceipt }> {
  const startedAt = now();
  const pool = poolFor(stockModelId);
  const drift = mode === "degraded" ? (DEMO_DEGRADED_CANARY_OUTPUTS[pool.id] ?? {}) : {};
  const canaryOutputs: Record<string, string> = {};
  for (const { id } of request.prompts) {
    const challenge = pool.challenges.find((candidate) => candidate.id === id);
    if (!challenge) throw new Error(`The daemon cannot answer prompt ${id}`);
    canaryOutputs[id] = drift[id] ?? challenge.referenceOutput;
  }
  const result: ResultDocument = {
    kind: "mep.result.v1",
    contract: request.contract,
    taskOutput: mode === "degraded" ? DEMO_DEGRADED_TASK_OUTPUT : DEMO_TASK_OUTPUT,
    canaryOutputs
  };
  const receipt = await signReceipt(
    {
      kind: "mep.receipt.v1",
      signerRole: "provider",
      signer: signer.address,
      contract: request.contract,
      sequence: 0,
      modelInstance: request.modelInstance,
      requestHash: await requestHash(request),
      resultRoot: await resultRoot(result),
      startedAt,
      finishedAt: Math.max(startedAt, now()),
      tokensIn: tokens(canonicalize(request)),
      tokensOut: tokens(canonicalize(result)),
      hardwareClaim: "simulated demo daemon"
    },
    signer.secretKey
  );
  return { result, receipt };
}
