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

Open <http://127.0.0.1:3000/demo> for the live explorer, or
<http://127.0.0.1:3000> for the protocol introduction. The launcher starts a local validator with the compiled
program if port 8899 is free. It uses a new ledger under `.anchor/` without
removing existing ledgers. If you already have a validator running, it must have
this version of the program loaded and the matching demo authority. Stop that
validator yourself or reuse its matching workspace. No devnet deployment occurs;
see [devnet.md](devnet.md) for the separate devnet mode.

The server binds to loopback, restricts Host and Origin, requires JSON mutations,
validates the run and stage, and serializes mutations. It manages eleven disposable
localnet keypairs in `.anchor/demo-wallets.json` (mode 0600, ignored by Git). No
wallet extension, imported wallet, or mainnet funding is used.

## Guided flow

Use **Run full demo** for an approximately one-minute sequence, or:

1. **Start first job**: fund the parent, settle the OCR subcontract, then rank
   compute offers read from the chain. Every provider claims a failure rate and
   Agent A trusts those claims, so the cheapest offer, Provider X (1%), wins.
2. **Trigger degraded serving** (`POST /demo/degrade`): the controlled fault.
   Agent A first commits a verification policy (checker code root, canary pool,
   a seed commitment, task checks, 90% threshold) as the contract's verification
   rule, then hires X (create, fund, and start in one transaction). X's serving
   is degraded (the cause is not claimed). It answers the task and three canaries
   drawn from an eight-prompt pool, signs a provider receipt, and submits its
   result root before the deadline. Agent A verifies the receipt against the
   contract's provider authority, then scores the result: it fails the
   required-field, tool-call, and grounding checks and drifts on at least one
   canary. The demo waits past the deadline and commits the result,
   receipt, policy, revealed seed, task input, and scores as evidence. See
   [verification.md](verification.md).
3. **Resolve with jury**: open a dispute on the submitted result inside the
   review window. Five jurors commit votes with independent random nonces, wait
   for the reveal window, and reveal: four find a breach and one dissents (a
   demo-script choice; the majority-of-five rule is unchanged). Finalization
   refunds X's compute price (0.005 SOL) to the customer and increments X's
   on-chain `breach_count`.
4. **Publish & update memory**: publish the precedent. Agent A and its twin
   Agent A′ each fetch the precedent, dispute, and contract, recompute the
   `ruling_root`, check the evidence against the dispute's evidence root and the
   contract's task, policy, and result roots, verify the provider-signed receipt,
   re-run the committed checker, and checkpoint a new memory root. Agent A′ was
   never party to the dispute. The demo also writes an evidence bundle to
   `.anchor/runs/<cluster>-<run>/evidence-bundle.json` for independent readers
   (`pnpm router:verify --bundle <path>`).
5. **Run second job**: Agent A verifies its memory against its passport, ranks
   the on-chain offers again, and now selects Provider Z. Z serves the reference
   build, passes its verification policy with a provider-signed receipt (E2),
   and is verified and paid. The parent contract then settles.

Prices, capabilities, and the utility policy stay fixed; see
[utility-router.md](utility-router.md) for the numbers. The overview shows both
agents' choices side by side and Agent A's profit and loss from on-chain
contract amounts: +15M parent revenue, −3M subcontract, −5M job 1 with +5M
refunded, −11M job 2. That nets **+1M lamports with the refund and −4M without
it**.

The ledger screen links every transaction signature to Solana Explorer. The
passport screen compares stock origin and independently committed memory for
both agents. The market screen shows each offer's earned H/M/E tiers; fixture
hardware tiers are labeled "simulated". The dispute screen shows each job's
receipt signer, task checks, canary scores, and committed policy root, plus the
evidence, commitments, revealed votes, refund, the verified precedent, the
independent-router command, and an optional AI explanation.

## Reset and state

