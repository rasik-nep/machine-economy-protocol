# Devnet mode

Localnet stays the default and is what the demo video uses. Devnet exists so judges
can open the program, dispute, precedent, and passports in Solana Explorer.

**Deploying the program to devnet needs explicit approval (AGENTS.md §10).** Nothing
in this repository deploys automatically.

## What changes on devnet

- **Wallets.** The devnet faucet is rate-limited, so the demo does not airdrop.
  `MEP_DEVNET_KEYPAIR` names one pre-funded devnet keypair. It must be the program's
  upgrade authority, because only that wallet can call `initialize_protocol`. It
  becomes the demo owner and tops up ten disposable wallets in
  `.anchor/devnet-wallets.json` (mode 0600, ignored by Git) by transfer. Keep about
  0.8 devnet SOL in it for the first run (0.6 SOL tops up the ten wallets; each
  later run uses much less). Request devnet SOL early.
- **Windows.** Devnet confirmations take seconds, so the demo uses wider slot windows
  (`TIMING` in `apps/api/src/cluster.ts`):

  | Window             | Localnet | Devnet |
  | ------------------ | -------: | -----: |
  | First job deadline |       20 |     90 |
  | Second job         |    1,000 |  1,500 |
  | Commit window      |       35 |    150 |
  | Reveal window      |       70 |    300 |

- **Explorer links.** Every receipt, contract, passport, the dispute, and the
  precedent link to `explorer.solana.com` with `?cluster=devnet`. Links never
  include your RPC URL, which may contain an API key.
- **Safety checks.** The demo refuses any URL containing "mainnet", verifies the
  RPC's genesis hash is devnet's, and stops with a clear message if the program
  is not deployed.

## Run once (after approval)

The program id `2jRt4n86GVHaW7Ebm1eoKYUBdqyrs3Zie3rwQnvA23uE` is pinned in
`declare_id!`, `apps/api/src/chain.ts`, and `scripts/demo.mjs`. Deploying it needs
its keypair, `target/deploy/machine_economy_protocol-keypair.json`, which is
ignored by Git. From a fresh clone without that file, `anchor build` generates a
different id and the demo will not find the program.

```sh
pnpm run anchor:build
# Deploy with the keypair that will be MEP_DEVNET_KEYPAIR (approval required):
anchor deploy --provider.cluster devnet --provider.wallet <devnet-keypair.json>

# In .env.local:
#   SOLANA_CLUSTER=devnet
#   SOLANA_RPC_URL=https://api.devnet.solana.com
#   MEP_DEVNET_KEYPAIR=<devnet-keypair.json>
pnpm run dev
```

Run the full demo once at <http://127.0.0.1:3000/demo>. Then put these links in the
README and the submission:

- the program, from the activity page;
- the dispute and precedent, from the dispute page;
- both agent passports, from the overview or passports page.

Offers on devnet are permanent. If the fixture offer terms change after the first
devnet run, the demo stops with an "older terms" error instead of ranking stale
offers.

Never use a wallet that holds mainnet funds as `MEP_DEVNET_KEYPAIR`.
