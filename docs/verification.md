# Verification, receipts, and trust tiers

This note covers the four changes from
[hackathon-improvements.md](hackathon-improvements.md): task-output
verification, portable signed receipts, the independent precedent consumer, and
honest trust labels. It also states what each one does **not** prove.

Our position is recourse and a portable public record, not "we verify models."
A verification result becomes dispute evidence, escrow lets a jury refund the
buyer, and the ruling becomes a precedent that other agents and routers can
check on their own.

## 1. Verifying the task output, not only canaries

Code: [packages/protocol/src/verifier.ts](../packages/protocol/src/verifier.ts).

Before a compute job is created, the customer builds a **verification policy**
and commits it as the contract's `verification_rule_root`:

| Field                        | Meaning                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `checker`                    | Name, version, and `codeRoot`: the SHA-256 root of the checker's source files (`hash.ts`, `verifier.ts`), with line endings normalized |
| `sampling.poolId/poolRoot`   | The stock model's hidden canary pool and its root                                                                                      |
| `sampling.canaryCount`       | How many canaries are drawn (3 per job: from 8 for ledger-lite, 5 for vision-ocr)                                                      |
| `sampling.draw`              | `sha256-rank.v1`: rank pool prompts by `sha256(seed, contract, challenge id)` and take the lowest                                      |
| `sampling.seedCommitment`    | `sha256("mep.canary-seed.v1:" ‖ seed)`. The seed is random per job and revealed only in evidence                                       |
| `taskChecks`                 | The task-specific checks applied                                                                                                       |
| `weightsBps`, `thresholdBps` | Task 70%, canaries 30%; the result fails below 90%                                                                                     |

The task input (source documents and tool schema) is committed as the task's
`inputRoot`. The provider must reply with a `mep.evidence-summary.v1` JSON
object. Five deterministic task checks run against the task input:

1. `output-json`: the output is a `mep.evidence-summary.v1` object.
2. `required-fields`: invoice, liability, exhibits, tool calls, and summary are present.
3. `tool-calls-valid`: every tool call names a declared tool, with all required
   arguments, no unknown arguments, and string values.
4. `fields-in-source`: invoice and liability values match their labeled source fields, and exhibit findings reproduce their source text.
   Amounts compare numerically (`418.2` equals `418.20`, `5,000,000` equals `5000000`).
5. `answers-consistent`: tool-call arguments agree with the extracted fields,
   every exhibit in the input is summarized, and the summary follows the committed extractive template.

Canaries are scored, not hash-matched. A JSON canary earns field-level credit
(a dropped tool argument costs one field, not the whole canary). A text canary
must match after normalization of case, Unicode form, quotes, whitespace, and
final punctuation. All arithmetic is in integer basis points.

What this gives:

- Correct canary answers with a fabricated task output fail (the
  `fields-in-source` and `answers-consistent` checks catch invented values).
- An honest host with formatting differences passes.
- A verifier cannot score with a different pool, seed, checker, or threshold
  than the contract committed: each is checked against the policy, and the
  policy against `verification_rule_root`.

A failed check **supports a dispute**. It settles nothing by itself: the program
does not read the policy, the jury still rules, and settlement rules are unchanged.

The controlled demo fault is "degraded serving" (for example a broken tool-call
parser or a misconfigured runtime). The demo does not claim a cause. In
particular it does not present quantization as the proven cause of host
variance.

Limits:

- The checks are specific to the demo's evidence-summary task. Other tasks need
  their own checks.
- Source extraction supports only the documented labeled format; unsupported or ambiguous layouts fail closed. Source authenticity itself is not established by these checks.
- A disputed job's evidence reveals its canary pool. Pools must rotate; the
  policy commits the pool root per job so a rotated pool is still checkable.
- Host measurements against real APIs (`scripts/measure-hosts.mjs` in the plan)
  are not implemented. They need approval to use a real API key.

## 2. Portable signed receipts

Code: [packages/protocol/src/receipt.ts](../packages/protocol/src/receipt.ts).

A `mep.receipt.v1` binds one job's details: signer role and key, contract,
sequence number, model instance, request hash, result root, start and finish
times, token counts, and the signer's hardware claim. The signature is Ed25519
over `"mep.receipt.v1\n" ‖ canonical JSON`, so it can be checked without the chain.

- `signerRole: "provider"`: signed with the contract's `provider_authority`
  key. The demo daemon simulates the provider, so in fixture mode it signs with
  that provider's disposable localnet key.
