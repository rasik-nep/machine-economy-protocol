# Hackathon Improvements Plan

**Revised:** Friday, October 9, 2026 (second revision, after team review)
**Deadline:** Monday, October 12, 2026, 11:59 pm PT (Tuesday, October 13, 12:44 pm Nepal time)
**Code freeze:** Sunday, October 11, midday (from `hackathon-plan.md`)
**Source:** review of `machine_economy_protocol_whitepaper_v0.1.md` against the current code, plus research on the Crypto World's Fair hackathon and the verifiable-inference market.

**Order of work:** real task verification → portable signed receipts → independent precedent consumer → honest trust labels. Collect customer evidence in parallel the whole time.

## 1. Positioning

Verifying hosted open models is an active, well-funded area:

- Tinfoil: model identity inside hardware enclaves.
- Ambient: Proof of Logits, and it slashes the stake of nodes caught substituting models.
- EigenAI: deterministic, re-checkable inference.
- Phala: GPU secure enclaves.
- OpenRouter Auto Exacto: quality-based routing, on by default for tool-calling requests.

Our pitch should be narrower than "we verify models." We focus on **recourse and a portable public record**. A verification result becomes dispute evidence. Escrow lets a jury refund the buyer. The ruling becomes a precedent that other agents and routers can check independently. Do not claim that no one else provides any part of this. Ambient, for example, already has economic penalties for its own nodes. Say what we combine and for whom (buyers routing across independent hosts).

Market claims we can support, quoted with their limits:

- OpenRouter (Sep 22, 2026 newsletter): open-weight share of OpenRouter tokens "crossed 50% … briefly in February and more permanently in April", "reached 79% in early July … and has held above 62% since", and was 72% in the week before publication. This is OpenRouter traffic only, not the whole market. Quote the source and its scope; the team could not independently reproduce the 72% figure.
- OpenRouter Auto Exacto: for GLM-5 and GLM-4.7, tool-call errors went from "approximately 8%" to "closer to 1%" after routing away from outlier providers.
- The same post says: "We haven't seen a measurable impact on tool-call quality from quantization alone." It blames tool-call parsers more often. **Our demo must not present quantization as the proven cause of host variance.** Describe the controlled fault as "degraded serving" (for example a broken tool-call parser, a misconfigured runtime, or a substituted model) and keep the cause generic.

Do not claim that we verify GPUs. Hardware attestation is future evidence, and only after it is cryptographically checked (see Item 4).

## 2. Gaps between the whitepaper and the code

| Whitepaper                                         | Code today                                                                                | Plan               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------ |
| Semi-deterministic verification of real work (§26) | Only canary answers are checked; the task output itself is not                            | Item 1             |
| Randomized challenge families (§35)                | Three fixed canaries, exact hash match                                                    | Item 1             |
| Portable signed execution receipts (§27)           | On-chain transactions are provider-signed, but no off-chain receipt binds the job details | Item 2             |
| Public jurisprudence others can use (§33, App. F)  | Precedents are on-chain; only our own twin agent consumes them                            | Item 3             |
| Trust vector H/M/E (§8, App. D.4)                  | Three plain bps numbers with no evidence behind them                                      | Item 4             |
| Liability classes and collateral (§29)             | Breach refunds the price only                                                             | After the deadline |
| Stable-token escrow (§21)                          | Native SOL                                                                                | After the deadline |

## 3. Must do, in this order

### Item 1. Verify real task outputs, not only canaries (about 1 day)

**Problem:**

- `packages/protocol/src/verifier.ts` checks only the canary answers. A host could answer the canaries correctly and fabricate the actual task output.
- Exact hash equality also wrongly flags honest hosts whose outputs differ slightly across GPUs or engines.

**Change:**

- Check the **task output** with deterministic, task-specific checks: JSON schema, required fields, tool name and argument validity, and answers that can be checked against the task input (for the OCR/evidence-summary task: extracted fields must appear in the source).
- Keep canaries as an additional signal, not the only one. Draw them from a larger hidden pool per job.
- Score instead of exact match. The check fails when the score is below the threshold.
- Commit a **verification policy**, not just a threshold, in the contract's `verification_rule_root`:
  - checker name and version (hash of the checker code or bundle);
  - sampling policy (pool ID, number of canaries, how they are drawn, seed commitment);
  - task checks applied;
  - threshold.
- A failed check **supports a dispute**. It does not settle anything by itself. The existing jury still decides, and the program's settlement rules are unchanged.
- Optional, with approval to use an API key (AGENTS.md §10): `scripts/measure-hosts.mjs` runs the same policy against 2–3 real hosts and saves the results to `docs/host-measurements.md`. Report what was measured and avoid naming a cause.
- The deterministic fixture path stays the default demo mode (AGENTS.md §7).

**Tests:**

- correct canaries with a fabricated task output fail;
- an honest output with minor formatting differences passes;
- boundary scores at the threshold;
- the evidence references the committed policy hash, and a mismatched policy is rejected.

### Item 2. Portable signed receipts (about half a day)

**Facts:** `start_contract` and `submit_result` are already transactions signed by the provider. What is missing is an off-chain receipt that binds the job details (contract, model instance, request hash, result hash, timing, token counts, hardware claim) and can be checked without the chain.

**Change:**

- Define a `mep.receipt.v1` document following whitepaper §27, with a `signer_role` field:
  - `provider`: signed with the provider authority key recorded on the contract. Our demo daemon simulates the provider, so it signs as the provider in fixture mode.
  - `observer`: when we call a third-party API and sign its response ourselves. This is **our** observation, never presented as the host's signature.
- Include a nonce or the contract address plus a sequence number, so a receipt cannot be reused for another job.
- The verifier checks the signature and the signer's role before scoring.
- The UI labels receipts "provider-signed" or "observer-signed".

