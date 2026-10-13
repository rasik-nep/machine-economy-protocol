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
solana program show 2jRt4n86GVHaW7Ebm1eoKYUBdqyrs3Zie3rwQnvA23uE --url devnet

# In .env.local (it is loaded before .env, so these values win):
#   SOLANA_CLUSTER=devnet
#   SOLANA_RPC_URL=https://api.devnet.solana.com
#   MEP_DEVNET_KEYPAIR=<absolute path to devnet-keypair.json>
pnpm run dev
```

Run the full demo once at <http://127.0.0.1:3000/demo>. To include the advisory
Gemini explanation in the published replay, request it from the dispute page after
the ruling is finalized (it uses the configured API key).

## Publish the run as a static replay

Judges should not need to clone the repository, and a public demo server would
expose a funded wallet. The demo server therefore saves a snapshot of every stage
to `.anchor/replay/<cluster>-<run>/` (ignored by Git). The public site replays one
complete devnet run from those snapshots. It needs no server, wallet, or RPC, and
every address and signature in it links to devnet Explorer.

```sh
pnpm run replay:export    # newest complete devnet run → apps/web/replay/ (commit it)
pnpm run site:build       # website + replay → dist/site
pnpm run site:preview     # check it at http://127.0.0.1:4173
```

`replay:export` refuses localnet runs, because their Explorer links point at a
local validator. `--run devnet-<run>` picks a specific run. The evidence bundle is
published next to the snapshots, so anyone can run `pnpm router:verify` against
devnet.

`vercel.json` builds the same `dist/site` (`pnpm run site:build`), serves clean
routes such as `/demo` and `/disputes`, and applies the demo server's content
security policy. Publishing to Vercel is a public deployment and needs approval.

In replay mode the first visit opens the completed run. The step buttons move
through the recorded stages in the same order as the live demo, and "Replay from
the start" returns to stage 1. Requesting a new Gemini summary is live-only.

Then put these links in the README and the submission:

- the hosted replay;
- the program, from the activity page;
- the dispute and precedent, from the dispute page;
- both agent passports, from the overview or passports page.

Offers on devnet are permanent. If the fixture offer terms change after the first
devnet run, the demo stops with an "older terms" error instead of ranking stale
offers.

Never use a wallet that holds mainnet funds as `MEP_DEVNET_KEYPAIR`.
