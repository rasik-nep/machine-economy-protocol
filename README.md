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
pnpm run anchor:build
pnpm run check
```

Localnet is the default development cluster. Devnet is reserved for final demo
validation only.

See [docs/commands.md](docs/commands.md) for the current command list.

## Run the complete demo

```sh
pnpm run anchor:build
pnpm run dev
```

Open <http://127.0.0.1:3000> to explore the protocol website, then choose
**Open demo** and **Run full demo**. The live dashboard runs
real localnet escrow, an agent subcontract, controlled failure, five-juror
commit/reveal, precedent publication, memory checkpointing, and a second job
that changes from Provider X to Provider Z.

See [the end-to-end guide](docs/end-to-end-demo.md) for setup, API commands,
Gemini summaries, testing, and the controlled-demo security boundary.

## Frontend

The website includes an introduction, illustrated protocol walkthrough, architecture,
searchable reference, and six live explorer pages. All pages have direct URLs and
responsive layouts. See [the frontend guide](docs/frontend.md) for the route map,
design decisions, and browser checks.
