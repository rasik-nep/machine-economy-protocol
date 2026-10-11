// Trust as an H/M/E vector (whitepaper §8, App. D.4), earned only from checks this
// code performs. Claims, including an attestation hash committed in a provider's
// evidence_root, earn nothing: a committed hash shows a document exists, not that
// its signature, freshness, hardware identity, or runtime binding was checked.

export type HardwareTier = "H0" | "H1" | "H2" | "H3";
export type ModelTier = "M0" | "M1" | "M2" | "M3" | "M4";
export type ExecutionTier = "E0" | "E1" | "E2" | "E3" | "E4";

export type TrustTiers = {
  readonly hardware: HardwareTier;
  readonly model: ModelTier;
  readonly execution: ExecutionTier;
};

/** "verified": a check in this code earned it. "simulated": fixture mode only. */
export type TrustStatus = "unverified" | "verified" | "simulated";

export type TrustLabel<Tier extends string> = {
  readonly tier: Tier;
  readonly status: TrustStatus;
  readonly basis: string;
};

export type OfferTrust = {
  readonly hardware: TrustLabel<HardwareTier>;
  readonly model: TrustLabel<ModelTier>;
  readonly execution: TrustLabel<ExecutionTier>;
};

/** Trust credit per tier, in basis points. The router prices the average shortfall. */
export const TIER_TRUST_BPS: {
  readonly hardware: Readonly<Record<HardwareTier, number>>;
  readonly model: Readonly<Record<ModelTier, number>>;
  readonly execution: Readonly<Record<ExecutionTier, number>>;
} = {
  hardware: { H0: 0, H1: 5_000, H2: 8_000, H3: 10_000 },
  model: { M0: 0, M1: 2_500, M2: 6_000, M3: 8_000, M4: 10_000 },
  execution: { E0: 0, E1: 5_000, E2: 8_000, E3: 9_000, E4: 10_000 }
};

/** Every offer starts here. */
export const UNVERIFIED_TRUST: OfferTrust = {
  hardware: { tier: "H0", status: "unverified", basis: "No hardware check performed" },
  model: { tier: "M0", status: "unverified", basis: "Model identity not checked" },
  execution: {
    tier: "E0",
    status: "unverified",
    basis: "Provider claim; execution is verified per job"
  }
};

export function tiersOf(trust: OfferTrust): TrustTiers {
  return {
    hardware: trust.hardware.tier,
    model: trust.model.tier,
    execution: trust.execution.tier
  };
}

/**
 * An offer's trust before any job runs.
 * - Model: M2 when the off-chain manifest hashes to the on-chain model record's root.
 * - Hardware: H0. Nothing in this code verifies hardware. A fixture provider may carry
 *   a simulated tier, labeled as such, only when the caller runs in fixture mode.
 * - Execution: E0. Execution trust is earned by a specific job (see `jobExecutionTrust`).
 */
export function offerTrust(input: {
  manifestVerified: boolean;
  simulatedHardwareTier?: HardwareTier;
}): OfferTrust {
  return {
    hardware:
      input.simulatedHardwareTier && input.simulatedHardwareTier !== "H0"
        ? {
            tier: input.simulatedHardwareTier,
            status: "simulated",
            basis: "Fixture mode: simulated hardware evidence, not verified"
          }
        : UNVERIFIED_TRUST.hardware,
    model: input.manifestVerified
      ? {
          tier: "M2",
          status: "verified",
          basis: "Manifest hash verified against the on-chain model record"
        }
      : UNVERIFIED_TRUST.model,
    execution: UNVERIFIED_TRUST.execution
  };
}

/**
 * One job's execution trust, from what the verifier actually checked.
 * - E1: a provider-signed receipt verified against the contract's provider authority.
 *   An observer-signed receipt is the observer's statement and earns nothing here.
 * - E2: E1, and the result passed the contract's committed verification policy.
 */
export function jobExecutionTrust(input: {
  receiptRole?: "provider" | "observer";
  receiptVerified: boolean;
  verificationPassed?: boolean;
}): TrustLabel<ExecutionTier> {
  if (!input.receiptVerified || input.receiptRole !== "provider")
    return {
      tier: "E0",
      status: "unverified",
      basis:
        input.receiptVerified && input.receiptRole === "observer"
          ? "Observer-signed receipt: our observation, not the host's signature"
          : "No verified provider-signed receipt"
    };
  if (input.verificationPassed)
    return {
      tier: "E2",
      status: "verified",
      basis: "Provider-signed receipt and passed the committed verification policy"
    };
  return {
    tier: "E1",
    status: "verified",
    basis:
      input.verificationPassed === false
        ? "Provider-signed receipt verified; the result failed verification"
        : "Provider-signed receipt verified"
  };
}
