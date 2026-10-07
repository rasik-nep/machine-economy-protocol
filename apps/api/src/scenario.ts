import {
  DEMO_PROVIDERS,
  DEMO_MODEL_INSTANCES,
  DEMO_COMPUTE_OFFERS,
  STOCK_MODEL_MANIFESTS,
  STOCK_AGENT_MANIFESTS
} from "../../../packages/fixtures/src/index.ts";
import { rankComputeOffers } from "../../../packages/protocol/src/index.ts";
// Controlled history for the Phase 10 experiment. Prices and policy never change.
export const offers = DEMO_COMPUTE_OFFERS.map((o) => ({
  ...o,
  failureProbabilityBps: o.id.includes("-x-")
    ? 100
    : o.id.includes("-y-")
      ? 900
      : o.failureProbabilityBps
}));
export const policy = STOCK_AGENT_MANIFESTS[0].policy;
export function scores(overrides: Record<string, number> = {}) {
  return rankComputeOffers({
    providers: DEMO_PROVIDERS,
    modelInstances: DEMO_MODEL_INSTANCES,
    offers,
    stockModels: STOCK_MODEL_MANIFESTS,
    policy,
    requiredCapabilities: ["evidence-summary"],
    failureProbabilityOverridesBps: overrides
  });
}
