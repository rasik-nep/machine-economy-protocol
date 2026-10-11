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
trust deficit bps     = ceil((30,000 - hardwareTierBps - modelTierBps - executionTierBps) / 3)
trust penalty         = ceil(maxPriceLamports * privacyWeightBps * trustDeficitBps / 100,000,000)
reservation adjustment = ceil(failureLossLamports * reservationRiskBps / 10,000)
```

The reservation risk coefficients are demo policy assumptions: spot **200 bps**,
reserved **50 bps**, dedicated **0 bps**. The trust penalty is a proxy for
privacy/assurance concerns. It is not a privacy attestation.

Trust comes from **earned H/M/E tiers**, never from the providers'
self-declared `hardware_trust_bps` / `execution_trust_bps` fields (shown as
"claimed, not scored"). Tier credits: H0 0, H1 5,000, H2 8,000, H3 10,000;
M0 0, M1 2,500, M2 6,000, M3 8,000, M4 10,000; E0 0, E1 5,000, E2 8,000,
E3 9,000, E4 10,000. An offer with no earned tier is priced as H0/M0/E0.
Every ranked offer has a verified manifest (M2). Execution is earned per job,
so offers rank at E0. Hardware is H0 unless the demo runs in fixture mode, where
its own providers carry simulated tiers: X H0, Y H1, Z H3, labeled "simulated".
See [verification.md](verification.md). All arithmetic uses `bigint`; divisions
round up to whole lamports so expected losses are never understated by a
fractional lamport.

The published offer supplies the default failure probability. An agent's
off-chain risk estimate can raise it by provider ID. Effective risk is the maximum of the published probability and the learned estimate; a breach never makes a high-risk offer appear safer. This changes only the
selection calculation; it does not mutate an on-chain offer or release escrow.

Offers publish failure claims of X 1%, Y 9%, and Z 1%. A new agent trusts
published claims, so its genesis memory has no overrides:

| Offer | Price | Expected cost, first job | After X's breach (X at 25%) |
| ----- | ----: | -----------------------: | --------------------------: |
| X     |  5.0M |            **7,568,000** |                  19,568,000 |
| Z     | 11.0M |               12,117,710 |              **12,117,710** |
| Y     |  8.0M |               13,592,420 |                  13,592,420 |

Values are lamports. X wins first because it is cheapest at the same claimed
reliability. Its result then fails its committed verification policy, and the jury finds a
breach. An agent raises its estimate for X to 25% only after verifying the
published precedent against the chain (each later breach adds 25 points). Z then
wins even though it costs more than twice as much. This is an explicit demo rule,
not a calibrated estimator.

In the live demo the router reads its input from the chain. `DemoChain.fetchMarket`
loads every `ComputeOffer` account plus the `ProviderRecord`, `ModelInstance`, and
`ModelRecord` accounts they reference. `marketFromChain`
([chain-market.ts](../packages/protocol/src/chain-market.ts)) converts them and
trusts a model's capabilities only when its off-chain manifest hashes to the
on-chain `manifest_root`. Offers it cannot verify are reported and never ranked.
Provider IDs are provider record addresses, and memory overrides use the same keys.
The on-chain `breach_count` is shown but does not change ranking: an agent acts on
a breach only through a precedent it has verified.

The static page ranks the same numbers from fixtures and shows the same winners.

Outside fixture mode (for example the independent router) every offer is
H0/M2/E0, so the trust penalty is equal for all three: X 7,568,000, Z
12,551,000, Y 13,809,000 before the precedent, and Z still wins after it.

Build the [market preview](../dist/market.html) with `pnpm run market:build`.
The output is ignored by Git and uses deterministic fixtures; it does not
query a local validator.
