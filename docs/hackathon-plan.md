# Hackathon Plan: Colosseum Crypto World's Fair

**Deadline:** Monday, October 12, 2026, 11:59 pm PT (06:59 UTC on October 13)
**Target:** Solana track ($100,000 shared by 10 projects), plus accelerator consideration
**Written:** Thursday, October 8, 2026
**Internal goal:** submit by noon PT on October 12. Keep the remaining 12 hours as buffer.

## 1. What we are pitching

> An enforceable SLA and a public breach record for open-model inference. If a host
> serves a degraded model, the agent gets refunded, and every other agent knows.

**Why now.** Open-weight models are increasingly served by many third-party hosts. The same weights do not behave the same on every host:

- Moonshot found "stark contrasts" between third-party hosts and its own API. It
  open-sourced the [Kimi Vendor Verifier](https://www.kimi.com/blog/kimi-vendor-verifier)
  so users can check hosts.
- OpenRouter launched
  ["Exacto"](https://openrouter.ai/blog/announcements/provider-variance-introducing-exacto/)
  endpoints because provider variance hurt tool-calling accuracy.
- Hosts differ on quantization, context length, and output caps. Cheap hosts are
  often cheap because they quantize aggressively.

Today's fixes are centralized: one vendor's verifier or one router's allowlist. None of them gives the buyer recourse, and none produces a record that other buyers can verify. This protocol adds both:

- escrow, with a refund on breach;
- an on-chain precedent that any agent or router can read.

**Who uses it:**

- Buyers are apps and AI agents that route work to open-model hosts. Ordinary end
  users are not the buyers.
- Honest hosts also benefit. A clean, verifiable record lets them charge more than
  hosts that quantize aggressively.

**Rules for the pitch:**

- Never say "the market isn't here yet." The evidence above shows the problem exists today.
- Never invent market-size numbers.

## 2. How we are judged

These are the criteria in official rules §8, with where we stand today.

| Criterion                      | Today       | What moves it                                                                          |
| ------------------------------ | ----------- | -------------------------------------------------------------------------------------- |
| Functionality and code quality | Strong      | Keep tests green. Make the demo read real chain state (A1).                            |
| Potential impact               | Medium      | "Why now" evidence plus builder quotes (C2, C3)                                        |
| Novelty                        | Medium      | Lead with precedent, then memory, then a changed hiring choice (A2), not "marketplace" |
| UX and use of the blockchain   | Medium      | Escrow refunds and a public breach record. Explorer links (B1).                        |
| Open source and composability  | Partial     | Public repo. A precedent that other agents consume (A2). Devnet deployment (B2).       |
| Business plan and team         | **Weakest** | Go-to-market plan and demand validation (C2, C3)                                       |

## 3. Workstream A: make the demo prove the protocol (code)

The current loop is mechanically correct: real localnet escrow, a subcontract, a dispute, commit/reveal voting, a precedent, and a memory checkpoint. But several links in the chain from the ruling to the next hiring decision are wired up off-chain, so the demo does not yet prove that on-chain state changes agent behavior. A1 to A3 fix that. A4 to A6 make the story match the pitch.

### A1. Rank offers and learn from the chain, not from fixtures (must do)

- **Now:** [scenario.ts](../apps/api/src/scenario.ts) ranks offers from fixture objects.
  The on-chain `breach_count` is displayed but has no effect. In
  [learning.ts](../packages/protocol/src/learning.ts), memory gets a hardcoded +25%,
  and nothing ties it to the published `PrecedentRecord`.
- **Change:**
  - Fetch the `ComputeOffer`, `ProviderRecord`, and `ModelInstance` accounts from the
    chain and rank them with `rankComputeOffers`.
  - Derive the memory update from the on-chain `Dispute` and `PrecedentRecord`, and
    recompute `ruling_root` to check it.
- **Why:** if the program could be deleted and the second job would still switch to
  Z, the demo is not proving the protocol.
- **Done when:**
  - The second-job choice is computed from fetched accounts.
  - A regression test fails if the precedent is missing or `ruling_root` does not match.

### A2. A precedent consumed by an agent that was not harmed (must do)

- **Change:** the twin agent (same stock manifest, independent memory) has no
  first-hand history with X.
  - Before: it would hire X.
  - It reads the published precedent, verifies the precedent against the chain,
    checkpoints its memory on-chain, and now hires Z.
  - The dashboard shows both agents' choices side by side.
- **Why:** a precedent is valuable because agents that were not party to the
  dispute can verify it and act on it. This is the main point of the pitch, and it
  is the composability story.
- **Done when:**
  - The twin's choice is X before and Z after reading the precedent.
  - The twin's memory root changes on-chain.
  - This is covered by a test and by the browser regression.

### A3. Quality-breach scenario replaces "missed deadline" (must do)

- **Now:** provider X never submits, and the jury rules on a breach that code could
  check mechanically.
- **Change:**
  - X submits a result.
  - A deterministic verifier spot-check, modeled on the Kimi Vendor Verifier, fails:
    the expected output hash does not match.
  - The customer disputes inside the review window.
  - The evidence records the verifier result.
- **Why:** this matches the pitch (degraded hosts), and it answers "why have a jury?"
- **Scope:**
  - No program change. `open_dispute` already accepts a `Submitted` contract after
    its deadline and inside `REVIEW_WINDOW_SLOTS`.
  - Update `FailureEvidence`, `learnFromBreach`, the fixtures, the API stage
    labels, and the UI copy.
  - The failure must stay controllable through the demo API, as required by AGENTS.md §7.
- **Done when:**
  - A full run disputes a submitted result and refunds the customer.
  - X's `breach_count` is incremented.

### A4. Fix the fixture numbers (must do, about 1 hour)

- **Now:**
  - X publishes a 16% failure probability, but the agent's genesis memory assumes 1%.
  - Y's 9% exists only to keep Y out of contention.
  - Anyone reading the market page sees the agent hire a provider that admits a 16%
    failure rate.
- **Change:**
  - Offers publish X 1%, Y 9%, and Z 1%.
  - The agent starts by trusting published claims, so the genesis override is no
    longer needed.
  - Prices and policy are unchanged.
- **Checked:** X wins first (expected cost 6.88M lamports, against Z's 11.55M). After
  the breach (X at 25%), Z wins with 11.55M, against Y's 12.87M and X's 18.88M.
- **Why:** the story becomes "X claimed it was reliable, and the precedent exposed it."
- **Done when:** the router and learning tests are updated, and the docs show the new numbers.

### A5. Agent profit-and-loss panel (should do)

- **Change:** show the procurement agent's profit and loss, computed from on-chain
  contract amounts:
  - parent revenue: 15M;
  - OCR subcontract: −3M;
  - job 1: −5M, refunded +5M;
  - job 2: −11M.
- **Result:** **+1M with the protocol's refund; −4M without it.**
- **Why:** one number shows why the protocol matters. No program change is needed.

### A6. A 4–1 jury split (nice to have)

- **Change:** one juror reveals "no breach." This is demo-script only. The
  arbitration rules are unchanged.
- **Why:** with a unanimous scripted vote, it is not obvious why commit/reveal or
  the majority-of-five rule matters.

## 4. Workstream B: devnet (public verifiability)

The contest is explicitly about public blockchains, and composability is judged. A precedent only demonstrates "public and verifiable" if judges can inspect it themselves.

- **B1. Devnet mode:**
  - Pre-funded wallets instead of the airdrop loop. The devnet faucet rate-limits it.
  - Wider job deadline and commit/reveal windows outside localnet. Today the job
    deadline is 20 slots and the commit window is 35.
  - A Solana Explorer link on every receipt.
- **B2. Deploy and run once:**
  - Deploy the program to devnet and complete one full run.
  - Put the program, dispute, precedent, and passport links in the README and the
    submission.
  - **Needs approval before deploying** (AGENTS.md §10).
- **Recording:** record the demo video on localnet for reliability. Show the devnet
  links as proof.
- **Start now:** request devnet SOL early. Faucet limits can delay us.

## 5. Workstream C: pitch, go-to-market, demand

- **C1. One-liner and narrative.** Problem: provider variance is documented today.
  Gap: existing fixes are centralized and offer no recourse. Then show how the
  protocol works, give a one-line answer to "why Solana," state the business model,
  and introduce the team.
- **C2. Go-to-market:**
  - Position the protocol as the liability layer _on top of_ existing compute and
    inference markets, not as a competing marketplace.
  - Business model: a fee on settled escrow and/or on arbitration. No native token
    (AGENTS.md §1).
- **C3. Demand validation (start immediately):**
  - Message 5–10 agent-framework builders or inference hosts. Ask whether provider
    variance has cost them time or money, and whether they would pay for recourse.
  - Quote real replies, with permission. Three genuine quotes are worth more than a
    market-size slide.
- **C4. Videos:**
  - Pitch: 2–3 minutes.
  - Product demo: 3 minutes at most. The full run takes about one minute, which
    leaves time to narrate the precedent and the agent switching providers.

## 6. Workstream D: submission

- Every team member registers on colosseum.com before the deadline.
- Commit the current uncommitted work as a checkpoint. Create the GitHub repo, which
  must be public for the open-source criterion. **Pushing needs approval.**
- Check a fresh clone: `pnpm install`, `pnpm run anchor:build`, `pnpm run dev`.
- Fill in the form: name, description, team, repo link, both videos, go-to-market
  plan, and demand evidence.

## 7. Timeline

| Day                     | Focus              | Tasks                                                                                                                             |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Thu Oct 8** (tonight) | Secure the base    | Registration. Checkpoint commit. Repo. Request devnet SOL. Start C3 outreach. Start A1.                                           |
| **Fri Oct 9**           | Protocol story     | A1, A2, A3, A4. Update tests. `pnpm run check` and `pnpm run anchor:test` green.                                                  |
| **Sat Oct 10**          | Devnet and polish  | B1, B2. A5. Show "precedent → memory → choice" in one view. README. Draft the pitch script (C1, C2).                              |
| **Sun Oct 11**          | Freeze and content | **Code freeze at midday** (bug fixes only after). A6 if time allows. Record both videos. Finish the go-to-market plan and quotes. |
| **Mon Oct 12**          | Submit             | Fresh-clone check. Upload videos. Submit by noon PT.                                                                              |

## 8. If we fall behind, cut in this order

1. A6: the jury split
2. B1 polish (keep a bare devnet deployment plus one run)
3. A5: the profit-and-loss panel

**Never cut:** A1, A2, A3, the two videos, and the go-to-market and demand sections.

**Out of scope until after the deadline:**

- Gemini summaries
- program changes to link compute contracts to the parent contract
- open (permissionless) jury selection
- juror staking and rewards
- provider bonds

## 9. Limitations to state openly

Judges will find these, so we say them first:

- **The jury is appointed by the demo authority.** It is not permissionless.
  Roadmap: open jury selection with staking.
- **Models and verifier outputs are deterministic fixtures.** Roadmap: plug in a
  real verifier such as the Kimi Vendor Verifier.
- **The risk update is an explicit demo rule** (+25% per breach). It is not a
  calibrated estimator.
- **The escrow and dispute code is not audited.**

## 10. Decisions that need explicit approval

- Pushing to GitHub and making the repo public
- Deploying to devnet
- Any change to the arbitration mechanism beyond the demo script (A6 is
  demo-script only)
