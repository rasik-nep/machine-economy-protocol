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

Use Node.js 24 or newer (the tested version is pinned in `.nvmrc`) and pnpm 10.13.1.

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
**Open demo** and **Run full demo**. The live dashboard runs real localnet escrow
and an agent subcontract. Provider X, hired from on-chain offers, has degraded
serving: its provider-signed result fails the verification policy committed in
the contract (task-output checks plus sampled canaries). A five-juror
commit/reveal ruling (4–1) refunds the customer and publishes a precedent. Two
agents verify the precedent on-chain and checkpoint memory: the harmed agent and
a twin that was never party to the dispute. Both switch from Provider X to
Provider Z, and the procurement agent ends +1M lamports with the refund (−4M
without it).

An independent router can then check the precedent from the chain alone, without
this server, and change its own provider choice:

```sh
pnpm router:verify --bundle .anchor/runs/localnet-<run>/evidence-bundle.json
```

See [docs/verification.md](docs/verification.md) for verification policies,
signed receipts, the independent consumer, and H/M/E trust tiers, including
what each does not prove.

To run the same loop against devnet, see [docs/devnet.md](docs/devnet.md).

See [the end-to-end guide](docs/end-to-end-demo.md) for setup, API commands,
Gemini summaries, testing, and the controlled-demo security boundary.

## Frontend

The website includes an introduction, illustrated protocol walkthrough, architecture,
searchable reference, and six live explorer pages. All pages have direct URLs and
responsive layouts. See [the frontend guide](docs/frontend.md) for the route map,
design decisions, and browser checks.