**Start a fresh run** creates new passports and contract PDAs after completion.
It does not delete previous accounts or history. Reset is rejected while escrow
is active. **Run full demo** can continue from a successful intermediate stage.
A failed result can be disputed only inside the review window
(`REVIEW_WINDOW_SLOTS`, about 10 minutes of localnet slots after the job
deadline). If the dashboard sits idle at "Verification failed" longer than that,
the provider can claim the compute escrow with `release_unverified`; the parent must also be resolved before reset is allowed.
The API's coordinator is in memory; restarting it creates a new guided run.
On-chain accounts remain auditable, and learned memory/evidence files are saved
under `.anchor/memory-<run>.json`. A process crash mid-transaction may require
starting the launcher with a fresh local validator ledger; it does not offer
production-grade interrupted-run recovery. Use the grouped jury action so manual
pauses cannot miss the short commit/reveal windows.

Every mutation requires `Content-Type: application/json` and a body containing the
current `{ "run": <run ID>, "stage": <stage number> }` from `GET /api/state`.
Endpoints: `/demo/next`, `/demo/degrade`, `/demo/resolve`, `/demo/run`, `/demo/reset`,
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
localnet loop and verifies: the X-to-Z change for both agents, the twin's memory
root changing on-chain, the failed (E1) and passing (E2) provider-signed
verifications, simulated and unverified trust labels, the 4–1 reveal, the
breached job-1 status, the +1M / −4M profit and loss, Explorer links, and zero
remaining escrow; checks API origin/input/replay guards; and checks
navigation and a 390px mobile viewport. Screenshots go to ignored `test-results/`.

`apps/api/src/learning.test.ts` is the memory and second-choice regression. It
builds chain-shaped accounts from the fixtures and fails if the precedent is
missing, its `ruling_root` does not recompute (checked against an independent
`node:crypto` hash), or the evidence does not match the chain.

Anchor/LiteSVM tests exercise real program bytecode and cover valid and invalid
instruction paths, including incorrect nonces, outsiders, duplicate votes,
early phase transitions, both jury outcomes, the hung-jury refund, the customer
review window, exact payout amounts, and duplicate finalization/precedent rejection.

## Reliability

Every step checks on-chain state before it sends a transaction, so a step that
failed partway (for example on an RPC error) can be retried with the same button.
Compute jobs are created, funded, and started in one atomic transaction. The
parent contract's deadline is about 4.6 days of slots, so an idle dashboard
cannot expire it. **Start a fresh run** is rejected with HTTP 409 while any current contract holds escrow. The rejection preserves evidence, run addresses, and juror nonces. Finish or resolve all funded obligations first. The one exception is a run that missed an on-chain window no retry can reopen (the job deadline, the jury commit window, or the customer review window): on localnet the error offers **Start a fresh run**, which abandons that run's disposable escrow on the throwaway ledger. On devnet reset stays blocked and the error asks you to restart the server. `pnpm dev` starts an
isolated validator on a reset ledger (`.anchor/demo-ledger`) each time.

## Arbitration and security boundary

The configured demo authority co-signs appointment of five distinct controlled
jurors. Contract parties cannot be jurors. Commitments hash the domain, dispute,
juror, vote byte, and 32-byte nonce. Reveal is allowed only after the commit
window and before its deadline. Settlement requires at least three matching
votes from the five-person panel after the reveal deadline. A hung jury (no side
reaches three) refunds the customer, so escrow can never stay locked.

A breach refunds the entire compute price and increments the provider record's
`breach_count`; a no-breach ruling pays the recorded provider. A submitted result
can be disputed only during the customer review window
(`REVIEW_WINDOW_SLOTS` after the deadline); after that window, anyone can call
`release_unverified` to pay the provider. Only the program's upgrade authority
can call `initialize_protocol`, so the configuration cannot be front-run on a
public cluster. Destinations are constrained to contract owners and program-account
rent is preserved. A precedent is derived from the finalized evidence and tally,
not arbitrary publisher text. Owner authorization is still required for memory
checkpointing. This changes escrow and dispute settlement code and is not a
production security audit or a permissionless jury-selection system.
