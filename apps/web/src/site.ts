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
/** The public Vercel site is a static replay; the local launcher drives a live run. */
const isReplay = () =>
  typeof document !== "undefined" && document.documentElement.dataset.mode === "replay";
const demoName = () => (isReplay() ? "recorded demo" : "live demo");
const where = (onChain: boolean) =>
  `<span class="where-tag ${onChain ? "on-chain" : "off-chain"}">${onChain ? "On-chain" : "Off-chain"}</span>`;
/** The three economic actors, built up from the resource to the decision maker. */
const actors = [
  [
    "G",
    "provider-symbol",
    "The GPU",
    "Compute provider",
    "A machine and its time. It sells capacity under a reservation class that states how likely it is to be interrupted.",
    "Capacity for a time window",
    "Price × utilization − running cost",
    "Staying online for the window it sold",
    "market",
    "Compare providers"
  ],
  [
    "M",
    "model-symbol",
    "The model",
    "Model instance",
    "Software running on a GPU: a canonical stock model bound to one provider, runtime, and configuration.",
    "Inference",
    "Inference revenue − compute cost",
    "Serving the model it claims to serve",
    "market",
    "Inspect model instances"
  ],
  [
    "A",
    "",
    "The agent",
    "Machine principal",
    "The actor that decides. It holds a passport, a budget, memory, and contracts, and it buys from the other two.",
    "Finished work",
    "Revenue − cost − risk",
    "The outcome it promised, even when it subcontracts",
    "agents",
    "Explore passports"
  ]
] as const;
/** One job, moment by moment: [title, short line, full explanation, on-chain?]. */
const moments = [
  [
    "Offer",
    "Providers publish priced offers.",
    "Each compute offer names a model instance, a price, a reservation class (spot, preemptible, standard, or guaranteed), a claimed failure rate, and a liability cap. Offers are on-chain records, so every agent sees the same market.",
    true
  ],
  [
    "Decide",
    "The agent scores every offer.",
    "The agent filters by capability and budget, then computes expected cost: price plus the money it expects to lose to failure, delay, and weak trust evidence. Its own memory of past jobs feeds the failure estimate. Integer arithmetic, no LLM.",
    false
  ],
  [
    "Commit",
    "A contract locks the money.",
    "The buyer opens a work contract with the task commitment, price, deadline, and the verification policy that will judge the result. Funding it moves the price into an escrow account that only the program can release.",
    true
  ],
  [
    "Delegate",
    "The agent hires others.",
    "To deliver, the agent opens child contracts of its own: a subcontract to a specialist agent and a compute contract with a provider. Each child is funded separately and has its own deadline, but the agent still owns the parent obligation.",
    true
  ],
  [
    "Execute",
    "Work happens off-chain, with receipts.",
    "The provider runs the model off-chain and signs a receipt: which contract, which model instance, a hash of the request, a hash of the result, and timestamps. Prompts and outputs never touch the chain.",
    false
  ],
  [
    "Verify",
    "The committed policy judges the result.",
    "The result hash is submitted to the contract. The buyer runs the verification policy that was committed before the job: checks against the task input and hidden test questions (canaries). Anyone can rerun it.",
    false
  ],
  [
    "Settle",
    "Escrow pays out, or a dispute opens.",
    "If the result passes, the contract settles and escrow pays the seller. If it fails, the buyer disputes inside the review window, and the escrow stays locked until jurors rule.",
    true
  ],
  [
    "Remember",
    "Experience changes the next decision.",
    "The agent records the outcome in its private memory and commits a fingerprint of that memory to its passport. A finalized ruling also publishes a precedent that any agent can verify and learn from.",
    true
  ]
] as const;
const momentStrip = (full: boolean) =>
  `<ol class="moment-list${full ? " full" : ""}">${moments.map(([title, short, body, onChain], i) => `<li><span class="moment-number">${String(i + 1).padStart(2, "0")}</span><div><h3>${title}</h3><p>${full ? body : short}</p></div>${where(onChain)}</li>`).join("")}</ol>`;
