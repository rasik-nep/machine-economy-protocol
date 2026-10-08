# Protocol website and explorer

The frontend uses the existing TypeScript renderer and native CSS. It adds no
framework, service, font download, wallet integration, or network dependency.
`pnpm dev` compiles `dashboard.ts` and `site.ts` into ignored browser modules.

## Information architecture

| URL             | Purpose                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `/`             | Explain the problem, the three identities, and the learning loop            |
| `/how-it-works` | Walk through procurement, subcontracting, failure, arbitration, and memory  |
| `/architecture` | Show the on-chain/off-chain split and authority boundaries                  |
| `/docs`         | Local setup, limitations, searchable glossary, and common questions         |
| `/demo`         | Run the existing full or guided localnet experiment                         |
| `/market`       | Inspect provider rankings, risk arithmetic, and model instances             |
| `/agents`       | Inspect passports, memory commitments, and the Foundation registry          |
| `/contracts`    | Inspect each contract's state, price, locked balance, deadline, and address |
| `/disputes`     | Inspect evidence, commitments, jury progress, ruling, and precedent         |
| `/transactions` | Inspect real localnet transaction signatures                                |

The server explicitly allowlists these routes and the three frontend assets.
Existing Host, Origin, content type, mutation schema, run, and stage guards remain
in place. The root now opens the introduction; existing demo functionality lives
at `/demo`. Internal links support history, direct load, refresh, and native
modified-click behavior. There is no external transaction explorer link because
these signatures belong to a local validator.

## Design audit and direction

The previous frontend was a dense green dashboard with five in-memory tabs,
small typography, and no independent explanation of the product or architecture.
Its useful live controls, scoring tables, identity comparisons, evidence, and
transaction receipts are preserved.

The replacement uses off-white surfaces, near-black text, blue actions, one modest
radius system, and the existing system font stack. Design variance is 5, motion
intensity is 2, and information density is 3 for education / 5 for the explorer.
The visual assets are semantic, responsive diagrams specific to this protocol:
the economic loop, contract hierarchy, state transitions, architecture layers,
and first/second procurement comparison. They do not require remote assets.

Public education renders before the first state request and remains usable if the
validator fails. Live pages show connection errors, a last-snapshot notice when
applicable, disabled mutations when disconnected, and retry controls. Public page
polls do not replace an in-progress search or expanded reference section.

The site identifies deterministic fixtures, controlled jurors, uncalibrated risk
updates, advisory AI text, and localnet settlement explicitly. It does not claim
public marketplace operation or production security.

## Validation

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run test`
- `pnpm run test:e2e`

The browser suite covers direct loading of all ten pages at 1440px, 390px, and
320px, overflow, reload, navigation history, glossary filtering and persistence
across polls, disconnected education and live recovery, and the existing complete
and guided localnet loops. Desktop and mobile screenshots are written to ignored
`test-results/`.

No scoring, wallet authority, arbitration, or escrow settlement logic is changed
by this frontend work. Server changes are confined to serving allowlisted pages
and the additional frontend module.
