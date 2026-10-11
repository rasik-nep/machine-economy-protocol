import type {
  ComputeOfferMarketRecord,
  ModelInstanceMarketRecord,
  ProviderMarketRecord,
  ReservationClass,
  StockAgentManifest,
  StockModelManifest
} from "./index.js";
import { TIER_TRUST_BPS, UNVERIFIED_TRUST, tiersOf, type TrustTiers } from "./trust.ts";

export const RESERVATION_RISK_BPS: Readonly<Record<ReservationClass, number>> = {
  spot: 200,
  reserved: 50,
  dedicated: 0
};

export type UtilityBreakdown = {
  readonly offerId: string;
  readonly providerId: string;
  readonly modelInstanceId: string;
  readonly stockModelId: string;
  readonly trust: TrustTiers;
  readonly effectiveFailureProbabilityBps: number;
  readonly trustDeficitBps: number;
  readonly priceLamports: bigint;
  readonly expectedFailureLossLamports: bigint;
  readonly expectedDelayLossLamports: bigint;
  readonly trustPenaltyLamports: bigint;
  readonly reservationAdjustmentLamports: bigint;
  readonly totalExpectedCostLamports: bigint;
};

export type UtilityRouterInput = {
  readonly providers: readonly ProviderMarketRecord[];
  readonly modelInstances: readonly ModelInstanceMarketRecord[];
  readonly offers: readonly ComputeOfferMarketRecord[];
  readonly stockModels: readonly StockModelManifest[];
  readonly policy: StockAgentManifest["policy"];
  readonly requiredCapabilities: readonly string[];
  readonly failureProbabilityOverridesBps?: Readonly<Record<string, number>>;
  /**
   * Earned trust tiers per offer id. An offer without an entry is priced as
   * H0/M0/E0. Providers' self-declared trust numbers are never scored.
   */
  readonly trustTiers?: Readonly<Record<string, TrustTiers>>;
};

const BPS = 10_000n;

function asSafeNonnegativeInteger(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return BigInt(value);
}

function asBasisPoints(value: number, label: string): bigint {
  const integer = asSafeNonnegativeInteger(value, label);
  if (integer > BPS) throw new Error(`${label} must be at most 10000`);
  return integer;
}

function asPositiveInteger(value: number, label: string): bigint {
  const integer = asSafeNonnegativeInteger(value, label);
  if (integer === 0n) throw new Error(`${label} must be greater than zero`);
  return integer;
}

function tierBps(table: Readonly<Record<string, number>>, tier: string, label: string): bigint {
  const value = Object.hasOwn(table, tier) ? table[tier] : undefined;
  if (value === undefined) throw new Error(`Unknown ${label} trust tier: ${tier}`);
  return BigInt(value);
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

export function rankComputeOffers(input: UtilityRouterInput): readonly UtilityBreakdown[] {
  const maxPrice = asSafeNonnegativeInteger(input.policy.maxPriceLamports, "maxPriceLamports");
  const failureLoss = asSafeNonnegativeInteger(
    input.policy.failureLossLamports,
    "failureLossLamports"
  );
  const delayLossPerSecond = asSafeNonnegativeInteger(
    input.policy.delayLossLamportsPerSecond,
    "delayLossLamportsPerSecond"
  );
  const privacyWeight = asBasisPoints(input.policy.privacyWeightBps, "privacyWeightBps");

  const providers = new Map(input.providers.map((provider) => [provider.id, provider]));
  const instances = new Map(input.modelInstances.map((instance) => [instance.id, instance]));
  const models = new Map(input.stockModels.map((model) => [model.id, model]));
  const scored: UtilityBreakdown[] = [];

  for (const providerId of Object.keys(input.failureProbabilityOverridesBps ?? {})) {
    if (!providers.has(providerId))
      throw new Error(`Unknown provider risk override: ${providerId}`);
  }

  for (const offer of input.offers) {
    const instance = instances.get(offer.modelInstanceId);
    if (!instance) throw new Error(`Unknown model instance: ${offer.modelInstanceId}`);
    const provider = providers.get(instance.providerId);
    if (!provider) throw new Error(`Unknown provider: ${instance.providerId}`);
    const model = models.get(instance.stockModelId);
    if (!model) throw new Error(`Unknown stock model: ${instance.stockModelId}`);

    const price = asPositiveInteger(offer.priceLamports, "priceLamports");
    const latency = asPositiveInteger(offer.expectedLatencyMs, "expectedLatencyMs");
    const publishedFailureProbability = asBasisPoints(
      offer.failureProbabilityBps,
      "failureProbabilityBps"
    );
    const override = input.failureProbabilityOverridesBps?.[provider.id];
    const learnedFailureProbability =
      override === undefined
        ? publishedFailureProbability
        : asBasisPoints(override, `failureProbabilityOverridesBps.${provider.id}`);
    // A breach-derived estimate is a risk floor, never a discount on published risk.
    const effectiveFailureProbability =
      learnedFailureProbability > publishedFailureProbability
        ? learnedFailureProbability
        : publishedFailureProbability;
    const earned =
      input.trustTiers && Object.hasOwn(input.trustTiers, offer.id)
        ? input.trustTiers[offer.id]
        : undefined;
    const trust = earned ?? tiersOf(UNVERIFIED_TRUST);
    const hardwareTrust = tierBps(TIER_TRUST_BPS.hardware, trust.hardware, "hardware");
    const modelTrust = tierBps(TIER_TRUST_BPS.model, trust.model, "model");
    const executionTrust = tierBps(TIER_TRUST_BPS.execution, trust.execution, "execution");
    if (!Object.hasOwn(RESERVATION_RISK_BPS, offer.reservationClass)) {
      throw new Error(`Unknown reservation class: ${offer.reservationClass}`);
    }
    const reservationRisk = RESERVATION_RISK_BPS[offer.reservationClass];

    if (
      price > maxPrice ||
      !input.requiredCapabilities.every((capability) => model.capabilities.includes(capability))
    ) {
      continue;
    }

    const trustDeficit = ceilDivide(3n * BPS - hardwareTrust - modelTrust - executionTrust, 3n);
    const expectedFailureLoss = ceilDivide(failureLoss * effectiveFailureProbability, BPS);
    const expectedDelayLoss = ceilDivide(delayLossPerSecond * latency, 1_000n);
    const trustPenalty = ceilDivide(maxPrice * privacyWeight * trustDeficit, BPS * BPS);
    const reservationAdjustment = ceilDivide(failureLoss * BigInt(reservationRisk), BPS);

    scored.push({
      offerId: offer.id,
      providerId: provider.id,
      modelInstanceId: instance.id,
      stockModelId: model.id,
      trust,
      effectiveFailureProbabilityBps: Number(effectiveFailureProbability),
      trustDeficitBps: Number(trustDeficit),
      priceLamports: price,
      expectedFailureLossLamports: expectedFailureLoss,
      expectedDelayLossLamports: expectedDelayLoss,
      trustPenaltyLamports: trustPenalty,
      reservationAdjustmentLamports: reservationAdjustment,
      totalExpectedCostLamports:
        price + expectedFailureLoss + expectedDelayLoss + trustPenalty + reservationAdjustment
    });
  }

  return scored.sort((left, right) => {
    if (left.totalExpectedCostLamports < right.totalExpectedCostLamports) return -1;
    if (left.totalExpectedCostLamports > right.totalExpectedCostLamports) return 1;
    return left.offerId < right.offerId ? -1 : left.offerId > right.offerId ? 1 : 0;
  });
}
