# Work contract and native SOL escrow (Phase 6)

The customer is the owner of an `AgentPassport`. It selects a published
`ComputeOffer` and creates a `WorkContract` PDA keyed by that agent and a
contract index. The program copies the offer's price and provider authority
into the contract. The customer also commits three SHA-256 roots: task,
verification rule, and liability rule. The structured content remains
off-chain.

The lifecycle is:

```text
Draft --customer funds quoted price--> Funded
Funded --provider starts--> Running
Running --provider submits result root--> Submitted
Submitted --customer verifies--> Verified
Verified --anyone settles--> Settled
Submitted --review window passes, anyone releases--> Settled
Funded/Running --deadline passes, customer disputes--> Disputed
Submitted --customer disputes inside review window--> Disputed
Disputed --jury breach / cleared / hung--> Breached / Settled / Refunded
```

`fund_contract` transfers the quoted price in native SOL from the customer to
the program-owned contract account. `settle_contract` sends exactly the tracked
escrow amount to the provider authority stored at creation. It checks that the
contract account retains its rent-exempt balance. The contract state and
escrow counter change atomically with each transfer. Repeating settlement
fails because the state is already `Settled` and the tracked escrow is zero.

The provider must sign start and submit instructions. The customer must sign
fund and verify. Settlement after verification is permissionless because the
payout address was fixed at creation. A result root must be non-zero. Funding,
start, and submission must happen by the deadline. The current verification
step is customer attestation of the submitted root; the program does not
inspect private output or evaluate the off-chain verification rule. No LLM can
release funds.

In the demo, compute jobs commit a `mep.verification-policy.v1` as the
verification rule: the checker's code root, the canary pool root and a seed
commitment, the task checks, and a pass threshold. The delivered result document
holds the task output and the answers to the drawn canaries, and its hash is the
on-chain result root. The provider also signs a `mep.receipt.v1` with its
provider authority key. Before verifying, the customer checks the receipt, then
scores the task output against the task input and the canaries with tolerance
for formatting. A failed check supports a dispute inside the review window, and
the receipt, policy, and scores become the evidence. See
[verification.md](verification.md).

A silent customer cannot lock the provider's payment. If the customer neither
verifies nor disputes a submitted result within `REVIEW_WINDOW_SLOTS` after the
deadline, anyone can call `release_unverified` to pay the provider. Failed
verifications and missed deadlines go to the jury dispute; a hung jury refunds the customer. A contract
that is funded but never started still needs a dispute (co-signed by the demo
authority) to refund. Use disposable localnet wallets only.

Phase 7 adds agent-service parent contracts and linked child subcontracts;
see [subcontract.md](subcontract.md).

Run `pnpm run anchor:test` for LiteSVM transaction tests and
`pnpm run contract:build` to generate `dist/contract.html` for the guided
static preview.
