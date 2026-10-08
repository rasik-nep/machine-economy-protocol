import {
  DEMO_AGENT_GENESIS_RISK_BPS,
  DEMO_COMPUTE_OFFERS,
  DEMO_CONTRACT_TERMS,
  DEMO_MODEL_INSTANCES,
  DEMO_PARENT_AGENT_SERVICE_PRICE_LAMPORTS,
  DEMO_PROVIDERS,
  DEMO_RESULT_ROOT,
  DEMO_SUBCONTRACT_ALTERNATE_PRICE_LAMPORTS,
  DEMO_SUBCONTRACT_PRICE_LAMPORTS,
  DEMO_SUBCONTRACT_TERMS,
  STOCK_AGENT_MANIFESTS,
  STOCK_MODEL_MANIFESTS
} from "@mep/fixtures";
import {
  type ComputeOfferMarketRecord,
  type DemoContractTerms,
  type FoundationManifest,
  type HashHex,
  type ModelInstanceMarketRecord,
  type ProviderMarketRecord,
  type UtilityBreakdown,
  calculateAgentMarginLamports,
  manifestRoot,
  rankComputeOffers,
  sha256Hex,
  canonicalize
} from "@mep/protocol";
import { raiseRiskAfterBreach } from "../../../packages/protocol/src/learning.ts";

export const APP_NAME = "Machine Economy Protocol";
export const FIRST_UI_MODE = "guided-judge-demo";

export type RegistryRow = {
  readonly id: string;
  readonly displayName: string;
  readonly kind: FoundationManifest["kind"];
  readonly stockOrigin: "canonical-demo-fixture";
  readonly manifestRoot: HashHex;
  readonly verificationStatus: "verified";
};

export type AgentPassportRow = {
  readonly id: string;
  readonly ownerLabel: string;
  readonly stockAgentRoot: HashHex;
  readonly currentMemoryRoot: HashHex;
  readonly checkpointCount: number;
  readonly reputationScoreBps: number;
};

export type MarketScreenModel = {
  readonly providers: readonly ProviderMarketRecord[];
  readonly modelInstances: readonly (ModelInstanceMarketRecord & {
    readonly stockModelName: string;
    readonly stockModelRoot: HashHex;
  })[];
  readonly offers: readonly ComputeOfferMarketRecord[];
};

export type RouterScreenModel = {
  readonly agentName: string;
  readonly requiredCapabilities: readonly string[];
  readonly baseline: readonly UtilityBreakdown[];
  readonly breachedProviderId: string;
  readonly riskUpdate: readonly UtilityBreakdown[];
};

export type ContractFlowStep = {
  readonly status: "Draft" | "Funded" | "Running" | "Submitted" | "Verified" | "Settled";
  readonly actor: "Customer" | "Provider";
  readonly escrowLamports: number;
  readonly detail: string;
};

export type ContractFlowScreenModel = {
  readonly offerId: string;
  readonly providerId: string;
  readonly customerAgentName: string;
  readonly priceLamports: number;
  readonly deadlineOffsetSlots: number;
  readonly taskRoot: HashHex;
  readonly verificationRuleRoot: HashHex;
  readonly liabilityRuleRoot: HashHex;
  readonly resultRoot: HashHex;
  readonly terms: DemoContractTerms;
  readonly steps: readonly ContractFlowStep[];
};

export type SubcontractScreenModel = {
  readonly parentId: string;
  readonly childId: string;
  readonly agentAName: string;
  readonly supplierAgentName: string;
  readonly computeProviderId: string;
  readonly parentRevenueLamports: number;
  readonly computeCostLamports: number;
  readonly childCostLamports: number;
  readonly alternateChildCostLamports: number;
  readonly marginLamports: bigint;
  readonly alternateMarginLamports: bigint;
  readonly parentTaskRoot: HashHex;
  readonly childTaskRoot: HashHex;
  readonly parentDeadlineOffsetSlots: number;
  readonly childDeadlineOffsetSlots: number;
};

