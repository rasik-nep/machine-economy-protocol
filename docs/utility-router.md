# Utility router (Phase 5)

The procurement agent ranks offers that fit its price cap and whose stock model
has every required capability. The lowest **expected cost in lamports** wins.
Equal totals are resolved by lexicographic offer ID, so ranking is repeatable.

For each eligible offer:

```text
expected cost = price
              + expected failure loss
              + expected delay loss
              + trust penalty
              + reservation adjustment

expected failure loss = ceil(failureLossLamports * effectiveFailureProbabilityBps / 10,000)
expected delay loss   = ceil(delayLossLamportsPerSecond * expectedLatencyMs / 1,000)
trust deficit bps     = ceil((30,000 - hardwareTrustBps - modelTrustBps - executionTrustBps) / 3)
trust penalty         = ceil(maxPriceLamports * privacyWeightBps * trustDeficitBps / 100,000,000)
reservation adjustment = ceil(failureLossLamports * reservationRiskBps / 10,000)
```

The reservation risk coefficients are demo policy assumptions: spot **200 bps**,
reserved **50 bps**, dedicated **0 bps**. The trust penalty is a proxy for
privacy/assurance concerns using the three trust signals currently in the
market. It is not a privacy attestation. All arithmetic uses `bigint`; divisions
round up to whole lamports so expected losses are never understated by a
fractional lamport.

The published offer supplies the default failure probability. An agent's
off-chain risk estimate can override it by provider ID. This changes only the
selection calculation; it does not mutate an on-chain offer or release escrow.
The static demo page includes a clearly labeled hypothetical override for
Provider Y to show how a future risk update can change the winner.

Build the [market preview](../dist/market.html) with `pnpm run market:build`.
The output is ignored by Git and uses deterministic fixtures; it does not
query a local validator.
