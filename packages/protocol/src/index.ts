export const PROTOCOL_NAME = "Machine Economy Protocol";
export const DEFAULT_CLUSTER = "localnet";
export { rankComputeOffers, RESERVATION_RISK_BPS } from "./router.ts";
export type { UtilityBreakdown, UtilityRouterInput } from "./router.ts";
export { calculateAgentMarginLamports } from "./subcontract.ts";

export type DemoLoopStage =
  | "foundation-registry"
  | "agent-passport"
  | "provider-marketplace"
  | "risk-router"
  | "work-contract"
  | "subcontract"
  | "controlled-failure"
  | "dispute"
  | "precedent"
  | "memory-update"
  | "second-job";

export const MVP_DEMO_LOOP: readonly DemoLoopStage[] = [
  "foundation-registry",
  "agent-passport",
  "provider-marketplace",
  "risk-router",
  "work-contract",
  "subcontract",
  "controlled-failure",
  "dispute",
  "precedent",
  "memory-update",
  "second-job"
] as const;

export type HashHex = `sha256:${string}`;

export type ReservationClass = "spot" | "reserved" | "dedicated";

export type ProviderMarketRecord = {
  readonly id: string;
  readonly displayName: string;
  readonly evidenceRoot: HashHex;
  readonly hardwareTrustBps: number;
  readonly executionTrustBps: number;
  readonly breachCount: number;
};

export type ModelInstanceMarketRecord = {
  readonly id: string;
  readonly providerId: string;
  readonly stockModelId: string;
  readonly executionCommitment: HashHex;
  readonly modelTrustBps: number;
};

export type ComputeOfferMarketRecord = {
  readonly id: string;
  readonly modelInstanceId: string;
  readonly priceLamports: number;
  readonly expectedLatencyMs: number;
  readonly failureProbabilityBps: number;
  readonly reservationClass: ReservationClass;
};

export type DemoContractTerms = {
  readonly task: {
    readonly kind: "evidence-summary" | "ocr-extraction";
    readonly inputRoot: HashHex;
  };
  readonly verificationRule: {
    readonly kind: "customer-attested-result-root";
  };
  readonly liabilityRule: {
    readonly kind: "missed-deadline-provider-liability";
    readonly limitLamports: number;
  };
};

export type StockModelManifest = {
  readonly kind: "mep.stock-model.v1";
  readonly id: string;
  readonly displayName: string;
  readonly modelFamily: string;
  readonly version: number;
  readonly artifact: {
    readonly format: "stub" | "gguf" | "safetensors" | "onnx";
    readonly hash: HashHex;
    readonly parameterCount: string;
    readonly contextWindowTokens: number;
  };
  readonly capabilities: readonly string[];
  readonly license: string;
};

export type StockAgentManifest = {
  readonly kind: "mep.stock-agent.v1";
  readonly id: string;
  readonly displayName: string;
  readonly version: number;
  readonly role: "research" | "ops" | "juror" | "specialist";
  readonly policy: {
    readonly maxPriceLamports: number;
    readonly failureLossLamports: number;
    readonly delayLossLamportsPerSecond: number;
    readonly privacyWeightBps: number;
  };
  readonly preferredCapabilities: readonly string[];
  readonly memoryTemplateHash: HashHex;
};

export type FoundationManifest = StockModelManifest | StockAgentManifest;

export type VerifiedManifest<TManifest extends FoundationManifest> = {
  readonly manifest: TManifest;
  readonly manifestRoot: HashHex;
  readonly isVerified: true;
};

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortForCanonicalJson(value));
}

export async function sha256Hex(value: string): Promise<HashHex> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

export async function manifestRoot(manifest: FoundationManifest): Promise<HashHex> {
  return sha256Hex(canonicalize(manifest));
}

export async function verifyManifest<TManifest extends FoundationManifest>(
  manifest: TManifest,
  expectedRoot: HashHex
): Promise<VerifiedManifest<TManifest>> {
  const actualRoot = await manifestRoot(manifest);

  if (actualRoot !== expectedRoot) {
    throw new Error(
      `Manifest root mismatch for ${manifest.id}: expected ${expectedRoot}, got ${actualRoot}`
    );
  }

  return {
    manifest,
    manifestRoot: actualRoot,
    isVerified: true
  };
}

function sortForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortForCanonicalJson(item));
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortForCanonicalJson(item)])
  );
}
