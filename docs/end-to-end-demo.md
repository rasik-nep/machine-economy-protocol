# End-to-end localnet demo (through Phase 10)

This dashboard executes real Anchor transactions against `127.0.0.1:8899`. It is a
controlled, single-user judge demo. Models produce deterministic fixture outputs;
Gemini optionally explains a finalized ruling and never votes or moves funds.

## Start

```sh
pnpm install
pnpm run anchor:build
pnpm run dev
```

Open <http://127.0.0.1:3000>. The launcher starts a local validator with the compiled
program if port 8899 is free. It uses a new ledger under `.anchor/` without
removing existing ledgers. If you already have a validator running, it must have
this version of the program loaded and the matching demo authority. Stop that
validator yourself or reuse its matching workspace. No devnet deployment occurs.

The server binds to loopback, restricts Host and Origin, requires JSON mutations,
validates the run and stage, and serializes mutations. It manages eleven disposable
localnet keypairs in `.anchor/demo-wallets.json` (mode 0600, ignored by Git). No
wallet extension, imported wallet, or mainnet funding is used.

## Guided flow

Use **Run full demo** for an approximately one-minute sequence, or:

1. **Start first job**: fund the parent, settle the OCR subcontract, score offers,
   and fund/start Provider X's compute contract.
2. **Trigger provider failure**: suppress the fixture result, wait beyond the SLA
   deadline, and create structured failure evidence. API: `POST /demo/preempt`.
3. **Resolve with jury**: open a dispute, commit five votes with independent random
   nonces, wait for the reveal window, reveal, then finalize and refund 0.005 SOL.
4. **Publish & update memory**: publish the deterministic precedent root and
   checkpoint the agent's new memory root.
5. **Run second job**: the same scorer now selects Provider Z; submit, verify, and
   settle the new compute contract and the parent report contract.

The first procurement uses a controlled history: X 1%, Y 9%, Z 1% failure
probability. The older static preview retains its separate Y-to-Z scoring
experiment. In the live Phase 10 scenario, only X's local learned probability
changes to 25%. Prices, capabilities, and utility policy remain fixed. Both X and
Z support `evidence-summary`. The cheaper X therefore wins initially; the more
reliable Z wins after the breach. The risk estimate is an explicit demo update,
not a statistically calibrated production estimator.

The ledger screen shows actual transaction signatures. The passport screen compares
stock origin and independently committed memory, and verifies registered model
manifest roots against the chain. The dispute screen exposes the evidence,
commitments, reveals, refund, precedent, and optional AI explanation.

## Reset and state

**Start a fresh run** creates new passports and contract PDAs after completion.
It does not delete previous accounts or history. Reset is rejected while escrow
is active. **Run full demo** can continue from a successful intermediate stage.
The API's coordinator is in memory; restarting it creates a new guided run.
On-chain accounts remain auditable, and learned memory/evidence files are saved
under `.anchor/memory-<run>.json`. A process crash mid-transaction may require
starting the launcher with a fresh local validator ledger; it does not offer
production-grade interrupted-run recovery. Use the grouped jury action so manual
pauses cannot miss the short commit/reveal windows.

Every mutation requires `Content-Type: application/json` and a body containing the
current `{ "run": <run ID>, "stage": <stage number> }` from `GET /api/state`.
Endpoints: `/demo/next`, `/demo/preempt`, `/demo/resolve`, `/demo/run`, `/demo/reset`,
`/demo/summary`. The core run never calls Gemini automatically.

## Optional Gemini summary

Set `GEMINI_API_KEY` in ignored `.env` or `.env.local`; optionally set
`GEMINI_MODEL` (default `gemini-3.8-flash`). Run:

```sh
pnpm run test:gemini
```

The live check sends only a small synthetic ruling via the Gemini generateContent API,
caps the output, and reports API errors without logging credentials.
In the UI, use **Explain with Gemini** after finalization. An absent key, timeout,
quota error, or malformed response cannot change a contract, vote, or memory.
Official API reference: <https://ai.google.dev/api/generate-content>.

## Validation

```sh
pnpm run typecheck
pnpm run check
pnpm run anchor:test
# Keep pnpm run dev running in another terminal:
pnpm run test:e2e
```

The browser regression uses installed Google Chrome. It runs a fresh complete
localnet loop, verifies the X-to-Z change, all five reveals, a memory checkpoint,
and zero remaining escrow; checks API origin/input/replay guards; and checks
navigation and a 390px mobile viewport. Screenshots go to ignored `test-results/`.

Anchor/LiteSVM tests exercise real program bytecode and cover valid and invalid
instruction paths, including incorrect nonces, outsiders, duplicate votes,
early phase transitions, frozen escrow, both jury outcomes, exact payout amounts,
and duplicate finalization/precedent rejection.

## Arbitration and security boundary

The configured demo authority co-signs appointment of five distinct controlled
jurors. Contract parties cannot be jurors. Commitments hash the domain, dispute,
juror, vote byte, and 32-byte nonce. Reveal is allowed only after the commit
window and before its deadline. Settlement requires at least three matching
votes from the five-person panel after the reveal deadline. No majority leaves
escrow frozen; production timeout recovery is outside this controlled demo.

A breach refunds the entire compute price; a no-breach ruling pays the recorded
provider. Destinations are constrained to contract owners and program-account
rent is preserved. A precedent is derived from the finalized evidence and tally,
not arbitrary publisher text. Owner authorization is still required for memory
checkpointing. This changes escrow and dispute settlement code and is not a
production security audit or a permissionless jury-selection system.
