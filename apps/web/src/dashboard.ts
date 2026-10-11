/* Rendering is gated on state and uses the fixed dashboard DOM and fixture rows. */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { pages, pageForPath, renderPublicPage, workDiagram, link, type Page } from "./site.js";
import type { DemoChain } from "../../api/src/chain.ts";
type Wire<T> = T extends bigint
  ? string
  : T extends readonly (infer V)[]
    ? Wire<V>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;
type State = Wire<Awaited<ReturnType<DemoChain["snapshot"]>>> & {
  busy: boolean;
  error: string | null;
};
let state: State | undefined;
let view: Page = pageForPath(location.pathname) ?? "home";
let connected = false;
let requesting = false;
let localError = "";
const content = document.querySelector<HTMLElement>("#content")!;
const notice = document.querySelector<HTMLElement>("#notice")!;
const descriptions = (s: State) => [
  `Stock agents and model offers are registered on ${s.network}. Start a funded job to see the economy in motion.`,
  `Agent A settled its OCR subcontract and ranked the on-chain offers: ${s.firstProvider} claims 1% failure and is cheapest. Trigger the controlled fault: degraded serving at ${s.firstProvider}.`,
  `${s.firstProvider}'s provider-signed result scored ${verificationScore(s.verifications.first)} under the committed policy. A failed check supports a dispute; the five-juror panel decides.`,
  "The jury is in its commit window. Each vote is hidden behind a salted commitment.",
  "Five votes are committed. Waiting for the reveal window protects the independent ballot.",
  "All votes are revealed. Escrow stays locked until the reveal window closes.",
  rulingSentence(s),
  "The precedent is public. Agent A and an uninvolved twin both recomputed its ruling root on-chain and checkpointed their memory. Run the same task with the same scoring policy.",
  `${s.secondProvider ?? "The new provider"} passed its verification policy and completed job two. Compute, subcontract, and parent escrow are settled. The learning loop is complete.`
];
type Verification = NonNullable<State["verifications"]["first"]>;
const pct = (bps: number) => `${bps / 100}%`;
const verificationScore = (v: Verification | undefined) =>
  v
    ? `${pct(v.result.scoreBps)} against a ${pct(v.result.thresholdBps)} threshold (task checks ${v.result.taskChecks.filter((c) => c.passed).length} of ${v.result.taskChecks.length})`
    : "below its threshold";
/** An earned tier with its status, so simulated or unverified tiers are never shown bare. */
const tier = (label: { tier: string; status: string; basis: string } | undefined) =>
  label
    ? `<span class="tier ${escape(label.status)}" title="${escape(label.basis)}">${escape(label.tier)}${label.status === "verified" ? "" : ` <small>${escape(label.status)}</small>`}</span>`
    : '<span class="tier unverified">H0 <small>unverified</small></span>';
const offerTrust = (s: State, offerId: string) =>
  s.providers.find((p) => p.offer === offerId)?.trust;
