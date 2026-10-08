# Commands

Install dependencies:

```sh
pnpm install
```

Check required local tools:

```sh
pnpm run doctor
```

Run all base checks:

```sh
pnpm run check
```

Build the Anchor program:

```sh
pnpm run anchor:build
```

Run Anchor/LiteSVM tests:

```sh
pnpm run anchor:test
```

The project test script builds SBPF v2 bytecode before running `anchor test`
because the local LiteSVM version does not load Anchor's default SBPF v3 output.

Run tests only:

```sh
pnpm run test
```

Build the deterministic provider/model market page:

```sh
pnpm run market:build
```

Open `dist/market.html` in a browser. This is a static judge preview of the
market and utility router built from deterministic fixtures; it is not a live
localnet account viewer. See [utility-router.md](utility-router.md) for the
scoring formula and assumptions.

Build the guided work contract and escrow page:

```sh
pnpm run contract:build
```

Open `dist/contract.html` in a browser. It displays deterministic committed
terms and the tested lifecycle, not live account state.

Build the parent/child subcontract dependency page:

```sh
pnpm run subcontract:build
```

Open `dist/subcontract.html` in a browser. Its margin comparison uses the
same deterministic parent revenue, compute offer, and child quote as the tests.

Check formatting:

```sh
pnpm run format:check
```

Run the linter:

```sh
pnpm run lint
```

Start a reset local Solana validator:

```sh
pnpm run localnet:start
```

Check the local validator:

```sh
pnpm run localnet:status
```

## Live end-to-end dashboard

```sh
pnpm run anchor:build
pnpm run dev
pnpm run typecheck
pnpm run test:e2e
pnpm run test:gemini
```

`pnpm run test:e2e` reuses a running demo server or starts one with `pnpm dev`.
Stop any separately started validator first: the demo validator deploys the
program with the demo wallet as upgrade authority, which `initialize_protocol`
requires. The Gemini test is an explicit live request using the ignored
environment key; normal unit tests mock it.
See [end-to-end-demo.md](end-to-end-demo.md) for the full workflow.
