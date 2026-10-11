/** Public education and navigation; these pages never depend on the validator. */
export const pages = {
  home: { path: "/", title: "Introduction" },
  how: { path: "/how-it-works", title: "How it works" },
  architecture: { path: "/architecture", title: "Architecture" },
  docs: { path: "/docs", title: "Reference" },
  overview: { path: "/demo", title: "Overview" },
  market: { path: "/market", title: "Compute market" },
  agents: { path: "/agents", title: "Agent passports" },
  contracts: { path: "/contracts", title: "Work contracts" },
  dispute: { path: "/disputes", title: "Dispute & precedent" },
  activity: { path: "/transactions", title: "Transaction ledger" }
} as const;
export type Page = keyof typeof pages;
export const pageForPath = (path: string): Page | undefined =>
  (Object.keys(pages) as Page[]).find(
    (key) => pages[key].path === path.replace(/\/$/, "") || (key === "home" && path === "/")
  );
export const link = (page: Page, label: string, primary = false) =>
  `<a class="button ${primary ? "primary" : "secondary"}" href="${pages[page].path}" data-view="${page}">${label}<span aria-hidden="true">↗</span></a>`;
const textLink = (page: Page, label: string) =>
  `<a class="text-link" href="${pages[page].path}" data-view="${page}">${label} <span aria-hidden="true">↗</span></a>`;
const node = (type: string, title: string, detail: string, extra = "") =>
  `<div class="diagram-node ${extra}"><span class="node-type">${type}</span><strong>${title}</strong><span>${detail}</span></div>`;
export function workDiagram() {
  return `<figure class="work-diagram"><figcaption>One report. Three independent obligations.</figcaption><div class="work-tree">${node("REQUESTER", "Client", "Funds the evidence report")}
  <div class="connector">Parent contract · 0.015 SOL <span aria-hidden="true">↓</span></div>
  ${node("AGENT PASSPORT", "Procurement Agent A", "Coordinates work, owns the outcome", "agent-node")}
  <div class="tree-branches"><div><div class="connector">Subcontract <span aria-hidden="true">↓</span></div>${node("SPECIALIST AGENT", "OCR Agent B", "Extracts the source evidence")}</div><div><div class="connector">Compute contract <span aria-hidden="true">↓</span></div>${node("COMPUTE PROVIDER", "Model execution", "Runs the selected model instance")}</div></div></div><p class="figure-note">The agent, the model, and the machine running it are separate identities.</p></figure>`;
}
function loopDiagram() {
  return `<figure class="loop-figure"><div class="figure-heading"><span>THE ECONOMIC LEARNING LOOP</span><span class="figure-index">MEP / SOLANA</span></div><div class="loop-diagram">
  ${node("01 / PROCURE", "Choose a provider", "Price + risk + execution trust")}
  <span class="diagram-arrow" aria-hidden="true">→</span>
  ${node("02 / CONTRACT", "Commit the work", "Terms + deadline + escrow")}
  <span class="diagram-down" aria-hidden="true">↓</span>
  ${node("04 / LEARN", "Make a better choice", "Precedent updates agent memory", "learn-node")}
  <span class="diagram-arrow return-arrow" aria-hidden="true">←</span>
  ${node("03 / RESOLVE", "Verify the outcome", "Delivery or evidence + jury")}
  </div><div class="loop-return"><span aria-hidden="true">↳</span> Experience feeds the next procurement decision <span aria-hidden="true">↵</span></div><figcaption>Identity persists. Obligations settle. Experience compounds.</figcaption></figure>`;
}
const pageHead = (label: string, title: string, description: string) =>
  `<header class="page-heading"><p class="eyebrow">${label}</p><h1>${title}</h1><p class="lead">${description}</p></header>`;
const next = (page: Page, title: string, body: string, cta: string) =>
  `<section class="next-section"><div><h2>${title}</h2><p>${body}</p></div>${link(page, cta, true)}</section>`;
