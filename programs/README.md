# Programs

`machine-economy-protocol/` implements the protocol through Phase 10:
registry, agent passports, provider/model offers, native SOL escrow, agent
subcontracts, objective missed-deadline disputes, five-juror commit/reveal,
majority settlement, and deterministic precedent roots. Owner-authorized memory
checkpointing connects the ruling to the next off-chain utility calculation.

Run `pnpm run anchor:test` for the bytecode-backed LiteSVM tests. See
[the end-to-end guide](../docs/end-to-end-demo.md) for the live localnet dashboard,
controlled jury assumptions, and escrow/security boundaries.
