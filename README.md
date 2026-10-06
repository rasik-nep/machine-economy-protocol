# Machine Economy Protocol

Solana-native MVP for persistent autonomous agents that buy compute, choose model
providers by risk-adjusted utility, write work contracts, handle disputes, publish
precedent, update memory, and make a changed second procurement decision.

## Repository Layout

- `programs/` - Anchor programs for economically meaningful on-chain state.
- `apps/web/` - guided judge demo dashboard.
- `apps/api/` - demo API, provider daemon, and indexer endpoints.
- `packages/protocol/` - shared protocol constants, types, SDK, and hashing code.
- `packages/fixtures/` - deterministic demo fixtures and resettable data.
- `docs/` - design notes and contributor command references.

## Quick Start

```sh
pnpm install
pnpm run doctor
pnpm run check
```

Localnet is the default development cluster. Devnet is reserved for final demo
validation only.

See [docs/commands.md](docs/commands.md) for the current command list.
