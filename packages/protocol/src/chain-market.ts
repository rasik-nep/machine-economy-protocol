import {
  manifestRoot,
  type ComputeOfferMarketRecord,
  type HashHex,
  type ModelInstanceMarketRecord,
  type ProviderMarketRecord,
  type ReservationClass,
  type StockModelManifest
} from "./index.ts";
import { offerTrust, type HardwareTier, type OfferTrust } from "./trust.ts";

// Decoded program accounts, with public keys as base58 strings and roots as HashHex.
// The router ranks exactly these fields; fixtures only supply off-chain manifests.

export type ChainProviderRecord = {
  readonly address: string;
  readonly evidenceRoot: HashHex;
  readonly hardwareTrustBps: number;
  readonly executionTrustBps: number;
  readonly breachCount: number;
};

export type ChainModelRecord = {
  readonly address: string;
  readonly manifestRoot: HashHex;
};

export type ChainModelInstance = {
  readonly address: string;
  readonly provider: string;
  readonly modelRecord: string;
  readonly executionCommitment: HashHex;
  readonly trustScoreBps: number;
};

export type ChainComputeOffer = {
  readonly address: string;
  readonly provider: string;
  readonly modelInstance: string;
  readonly priceLamports: number | bigint;
  readonly expectedLatencyMs: number;
  readonly failureProbabilityBps: number;
  readonly reservationClass: number;
};

export type ChainMarketAccounts = {
  readonly providers: readonly ChainProviderRecord[];
  readonly modelRecords: readonly ChainModelRecord[];
  readonly modelInstances: readonly ChainModelInstance[];
  readonly offers: readonly ChainComputeOffer[];
};

export type ChainMarket = {
  readonly providers: readonly ProviderMarketRecord[];
  readonly modelInstances: readonly ModelInstanceMarketRecord[];
  readonly offers: readonly ComputeOfferMarketRecord[];
  readonly stockModels: readonly StockModelManifest[];
  /** Earned trust per ranked offer id. Every ranked offer has a verified manifest (M2). */
  readonly trust: Readonly<Record<string, OfferTrust>>;
  /** Offers the agent cannot rank, with the reason. They are never hired. */
  readonly rejected: readonly { readonly offer: string; readonly reason: string }[];
};

/** Matches the program's `reservation_class` byte. */
export const RESERVATION_CLASSES: readonly ReservationClass[] = ["spot", "reserved", "dedicated"];

/**
 * Builds router input from on-chain accounts. A model's capabilities are trusted
 * only when its off-chain manifest hashes to the root registered on-chain.
 * `providerName` labels a provider for display; it never affects ranking.
 * `simulatedHardwareTier` is for fixture mode only: it may give the demo's own
 * providers a simulated hardware tier, which the trust label marks as simulated.
 * Without it every provider is H0, whatever its evidence root commits to.
 */
export async function marketFromChain(
  accounts: ChainMarketAccounts,
  manifests: readonly StockModelManifest[],
  options: {
    providerName?: (provider: ChainProviderRecord) => string;
    simulatedHardwareTier?: (provider: ChainProviderRecord) => HardwareTier | undefined;
  } = {}
): Promise<ChainMarket> {
  const providerName = options.providerName ?? ((provider) => provider.address);
  const manifestByRoot = new Map<HashHex, StockModelManifest>();
  for (const manifest of manifests) manifestByRoot.set(await manifestRoot(manifest), manifest);
  const providers = new Map(accounts.providers.map((record) => [record.address, record]));
  const records = new Map(accounts.modelRecords.map((record) => [record.address, record]));
  const instances = new Map(
    accounts.modelInstances.map((instance) => [instance.address, instance])
  );

  const rejected: { offer: string; reason: string }[] = [];
  const offers: ComputeOfferMarketRecord[] = [];
  const trust: Record<string, OfferTrust> = {};
  const usedInstances = new Map<string, ModelInstanceMarketRecord>();
  const usedProviders = new Map<string, ProviderMarketRecord>();
  const usedModels = new Map<string, StockModelManifest>();

  // The router looks models up by manifest id. If offers reach two registered roots
  // (versions) under one id, either manifest could be applied to the other's
  // instances, so those offers are rejected rather than merged in arbitrary order.
  const rootsById = new Map<string, Set<string>>();
  for (const offer of accounts.offers) {
    const instance = instances.get(offer.modelInstance);
    const record = instance && records.get(instance.modelRecord);
    const manifest = record && manifestByRoot.get(record.manifestRoot);
    if (!record || !manifest) continue;
    const roots = rootsById.get(manifest.id) ?? new Set<string>();
    rootsById.set(manifest.id, roots.add(record.manifestRoot));
  }

  for (const offer of accounts.offers) {
    const instance = instances.get(offer.modelInstance);
    const provider = providers.get(offer.provider);
    const record = instance && records.get(instance.modelRecord);
    const manifest = record && manifestByRoot.get(record.manifestRoot);
    const reservationClass = RESERVATION_CLASSES[offer.reservationClass];
    const price = offer.priceLamports;
    const supportedPrice =
      typeof price === "bigint"
        ? price > 0n && price <= BigInt(Number.MAX_SAFE_INTEGER)
        : Number.isSafeInteger(price) && price > 0;
    const reason = !supportedPrice
      ? "price is outside the supported positive safe-integer range"
      : !instance
        ? "model instance account not found"
        : !provider
          ? "provider record not found"
          : instance.provider !== offer.provider
            ? "offer and model instance name different providers"
            : !record
              ? "model record not found"
              : !manifest
                ? "no verified manifest for the registered model root"
                : (rootsById.get(manifest.id)?.size ?? 0) > 1
                  ? `several registered versions share manifest id ${manifest.id}`
                  : !reservationClass
                    ? "unknown reservation class"
                    : undefined;
    if (reason || !instance || !provider || !manifest || !reservationClass) {
      rejected.push({ offer: offer.address, reason: reason ?? "invalid offer" });
      continue;
    }
    usedProviders.set(provider.address, {
      id: provider.address,
      displayName: providerName(provider),
      evidenceRoot: provider.evidenceRoot,
      hardwareTrustBps: provider.hardwareTrustBps,
      executionTrustBps: provider.executionTrustBps,
      breachCount: provider.breachCount
    });
    usedInstances.set(instance.address, {
      id: instance.address,
      providerId: provider.address,
      stockModelId: manifest.id,
      executionCommitment: instance.executionCommitment,
      modelTrustBps: instance.trustScoreBps
    });
    usedModels.set(manifest.id, manifest);
    offers.push({
      id: offer.address,
      modelInstanceId: instance.address,
      priceLamports: Number(price),
      expectedLatencyMs: offer.expectedLatencyMs,
      failureProbabilityBps: offer.failureProbabilityBps,
      reservationClass
    });
    trust[offer.address] = offerTrust({
      manifestVerified: true,
      simulatedHardwareTier: options.simulatedHardwareTier?.(provider)
    });
  }

  return {
    providers: [...usedProviders.values()],
    modelInstances: [...usedInstances.values()],
    offers,
    stockModels: [...usedModels.values()],
    trust,
    rejected
  };
}
