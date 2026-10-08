# Agent subcontract (Phase 7)

An external client funds a parent agent-service `WorkContract` that pays Agent
A for an evidence summary. The parent records A's `AgentPassport` in
`supplier_agent` and A's owner as the payment authority. After the parent is
funded, Agent A creates one child `WorkContract` for OCR specialist Agent B.
The child records B's Passport and owner, plus the parent address. The parent
records the child address. A child must have an earlier deadline and a
positive price no greater than the parent's quoted revenue.

Both escrows are separate. The client funds the parent; Agent A funds the
child from its own wallet while the parent escrow stays in its contract
account. Agent B's owner signs start and result submission for the child.
Agent A verifies and settles the child, paying its exact price to B's owner.
Agent A then starts and submits the parent work; the client verifies and pays
the parent quote to A. LiteSVM tests assert the exact payments and that the
parent escrow is unchanged by child settlement.

The demo also uses the selected Provider X compute offer at 5,000,000
lamports as a projected separate cost for Agent A. Expected margin is `parent
revenue - compute cost - child price`: 15,000,000 − 5,000,000 − 3,000,000 =
7,000,000 lamports. If the child quote rises to 4,000,000 lamports, expected
margin falls to 6,000,000 lamports. This excludes transaction fees and
failures. The parent quote is not realized revenue until the client settles.
The compute quote is not a settled purchase in this subcontract preview.

The link records provenance, but the program does not yet require the child to
settle before the parent can be verified or settled. Only one child is allowed
per parent in this MVP. Disputes, the hung-jury refund, and the review-window
release described in [work-contract.md](work-contract.md) apply to child
contracts too. Use disposable localnet accounts for escrow tests.

This phase expands the `WorkContract` account layout. Reset an older local
validator before reseeding contracts created with the Phase 6 program.

Run `pnpm run anchor:test` for transaction tests, `pnpm run test` for margin
tests, and `pnpm run subcontract:build` to generate `dist/subcontract.html`.
