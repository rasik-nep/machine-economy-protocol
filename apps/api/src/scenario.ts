import { STOCK_AGENT_MANIFESTS } from "../../../packages/fixtures/src/index.ts";
import { rankComputeOffers } from "../../../packages/protocol/src/index.ts";
import type { ChainMarket } from "../../../packages/protocol/src/chain-market.ts";
import { tiersOf } from "../../../packages/protocol/src/trust.ts";

// Prices and policy never change between jobs. The agent ranks the offers it reads
// from the chain with its own memory: providers' published failure claims, overridden
// only by precedents it has verified. Trust is priced from earned tiers, never from
// providers' self-declared trust numbers.
export const policy = STOCK_AGENT_MANIFESTS[0].policy;
export const REQUIRED_CAPABILITIES = ["evidence-summary"] as const;

export function rankMarket(market: ChainMarket, learned: Readonly<Record<string, number>> = {}) {
  // Experience about a provider with no current offer has nothing to re-rank.
  const listed = new Set(market.providers.map((provider) => provider.id));
  return rankComputeOffers({
    providers: market.providers,
    modelInstances: market.modelInstances,
    offers: market.offers,
    stockModels: market.stockModels,
    policy,
    requiredCapabilities: REQUIRED_CAPABILITIES,
    trustTiers: Object.fromEntries(
      Object.entries(market.trust).map(([offer, trust]) => [offer, tiersOf(trust)])
    ),
    failureProbabilityOverridesBps: Object.fromEntries(
      Object.entries(learned).filter(([provider]) => listed.has(provider))
    )
  });
}