**Tests:**

- a wrong signer is rejected (a key that is not the contract's provider authority);
- a wrong contract is rejected (a valid receipt from another contract);
- a replay is rejected (the same receipt submitted twice, or a reused nonce);
- a tampered field breaks the signature;
- an observer receipt is never accepted as a provider receipt.

### Item 3. Independent precedent consumer (about half a day)

**Goal:** prove that a separate application can check our evidence and act on a precedent without trusting our server.

**Change:**

- Add a standalone script or package, `examples/independent-router/`, with no imports from `apps/api` and no demo-server calls for verification. It:
  1. reads the `PrecedentRecord`, `Dispute` and `WorkContract` accounts from the RPC;
  2. **retrieves the evidence document itself** (result document, receipt, verifier output, verification policy) from a published location: a file in the repo or the devnet run's artifacts;
  3. recomputes `ruling_root`, checks the evidence against the dispute's `evidence_root` and the contract's `result_root`, verifies the receipt signature, and re-runs the committed checker version;
  4. ranks the same offers before and after applying the precedent and prints its decision.
- Reuse only `packages/protocol` (pure functions) so the check is reproducible.

**Done when:**

- the script runs from a fresh clone against a localnet or devnet run;
- it fails clearly if the evidence is missing, altered or does not match the on-chain roots.

New website pages (case database, Verify page) come after this and are optional.

### Item 4. Honest trust labels (about half a day)

**Change:**

- Show trust as H/M/E tiers on offers and in the router explanation (App. D.4).
- An attestation hash in `ProviderRecord.evidence_root` **does not earn H3**. It only shows that a document was committed. It does not show that the signature, freshness, hardware identity or runtime/model binding was checked.
- Tiers are derived from verification results, not from claims:
  - H0: unverified (the default for every real offer);
  - H1 and above: only after a check that the code actually performs.
- Provider Z's H3 exists **only in fixture mode** and is labeled "simulated" in the UI and API.
- Model tier M2 (manifest hash verified) is already earned honestly by `chain-market.ts`, so show it.

**Tests:**

- a real (non-fixture) offer with an attestation hash still shows H0 "unverified";
- a fixture offer shows H3 with the simulated label;
- changing a tier changes the expected cost without changing the price.

## 4. After the deadline

- **Provider bonds and penalties.** Shared bonds need rules for concurrent contracts, reserved collateral per contract, withdrawal delays and repeated penalties. This is much more than a one-day settlement change.
- Real hardware-attestation verification (signature chain, freshness, runtime and model binding) before any H3 or E3 label.
- USDC escrow.
- A proposed ruling with a challenge window before the jury (Level 2).
- Random juror selection, juror bonds, appeals.
- Case database and Verify pages, if not done.
- No native token.

## 5. Non-code work (in parallel)

1. **Customer evidence.** Contact agent builders and open-model hosts. Ask whether host variance has cost them time or money and whether they would pay for recourse. Quote replies only with permission. Report the numbers honestly (contacted, replied, interested).
2. **Short paper.** Write 2–3 pages on the problem, our recourse position, and how other verifiers' outputs could become evidence. State the limits. Link the full whitepaper as the vision document.
3. **Repository.** Commit the uncommitted work in focused commits. Make the repo public (needs approval).
4. **Devnet.** Deploy and do one full run, and publish the evidence documents so Item 3 can use them (needs approval).
5. **Videos.** A 2–3 minute pitch and a demo of at most 3 minutes. State the limitations openly (`hackathon-plan.md` §9).

## 6. Schedule

| When          | Work                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| Fri evening   | Item 1: verification policy format, task-output checks, tests. Start outreach. |
| Sat morning   | Item 1 finished; Item 2 receipts and tests                                     |
| Sat afternoon | Item 3 independent consumer; commit; devnet run (if approved)                  |
| Sun to midday | Item 4 trust labels, then code freeze                                          |
| Sun afternoon | Short paper, videos, collect replies                                           |
| Mon           | Fresh-clone check, submit by noon PT                                           |

**If behind, cut:** Item 4 UI polish first (keep the "unverified" default), then optional host measurements. **Never cut:** task-output verification, receipt signer tests, the independent consumer, the videos.

## 7. Estimated chances

These are judgment calls, not calculations. The base rate: in the previous Colosseum hackathon (Frontier), 28 of 2,857 submissions won a prize (about 1%), and 21 teams entered the accelerator.

| Outcome             | Today  | With Items 1–4 done |
| ------------------- | ------ | ------------------- |
| Any prize           | 10–20% | 12–22%              |
| Accelerator ($250k) | 3–6%   | 4–7%                |

The code changes make our claims defensible more than they make them impressive, so they move the estimate only slightly. Customer evidence and a clear pitch matter more, but their effect cannot be estimated until we see what we actually collect. Do not quote these numbers externally.

## Sources

- Crypto World's Fair: https://colosseum.com/worldsfair
- Colosseum judging: https://colosseum.com/hackathon
- Frontier winners: https://blog.colosseum.com/announcing-the-winners-of-the-solana-frontier-hackathon/
- OpenRouter token share newsletter (Sep 22, 2026): https://openrouter.ai/data/newsletter/the-token-state-of-play
- OpenRouter Auto Exacto: https://openrouter.ai/blog/announcements/auto-exacto/
- Kimi Vendor Verifier: https://www.kimi.ai/blog/kimi-vendor-verifier
- Tinfoil: https://tinfoil.sh/blog/2026-02-03-proving-model-identity
- Ambient: https://ambient.xyz/verified-inference
- EigenAI: https://arxiv.org/html/2602.00182
