# Machine Economy Protocol Project Rules

These rules govern all coding, documentation, testing, and operational work in this repository. They apply to human contributors and AI coding agents.

## 1. Product Boundary

- Build the full Machine Economy Protocol MVP loop:
  - Foundation registry
  - Agent Passport
  - model/provider marketplace
  - risk-based provider selection
  - work contract and escrow
  - agent-to-agent subcontract
  - controlled provider failure
  - dispute and juror commit/reveal
  - precedent record
  - memory update
  - second job with changed provider choice
- Do not expand into a general decentralized GPU marketplace unless it directly supports the demo loop.
- Do not add native protocol token mechanics for v0.1.
- Localnet is the default development cluster. Devnet is for final demo validation.

## 2. Secrets and Keys

- Never commit private keys, seed phrases, API keys, RPC secrets, wallet files, or `.env` files.
- Put local secrets in `.env.local` or `.env`, both of which must be ignored by Git.
- Commit only `.env.example` with placeholder values.
- Use disposable localnet/devnet wallets only during development.
- Never use a wallet containing mainnet funds for tests, demos, screenshots, or automated scripts.
- AI API keys are optional during early development. Core scoring and settlement logic must work without an LLM.

## 3. Architecture Standards

- Keep on-chain state small and economically meaningful.
- Put identity, obligations, escrow, status transitions, commitments, disputes, votes, and precedent roots on-chain.
- Keep prompts, private memory, large outputs, model files, and high-frequency telemetry off-chain.
- Deterministic code must perform all money movement, scoring arithmetic, state transitions, and pass/fail checks.
- LLMs may summarize, explain, arbitrate in demo mode, or assist with text generation, but must not directly control escrow release.
- The frontend should make compute providers, model instances, and agents visibly separate concepts.

## 4. Repository Standards

- Prefer a monorepo structure:
  - `programs/` for Anchor programs
  - `apps/web/` for the dashboard
  - `apps/api/` for demo backend, provider daemon, and indexer endpoints
  - `packages/` for shared types, SDK, hashing, fixtures, and demo data
  - `docs/` for design notes and competition material
- Shared protocol types should live in one package and be reused by frontend/backend tests where practical.
- Demo fixtures should be deterministic and easy to reset.

## 5. Coding Standards

- Use TypeScript for frontend, backend, SDK, tests, and scripts unless there is a clear reason not to.
- Use Rust/Anchor for Solana programs.
- Keep business logic explicit and readable; avoid clever abstractions during the hackathon build.
- Validate all external inputs at API and instruction boundaries.
- Use structured data formats for manifests, receipts, votes, and evidence.
- Avoid hand-parsing JSON or binary formats when reliable libraries are available.
- Do not introduce new frameworks or infrastructure without a clear benefit to the MVP loop.

## 6. Testing Requirements

- Every on-chain instruction must have at least one happy-path test and one relevant failure-path test.
- Escrow, dispute, vote commit/reveal, and settlement logic require focused tests before being wired into the UI.
- Utility scoring must have deterministic unit tests showing why a more expensive provider can win.
- Memory update and second-job provider choice must have a regression test.
- Frontend should include smoke tests for the core demo flow once the UI exists.
- Before claiming a feature is complete, run the relevant test command and report the result.

## 7. Demo Reliability

- The demo must not depend on random real-world outages.
- Provider failure must be triggerable through a controlled demo command or API.
- The same scripted demo should be runnable repeatedly from a clean localnet state.
- Demo data should include at least:
  - two stock agents
  - two stock models
  - three provider/model offers
  - one parent work contract
  - one child subcontract
  - one controlled breach
  - five juror accounts
  - one published precedent

## 8. Git and Change Control

- Do not rewrite history, reset hard, or discard existing changes unless the user explicitly asks.
- Keep commits focused around coherent units of work.
- Do not commit generated build artifacts, dependency folders, local wallet files, logs, or environment files.
- If unrelated local changes exist, leave them alone.
- If a change touches security, escrow, wallet authority, or dispute settlement, mention the risk in the final summary.

## 9. Dependency Policy

- Prefer established libraries and official tooling:
  - Anchor for Solana programs
  - Solana CLI for localnet/devnet
  - pnpm for JavaScript package management
  - Vitest or the project-selected test runner for TypeScript tests
- Pin versions where practical after the scaffold stabilizes.
- Avoid adding heavy services unless the MVP loop requires them.
- Any dependency that introduces network calls, wallet handling, or code execution needs extra scrutiny.

## 10. User Approval Required

Ask before:

- deploying to devnet or mainnet;
- pushing to GitHub;
- adding paid services;
- using a real API key;
- creating or importing wallets outside local/devnet;
- deleting files;
- changing the product scope;
- adding a native token;
- changing the arbitration mechanism materially.

## 11. Open Questions for the User

These should be resolved before or during initial implementation:

- Should the app name shown in the UI be `Machine Economy Protocol`, `MEP`, or another brand?
- Should the first frontend be optimized for judges as a guided demo, or for users as an actual marketplace?
- Should the backend be a single demo API at first, or split into provider daemon, indexer, and arbitration services immediately?
- Should OpenAI integration be stubbed until the core loop works, or wired in early for arbitration summaries?
- Should the first public deployment target be Vercel plus a hosted API, or local demo video only?