/** Where disputes come from, drawn from the whitepaper's failure cases. */
const disputeCauses = [
  [
    "Bad or degraded output",
    "The result arrives on time but fails the verification policy agreed in advance. This is the failure the demo triggers.",
    "In the demo"
  ],
  [
    "Capacity taken back",
    "The GPU owner reclaims the machine for their own work. Heartbeats stop and the job never finishes.",
    "Whitepaper"
  ],
  [
    "Missed deadline",
    "The work completes, but after the deadline slot that the contract committed to.",
    "Whitepaper"
  ],
  [
    "Model substitution",
    "The provider claims a canonical model but quietly serves a cheaper or different one.",
    "Whitepaper"
  ],
  [
    "Risk mismatch",
    "An agent promises a guaranteed deadline downstream while buying preemptible capacity upstream. Who carries the loss?",
    "Whitepaper"
  ],
  [
    "Subcontractor failure",
    "A child contract fails. The specialist answers to the agent, and the agent still answers to its client.",
    "Whitepaper"
  ]
] as const;
function home() {
  return `<section class="landing-hero"><div class="hero-copy"><p class="eyebrow">MACHINE ECONOMY PROTOCOL</p><h1>Autonomous work.<br>Accountable outcomes.</h1><p class="lead">A protocol where GPUs, models, and AI agents trade as separate economic actors, and agents hire, transact, resolve disputes, and learn from experience.</p><div class="actions">${link("overview", `Explore the ${demoName()}`, true)}${textLink("how", "How it works")}</div></div>${loopDiagram()}</section>
  <div class="principle-strip"><span>Built on Solana</span><span>Risk-aware procurement</span><span>Contract-backed work</span><span>Persistent agent memory</span></div>
  <section class="mission-section"><div><p class="section-label">WHY WE’RE BUILDING</p><h2>Agents can do the work.<br>Can they trust the deal?</h2></div><div class="mission-copy"><p>Autonomous agents need more than access to a model. They need to know who is doing the work, what was promised, and what happens when a provider fails.</p><p>MEP connects identity, procurement, enforceable obligations, and memory in one loop. A failed job becomes evidence that changes the next decision.</p>${textLink("architecture", "See the system behind it")}</div></section>
  <section class="concept-section"><p class="section-label">WHO TRADES</p><h2>Three economic actors.</h2><p class="section-description">A GPU, a model, and an agent can belong to the same person, but MEP records each one as its own actor, with its own identity, offer, and accountability.</p><div class="concept-grid actor-grid">${actors.map(([symbol, shape, title, role, body, sells, earns, owes, page, cta]) => `<article><span class="entity-symbol ${shape}">${symbol}</span><span class="node-type">${role.toUpperCase()}</span><h3>${title}</h3><p>${body}</p><dl class="actor-facts"><div><dt>Sells</dt><dd>${sells}</dd></div><div><dt>Earns</dt><dd>${earns}</dd></div><div><dt>Accountable for</dt><dd>${owes}</dd></div></dl>${textLink(page, cta)}</article>`).join("")}</div></section>
  <section class="two-column-note atom-section"><div><p class="section-label">THE ECONOMIC ATOM</p><h2>The agent is the<br>smallest economic unit.</h2></div><div><p>A GPU is a resource. A model is software running on that resource. Neither one decides anything. The agent is the smallest unit that can hold money, sign an obligation, carry liability, and remember what happened, so the economy is built from agents.</p><div class="formula-block">Agent = identity + wallet authority + memory + policy + reputation + contract rights + contract liabilities</div><p>An agent can switch models, providers, and hardware and still be the same economic actor, with the same passport and history. One person may own a GPU, host a model, and run an agent at the same time. MEP still records three actors, because their interests can conflict: the owner may want the GPU back for their own work while their agent has promised someone a deadline.</p>${textLink("agents", "See two agents with one origin")}</div></section>
  <section class="moments-section"><div class="moments-heading"><p class="section-label">MOMENT BY MOMENT</p><h2>What one transaction<br>looks like.</h2><p class="section-description">Every job is a small contract. Money, commitments, and outcomes go on-chain. The work itself, and everything private, stays off-chain.</p></div>${momentStrip(false)}<p class="moments-foot">${textLink("how", "Follow each moment in detail")}</p></section>
  <section class="two-column-note dispute-teaser"><div><p class="section-label">WHEN A DEAL GOES WRONG</p><h2>Where disputes<br>come from.</h2></div><div><p>Machines fail in ordinary ways. A provider serves degraded output, a GPU owner takes the machine back, a deadline passes, a cheaper model is swapped in, or an agent promises more downstream than it bought upstream.</p><p>Because every contract commits its verification rules and liability before work starts, a failure becomes a question of fact: did the result meet the agreed policy? Deterministic checks settle the easy cases. A jury decides the rest by committing and then revealing votes, and the program routes the escrow.</p>${textLink("how", "See how a dispute is resolved")}</div></section>
  <section class="story-section"><div><h2>The real test is<br>the second decision.</h2><p>In the controlled demo, Provider X claims a 1% failure rate and wins the first job. Its provider-signed result fails the verification policy committed in the contract: X’s serving is degraded. A jury ruling refunds the escrow and publishes a precedent.</p><p>The same agent then chooses Provider Z, and so does a second agent that was never harmed but verified the precedent on-chain. Task and scoring policy stay fixed. Only experience has changed.</p>${link("overview", "Follow the experiment", true)}</div><figure class="decision-figure"><div><span class="node-type">FIRST PROCUREMENT</span><strong>Provider X</strong><p>Published 1% failure claim</p></div><div class="decision-event">Failed verification → jury ruling → public precedent</div><div><span class="node-type">SECOND PROCUREMENT</span><strong>Provider Z</strong><p>X’s learned risk increases to 25%</p></div><figcaption>Controlled demo scenario. These estimates are illustrative, not production-calibrated predictions.</figcaption></figure></section>
  <section class="scope-section"><h2>Real commitments.<br>A deliberately controlled demo.</h2><div><p>Contracts, escrow, vote commitments, and precedent roots are recorded on Solana: a local validator for development, and devnet for the public replay. Model outputs and provider failure are deterministic fixtures, so the experiment is repeatable.</p>${isReplay() ? "<p><strong>This website is a static demo.</strong> It replays one recorded devnet run from saved snapshots. Stepping through it sends no new transactions, but every address and signature it shows is real and opens on Solana Explorer. Run the repository locally to drive a live run.</p>" : ""}<p>Five controlled juror accounts rule on the recorded verification evidence. This MVP does not claim permissionless jury selection or production-ready security.</p>${textLink("docs", "Read the demo boundaries")}</div></section>`;
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
const markets = [
  [
    "COMPUTE MARKET",
    "GPU providers",
    "Sell raw capacity: hardware, time, and an interruption policy."
  ],
  ["MODEL MARKET", "Model instances", "Sell inference from a known model on a specific provider."],
  ["CAPABILITY MARKET", "Agents", "Sell finished work, such as OCR, research, or verification."]
] as const;
/** The whitepaper's subcontracting example: a $4 job split across the three markets. */
const adJob = [
  ["Copywriting agent", "Capability", "0.10"],
  ["Image agent", "Capability", "0.35"],
  ["Voice agent", "Capability", "0.15"],
  ["Video rendering GPU", "Compute", "1.20"],
  ["Verification agent", "Capability", "0.05"]
] as const;
/** Contract states, as the Anchor program defines them. */
const lifecycle = {
  path: ["Draft", "Funded", "Running", "Submitted"],
  pass: ["Verified", "Settled"],
  fail: ["Disputed", "Breached"]
} as const;
const chips = (states: readonly string[]) =>
  states
    .map((state) => `<span class="state-chip">${state}</span>`)
    .join('<span class="state-arrow" aria-hidden="true">→</span>');
const disputeLevels = [
  [
    "Level 0",
    "Automatic settlement",
    "Deterministic checks, such as a schema, a hash, or a deadline, settle the contract with no one involved.",
    true
  ],
  [
    "Level 1",
    "Objective verification",
    "The buyer reruns the committed verification policy and posts the receipt, policy, and scores as evidence.",
    true
  ],
  [
    "Level 2",
    "Optimistic ruling",
    "Someone proposes a ruling. It stands unless a party challenges it within a window.",
    false
  ],
  [
    "Level 3",
    "Jury arbitration",
    "Five jurors commit hidden votes, then reveal them in a later window. Three of five decide. The whitepaper selects bonded jurors at random; the demo appoints five accounts.",
    true
  ]
] as const;
const liability = [
  ["Spot", "Refund of unused service"],
  ["Preemptible", "Refund plus a small credit"],
  ["Standard", "Refund plus a fixed SLA penalty"],
  ["Guaranteed", "Larger penalty backed by collateral"]
] as const;
function how() {
  return `${pageHead("THE PROTOCOL IN PRACTICE", "From a task to experience.", "Follow the life of an evidence report: who does the work, how funds move, and what the agent learns.")}
  <section class="markets-section"><div class="two-column-note"><div><p class="section-label">THREE MARKETS</p><h2>Three markets.<br>One contract joins them.</h2></div><div><p>MEP keeps compute, models, and agents in separate markets because they sell different things and fail in different ways. A work contract composes them: one task can buy capacity, inference, and other agents’ work at the same time.</p><p>The whitepaper’s example: Agent A takes a job to make a 30-second advertisement for $4. It hires across the markets and keeps the margin, minus protocol and execution costs.</p></div></div><div class="market-layout"><div class="market-columns">${markets.map(([label, title, body]) => `<div class="diagram-node"><span class="node-type">${label}</span><strong>${title}</strong><span>${body}</span></div>`).join("")}</div><div class="table-wrap"><table class="ad-table"><caption>A $4 advertisement job, procured by one agent</caption><thead><tr><th scope="col">Purchase</th><th scope="col">Market</th><th scope="col">Price (USD)</th></tr></thead><tbody>${adJob.map(([what, market, price]) => `<tr><td>${what}</td><td>${market}</td><td>$${price}</td></tr>`).join("")}<tr class="total-row"><td><strong>Agent A’s margin</strong></td><td>Before fees</td><td><strong>$2.15</strong></td></tr></tbody></table></div></div><p class="figure-note">Illustrative figures from the MEP whitepaper. The demo below uses a smaller evidence report.</p></section>
  ${workDiagram()}
  <section id="transaction" class="moments-section detailed"><div class="moments-heading"><p class="section-label">MOMENT BY MOMENT</p><h2>The anatomy of one transaction.</h2><p class="section-description">Each step is either an on-chain state change that everyone can check, or off-chain work that leaves a signed or hashed trace. Solana’s base fee of 5,000 lamports per signature keeps a contract per job affordable.</p></div>${momentStrip(true)}</section>
  <section class="lifecycle-section"><h2>Every contract follows the same states.</h2><p class="section-description">The program allows only these transitions. A submitted result either passes and settles, or is disputed and resolved by the jury.</p><div class="lifecycle"><div class="state-row">${chips(lifecycle.path)}</div><div class="state-branches"><div><span class="branch-label">Result passes</span><div class="state-row">${chips(lifecycle.pass)}</div></div><div><span class="branch-label">Result or deadline disputed · breach found</span><div class="state-row">${chips(lifecycle.fail)}</div></div></div></div><p class="figure-note">A breach ruling refunds the escrow to the buyer. If the jury clears the provider, the contract settles and pays the provider. A hung jury ends the contract as Refunded. Unfinished work becomes disputable once its deadline passes.</p></section>
  <section id="disputes" class="disputes-section"><p class="section-label">DISPUTES</p><h2>How a dispute arises.</h2><p class="section-description">A dispute is a claim that a contract’s committed terms were not met. These are the failure cases the protocol is designed around.</p><div class="cause-grid">${disputeCauses.map(([title, body, scope]) => `<article><span class="node-type">${scope.toUpperCase()}</span><h3>${title}</h3><p>${body}</p></article>`).join("")}</div>
  <div class="two-column-note"><div><h2>How a dispute<br>is resolved.</h2><p>Disputes climb a ladder and stop at the first level that can decide them. Arbitration determines facts and applies the terms agreed before the job. It does not invent new liability after the fact.</p></div><ol class="ladder">${disputeLevels.map(([level, title, body, built]) => `<li><span class="moment-number">${level}</span><div><h3>${title}</h3><p>${body}</p></div><span class="where-tag ${built ? "on-chain" : "off-chain"}">${built ? "In the demo" : "Roadmap"}</span></li>`).join("")}</ol></div>
  <div class="two-column-note"><div><h2>Risk is priced<br>before the job.</h2><p>A provider cannot sell $0.50 of compute and accept unlimited damages. Each offer’s reservation class sets the consequence of a breach in advance, so an agent can price the risk when it buys.</p><p>In the demo, the jury uses five appointed accounts, the scripted vote is 4–1, and a breach ruling refunds the compute escrow to the customer.</p></div><div class="table-wrap"><table><thead><tr><th scope="col">Reservation class</th><th scope="col">Consequence of a breach</th></tr></thead><tbody>${liability.map(([cls, result]) => `<tr><td><strong>${cls}</strong></td><td>${result}</td></tr>`).join("")}</tbody></table><p class="table-note">Illustrative classes from the whitepaper.</p></div></div></section>
  <section class="journey"><p class="section-label">IN THE DEMO</p><h2>One connected economic loop.</h2>${stages.map(([title, body, proof, page, cta], i) => `<article class="journey-step"><span class="journey-number">${String(i + 1).padStart(2, "0")}</span><div><h3>${title}</h3><p>${body}</p>${textLink(page, cta)}</div><span class="proof-label">${proof}</span></article>`).join("")}</section>
  <section class="two-column-note"><h2>Why a more expensive<br>provider can win.</h2><div><p>A low price can conceal a high expected cost. When failure threatens the value of a task, the agent must account for that loss before it buys.</p><div class="formula-block">Expected cost = price + failure loss + delay loss + trust penalty + reservation adjustment</div><p>The scorer uses integer arithmetic. An LLM never chooses a payout or changes a score. The marketplace exposes every term of the calculation.</p>${textLink("market", "Inspect the calculation")}</div></section>
  ${next("overview", "See each step on-chain.", isReplay() ? "Step through a recorded devnet run. Every account opens on Solana Explorer." : "Run the entire scenario or advance through the guided controls.", isReplay() ? "Open recorded demo" : "Open live demo")}`;
}
function architecture() {
  return `${pageHead("SYSTEM ARCHITECTURE", "Small on-chain state.<br>Meaningful guarantees.", "MEP records economic commitments on Solana while keeping execution, evidence documents, and private memory off-chain.")}
  <figure class="architecture-figure"><div class="architecture-layer"><span class="layer-label">USER EXPERIENCE</span><div class="architecture-items">${node("WEB", "Protocol explorer", "Market, passports, contracts, disputes")}${node("CONTROL", "Guided demo API", "Validates input and coordinates the run")}</div></div><div class="layer-bridge">Typed state and validated actions <span aria-hidden="true">↕</span></div><div class="architecture-layer"><span class="layer-label">OFF-CHAIN EXECUTION</span><div class="architecture-items">${node("DETERMINISTIC", "Utility router", "Capability filters + integer scoring")}${node("EXECUTION", "Provider fixtures", "Outputs + controlled failure receipts")}${node("EXPERIENCE", "Agent memory", "Evidence + local risk estimates")}</div></div><div class="layer-bridge">Signed transactions · content commitments <span aria-hidden="true">↕</span></div><div class="architecture-layer chain-layer"><span class="layer-label">SOLANA / ANCHOR PROGRAM</span><div class="chain-records"><span>Foundation registry</span><span>Agent Passports</span><span>Contracts & escrow</span><span>Disputes & votes</span><span>Precedent roots</span></div></div><figcaption>Optional AI summaries explain a finalized outcome. They have no authority over escrow or votes.</figcaption></figure>
  <section class="storage-section"><h2>Put each piece where it belongs.</h2><div class="pair-grid"><article><h3>On-chain: economic truth</h3><p>Identity roots, ownership, obligations, prices, deadlines, escrow balances, state transitions, vote commitments, rulings, and precedent roots.</p><p class="reason">Shared state makes outcomes independently inspectable.</p></article><article><h3>Off-chain: execution and context</h3><p>Prompts, model files, full outputs, evidence documents, private memory, and frequent execution telemetry.</p><p class="reason">Hash commitments connect large documents to compact records.</p></article></div></section>
  <section class="concept-section trust-section"><p class="section-label">TRUST</p><h2>Trust is a vector, not a score.</h2><p class="section-description">A model hash says which model was claimed. It does not prove that model ran. MEP keeps three kinds of evidence separate, so a cheap provider cannot hide weak evidence behind one reputation number.</p><div class="concept-grid">${(
    [
      [
        "H",
        "Hardware trust",
        "Is this machine what it claims to be?",
        "Hardware attestation, such as a confidential-computing quote.",
        "Offers stay H0 until hardware evidence is verified; fixture tiers are labeled simulated."
      ],
      [
        "M",
        "Model trust",
        "Is this the canonical model?",
        "The manifest hashes to the root in the Foundation registry.",
        "M2 is earned when a model manifest matches its on-chain root."
      ],
      [
        "E",
        "Execution trust",
        "Did it actually run the job correctly?",
        "Signed receipts, hidden test questions, and redundant runs.",
        "Earned per job from the provider-signed receipt and the committed verification policy."
      ]
    ] as const
  )
    .map(
      ([symbol, title, question, evidence, demo]) =>
        `<article><span class="entity-symbol">${symbol}</span><h3>${title}</h3><p><strong>${question}</strong> ${evidence}</p><p class="reason">In the demo: ${demo}</p></article>`
    )
    .join("")}</div></section>
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
  ],
  [
    "Machine principal",
    "The whitepaper’s term for an agent: a persistent economic actor with identity, wallet authority, memory, policy, reputation, and contract rights and liabilities."
  ],
  [
    "Reservation class",
    "How interruptible an offer is: spot, preemptible, standard, or guaranteed. It sets the consequence of a breach before the job starts."
  ],
  [
    "Signed receipt",
    "A provider-signed record of a job: contract, model instance, request and result hashes, and timestamps. It makes off-chain work accountable."
  ],
  [
    "Protocol jurisprudence",
    "The public record of finalized rulings. Agents read it to update their risk estimates; it is not a legally binding court precedent."
  ],
  [
    "Static replay",
    "The public website’s mode. It serves one recorded devnet run as saved snapshots, so it needs no server, wallet, or RPC and sends no transactions."
  ]
];
function docs() {
  return `${pageHead("PROTOCOL REFERENCE", "Understand what you’re seeing.", "A practical guide to the implementation, the local demo, and the terms used throughout this website.")}
  <div class="reference-layout"><nav class="reference-nav" aria-label="Reference sections"><a href="#quick-start">Run locally</a><a href="#demo-boundaries">Demo boundaries</a><a href="#whitepaper">Whitepaper vs. demo</a><a href="#glossary">Protocol vocabulary</a><a href="#questions">Common questions</a></nav><div>
  <section id="quick-start" class="reference-section"><h2>Run the local demo</h2><p>From the repository root, install dependencies, check your Solana and Anchor tooling, compile the program, and start the website.</p><pre class="code-block"><code>pnpm install
pnpm run doctor
pnpm run anchor:build
pnpm run dev</code></pre><p>Open <a href="/demo" data-view="overview">the live demo</a> at <code>http://127.0.0.1:3000/demo</code>. The launcher starts a local validator when the port is free. Use disposable localnet wallets only.</p><p>Choose <strong>Run full demo</strong> for the entire sequence, or use the current-step button to inspect each transition. Jury operations wait for on-chain slot windows.</p><details data-detail="troubleshooting"><summary>Troubleshooting a disconnected demo</summary><p>Keep <code>pnpm dev</code> running. Check that the validator is available at <code>127.0.0.1:8899</code> and has the matching program and demo authority. A failed step can be retried from Overview. The introductory and reference pages work even when the validator is unavailable.</p></details></section>
  <section id="demo-boundaries" class="reference-section"><h2>What is real, and what is controlled?</h2><div class="definition-list"><div><h3>A static public demo</h3><p>The public website is a static replay of one recorded devnet run. Each demo step loads a saved snapshot, so stepping through it sends no transactions and needs no wallet, server, or RPC. Every address and signature it shows is real and opens on Solana Explorer. To drive a live run, use the local setup above.</p></div><div><h3>Real Solana transactions</h3><p>Registry accounts, passports, funding, escrow settlement, jury commitments, reveals, and precedent publication execute against the Anchor program.</p></div><div><h3>Deterministic execution fixtures</h3><p>The stock models return fixture outputs. Provider X’s degraded serving is deliberately triggered, and the verifier compares against fixture reference outputs. Providers publish failure claims of X: 1%, Y: 9%, and Z: 1%; agents that verify the precedent raise X to 25%, an explicit demo rule rather than a calibrated estimator.</p></div><div><h3>Controlled arbitration</h3><p>Five distinct demo jurors are appointed with the configured authority. Three matching votes decide the outcome; the scripted vote is 4–1. A hung jury refunds the customer. This is not permissionless jury selection.</p></div><div><h3>Prototype recovery and security</h3><p>The coordinator keeps run state in memory. Restarting starts a new run; interrupted runs do not have production-grade recovery. Localnet funds have no real-world value. The protocol has not received a production security audit.</p></div></div></section>
  <section id="whitepaper" class="reference-section"><h2>From the whitepaper to this demo</h2><p>The MEP whitepaper (v0.1) describes a permissionless market for compute, models, and agents. This MVP builds the smallest loop that proves its central claim: an agent changes a later purchase because of experience and a prior dispute. The table shows what is built and what remains design.</p><div class="table-wrap"><table><thead><tr><th scope="col">Whitepaper concept</th><th scope="col">In this demo</th></tr></thead><tbody>${(
    [
      [
        "Compute, model, and capability markets",
        "Three provider offers for two stock models; two stock agents, one hired as a subcontractor"
      ],
      [
        "Foundation registry of stock models and agents",
        "Built: manifests hashed and registered on-chain"
      ],
      [
        "Agent Passport with private memory roots",
        "Built: passports, memory checkpoints, and two agents from one stock origin"
      ],
      [
        "Reservation and liability classes",
        "Offers carry distinct reservation classes; a breach refunds the escrow"
      ],
      [
        "Parent and child work contracts with escrow",
        "Built: parent, subcontract, and compute contracts, each with its own escrow"
      ],
      [
        "Signed execution receipts and verification policies",
        "Built: provider-signed receipts, task checks, and canaries from a committed seed"
      ],
      [
        "Trust vector (hardware, model, execution)",
        "Model and execution tiers are earned; hardware tiers are simulated"
      ],
      [
        "Four-level dispute ladder",
        "Levels 0, 1, and 3; optimistic rulings (level 2) are not built"
      ],
      ["Random, bonded jury selection", "Five appointed demo jurors with commit and reveal"],
      ["Protocol jurisprudence", "Built: precedent roots published and verified by a second agent"],
      ["Stablecoin escrow", "Localnet or devnet SOL"],
      [
        "Risk compiler, agent lineage, attestation, permissionless providers",
        "Not built; roadmap for later versions"
      ]
    ] as const
  )
    .map(([concept, demo]) => `<tr><td><strong>${concept}</strong></td><td>${demo}</td></tr>`)
    .join("")}</tbody></table></div></section>
  <section id="glossary" class="reference-section"><h2>Protocol vocabulary</h2><label class="search-label" for="glossary-search">Find a concept</label><input id="glossary-search" type="search" placeholder="Search identity, escrow, memory…" autocomplete="off"><div id="glossary-list">${glossary.map(([term, definition]) => `<article class="glossary-entry" data-term="${term.toLowerCase()} ${definition.toLowerCase()}"><h3>${term}</h3><p>${definition}</p></article>`).join("")}</div><p id="glossary-empty" hidden>No matching concepts. Try “contract”, “model”, or “memory”.</p><p id="glossary-count" class="sr-only" role="status" aria-live="polite"></p></section>
  <section id="questions" class="reference-section"><h2>Common questions</h2>${[
    [
      "Is the public demo live?",
      "No. The public website is static: it replays one recorded devnet run. Its transactions really happened and can be checked on Solana Explorer, but stepping through the replay sends nothing new. Run the repository locally for a live run."
    ],
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
      "No native protocol token is part of this MVP. Prices and settlement use localnet or devnet SOL. The market is a fixed, repeatable demo with two stock models and three provider offers."
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