- `signerRole: "observer"`: a party that called a third-party API signs what it
  observed. That is the observer's statement, never the host's signature, and an
  observer receipt is never accepted where a provider receipt is required.

`verifyReceipt` checks role, signer, contract, signature, and result root
before any scoring, then records `(contract, signer, sequence)` in a replay
guard. The demo customer keeps one guard per run. The hardware claim is
recorded but never verified.

## 3. Independent precedent consumer

Code: [examples/independent-router/](../examples/independent-router/).

A separate router that imports only pure functions from `packages/protocol`
(no `apps/api` imports, no demo-server calls). From a fresh clone after
`pnpm install`, `pnpm run anchor:build`, and a completed localnet run:

```sh
pnpm router:verify --bundle .anchor/runs/localnet-<run>/evidence-bundle.json
# devnet: add --rpc https://api.devnet.solana.com
```

The demo writes the evidence bundle after publishing a precedent; the dashboard's
dispute page shows the exact command. The router:

1. pins the program ID from this checkout's IDL (a bundle naming another program is rejected);
2. reads the `PrecedentRecord` named in the bundle, then the `Dispute` and
   `WorkContract` it references, checking owner and Anchor discriminator;
3. recomputes `ruling_root`, checks the evidence against the dispute's
   `evidence_root` and the contract's task, verification rule, and result roots,
   verifies the provider-signed receipt against `provider_authority`, and re-runs
   the committed checker (refusing if its own code root differs);
4. ranks the on-chain offers with its own policy before and after applying the
   precedent to its own memory, and prints its decision.

It exits with status 1 and a clear message when the bundle is missing,
malformed, altered, or does not match the on-chain roots. It never signs or
sends a transaction.

Publishing a devnet run's bundle needs a devnet deployment, which needs
approval (see [devnet.md](devnet.md)).

## 4. Honest trust labels

Code: [packages/protocol/src/trust.ts](../packages/protocol/src/trust.ts).

Trust is an H/M/E vector (whitepaper §8, App. D.4). Tiers are earned only from
checks this code performs:

| Dimension     | Earned here                                                                                 | Never earned here                                                          |
| ------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Hardware (H)  | H0 for every offer                                                                          | H1–H3. An attestation hash in `evidence_root` only shows a document exists |
| Model (M)     | M2 when the manifest hashes to the on-chain model record root                               | M3/M4                                                                      |
| Execution (E) | Per job: E1 for a verified provider-signed receipt, E2 if the result also passed its policy | Anything from an observer receipt; E3/E4                                   |

Fixture mode: the demo runs its own providers, so Provider Y (H1) and Provider Z
(H3) carry **simulated** hardware tiers, labeled "simulated" in the API and UI.
Only providers whose provider record belongs to one of the demo's own keys get
them; any other offer is H0 even if it copies a fixture evidence root.

The router prices trust from tiers, never from providers' self-declared
`hardware_trust_bps` / `execution_trust_bps` (those are shown as "claimed, not
scored"). An offer with no earned tier is priced as H0/M0/E0. Changing a tier
changes the expected cost, never the price. See
[utility-router.md](utility-router.md) for the numbers.

## Tests

```sh
pnpm test        # verifier, receipt, trust, router, regression, independent router
pnpm test:e2e    # full localnet loop with receipts, scores, and tiers
```

## Checker 1.2.0 canary fields

Structured canaries compare JSON field paths with quoted keys, so a flattened
`{"arguments.invoice_id": …}` no longer matches a nested `{"arguments": {"invoice_id": …}}`
argument. Empty objects and arrays count as fields, so a dropped empty container
loses credit and a reference with no scalar fields still scores instead of
producing an undefined score.

## Checker 1.1.0 hardening

The checker reads the labeled `Invoice`, `Total due`, and `Clause N. Liability`
source fields rather than matching arbitrary numbers anywhere in a document.
Ambiguous or unsupported layouts fail closed. Exhibit findings must reproduce
the source finding, and the summary must use the extractive template in the
committed task instructions. Case, decimal formatting, punctuation, and articles
are tolerated; invented findings and additional summary claims are rejected.
This verifies the supported structured task, not arbitrary semantic paraphrases.
New policies commit the updated checker code root; old evidence requires its
original checker version to replay.

Chain readers retain offer prices as bigint until market validation. Offers outside
the router's positive safe-integer range are listed as rejected individually, so
one valid u64 price cannot stop other offers from being ranked.