export async function buildFoundationRegistryRows(): Promise<readonly RegistryRow[]> {
  const manifests = [...STOCK_MODEL_MANIFESTS, ...STOCK_AGENT_MANIFESTS];

  return Promise.all(
    manifests.map(async (manifest) => ({
      id: manifest.id,
      displayName: manifest.displayName,
      kind: manifest.kind,
      stockOrigin: "canonical-demo-fixture" as const,
      manifestRoot: await manifestRoot(manifest),
      verificationStatus: "verified" as const
    }))
  );
}

export async function buildDemoAgentPassportRows(): Promise<readonly AgentPassportRow[]> {
  const [stockAgent] = STOCK_AGENT_MANIFESTS;
  const stockAgentRoot = await manifestRoot(stockAgent);

  return [
    {
      id: "agent-passport-procurement-a",
      ownerLabel: "Demo Owner A",
      stockAgentRoot,
      currentMemoryRoot: "sha256:4c0b27a43f2bf70f2c7b9074c526f8b776f901058af1d99d6504f11ad65f5401",
      checkpointCount: 1,
      reputationScoreBps: 5000
    },
    {
      id: "agent-passport-procurement-b",
      ownerLabel: "Demo Owner B",
      stockAgentRoot,
      currentMemoryRoot: "sha256:e50fae990689221d75f7aa384bd4884e908a8cd32cb1db9b0de01010d55e6139",
      checkpointCount: 1,
      reputationScoreBps: 5000
    }
  ];
}

export async function buildMarketScreenModel(): Promise<MarketScreenModel> {
  const models = await Promise.all(
    STOCK_MODEL_MANIFESTS.map(async (manifest) => ({
      manifest,
      root: await manifestRoot(manifest)
    }))
  );

  return {
    providers: DEMO_PROVIDERS,
    modelInstances: DEMO_MODEL_INSTANCES.map((instance) => {
      const stockModel = models.find(({ manifest }) => manifest.id === instance.stockModelId);
      if (!stockModel) throw new Error(`Unknown stock model: ${instance.stockModelId}`);
      if (!DEMO_PROVIDERS.some((provider) => provider.id === instance.providerId)) {
        throw new Error(`Unknown provider: ${instance.providerId}`);
      }
      return {
        ...instance,
        stockModelName: stockModel.manifest.displayName,
        stockModelRoot: stockModel.root
      };
    }),
    offers: DEMO_COMPUTE_OFFERS.map((offer) => {
      if (!DEMO_MODEL_INSTANCES.some((instance) => instance.id === offer.modelInstanceId)) {
        throw new Error(`Unknown model instance: ${offer.modelInstanceId}`);
      }
      return offer;
    })
  };
}

// Mirrors the live localnet demo: the agent ranks offers with its genesis memory,
// the first winner breaches, and the learned estimate changes the next choice.
export function buildRouterScreenModel(): RouterScreenModel {
  const agent = STOCK_AGENT_MANIFESTS[0];
  const input = {
    providers: DEMO_PROVIDERS,
    modelInstances: DEMO_MODEL_INSTANCES,
    offers: DEMO_COMPUTE_OFFERS,
    stockModels: STOCK_MODEL_MANIFESTS,
    policy: agent.policy,
    requiredCapabilities: ["evidence-summary"],
    failureProbabilityOverridesBps: DEMO_AGENT_GENESIS_RISK_BPS
  };
  const baseline = rankComputeOffers(input);
  const breached = baseline[0];
  if (!breached) throw new Error("No eligible offer for the demo agent");

  return {
    agentName: agent.displayName,
    requiredCapabilities: input.requiredCapabilities,
    baseline,
    breachedProviderId: breached.providerId,
    riskUpdate: rankComputeOffers({
      ...input,
      failureProbabilityOverridesBps: {
        ...DEMO_AGENT_GENESIS_RISK_BPS,
        [breached.providerId]: raiseRiskAfterBreach(
          DEMO_AGENT_GENESIS_RISK_BPS[breached.providerId]
        )
      }
    })
  };
}

