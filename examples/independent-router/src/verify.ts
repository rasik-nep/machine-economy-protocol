// An independent router's check of a published precedent. It trusts no server: the
// only input from the demo is an evidence bundle (a file), and every document in it
// is checked against roots read from the chain before the router acts on it.
// It imports only pure functions from packages/protocol.
import { z } from "zod";

import {
  rankComputeOffers,
  sha256Hex,
  tiersOf,
  type HashHex,
  type StockModelManifest,
  type UtilityBreakdown
} from "../../../packages/protocol/src/index.ts";
import {
  marketFromChain,
  type ChainMarketAccounts
} from "../../../packages/protocol/src/chain-market.ts";
import {
  genesisMemory,
  learnFromPrecedent,
  verifyPrecedent,
  type FailureEvidence,
  type PrecedentChainFacts,
  type VerifiedPrecedent
} from "../../../packages/protocol/src/learning.ts";

/** Decoded program accounts. Implementations must check account owner and discriminator. */
export type ChainReader = {
  precedent(address: string): Promise<PrecedentChainFacts["precedent"]>;
  dispute(address: string): Promise<PrecedentChainFacts["dispute"]>;
  contract(address: string): Promise<PrecedentChainFacts["contract"]>;
  market(): Promise<ChainMarketAccounts>;
};

const hashHex = z.string().regex(/^sha256:[0-9a-f]{64}$/) as unknown as z.ZodType<HashHex>;

const bundleSchema = z.object({
  kind: z.literal("mep.evidence-bundle.v1"),
  cluster: z.enum(["localnet", "devnet"]),
  programId: z.string().min(32).max(44),
  precedent: z.string().min(32).max(44),
  // The evidence is checked field by field against chain roots; here it only has to
  // be the expected kind of document.
  evidence: z.object({ kind: z.literal("mep.failure.v3") }).passthrough(),
  stockModels: z
    .array(
      z
        .object({
          kind: z.literal("mep.stock-model.v1"),
          id: z.string(),
          capabilities: z.array(z.string()),
          artifact: z.object({ hash: hashHex }).passthrough()
        })
        .passthrough()
    )
    .min(1)
});

export type EvidenceBundle = z.infer<typeof bundleSchema>;

/**
 * This router's own procurement policy. It is not read from the bundle: an
 * independent consumer decides for itself what a failure costs it.
 */
export const ROUTER_POLICY = {
  maxPriceLamports: 20_000_000,
  failureLossLamports: 50_000_000,
  delayLossLamportsPerSecond: 10_000,
  privacyWeightBps: 650
} as const;
export const ROUTER_CAPABILITIES = ["evidence-summary"] as const;

export type RankedOffer = Pick<
  UtilityBreakdown,
  "offerId" | "providerId" | "trust" | "effectiveFailureProbabilityBps" | "priceLamports"
> & { totalExpectedCostLamports: bigint };

export type RouterDecision = {
  precedent: VerifiedPrecedent;
  rejectedOffers: readonly { offer: string; reason: string }[];
  before: readonly RankedOffer[];
  after: readonly RankedOffer[];
  choiceBefore: string | undefined;
  choiceAfter: string | undefined;
  learnedOverridesBps: Readonly<Record<string, number>>;
};

export function parseBundle(raw: unknown): EvidenceBundle {
  const parsed = bundleSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      `Evidence bundle is malformed: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
        .join("; ")}`
    );
  return parsed.data;
}

const ranked = (rows: readonly UtilityBreakdown[]): RankedOffer[] =>
  rows.map((row) => ({
    offerId: row.offerId,
    providerId: row.providerId,
    trust: row.trust,
    effectiveFailureProbabilityBps: row.effectiveFailureProbabilityBps,
    priceLamports: row.priceLamports,
    totalExpectedCostLamports: row.totalExpectedCostLamports
  }));

/**
 * Verifies a bundle against the chain, then ranks the current offers before and
 * after applying the precedent to this router's own memory.
 * @param expectedProgramId the program this router trusts, pinned by the caller.
 * @param runningCodeRoot root of the checker code this process runs.
 */
export async function decide(
  rawBundle: unknown,
  reader: ChainReader,
  expectedProgramId: string,
  runningCodeRoot: HashHex
): Promise<RouterDecision> {
  const bundle = parseBundle(rawBundle);
  if (bundle.programId !== expectedProgramId)
    throw new Error(
      `Bundle names program ${bundle.programId}; this router trusts ${expectedProgramId}`
    );

  // Only the precedent address comes from the bundle. The dispute and contract
  // addresses are read from the precedent account itself.
  const precedent = await reader.precedent(bundle.precedent);
  if (!precedent) throw new Error(`Precedent account ${bundle.precedent} not found on-chain`);
  const [dispute, contract] = await Promise.all([
    reader.dispute(precedent.dispute),
    reader.contract(precedent.workContract)
  ]);
  // Stock model manifests are trusted only where they hash to an on-chain model root.
  const stockModels = bundle.stockModels as unknown as StockModelManifest[];
  const verified = await verifyPrecedent(
    { precedent, dispute, contract },
    bundle.evidence as unknown as FailureEvidence,
    runningCodeRoot,
    stockModels
  );

  const market = await marketFromChain(await reader.market(), stockModels);
  const rank = (overrides: Readonly<Record<string, number>>) =>
    rankComputeOffers({
      providers: market.providers,
      modelInstances: market.modelInstances,
      offers: market.offers,
      stockModels: market.stockModels,
      policy: ROUTER_POLICY,
      requiredCapabilities: ROUTER_CAPABILITIES,
      // Not in fixture mode: every offer's hardware tier is H0 unless verified.
      trustTiers: Object.fromEntries(
        Object.entries(market.trust).map(([offer, trust]) => [offer, tiersOf(trust)])
      ),
      failureProbabilityOverridesBps: Object.fromEntries(
        Object.entries(overrides).filter(([provider]) =>
          market.providers.some((p) => p.id === provider)
        )
      )
    });

  const self = "independent-router";
  const genesis = await genesisMemory(self, await sha256Hex(self));
  const learned = await learnFromPrecedent(genesis.memory, verified);
  const before = ranked(rank(genesis.memory.failureProbabilityOverridesBps));
  const after = ranked(rank(learned.memory.failureProbabilityOverridesBps));
  return {
    precedent: verified,
    rejectedOffers: market.rejected,
    before,
    after,
    choiceBefore: before[0]?.offerId,
    choiceAfter: after[0]?.offerId,
    learnedOverridesBps: learned.memory.failureProbabilityOverridesBps
  };
}
