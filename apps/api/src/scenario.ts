import {
  DEMO_AGENT_GENESIS_RISK_BPS,
  DEMO_PROVIDERS,
  DEMO_MODEL_INSTANCES,
  DEMO_COMPUTE_OFFERS,
  STOCK_MODEL_MANIFESTS,
  STOCK_AGENT_MANIFESTS
} from "../../../packages/fixtures/src/index.ts";
import { rankComputeOffers } from "../../../packages/protocol/src/index.ts";
// Prices and policy never change. The agent ranks offers with its own failure
// estimates: genesis memory first, then whatever it learned from precedent.
export const offers = DEMO_COMPUTE_OFFERS;
export const policy = STOCK_AGENT_MANIFESTS[0].policy;
export function scores(learned: Record<string, number> = {}) {
  return rankComputeOffers({
    providers: DEMO_PROVIDERS,
    modelInstances: DEMO_MODEL_INSTANCES,
    offers,
    stockModels: STOCK_MODEL_MANIFESTS,
    policy,
    requiredCapabilities: ["evidence-summary"],
    failureProbabilityOverridesBps: { ...DEMO_AGENT_GENESIS_RISK_BPS, ...learned }
  });
}
