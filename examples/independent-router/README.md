# Independent router

A separate application that checks a published Machine Economy Protocol
precedent without trusting the demo server, then changes its own provider choice.

- Imports only pure functions from `packages/protocol`. No `apps/api` imports and
  no demo-server calls.
- Reads `PrecedentRecord`, `Dispute`, `WorkContract`, and market accounts from a
  Solana RPC, checking each account's owner and Anchor discriminator. The program
  ID is pinned by this checkout's IDL, not by the bundle.
- Reads the off-chain documents (result, provider-signed receipt, verification
  policy, task input, canary pool, scores) from an evidence bundle file, and
  checks each one against the on-chain roots. The canary pool must belong to the
  stock model the contract hired, resolved on-chain through the contract's compute
  offer, model instance, and model record.
- Re-runs the committed checker. If this checkout's checker code differs from the
  one the policy commits, it refuses and says so.
- Ranks offers with its own policy before and after applying the precedent to its
  own memory. It never signs or sends a transaction.

```sh
pnpm install
pnpm run anchor:build
pnpm run dev            # then run the full demo once in the browser
pnpm run router:verify --bundle .anchor/runs/localnet-<run>/evidence-bundle.json
```

It exits with status 1 and a `Precedent NOT accepted: …` message when the bundle
is missing, malformed, altered, or does not match the chain. Tests:
`pnpm test examples`. Design notes: [docs/verification.md](../../docs/verification.md).