export async function buildContractFlowScreenModel(): Promise<ContractFlowScreenModel> {
  const winner = buildRouterScreenModel().baseline[0];
  if (!winner) throw new Error("No eligible offer for the demo contract");
  const offer = DEMO_COMPUTE_OFFERS.find((item) => item.id === winner.offerId);
  if (!offer) throw new Error(`Selected offer missing: ${winner.offerId}`);
  const price = offer.priceLamports;
  if (DEMO_CONTRACT_TERMS.liabilityRule.limitLamports > price) {
    throw new Error("Demo liability limit exceeds the selected offer price");
  }

  return {
    offerId: offer.id,
    providerId: winner.providerId,
    customerAgentName: STOCK_AGENT_MANIFESTS[0].displayName,
    priceLamports: price,
    deadlineOffsetSlots: 1_000,
    taskRoot: await sha256Hex(canonicalize(DEMO_CONTRACT_TERMS.task)),
    verificationRuleRoot: await sha256Hex(canonicalize(DEMO_CONTRACT_TERMS.verificationRule)),
    liabilityRuleRoot: await sha256Hex(canonicalize(DEMO_CONTRACT_TERMS.liabilityRule)),
    resultRoot: DEMO_RESULT_ROOT,
    terms: DEMO_CONTRACT_TERMS,
    steps: [
      {
        status: "Draft",
        actor: "Customer",
        escrowLamports: 0,
        detail: "Commit task, rules, offer, and deadline."
      },
      {
        status: "Funded",
        actor: "Customer",
        escrowLamports: price,
        detail: "Transfer the quoted price into the contract account."
      },
      {
        status: "Running",
        actor: "Provider",
        escrowLamports: price,
        detail: "Provider accepts the funded job."
      },
      {
        status: "Submitted",
        actor: "Provider",
        escrowLamports: price,
        detail: "Commit a non-zero result root before the deadline."
      },
      {
        status: "Verified",
        actor: "Customer",
        escrowLamports: price,
        detail: "Customer attests the submitted result."
      },
      {
        status: "Settled",
        actor: "Customer",
        escrowLamports: 0,
        detail: "Transfer the escrowed price to the provider."
      }
    ]
  };
}

export async function buildSubcontractScreenModel(): Promise<SubcontractScreenModel> {
  const computePurchase = await buildContractFlowScreenModel();
  const parentRevenue = DEMO_PARENT_AGENT_SERVICE_PRICE_LAMPORTS;
  const computeCost = computePurchase.priceLamports;
  const childCost = DEMO_SUBCONTRACT_PRICE_LAMPORTS;
  const alternateChildCost = DEMO_SUBCONTRACT_ALTERNATE_PRICE_LAMPORTS;

  return {
    parentId: "contract-client-to-agent-a-summary",
    childId: "subcontract-agent-b-ocr",
    agentAName: computePurchase.customerAgentName,
    supplierAgentName: STOCK_AGENT_MANIFESTS[1].displayName,
    computeProviderId: computePurchase.providerId,
    parentRevenueLamports: parentRevenue,
    computeCostLamports: computeCost,
    childCostLamports: childCost,
    alternateChildCostLamports: alternateChildCost,
    marginLamports: calculateAgentMarginLamports(parentRevenue, childCost, computeCost),
    alternateMarginLamports: calculateAgentMarginLamports(
      parentRevenue,
      alternateChildCost,
      computeCost
    ),
    parentTaskRoot: computePurchase.taskRoot,
    childTaskRoot: await sha256Hex(canonicalize(DEMO_SUBCONTRACT_TERMS.task)),
    parentDeadlineOffsetSlots: computePurchase.deadlineOffsetSlots,
    childDeadlineOffsetSlots: 600
  };
}
