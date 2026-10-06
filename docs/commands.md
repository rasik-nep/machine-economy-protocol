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