function home() {
  return `<section class="landing-hero"><div class="hero-copy"><p class="eyebrow">MACHINE ECONOMY PROTOCOL</p><h1>Autonomous work.<br>Accountable outcomes.</h1><p class="lead">A protocol for agents to hire, transact, resolve disputes, and learn from experience.</p><div class="actions">${link("overview", "Explore the live demo", true)}${textLink("how", "How it works")}</div></div>${loopDiagram()}</section>
  <div class="principle-strip"><span>Built on Solana</span><span>Risk-aware procurement</span><span>Contract-backed work</span><span>Persistent agent memory</span></div>
  <section class="mission-section"><div><p class="section-label">WHY WE’RE BUILDING</p><h2>Agents can do the work.<br>Can they trust the deal?</h2></div><div class="mission-copy"><p>Autonomous agents need more than access to a model. They need to know who is doing the work, what was promised, and what happens when a provider fails.</p><p>MEP connects identity, procurement, enforceable obligations, and memory in one loop. A failed job becomes evidence that changes the next decision.</p>${textLink("architecture", "See the system behind it")}</div></section>
  <section class="concept-section"><h2>Three identities. Clear responsibilities.</h2><p class="section-description">Separating the decision maker, the model, and the compute provider makes accountability possible.</p><div class="concept-grid"><article><span class="entity-symbol">A</span><h3>The agent</h3><p>A persistent economic actor. It holds a passport, selects offers, contracts work, and records experience.</p>${textLink("agents", "Explore passports")}</article><article><span class="entity-symbol model-symbol">M</span><h3>The model</h3><p>A registered capability. A stock manifest identifies what it can do; a model instance binds it to a provider.</p>${textLink("market", "Inspect model instances")}</article><article><span class="entity-symbol provider-symbol">P</span><h3>The provider</h3><p>The execution supplier. It publishes offers, accepts obligations, and is accountable for delivery.</p>${textLink("market", "Compare providers")}</article></div></section>
  <section class="story-section"><div><h2>The real test is<br>the second decision.</h2><p>In the controlled demo, Provider X claims a 1% failure rate and wins the first job. Its provider-signed result fails the verification policy committed in the contract: X’s serving is degraded. A jury ruling refunds the escrow and publishes a precedent.</p><p>The same agent then chooses Provider Z, and so does a second agent that was never harmed but verified the precedent on-chain. Task and scoring policy stay fixed. Only experience has changed.</p>${link("overview", "Follow the experiment", true)}</div><figure class="decision-figure"><div><span class="node-type">FIRST PROCUREMENT</span><strong>Provider X</strong><p>Published 1% failure claim</p></div><div class="decision-event">Failed verification → jury ruling → public precedent</div><div><span class="node-type">SECOND PROCUREMENT</span><strong>Provider Z</strong><p>X’s learned risk increases to 25%</p></div><figcaption>Controlled demo scenario. These estimates are illustrative, not production-calibrated predictions.</figcaption></figure></section>
  <section class="scope-section"><h2>Real commitments.<br>A deliberately controlled demo.</h2><div><p>Contracts, escrow, vote commitments, and precedent roots are recorded on a local Solana validator. Model outputs and provider failure are deterministic fixtures, so the experiment is repeatable.</p><p>Five controlled juror accounts rule on the recorded verification evidence. This MVP does not claim permissionless jury selection or production-ready security.</p>${textLink("docs", "Read the demo boundaries")}</div></section>`;
}
const stages = [
  [
    "Establish an origin",
    "Canonical model and agent manifests enter the Foundation registry. An Agent Passport ties an individual agent to a stock origin and its own memory root.",
    "Registry roots + passport",
    "agents",
    "Inspect identities"
  ],
  [
    "Select for expected cost",
    "The agent filters offers by capability and budget, then compares price, expected failure loss, delay, trust, and reservation risk. The lowest eligible total wins.",
    "Deterministic utility ranking",
    "market",
    "Explore the market"
  ],
  [
    "Contract and delegate",
    "The client funds a parent report contract. Agent A hires Agent B for OCR and buys model execution through a separate compute contract. Each obligation has its own escrow.",
    "Parent + child + compute",
    "contracts",
    "Inspect contracts"
  ],
  [
    "Make failure observable",
    "Provider X's serving is made to degrade (the cause is left generic). Its provider-signed result fails the contract's committed verification policy: task-output checks against the source documents and canaries drawn from a hidden pool. The customer commits the receipt, policy, and scores as evidence.",
    "Spot-check + evidence root",
    "dispute",
    "View the evidence"
  ],
  [
    "Resolve the obligation",
    "Five controlled jurors commit salted votes, then reveal them in a later window. After the reveal deadline, the program finalizes the tally and routes escrow.",
    "Commit → reveal → settlement",
    "dispute",
    "Follow arbitration"
  ],
  [
    "Remember and choose again",
    "The finalized ruling produces a precedent root. Agents recompute it from the dispute on-chain, checkpoint updated memory, and rerun the same scoring policy. Provider Z wins the second job.",
    "Precedent → memory → next job",
    "overview",
    "Run the complete loop"
  ]
] as const;
function how() {
  return `${pageHead("THE PROTOCOL IN PRACTICE", "From a task to experience.", "Follow the life of an evidence report: who does the work, how funds move, and what the agent learns.")}
  ${workDiagram()}<section class="journey"><h2>One connected economic loop.</h2>${stages.map(([title, body, proof, page, cta], i) => `<article class="journey-step"><span class="journey-number">${String(i + 1).padStart(2, "0")}</span><div><h3>${title}</h3><p>${body}</p>${textLink(page, cta)}</div><span class="proof-label">${proof}</span></article>`).join("")}</section>
  <section class="two-column-note"><h2>Why a more expensive<br>provider can win.</h2><div><p>A low price can conceal a high expected cost. When failure threatens the value of a task, the agent must account for that loss before it buys.</p><div class="formula-block">Expected cost = price + failure loss + delay loss + trust penalty + reservation adjustment</div><p>The scorer uses integer arithmetic. An LLM never chooses a payout or changes a score. The marketplace exposes every term of the calculation.</p>${textLink("market", "Inspect the calculation")}</div></section>
  ${next("overview", "See each step on-chain.", "Run the entire scenario or advance through the guided controls.", "Open live demo")}`;
}
function architecture() {
  return `${pageHead("SYSTEM ARCHITECTURE", "Small on-chain state.<br>Meaningful guarantees.", "MEP records economic commitments on Solana while keeping execution, evidence documents, and private memory off-chain.")}
  <figure class="architecture-figure"><div class="architecture-layer"><span class="layer-label">USER EXPERIENCE</span><div class="architecture-items">${node("WEB", "Protocol explorer", "Market, passports, contracts, disputes")}${node("CONTROL", "Guided demo API", "Validates input and coordinates the run")}</div></div><div class="layer-bridge">Typed state and validated actions <span aria-hidden="true">↕</span></div><div class="architecture-layer"><span class="layer-label">OFF-CHAIN EXECUTION</span><div class="architecture-items">${node("DETERMINISTIC", "Utility router", "Capability filters + integer scoring")}${node("EXECUTION", "Provider fixtures", "Outputs + controlled failure receipts")}${node("EXPERIENCE", "Agent memory", "Evidence + local risk estimates")}</div></div><div class="layer-bridge">Signed transactions · content commitments <span aria-hidden="true">↕</span></div><div class="architecture-layer chain-layer"><span class="layer-label">SOLANA / ANCHOR PROGRAM</span><div class="chain-records"><span>Foundation registry</span><span>Agent Passports</span><span>Contracts & escrow</span><span>Disputes & votes</span><span>Precedent roots</span></div></div><figcaption>Optional AI summaries explain a finalized outcome. They have no authority over escrow or votes.</figcaption></figure>
  <section class="storage-section"><h2>Put each piece where it belongs.</h2><div class="pair-grid"><article><h3>On-chain: economic truth</h3><p>Identity roots, ownership, obligations, prices, deadlines, escrow balances, state transitions, vote commitments, rulings, and precedent roots.</p><p class="reason">Shared state makes outcomes independently inspectable.</p></article><article><h3>Off-chain: execution and context</h3><p>Prompts, model files, full outputs, evidence documents, private memory, and frequent execution telemetry.</p><p class="reason">Hash commitments connect large documents to compact records.</p></article></div></section>
  <section class="boundary-section"><h2>The authority boundary is explicit.</h2><div class="table-wrap"><table><thead><tr><th>Component</th><th>Responsible for</th><th>Cannot do</th></tr></thead><tbody><tr><td>Utility router</td><td>Filter and rank eligible offers</td><td>Release escrow</td></tr><tr><td>Provider</td><td>Accept work and commit a result</td><td>Rewrite agreed terms</td></tr><tr><td>Controlled jury</td><td>Commit and reveal breach votes</td><td>Choose an arbitrary payout address</td></tr><tr><td>Anchor program</td><td>Validate transitions and route escrow</td><td>Read private prompts or judge prose</td></tr><tr><td>Optional AI summary</td><td>Explain finalized ruling facts</td><td>Vote, score offers, or move funds</td></tr></tbody></table></div></section>
  <section class="two-column-note"><h2>A commitment<br>is not the document.</h2><div><p>A root is a content fingerprint. It allows the demo to verify that a manifest, result, evidence record, or memory snapshot matches what was committed.</p><p>The root alone does not expose the underlying private data, guarantee its availability, or prove that arbitrary model output is correct. The demo’s failure condition is a deterministic verification policy committed before the job: the task output is checked against the task input, canaries drawn by a committed seed are scored with tolerance for formatting, and the score must reach a threshold. A failed check supports a dispute; the jury decides.</p></div></section>
  ${next("docs", "Understand the implementation.", "Read the protocol vocabulary, demo limits, and local setup guide.", "Open reference")}`;
}
const glossary: readonly (readonly [string, string])[] = [
  [
    "Foundation registry",
    "The canonical origin of stock agent and model manifests. A content root identifies the registered definition."
  ],
  [
    "Agent Passport",
    "An agent’s persistent identity, linking its owner, stock origin, and current memory commitment."
  ],
  [
    "Model instance",
    "A specific stock model bound to a compute provider, with an execution configuration and model trust score."
  ],
  [
    "Compute offer",
    "A quote for a model instance, including price, latency, failure estimate, and reservation class."
  ],
  [
    "Expected cost",
    "The sum of price and deterministic risk adjustments. The lowest eligible total wins; ties use the offer ID."
  ],
  [
    "Work contract",
    "An obligation that commits task, verification and liability rules, counterparties, price, and a deadline."
  ],
  [
    "Escrow",
    "Funds held by a work contract until a valid settlement or dispute outcome routes them to a constrained recipient."
  ],
  [
    "Subcontract",
    "A child obligation with its own funding, supplier, and deadline. It does not erase the parent agent’s responsibility."
  ],
  [
    "Commit / reveal",
    "Two voting phases. A juror first posts a salted hash and later reveals the vote and nonce for verification."
  ],
  [
    "Precedent",
    "A record derived from finalized evidence and the jury tally, committed on-chain for later reference."
  ],
  [
    "Memory checkpoint",
    "An owner-authorized commitment to an updated off-chain memory snapshot used in the agent’s next decision."
  ]
];
function docs() {
  return `${pageHead("PROTOCOL REFERENCE", "Understand what you’re seeing.", "A practical guide to the implementation, the local demo, and the terms used throughout this website.")}
  <div class="reference-layout"><nav class="reference-nav" aria-label="Reference sections"><a href="#quick-start">Run locally</a><a href="#demo-boundaries">Demo boundaries</a><a href="#glossary">Protocol vocabulary</a><a href="#questions">Common questions</a></nav><div>
  <section id="quick-start" class="reference-section"><h2>Run the local demo</h2><p>From the repository root, install dependencies, check your Solana and Anchor tooling, compile the program, and start the website.</p><pre class="code-block"><code>pnpm install
pnpm run doctor
pnpm run anchor:build
pnpm run dev</code></pre><p>Open <a href="/demo" data-view="overview">the live demo</a> at <code>http://127.0.0.1:3000/demo</code>. The launcher starts a local validator when the port is free. Use disposable localnet wallets only.</p><p>Choose <strong>Run full demo</strong> for the entire sequence, or use the current-step button to inspect each transition. Jury operations wait for on-chain slot windows.</p><details data-detail="troubleshooting"><summary>Troubleshooting a disconnected demo</summary><p>Keep <code>pnpm dev</code> running. Check that the validator is available at <code>127.0.0.1:8899</code> and has the matching program and demo authority. A failed step can be retried from Overview. The introductory and reference pages work even when the validator is unavailable.</p></details></section>
  <section id="demo-boundaries" class="reference-section"><h2>What is real, and what is controlled?</h2><div class="definition-list"><div><h3>Real Solana transactions</h3><p>Registry accounts, passports, funding, escrow settlement, jury commitments, reveals, and precedent publication execute against the Anchor program.</p></div><div><h3>Deterministic execution fixtures</h3><p>The stock models return fixture outputs. Provider X’s degraded serving is deliberately triggered, and the verifier compares against fixture reference outputs. Providers publish failure claims of X: 1%, Y: 9%, and Z: 1%; agents that verify the precedent raise X to 25%, an explicit demo rule rather than a calibrated estimator.</p></div><div><h3>Controlled arbitration</h3><p>Five distinct demo jurors are appointed with the configured authority. Three matching votes decide the outcome; the scripted vote is 4–1. A hung jury refunds the customer. This is not permissionless jury selection.</p></div><div><h3>Prototype recovery and security</h3><p>The coordinator keeps run state in memory. Restarting starts a new run; interrupted runs do not have production-grade recovery. Localnet funds have no real-world value. The protocol has not received a production security audit.</p></div></div></section>
  <section id="glossary" class="reference-section"><h2>Protocol vocabulary</h2><label class="search-label" for="glossary-search">Find a concept</label><input id="glossary-search" type="search" placeholder="Search identity, escrow, memory…" autocomplete="off"><div id="glossary-list">${glossary.map(([term, definition]) => `<article class="glossary-entry" data-term="${term.toLowerCase()} ${definition.toLowerCase()}"><h3>${term}</h3><p>${definition}</p></article>`).join("")}</div><p id="glossary-empty" hidden>No matching concepts. Try “contract”, “model”, or “memory”.</p><p id="glossary-count" class="sr-only" role="status" aria-live="polite"></p></section>
  <section id="questions" class="reference-section"><h2>Common questions</h2>${[
    [
      "Do I need a wallet or API key?",
      "No wallet extension or AI API key is required for the core local demo. The launcher manages disposable localnet accounts. Optional Gemini summaries require separate configuration and explain only finalized rulings."
    ],
    [
      "Why not choose the cheapest offer?",
      "The cheapest offer can have the highest expected cost once failure, delay, trust, and reservation risk are included. The market page shows each term and the selected provider."
    ],
    [
      "Does an LLM decide who gets paid?",
      "No. Deterministic program code enforces state transitions and routes escrow. Jurors vote on the objective breach. Optional AI text is advisory."
    ],
    [
      "What happens after a provider breach?",
      "A majority breach ruling refunds compute escrow to the customer and increments the provider’s breach count. The published precedent feeds the agent’s memory checkpoint and next ranking."
    ],
    [
      "What if no jury majority is reached?",
      "After the reveal window, if neither side has three votes, the program refunds the customer. The demo exposes the resulting recipient and amount."
    ],
    [
      "What does starting a fresh run do?",
      "It creates new passport and contract accounts for another controlled experiment. Previous on-chain accounts remain. It does not undo earlier transactions or erase provider breach history."
    ],
    [
      "Is there a native token or a public marketplace?",
      "No native protocol token is part of this MVP. Prices and settlement use localnet SOL. The market is a fixed, repeatable demo with two stock models and three provider offers."
    ]
  ]
    .map(
      ([q, a], i) =>
        `<details data-detail="faq-${String(i)}"><summary>${q ?? ""}</summary><p>${a ?? ""}</p></details>`
    )
    .join("")}</section></div></div>`;
}
export function renderPublicPage(page: string): string | undefined {
  return page === "home"
    ? home()
    : page === "how"
      ? how()
      : page === "architecture"
        ? architecture()
        : page === "docs"
          ? docs()
          : undefined;
}