function rulingSentence(s: State) {
  const r = s.ruling;
  if (!r) return "The ruling is being finalized.";
  const amount = `${sol(r.amountLamports)} SOL`;
  return r.outcome === "provider-breached"
    ? `${r.breachVotes} of ${r.reveals} jurors found a breach. ${amount} of compute escrow was refunded to the customer.`
    : r.outcome === "provider-cleared"
      ? `The jury cleared ${r.provider}. ${amount} of escrow was paid to the provider.`
      : `The jury reached no majority, so ${amount} of escrow was refunded to the customer.`;
}
const initial = (name: string | null | undefined) => (name ?? "?").slice(-1).toUpperCase();
const actions = [
  "Start first job",
  "Trigger degraded serving",
  "Resolve with jury",
  "Commit jury votes",
  "Reveal jury votes",
  "Finalize ruling",
  "Publish & update memory",
  "Run second job",
  "Start a fresh run"
];
const escape = (value: unknown) =>
  (typeof value === "string" || typeof value === "number" ? String(value) : "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
const sol = (value: string | number | bigint) =>
  (Number(value) / 1e9).toFixed(9).replace(/0+$/, "").replace(/\.$/, ".0");
const short = (value: string) => `${value.slice(0, 7)}…${value.slice(-6)}`;
const hash = (value: unknown) =>
  `<div class="hash">${escape(value ?? "Waiting for commitment")}</div>`;
// Explorer URLs are built by the server from base58 addresses and signatures.
const explorer = (url: string | undefined, label = "Solana Explorer ↗") =>
  url
    ? `<a class="ext-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`
    : "";
const network = (s: State) => s.network[0]!.toUpperCase() + s.network.slice(1);
const signedSol = (value: string) =>
  `${value.startsWith("-") ? "−" : "+"}${sol(value.replace("-", ""))}`;
const button = (label: string, action: string, kind = "") =>
  `<button class="button ${kind}" data-action="${action}" ${state?.busy || requesting || !connected ? "disabled" : ""}>${escape(label)}</button>`;
function riskPercent(s: State, learned: boolean) {
  const row = s.before.find((r) => r.providerName === s.firstProvider);
  const published = s.providers.find((p) => p.address === row?.providerId)?.failureProbabilityBps;
  const bps =
    (learned && row ? s.memory?.failureProbabilityOverridesBps[row.providerId] : undefined) ??
    published ??
    0;
  return `${bps / 100}%`;
}
function intro(title: string, description: string, controls = "") {
  return `<section class="intro"><div><p class="eyebrow">PROTOCOL EXPLORER / ${escape(state?.network.toUpperCase())}</p><h1>${title}</h1><p>${description}</p></div><div class="actions">${controls}</div></section>`;
}
function status(value: string) {
  return `<span class="status ${["disputed", "breached", "refunded", "mismatch", "failed", "fail"].includes(value) ? "warning" : value === "draft" ? "neutral" : ""}">${escape(value[0]!.toUpperCase() + value.slice(1))}</span>`;
}
function costTable(after = false) {
  const s = state!;
  const rows = after ? s.after : s.before;
  return `<div class="table-wrap"><table><thead><tr><th scope="col">Provider / reservation</th><th scope="col">Trust H / M / E</th><th scope="col">Price</th><th scope="col">Failure risk</th><th scope="col">Expected cost</th><th scope="col">Decision</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${i === 0 ? "winner" : ""}"><td><strong>${escape(r.providerName)}</strong><small>${escape(r.reservationClass)} · ${escape(r.stockModelId.replace("stock-model-", ""))}</small></td><td>${["hardware", "model", "execution"].map((k) => tier(offerTrust(s, r.offerId)?.[k as "hardware"])).join(" ")}</td><td class="amount">${sol(r.priceLamports)}</td><td>${r.effectiveFailureProbabilityBps / 100}%</td><td class="amount">${sol(r.totalExpectedCostLamports)}</td><td>${i === 0 ? status("selected") : '<span class="muted micro">Higher cost</span>'}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderOverview() {
  const s = state!;
  const total = s.contracts.reduce((n, c) => n + c.escrowLamports, 0);
  return (
    intro(
      "An economy that learns.",
      "Follow one agent from its first contract to a better next decision.",
      s.stage === 8
        ? '<button class="button primary" data-view="dispute">View precedent</button>'
        : button(s.stage === 0 ? "Run full demo" : "Finish demo", "/demo/run", "primary")
    ) +
    `<div class="hero-grid"><section class="experiment"><div class="kicker"><span>THE ECONOMIC LEARNING LOOP</span><span class="tag">On-chain proof</span></div><h2>Same agent. Same task. <br><em>A different decision.</em></h2><div class="choice-track"><div class="choice"><small>First procurement</small><strong>${escape(s.firstProvider)}</strong><p>Lowest expected cost</p></div><div class="choice-line"></div><div class="choice"><small>${s.stage >= 7 ? "After learning" : "Learning target"}</small><strong>${s.stage >= 7 ? escape(s.secondProvider) : "Experience"}</strong><p>${s.stage >= 7 ? "Memory changes the winner" : "Verification → precedent → memory"}</p></div></div></section><section class="run-panel"><div class="panel-title"><h3 class="micro">CURRENT RUN</h3><span class="step-count">${String(s.stage + 1).padStart(2, "0")} / ${String(s.stages.length).padStart(2, "0")}</span></div><h3>${escape(s.stageLabel)}</h3><p>${escape(descriptions(s)[s.stage])}</p><div class="step-bars" aria-label="${s.stage + 1} of ${s.stages.length} stages">${s.stages.map((_, i) => `<span class="${i <= s.stage ? "done" : ""}"></span>`).join("")}</div>${button(s.busy ? `Processing on ${s.network}…` : actions[s.stage]!, s.stage === 1 ? "/demo/degrade" : s.stage === 2 ? "/demo/resolve" : s.stage === 8 ? "/demo/reset" : "/demo/next", s.stage === 1 ? "danger" : "primary")}</section></div>
  <section class="metrics" aria-label="Protocol statistics"><div class="metric"><span class="label">ACTIVE AGENTS <span>◎</span></span><strong>04</strong><p>Procurement, twin, specialist, client</p></div><div class="metric"><span class="label">COMPUTE OFFERS <span>▦</span></span><strong>03</strong><p>Two models · three providers</p></div><div class="metric"><span class="label">LOCKED ESCROW <span>◇</span></span><strong>${sol(total)}<small>SOL</small></strong><p>${s.stage === 8 ? "All work settled" : "Actual on-chain contract balances"}</p></div><div class="metric"><span class="label">MEMORY CHECKPOINTS <span>↗</span></span><strong>${String(s.agent.checkpoints).padStart(2, "0")}</strong><p>${s.agent.checkpoints ? "Experience committed on-chain" : "Ready to learn from the first job"}</p></div></section>
  <div class="section-grid"><section class="panel"><div class="panel-title"><h2>Work, composed.</h2><span class="micro muted">AGENT → AGENT → COMPUTE</span></div><p class="sub">Independent obligations. Explicit escrow. Verifiable outcomes.</p><div class="flow">${s.contracts.map((c, i) => `<div class="flow-row"><span class="flow-icon">${i === 0 ? "A" : i === 1 ? "B" : i === 2 ? initial(s.firstProvider) : initial(s.secondProvider)}</span><div class="flow-copy"><h3>${escape(c.label)}</h3><p>${sol(c.priceLamports)} SOL · <code>${short(c.address)}</code></p></div>${status(c.status)}</div>`).join("")}${s.stage === 0 ? '<div class="flow-row"><span class="flow-icon">B</span><div class="flow-copy"><h3>OCR specialist subcontract</h3><p>Created and funded when the first job starts</p></div>' + status("pending") + "</div>" : ""}</div><p class="table-note">Parent revenue: ${sol(s.contracts[0]?.priceLamports ?? 0)} SOL${s.contracts[1] ? ` · Specialist cost: ${sol(s.contracts[1].priceLamports)} SOL` : ""}. Each contract settles independently.</p></section><section class="panel"><div class="panel-title"><h2>From work to experience</h2><span class="micro muted">LIVE</span></div><ol class="timeline">${[
    "Registry & agent origin",
    "Funded work + subcontract",
    "Degraded serving fails verification",
    "Five-juror commit / reveal",
    "Ruling & escrow refund",
    "Precedent + memory root",
    "Second job settled"
  ]
    .map((label, i) => {
      const threshold = [0, 1, 2, 5, 6, 7, 8][i]!;
      return `<li class="${s.stage > threshold ? "complete" : s.stage === threshold ? "current" : ""}"><span class="node">${s.stage > threshold ? "✓" : i + 1}</span><div>${label}${i === 3 ? `<div class="detail">Salted commitments · ${s.ruling ? `${s.ruling.breachVotes}–${s.ruling.reveals - s.ruling.breachVotes} ruling` : "recorded verification evidence"}</div>` : ""}</div></li>`;
    })
    .join("")}</ol></section></div>
  <div class="pair-grid">${renderChoices()}${renderPnl()}</div>
  <section class="panel"><div class="panel-title"><h2>${s.stage >= 7 ? "The next decision has changed." : `Why ${escape(s.firstProvider)} wins the first job`}</h2><button class="subtle-link" data-view="market">Explore utility calculation ↗</button></div>${costTable(s.stage >= 7)}<p class="table-note">Ranked from compute offers, provider records, and model instances read from ${network(s)}. Expected cost = price + failure loss + delay loss + trust penalty + reservation adjustment. The trust penalty uses earned H/M/E tiers only; fixture hardware tiers are labeled simulated. All values in SOL.</p></section>`
  );
}
/** Agent A and its twin, side by side: one was harmed, the other only read the precedent. */
function renderChoices() {
  const s = state!;
  const card = (
    name: string,
    role: string,
    choice: { before: string | null; after: string | null },
    root: string,
    checkpoints: number,
    url: string
  ) =>
    `<div class="agent-choice"><div class="passport-heading"><span class="agent-avatar">${escape(name.replace("Agent ", ""))}</span><div><h3>${escape(name)}</h3><span class="micro muted">${escape(role)}</span></div></div><div class="choice-track"><div class="choice"><small>Before precedent</small><strong>${escape(choice.before)}</strong></div><div class="choice-line"></div><div class="choice"><small>After precedent</small><strong>${choice.after ? escape(choice.after) : "—"}</strong></div></div><div class="key-value"><span>Memory root · checkpoint ${checkpoints}</span><strong>${escape(short(root))}</strong></div>${explorer(url, "Passport on Explorer ↗")}</div>`;
  return `<section class="panel"><div class="panel-title"><h2>Two agents, one precedent.</h2><span class="micro muted">COMPOSABILITY</span></div><p class="sub">Same stock agent, independent memory. Only Agent A was party to the dispute. Its twin reads the published precedent, recomputes the ruling root from the on-chain dispute, and changes its choice too.</p>${card("Agent A", "DISPUTING CUSTOMER", s.choices.agent, s.agent.memoryRoot, s.agent.checkpoints, s.agent.url)}${card("Agent A′", "NEVER HARMED · READS PRECEDENT", s.choices.twin, s.agent.twinMemoryRoot, s.agent.twinCheckpoints, s.agent.twinUrl)}</section>`;
}
/** Agent A's profit and loss from on-chain contract prices and statuses. */
function renderPnl() {
  const s = state!;
  const p = s.pnl;
  return `<section class="panel"><div class="panel-title"><h2>Agent A’s books.</h2><span class="micro muted">FROM CONTRACT ACCOUNTS</span></div><p class="sub">Revenue counts when the client’s escrow settles. Costs count when Agent A funds an escrow.</p><div class="table-wrap"><table><tbody>${p.lines.length ? p.lines.map((l) => `<tr><td>${escape(l.label)}</td><td class="amount ${l.kind === "cost" ? "negative" : ""}">${signedSol(l.lamports)}</td></tr>`).join("") : '<tr><td colspan="2" class="muted">No escrow funded yet.</td></tr>'}</tbody></table></div><div class="key-value"><span>Net, with the protocol’s refund</span><strong>${signedSol(p.totalLamports)} SOL</strong></div><div class="key-value"><span>Net, if the breached job had kept the escrow</span><strong>${signedSol(p.withoutRefundsLamports)} SOL</strong></div></section>`;
}
function renderMarket() {
  const s = state!;
  const after = s.stage >= 7;
  const rows = after ? s.after : s.before;
  return (
    intro(
      "The price of reliability.",
      "Providers supply compute. Model instances define execution. Offers connect the two."
    ) +
    `<section class="panel"><div class="panel-title"><h2>${after ? "After the memory update" : "First-job utility ranking"}</h2>${status(after ? "learned" : "baseline")}</div>${costTable(after)}<div class="explain">A failure costs this agent ${sol(s.policy.failureLossLamports)} SOL. The agent starts from each provider’s published failure claim. After a verified breach precedent, its estimate for ${escape(s.firstProvider)} rises from ${riskPercent(s, false)} to ${riskPercent(s, true)}. Prices, capabilities, and policy stay fixed.</div><details data-detail="formula"><summary>Inspect every term in the deterministic score</summary><div class="table-wrap"><table><thead><tr><th scope="col">Provider</th><th scope="col">Price</th><th scope="col">Failure loss</th><th scope="col">Delay loss</th><th scope="col">Trust penalty</th><th scope="col">Reservation</th><th scope="col">Total (SOL)</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escape(r.providerName)}</td>${[r.priceLamports, r.expectedFailureLossLamports, r.expectedDelayLossLamports, r.trustPenaltyLamports, r.reservationAdjustmentLamports, r.totalExpectedCostLamports].map((v) => `<td class="amount">${sol(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details></section>
  <div class="pair-grid"><section class="panel"><h2>Before experience</h2>${scoreChart(s.before)}</section><section class="panel"><h2>${after ? "After experience" : "After experience · not yet recorded"}</h2>${after ? scoreChart(s.after) : '<div class="empty">Finalize the dispute and checkpoint memory to reveal the second decision.</div>'}</section></div>
  <section class="panel"><h2>The supply side</h2><p class="sub">Every row is read from on-chain provider records, model instances, and compute offers. Hardware identity and model identity remain separate. Trust tiers are earned only from checks this code performs: M2 means the model manifest hashed to its on-chain root. An attestation hash in a provider record earns nothing, so a real offer is H0 until hardware evidence is actually verified; the demo's fixture tiers are simulated. Execution tiers are earned per job. Self-declared percentages are shown but never scored. Breach counts are written by the program when a jury finds a breach and accumulate across runs; agents act on a breach only after verifying its precedent.</p><div class="table-wrap"><table><thead><tr><th scope="col">Provider</th><th scope="col">Hardware tier</th><th scope="col">Model instance</th><th scope="col">Model tier</th><th scope="col">Execution tier</th><th scope="col">Claimed H / E (not scored)</th><th scope="col">Published failure</th><th scope="col">Breaches on-chain</th></tr></thead><tbody>${s.providers.map((p) => `<tr><td><strong>${escape(p.name)}</strong><small>${escape(short(p.address))} · ${escape(p.reservationClass)}</small></td><td>${tier(p.trust.hardware)}</td><td>${escape(short(p.instance))}<small>${escape(p.stockModelId)}</small></td><td>${tier(p.trust.model)}</td><td>${tier(p.trust.execution)}</td><td class="muted">${p.hardwareTrustBps / 100}% / ${p.executionTrustBps / 100}%</td><td>${p.failureProbabilityBps / 100}%</td><td>${p.breachCount}</td></tr>`).join("")}</tbody></table></div></section>`
  );
}
function scoreChart(rows: State["before"]) {
  // SVG width values are bounded numeric score data, not user-authored markup.
  const max = Math.max(...rows.map((r) => Number(r.totalExpectedCostLamports)));
  return `<div class="cost-chart">${rows.map((r) => `<div class="cost-row"><span>${escape(r.providerName)}</span><svg viewBox="0 0 200 20" width="100%" height="20" role="img" aria-label="Price ${sol(r.priceLamports)}, total expected cost ${sol(r.totalExpectedCostLamports)} SOL"><rect width="${(Number(r.priceLamports) / max) * 200}" height="20" fill="#2459d9"/><rect x="${(Number(r.priceLamports) / max) * 200}" width="${((Number(r.totalExpectedCostLamports) - Number(r.priceLamports)) / max) * 200}" height="20" fill="#b6c8ef"/></svg><span class="amount">${sol(r.totalExpectedCostLamports)}</span></div>`).join("")}</div><div class="legend"><span><i></i>Price</span><span><i class="risk"></i>Risk, delay & trust</span><span>SOL</span></div>`;
}
function renderAgents() {
  const s = state!;
  return (
    intro(
      "Identity stays. Experience evolves.",
      "Two procurement agents share the same stock origin. One was harmed by a breach; the other only read the precedent. Both changed their next choice."
    ) +
    `<div class="pair-grid"><section class="panel"><div class="passport-heading"><span class="agent-avatar">A</span><div><h2>Procurement Agent A</h2><span class="micro muted">ACTIVE LEARNING AGENT</span></div></div><span class="micro muted">Passport address</span>${hash(s.agent.address)}${explorer(s.agent.url)}<span class="micro muted">Stock origin · immutable</span>${hash(s.agent.genesisRoot)}<span class="micro muted">Current memory · checkpoint ${s.agent.checkpoints}</span>${hash(s.agent.memoryRoot)}<div class="key-value"><span>Published failure claim · ${escape(s.firstProvider)}</span><strong>${riskPercent(s, false)}</strong></div><div class="key-value"><span>Current failure estimate · ${escape(s.firstProvider)}</span><strong>${riskPercent(s, !!s.memory)}</strong></div><div class="key-value"><span>Next hire</span><strong>${escape(s.choices.agent.after ?? s.choices.agent.before)}</strong></div><div class="key-value"><span>Scoring policy</span><strong>Unchanged</strong></div></section><section class="panel"><div class="passport-heading"><span class="agent-avatar">A′</span><div><h2>Independent Agent A′</h2><span class="micro muted">SAME STOCK CODE</span></div></div><span class="micro muted">Passport address</span>${hash(s.agent.twin)}${explorer(s.agent.twinUrl)}<span class="micro muted">Shared stock origin</span>${hash(s.agent.genesisRoot)}<span class="micro muted">Independent memory · checkpoint ${s.agent.twinCheckpoints}</span>${hash(s.agent.twinMemoryRoot)}<div class="key-value"><span>Hire before reading the precedent</span><strong>${escape(s.choices.twin.before)}</strong></div><div class="key-value"><span>Hire after verifying it on-chain</span><strong>${escape(s.choices.twin.after ?? "Not yet read")}</strong></div><div class="explain">Agent A′ was never party to the dispute. It learns only by recomputing the published precedent’s ruling root from the on-chain dispute and checking the evidence against the contract’s result root. Its memory root ${s.agent.twinMemoryRoot === s.agent.twinInitialMemoryRoot ? "is still its genesis root" : "changed on-chain"}.</div></section></div><div class="pair-grid"><section class="panel"><h2>Agent A’s memory</h2>${s.memory ? `<pre class="evidence">${escape(JSON.stringify(s.memory, null, 2))}</pre>` : '<div class="empty">No learned precedent yet. Run the experiment to create the first memory checkpoint.</div>'}</section><section class="panel"><h2>Agent A′’s memory</h2>${s.twinMemory ? `<pre class="evidence">${escape(JSON.stringify(s.twinMemory, null, 2))}</pre>` : '<div class="empty">Agent A′ has not read a precedent yet.</div>'}</section></div><section class="panel"><h2>Foundation registry</h2><p class="sub">Canonical manifests are hashed before registration. Demo models use deterministic outputs.</p>${s.registry.map((r) => `<details data-detail="${escape(r.id)}"><summary>${escape(r.id)} · ${r.verified ? "Root verified against chain" : "Root mismatch"}</summary>${hash(r.root)}</details>`).join("")}<div class="table-wrap"><table><thead><tr><th scope="col">Manifest</th><th scope="col">Kind</th><th scope="col">Version</th><th scope="col">Capabilities / role</th></tr></thead><tbody>${[...s.models, ...s.stockAgents].map((m) => `<tr><td><strong>${escape(m.displayName)}</strong><small>${escape(m.id)}</small></td><td>${m.kind.includes("model") ? "Stock model" : "Stock agent"}</td><td>${m.version}</td><td>${escape("capabilities" in m ? m.capabilities.join(", ") : m.role)}</td></tr>`).join("")}</tbody></table></div></section>`
  );
}
/** One job's receipt and policy verification, as the customer checked them. */
function verificationPanel(label: string, v: Verification | undefined) {
  if (!v) return "";
  const r = v.result;
  return `<div class="verification"><div class="panel-title"><h3>${escape(label)}</h3>${status(r.passed ? "passed" : "failed")}</div><div class="key-value"><span>Receipt</span><strong>${escape(v.receipt.label)} · ${escape(short(v.receipt.signer))}</strong></div><div class="key-value"><span>Execution trust earned</span><strong>${tier(v.executionTrust)}</strong></div><div class="key-value"><span>Score / threshold</span><strong>${pct(r.scoreBps)} / ${pct(r.thresholdBps)}</strong></div><div class="key-value"><span>Task · canaries</span><strong>${pct(r.taskScoreBps)} · ${pct(r.canaryScoreBps)}</strong></div><div class="table-wrap"><table><thead><tr><th scope="col">Task check</th><th scope="col">Result</th><th scope="col">Detail</th></tr></thead><tbody>${r.taskChecks.map((c) => `<tr><td>${escape(c.id)}</td><td>${status(c.passed ? "pass" : "fail")}</td><td><small>${escape(c.detail)}</small></td></tr>`).join("")}</tbody></table></div><div class="table-wrap"><table><thead><tr><th scope="col">Drawn canary</th><th scope="col">Method</th><th scope="col">Score</th></tr></thead><tbody>${r.canaries.map((c) => `<tr><td>${escape(c.challengeId)}</td><td>${escape(c.method)}</td><td>${pct(c.scoreBps)}</td></tr>`).join("")}</tbody></table></div><span class="micro muted">Committed policy root · ${escape(r.checker.name)}@${escape(r.checker.version)}</span>${hash(v.policyRoot)}</div>`;
}
function renderDispute() {
  const s = state!;
  return (
    intro(
      "A breach becomes precedent.",
      "A failed verification, a provider-signed receipt, committed evidence, and five controlled jurors.",
      s.stage >= 6
        ? button(s.summary ? "Regenerate explanation" : "Explain with Gemini", "/demo/summary")
        : ""
    ) +
    `<div class="pair-grid"><section class="panel"><div class="panel-title"><h2>Disputed obligation</h2>${status(s.stage >= 6 ? "finalized" : s.stage >= 3 ? "disputed" : "pending")}</div><h3>${escape(s.firstProvider)} · failed its verification policy</h3><p class="sub">Clause: the contract commits a verification policy before the job runs: the checker’s code root, task-output checks against the source documents, canaries drawn from a hidden pool by a committed seed, and a pass threshold. The controlled fault is degraded serving at ${escape(s.firstProvider)}; the cause is not claimed. It delivers on time with a provider-signed receipt, and the customer disputes inside the review window. A failed check supports the dispute; it does not settle anything by itself.</p>${verificationPanel("Job 1 · " + (s.firstProvider ?? ""), s.verifications.first)}${s.evidence ? `<details data-detail="evidence"><summary>Full evidence document</summary><pre class="evidence">${escape(JSON.stringify(s.evidence, null, 2))}</pre></details><span class="micro muted">Evidence commitment</span>${hash(s.evidenceRoot)}` : '<div class="empty">Evidence will appear after the controlled degraded serving.</div>'}</section><section class="panel"><h2>Deterministic ruling</h2><p class="sub">The jury rules on the recorded verification evidence. Program code routes the escrow.</p><div class="key-value"><span>Jurors appointed</span><strong>5 controlled accounts</strong></div><div class="key-value"><span>Commitments</span><strong>${s.votes.filter((v) => v.committed).length} / 5</strong></div><div class="key-value"><span>Reveals</span><strong>${s.votes.filter((v) => v.revealed).length} / 5</strong></div><div class="key-value"><span>Escrow routed</span><strong>${s.ruling ? `${sol(s.ruling.amountLamports)} SOL to ${s.ruling.recipient}` : "Pending ruling"}</strong></div><div class="key-value"><span>Decision</span><strong>${s.ruling ? (s.ruling.outcome === "provider-breached" ? "Provider breached" : s.ruling.outcome === "provider-cleared" ? "Provider cleared" : "No majority · refunded") : "Not finalized"}</strong></div><p class="table-note">Three of the five appointed jurors decide the ruling. A hung jury refunds the customer, so escrow can never stay locked. The scripted demo includes one dissenting juror.</p>${s.precedent ? `<p class="micro muted">Published precedent root · recomputed from the dispute</p>${hash(s.precedent.rulingRoot)}${explorer(s.precedent.url, "Precedent account on Explorer ↗")} ${explorer(s.links.dispute, "Dispute account ↗")}` : ""}</section></div><section class="panel"><div class="panel-title"><h2>The jury</h2><span class="micro muted">COMMIT → REVEAL</span></div><div class="jury">${Array.from(
      { length: 5 },
      (_, i) => {
        const v = s.votes[i];
        return `<div class="juror"><span class="agent-avatar">J${i + 1}</span><h3>Juror ${i + 1}</h3><p>${v?.revealed ? `Revealed · ${escape(v.vote)}` : v?.committed ? "Vote sealed" : "Awaiting vote"}</p></div>`;
      }
    ).join(
      ""
    )}</div><p class="table-note">Commitments bind the dispute address, juror identity, vote, and a random 32-byte nonce.</p></section>${s.verifications.second ? `<section class="panel"><h2>Job 2 verification</h2><p class="sub">The new provider’s result passed the same kind of committed policy with a provider-signed receipt, so the job earned E2 and settled.</p>${verificationPanel("Job 2 · " + (s.secondProvider ?? ""), s.verifications.second)}</section>` : ""}${s.evidenceBundle ? `<section class="panel"><h2>Check it without this server</h2><p class="sub">The evidence bundle holds every off-chain document. An independent reader fetches the precedent, dispute, and contract accounts from the RPC, checks each document against their roots, verifies the receipt signature, re-runs the committed checker, and re-ranks the offers.</p><pre class="evidence">pnpm router:verify --bundle ${escape(s.evidenceBundle)}</pre></section>` : ""}<section class="panel"><h2>Ruling explanation</h2><p class="sub">Optional Gemini summary. It has no authority over votes, arithmetic, or escrow.</p>${s.summary ? `<div class="summary">${escape(s.summary.text)}<small>${escape(s.summary.model)} · Advisory explanation</small></div>` : `<div class="empty">${s.geminiConfigured ? (s.stage >= 6 ? "Use Explain with Gemini to request an advisory summary." : "Gemini is configured. Finalize the ruling to request an explanation.") : "No Gemini key configured. The complete protocol loop still works."}</div>`}</section>`
  );
}
function renderActivity() {
  const s = state!;
  return (
    intro(
      "Every step leaves a receipt.",
      `${s.receipts.length} confirmed transactions in this run. Open any signature in Solana Explorer.`
    ) +
    `<section class="panel"><div class="panel-title"><h2>${network(s)} transaction ledger</h2>${explorer(s.links.program, "Program on Explorer ↗")}<span class="micro muted">SLOT ${s.slot.toLocaleString()}</span></div>${s.receipts
      .slice()
      .reverse()
      .map(
        (r, i) =>
          `<div class="receipt"><strong>${String(s.receipts.length - i).padStart(2, "0")} &nbsp; ${escape(r.label)}</strong><span class="ledger"><a href="${escape(r.url)}" target="_blank" rel="noopener noreferrer">${escape(r.signature)}</a></span></div>`
      )
      .join("")}</section>`
  );
}
function renderContracts() {
  const s = state!;
  return (
    intro(
      "Work with explicit obligations.",
      "Inspect the parent report, specialist subcontract, and provider jobs. Each has its own escrow and deadline.",
      link("overview", "Continue guided demo", true)
    ) +
    workDiagram() +
    `<section class="panel"><div class="panel-title"><h2>Contracts in this run</h2><span class="micro muted">${s.contracts.length} ON-CHAIN RECORDS</span></div><p class="sub">Balances and status are read from ${network(s)}. Prices are in SOL; deadlines are Solana slots.</p>${s.contracts.map((c, i) => `<details class="contract-detail" data-detail="contract-${i}" ${i === 0 ? "open" : ""}><summary><span>${escape(c.label)}</span>${status(c.status)}</summary><div class="contract-facts"><div><span>Agreed price</span><strong>${sol(c.priceLamports)} SOL</strong></div><div><span>Locked escrow</span><strong>${sol(c.escrowLamports)} SOL</strong></div><div><span>Deadline slot</span><strong>${c.deadlineSlot.toLocaleString()}</strong></div></div><p class="micro muted">Contract account</p>${hash(c.address)}${explorer(c.url)}<p class="table-note">${i === 0 ? "Client → Agent A. The report obligation remains independent of the compute purchase." : i === 1 ? "Agent A → Agent B. OCR extraction is a separate, funded child obligation." : "Agent A → compute provider. A passed verification settles it; a failed one supports a dispute that the jury decides."}</p></details>`).join("")}${s.stage === 0 ? '<div class="empty">Start the first job to fund the parent and create the specialist and compute contracts.</div>' : ""}</section>
    <section class="storage-section"><h2>Two paths to a final outcome.</h2><div class="pair-grid"><article><h3>Successful delivery</h3><ol class="state-path"><li>Draft</li><li>Funded</li><li>Running</li><li>Submitted</li><li>Verified</li><li>Settled</li></ol><p>The provider commits a result, the customer verifies it, and the program transfers the agreed price.</p></article><article><h3>Disputed delivery</h3><ol class="state-path"><li>Running / submitted</li><li>Disputed</li><li>Jury ruling</li><li>Refund or payout</li></ol><p>A failed verification is disputed inside the review window. A breach refunds compute escrow. A cleared provider is paid. No majority also refunds the customer.</p>${link("dispute", "Inspect dispute & precedent")}</article></div></section>`
  );
}
function updateNavigation() {
  const publicPage = ["home", "how", "architecture", "docs"].includes(view);
  document.querySelector<HTMLElement>("#workspace-bar")!.hidden = publicPage;
  document.querySelector("main")!.classList.toggle("explorer-main", !publicPage);
  document.title = `${pages[view].title} · Machine Economy Protocol`;
  document.querySelectorAll<HTMLElement>(".nav").forEach((n) => {
    const active = n.dataset.view === view;
    n.classList.toggle("active", active);
    if (active) n.setAttribute("aria-current", "page");
    else n.removeAttribute("aria-current");
  });
  document.querySelector("#connection-status")!.textContent = connected
    ? `Connected · ${state ? network(state) : "Localnet"}`
    : "Disconnected";
}
function render() {
  updateNavigation();
  const publicContent = renderPublicPage(view);
  if (publicContent !== undefined) {
    notice.innerHTML = "";
    // Polls must not reset reference searches, open details, or keyboard focus.
    if (content.dataset.page !== view) content.innerHTML = publicContent;
    content.dataset.page = view;
    return;
  }
  if (!state) {
    content.innerHTML = `<section class="connection-empty"><p class="eyebrow">PROTOCOL EXPLORER</p><h1>${connected ? "Loading protocol state." : "Connect to your local demo."}</h1><p>The live explorer reads real on-chain accounts. Start <code>pnpm dev</code> in the repository, then retry the connection.</p><div class="actions"><button class="button primary" data-retry>Retry connection</button>${link("docs", "View setup guide")}</div></section>`;
    return;
  }
  const openDetails = new Set(
    Array.from(content.querySelectorAll<HTMLDetailsElement>("details[open]")).map(
      (d) => d.dataset.detail
    )
  );
  const focused =
    document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const focusKey =
    focused?.dataset.action ?? focused?.closest<HTMLDetailsElement>("details")?.dataset.detail;
  const recover =
    state.canAbandon ||
    (state.stage > 0 && state.stage < 8 && state.contracts.every((c) => c.escrowLamports === 0))
      ? ` ${button("Start a fresh run", "/demo/reset")}`
      : "";
  notice.innerHTML =
    localError || state.error
      ? `<div class="notice error">${escape(localError || state.error)}${recover}</div>`
      : state.busy || requesting
        ? `<div class="notice"><span class="spinner"></span>${escape(state.stageLabel)} · Confirming ${escape(state.network)} transactions. Jury phases wait for their on-chain slot deadlines.</div>`
        : "";
  content.innerHTML =
    view === "market"
      ? renderMarket()
      : view === "agents"
        ? renderAgents()
        : view === "contracts"
          ? renderContracts()
          : view === "dispute"
            ? renderDispute()
            : view === "activity"
              ? renderActivity()
              : renderOverview();
  content.dataset.page = view;
  content.querySelectorAll<HTMLDetailsElement>("details").forEach((d) => {
    if (openDetails.has(d.dataset.detail)) d.open = true;
  });
  if (focusKey) {
    const restored = Array.from(
      content.querySelectorAll<HTMLElement>("[data-action], details")
    ).find((el) => el.dataset.action === focusKey || el.dataset.detail === focusKey);
    (restored instanceof HTMLDetailsElement
      ? restored.querySelector("summary")
      : restored
    )?.focus();
  }
}
function navigate(nextView: Page, url: string, push = true) {
  view = nextView;
  if (push) history.pushState({}, "", url);
  // A page transition deliberately discards the previous page's transient UI.
  content.dataset.page = "";
  content.innerHTML = "";
  render();
  if (location.hash)
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  else window.scrollTo(0, 0);
  document.querySelector<HTMLElement>("main")!.focus({ preventScroll: true });
}
window.addEventListener("popstate", () => {
  navigate(pageForPath(location.pathname) ?? "home", location.href, false);
});
let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const response = await fetch("/api/state", { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Localnet is unavailable. Check the demo server and retry.");
    const next = (await response.json()) as State;
    const changed = JSON.stringify({ ...state, slot: 0 }) !== JSON.stringify({ ...next, slot: 0 });
    state = next;
    connected = true;
    const recovered = localError !== "" && !requesting;
    if (recovered) localError = "";
    if (changed || recovered) render();
    else updateNavigation();
  } catch (error) {
    connected = false;
    localError = error instanceof Error ? error.message : "Connection failed";
    if (renderPublicPage(view) === undefined) {
      render();
      notice.innerHTML = `<div class="notice error">${state ? "Showing the last received snapshot. " : ""}${escape(localError)} <button class="button" data-retry>Retry connection</button></div>`;
    } else updateNavigation();
  } finally {
    refreshing = false;
  }
}
document.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.id !== "glossary-search") return;
  const query = input.value.trim().toLowerCase();
  let count = 0;
  content.querySelectorAll<HTMLElement>(".glossary-entry").forEach((entry) => {
    entry.hidden = !entry.dataset.term?.includes(query);
    if (!entry.hidden) count++;
  });
  document.querySelector<HTMLElement>("#glossary-empty")!.hidden = count > 0;
  document.querySelector("#glossary-count")!.textContent = `${count} matching concepts`;
});
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest("[data-retry]")) {
    void refresh();
    return;
  }
  const target = event.target.closest<HTMLElement>("[data-view], [data-action]");
  if (!target) return;
  if (target.dataset.view && Object.hasOwn(pages, target.dataset.view)) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    const nextView = target.dataset.view as Page;
    navigate(nextView, target.getAttribute("href") ?? pages[nextView].path);
    return;
  }
  if (target.dataset.action && !requesting && state && !state.busy && connected) {
    const action = target.dataset.action;
    const payload = { run: state.run, stage: state.stage };
    requesting = true;
    localError = "";
    render();
    void (async () => {
      try {
        const response = await fetch(action, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data: unknown = await response.json();
        if (!response.ok)
          throw new Error(
            typeof data === "object" && data && "error" in data && typeof data.error === "string"
              ? data.error
              : "Request failed"
          );
        state = data as State;
      } catch (error) {
        localError = error instanceof Error ? error.message : "Request failed";
      } finally {
        requesting = false;
        render();
      }
    })();
  }
});
render();
void refresh();
setInterval(() => {
  if (!document.hidden) void refresh();
}, 3000);
