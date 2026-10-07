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
Verified --customer settles--> Settled
```

`fund_contract` transfers the quoted price in native SOL from the customer to
the program-owned contract account. `settle_contract` sends exactly the tracked
escrow amount to the provider authority stored at creation. It checks that the
contract account retains its rent-exempt balance. The contract state and
escrow counter change atomically with each transfer. Repeating settlement
fails because the state is already `Settled` and the tracked escrow is zero.

The provider must sign start and submit instructions. The customer must sign
fund, verify, and settle instructions. A result root must be non-zero. Funding,
start, and submission must happen by the deadline. The current verification
step is customer attestation of the submitted root; the program does not
inspect private output or evaluate the off-chain verification rule. No LLM can
release funds.

This phase implements the successful path only. There is currently no
instruction to refund an expired or disputed contract, and no timeout path if
the customer never verifies or settles. Avoid funding with non-disposable
wallets; use localnet test accounts while the dispute and recovery paths are
implemented. The liability rule is committed but not yet enforced by an
arbitration instruction.

Phase 7 adds agent-service parent contracts and linked child subcontracts;
see [subcontract.md](subcontract.md).

Run `pnpm run anchor:test` for LiteSVM transaction tests and
`pnpm run contract:build` to generate `dist/contract.html` for the guided
static preview.
