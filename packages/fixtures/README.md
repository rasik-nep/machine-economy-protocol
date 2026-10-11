# Demo Fixtures

Deterministic demo data lives here: stock agents, stock models, provider offers,
contract fixtures, juror accounts, controlled failure evidence, and precedent records.

Phase 2 includes:

- two stock model manifests
- two stock agent manifests
- canonical roots computed by `@mep/protocol`

Verification fixtures (`src/verifier.ts`):

- `DEMO_TASK_INPUT`: the compute job's source documents and tool schema. Its root
  is `DEMO_COMPUTE_TASK.inputRoot`; a test fails if the two drift apart.
- `DEMO_TASK_OUTPUT` and `DEMO_DEGRADED_TASK_OUTPUT`: structured
  `mep.evidence-summary.v1` outputs from the reference build and from degraded
  serving. The degraded output drops a tool argument and the liability terms and
  misreads the total. The cause of the degradation is deliberately not named.
- `DEMO_CANARY_POOLS`: a hidden canary pool per stock model (8 and 5 prompts) with
  reference outputs. Each job draws `DEMO_CANARY_COUNT` of them with a committed seed.
- `DEMO_DEGRADED_CANARY_OUTPUTS`: what degraded serving returns. Six of eight
  ledger-lite canaries drift, so every draw of three includes a drifted one.

The demo provider daemon (`apps/api/src/provider-daemon.ts`) uses them to produce
deterministic results and signs a `mep.receipt.v1` as the provider.

`DEMO_SIMULATED_HARDWARE_TIERS` and `DEMO_OFFER_TRUST` exist for fixture mode only.
The demo daemon simulates the providers, so their hardware tiers are simulated too
and every surface labels them "simulated".

The manifest bodies remain off-chain. Anchor accounts store the roots and compact
economic fields needed by later phases.
