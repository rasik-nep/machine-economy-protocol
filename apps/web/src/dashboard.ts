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
  "Stock agents and model offers are registered on localnet. Start a funded job to see the economy in motion.",
  `Agent A hired an OCR specialist and reserved compute from ${s.firstProvider}. Trigger the controlled SLA failure.`,
  `${s.firstProvider} missed its deadline. The structured failure receipt is ready for the five-juror panel.`,
  "The jury is in its commit window. Each vote is hidden behind a salted commitment.",
  "Five votes are committed. Waiting for the reveal window protects the independent ballot.",
  "All votes are revealed. Escrow stays locked until the reveal window closes.",
  rulingSentence(s),
  "The ruling is published and committed to agent memory. Run the same task with the same scoring policy.",
  `${s.secondProvider ?? "The new provider"} completed job two. Compute, subcontract, and parent escrow are settled. The learning loop is complete.`
];
function rulingSentence(s: State) {
  const r = s.ruling;
  if (!r) return "The ruling is being finalized.";
  const amount = `${sol(r.amountLamports)} SOL`;
  return r.outcome === "provider-breached"
    ? `${r.breachVotes} of 5 jurors confirmed the breach. ${amount} of compute escrow was refunded to the customer.`
    : r.outcome === "provider-cleared"
      ? `The jury cleared ${r.provider}. ${amount} of escrow was paid to the provider.`
      : `The jury reached no majority, so ${amount} of escrow was refunded to the customer.`;
}
const initial = (name: string | null) => (name ?? "?").slice(-1).toUpperCase();
const actions = [
  "Start first job",
  "Trigger provider failure",
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
  (Number(value) / 1e9).toFixed(9).replace(/0+$/, "0");
const short = (value: string) => `${value.slice(0, 7)}…${value.slice(-6)}`;
const hash = (value: unknown) =>
  `<div class="hash">${escape(value ?? "Waiting for commitment")}</div>`;
const button = (label: string, action: string, kind = "") =>
  `<button class="button ${kind}" data-action="${action}" ${state?.busy || requesting || !connected ? "disabled" : ""}>${escape(label)}</button>`;
function riskPercent(s: State, learned: boolean) {
  const id = s.providers.find((p) => p.name === s.firstProvider)?.id ?? "";
  const bps =
    (learned ? s.memory?.failureProbabilityOverridesBps[id] : undefined) ?? s.genesisRisk[id] ?? 0;
  return `${bps / 100}%`;
}
function intro(title: string, description: string, controls = "") {
  return `<section class="intro"><div><p class="eyebrow">PROTOCOL EXPLORER / LOCALNET</p><h1>${title}</h1><p>${description}</p></div><div class="actions">${controls}</div></section>`;
}
function status(value: string) {
  return `<span class="status ${["disputed", "breached", "refunded"].includes(value) ? "warning" : value === "draft" ? "neutral" : ""}">${escape(value[0]!.toUpperCase() + value.slice(1))}</span>`;
}
function costTable(after = false) {
  const s = state!;
  const rows = after ? s.after : s.before;
  return `<div class="table-wrap"><table><thead><tr><th scope="col">Provider / reservation</th><th scope="col">Price</th><th scope="col">Failure risk</th><th scope="col">Expected cost</th><th scope="col">Decision</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${i === 0 ? "winner" : ""}"><td><strong>Provider ${r.providerId.slice(-1).toUpperCase()}</strong><small>${escape(s.offers.find((o) => o.id === r.offerId)?.reservationClass)} · ${escape(r.stockModelId.replace("stock-model-", ""))}</small></td><td class="amount">${sol(r.priceLamports)}</td><td>${r.effectiveFailureProbabilityBps / 100}%</td><td class="amount">${sol(r.totalExpectedCostLamports)}</td><td>${i === 0 ? status("selected") : '<span class="muted micro">Higher cost</span>'}</td></tr>`).join("")}</tbody></table></div>`;
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
    `<div class="hero-grid"><section class="experiment"><div class="kicker"><span>THE ECONOMIC LEARNING LOOP</span><span class="tag">On-chain proof</span></div><h2>Same agent. Same task. <br><em>A different decision.</em></h2><div class="choice-track"><div class="choice"><small>First procurement</small><strong>${escape(s.firstProvider)}</strong><p>Lowest expected cost</p></div><div class="choice-line"></div><div class="choice"><small>${s.stage >= 7 ? "After learning" : "Learning target"}</small><strong>${s.stage >= 7 ? escape(s.secondProvider) : "Experience"}</strong><p>${s.stage >= 7 ? "Memory changes the winner" : "Breach → precedent → memory"}</p></div></div></section><section class="run-panel"><div class="panel-title"><h3 class="micro">CURRENT RUN</h3><span class="step-count">${String(s.stage + 1).padStart(2, "0")} / 09</span></div><h3>${escape(s.stageLabel)}</h3><p>${escape(descriptions(s)[s.stage])}</p><div class="step-bars" aria-label="${s.stage + 1} of 9 stages">${s.stages.map((_, i) => `<span class="${i <= s.stage ? "done" : ""}"></span>`).join("")}</div>${button(s.busy ? "Processing on localnet…" : actions[s.stage]!, s.stage === 1 ? "/demo/preempt" : s.stage === 2 ? "/demo/resolve" : s.stage === 8 ? "/demo/reset" : "/demo/next", s.stage === 1 ? "danger" : "primary")}</section></div>
  <section class="metrics" aria-label="Protocol statistics"><div class="metric"><span class="label">ACTIVE AGENTS <span>◎</span></span><strong>04</strong><p>Procurement, twin, specialist, client</p></div><div class="metric"><span class="label">COMPUTE OFFERS <span>▦</span></span><strong>03</strong><p>Two models · three providers</p></div><div class="metric"><span class="label">LOCKED ESCROW <span>◇</span></span><strong>${sol(total)}<small>SOL</small></strong><p>${s.stage === 8 ? "All work settled" : "Actual on-chain contract balances"}</p></div><div class="metric"><span class="label">MEMORY CHECKPOINTS <span>↗</span></span><strong>${String(s.agent.checkpoints).padStart(2, "0")}</strong><p>${s.agent.checkpoints ? "Experience committed on-chain" : "Ready to learn from the first job"}</p></div></section>
  <div class="section-grid"><section class="panel"><div class="panel-title"><h2>Work, composed.</h2><span class="micro muted">AGENT → AGENT → COMPUTE</span></div><p class="sub">Independent obligations. Explicit escrow. Verifiable outcomes.</p><div class="flow">${s.contracts.map((c, i) => `<div class="flow-row"><span class="flow-icon">${i === 0 ? "A" : i === 1 ? "B" : i === 2 ? initial(s.firstProvider) : initial(s.secondProvider)}</span><div class="flow-copy"><h3>${escape(c.label)}</h3><p>${sol(c.priceLamports)} SOL · <code>${short(c.address)}</code></p></div>${status(c.status)}</div>`).join("")}${s.stage === 0 ? '<div class="flow-row"><span class="flow-icon">B</span><div class="flow-copy"><h3>OCR specialist subcontract</h3><p>Created and funded when the first job starts</p></div>' + status("pending") + "</div>" : ""}</div><p class="table-note">Parent revenue: ${sol(s.contracts[0]?.priceLamports ?? 0)} SOL${s.contracts[1] ? ` · Specialist cost: ${sol(s.contracts[1].priceLamports)} SOL` : ""}. Each contract settles independently.</p></section><section class="panel"><div class="panel-title"><h2>From work to experience</h2><span class="micro muted">LIVE</span></div><ol class="timeline">${[
    "Registry & agent origin",
    "Funded work + subcontract",
    "Controlled provider failure",
    "Five-juror commit / reveal",
    "Ruling & escrow refund",
    "Precedent + memory root",
    "Second job settled"
  ]
    .map((label, i) => {
      const threshold = [0, 1, 2, 5, 6, 7, 8][i]!;
      return `<li class="${s.stage > threshold ? "complete" : s.stage === threshold ? "current" : ""}"><span class="node">${s.stage > threshold ? "✓" : i + 1}</span><div>${label}${i === 3 ? '<div class="detail">Salted commitments · objective SLA breach</div>' : ""}</div></li>`;
    })
    .join("")}</ol></section></div>
  <section class="panel"><div class="panel-title"><h2>${s.stage >= 7 ? "The next decision has changed." : `Why ${escape(s.firstProvider)} wins the first job`}</h2><button class="subtle-link" data-view="market">Explore utility calculation ↗</button></div>${costTable(s.stage >= 7)}<p class="table-note">Expected cost = price + failure loss + delay loss + trust penalty + reservation adjustment. All values in SOL.</p></section>`
  );
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
    `<section class="panel"><div class="panel-title"><h2>${after ? "After the memory update" : "First-job utility ranking"}</h2>${status(after ? "learned" : "baseline")}</div>${costTable(after)}<div class="explain">A failure costs this agent ${sol(s.policy.failureLossLamports)} SOL. ${escape(s.firstProvider)}’s failure estimate rises from ${riskPercent(s, false)} to ${riskPercent(s, true)} after a finalized breach. Prices, capabilities, and policy stay fixed.</div><details data-detail="formula"><summary>Inspect every term in the deterministic score</summary><div class="table-wrap"><table><thead><tr><th scope="col">Provider</th><th scope="col">Price</th><th scope="col">Failure loss</th><th scope="col">Delay loss</th><th scope="col">Trust penalty</th><th scope="col">Reservation</th><th scope="col">Total (SOL)</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escape(r.providerId)}</td>${[r.priceLamports, r.expectedFailureLossLamports, r.expectedDelayLossLamports, r.trustPenaltyLamports, r.reservationAdjustmentLamports, r.totalExpectedCostLamports].map((v) => `<td class="amount">${sol(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details></section>
  <div class="pair-grid"><section class="panel"><h2>Before experience</h2>${scoreChart(s.before)}</section><section class="panel"><h2>${after ? "After experience" : "After experience · not yet recorded"}</h2>${after ? scoreChart(s.after) : '<div class="empty">Finalize the dispute and checkpoint memory to reveal the second decision.</div>'}</section></div>
  <section class="panel"><h2>The supply side</h2><p class="sub">Hardware identity and model identity remain separate. Breach counts are written by the program when a jury finds a breach, and accumulate across runs.</p><div class="table-wrap"><table><thead><tr><th scope="col">Provider</th><th scope="col">Hardware trust</th><th scope="col">Execution trust</th><th scope="col">Model instance</th><th scope="col">Model trust</th><th scope="col">Breaches on-chain</th></tr></thead><tbody>${s.providers.map((p, i) => `<tr><td><strong>${escape(p.displayName)}</strong></td><td>${p.hardwareTrustBps / 100}%</td><td>${p.executionTrustBps / 100}%</td><td>${escape(s.instances[i]!.id)}<small>${escape(s.instances[i]!.stockModelId)}</small></td><td>${s.instances[i]!.modelTrustBps / 100}%</td><td>${p.breachCount}</td></tr>`).join("")}</tbody></table></div></section>`
  );
}
function scoreChart(rows: State["before"]) {
  // SVG width values are bounded numeric score data, not user-authored markup.
  const max = Math.max(...rows.map((r) => Number(r.totalExpectedCostLamports)));
  return `<div class="cost-chart">${rows.map((r) => `<div class="cost-row"><span>Provider ${r.providerId.slice(-1).toUpperCase()}</span><svg viewBox="0 0 200 20" width="100%" height="20" role="img" aria-label="Price ${sol(r.priceLamports)}, total expected cost ${sol(r.totalExpectedCostLamports)} SOL"><rect width="${(Number(r.priceLamports) / max) * 200}" height="20" fill="#2459d9"/><rect x="${(Number(r.priceLamports) / max) * 200}" width="${((Number(r.totalExpectedCostLamports) - Number(r.priceLamports)) / max) * 200}" height="20" fill="#b6c8ef"/></svg><span class="amount">${sol(r.totalExpectedCostLamports)}</span></div>`).join("")}</div><div class="legend"><span><i></i>Price</span><span><i class="risk"></i>Risk, delay & trust</span><span>SOL</span></div>`;
}
function renderAgents() {
  const s = state!;
  return (
    intro(
      "Identity stays. Experience evolves.",
      "Two procurement agents share the same stock origin. Their memory roots tell different stories."
    ) +
    `<div class="pair-grid"><section class="panel"><div class="passport-heading"><span class="agent-avatar">A</span><div><h2>Procurement Agent A</h2><span class="micro muted">ACTIVE LEARNING AGENT</span></div></div><span class="micro muted">Passport address</span>${hash(s.agent.address)}<span class="micro muted">Stock origin · immutable</span>${hash(s.agent.genesisRoot)}<span class="micro muted">Current memory · checkpoint ${s.agent.checkpoints}</span>${hash(s.agent.memoryRoot)}<div class="key-value"><span>Initial failure estimate · ${escape(s.firstProvider)}</span><strong>${riskPercent(s, false)}</strong></div><div class="key-value"><span>Current failure estimate · ${escape(s.firstProvider)}</span><strong>${riskPercent(s, !!s.memory)}</strong></div><div class="key-value"><span>Scoring policy</span><strong>Unchanged</strong></div></section><section class="panel"><div class="passport-heading"><span class="agent-avatar">A′</span><div><h2>Independent Agent A′</h2><span class="micro muted">SAME STOCK CODE</span></div></div><span class="micro muted">Passport address</span>${hash(s.agent.twin)}<span class="micro muted">Shared genesis root</span>${hash(s.agent.genesisRoot)}<span class="micro muted">Independent memory root</span>${hash(s.agent.twinMemoryRoot)}<div class="explain">This passport has its own memory root and no checkpoint from this dispute. Stock identity is reproducible; experience belongs to an individual agent.</div><h3 class="table-note">What changed for Agent A?</h3>${s.memory ? `<pre class="evidence">${escape(JSON.stringify(s.memory, null, 2))}</pre>` : '<div class="empty">No learned precedent yet. Run the experiment to create the first memory checkpoint.</div>'}</section></div><section class="panel"><h2>Foundation registry</h2><p class="sub">Canonical manifests are hashed before registration. Demo models use deterministic outputs.</p>${s.registry.map((r) => `<details data-detail="${escape(r.id)}"><summary>${escape(r.id)} · ${r.verified ? "Root verified against chain" : "Root mismatch"}</summary>${hash(r.root)}</details>`).join("")}<div class="table-wrap"><table><thead><tr><th scope="col">Manifest</th><th scope="col">Kind</th><th scope="col">Version</th><th scope="col">Capabilities / role</th></tr></thead><tbody>${[...s.models, ...s.stockAgents].map((m) => `<tr><td><strong>${escape(m.displayName)}</strong><small>${escape(m.id)}</small></td><td>${m.kind.includes("model") ? "Stock model" : "Stock agent"}</td><td>${m.version}</td><td>${escape("capabilities" in m ? m.capabilities.join(", ") : m.role)}</td></tr>`).join("")}</tbody></table></div></section>`
  );
}
function renderDispute() {
  const s = state!;
  return (
    intro(
      "A breach becomes precedent.",
      "An objective deadline, committed evidence, and five controlled jurors.",
      s.stage >= 6
        ? button(s.summary ? "Regenerate explanation" : "Explain with Gemini", "/demo/summary")
        : ""
    ) +
    `<div class="pair-grid"><section class="panel"><div class="panel-title"><h2>Disputed obligation</h2>${status(s.stage >= 6 ? "finalized" : s.stage >= 3 ? "disputed" : "pending")}</div><h3>${escape(s.firstProvider)} · missed delivery deadline</h3><p class="sub">Clause: deliver a committed result before the contract’s deadline slot. A controlled preemption prevents submission.</p>${s.evidence ? `<pre class="evidence">${escape(JSON.stringify(s.evidence, null, 2))}</pre><span class="micro muted">Evidence commitment</span>${hash(s.evidenceRoot)}` : '<div class="empty">Failure evidence will appear after the controlled preemption.</div>'}</section><section class="panel"><h2>Deterministic ruling</h2><p class="sub">The jury determines the objective breach. Program code routes the escrow.</p><div class="key-value"><span>Jurors appointed</span><strong>5 controlled accounts</strong></div><div class="key-value"><span>Commitments</span><strong>${s.votes.filter((v) => v.committed).length} / 5</strong></div><div class="key-value"><span>Reveals</span><strong>${s.votes.filter((v) => v.revealed).length} / 5</strong></div><div class="key-value"><span>Escrow routed</span><strong>${s.ruling ? `${sol(s.ruling.amountLamports)} SOL to ${s.ruling.recipient}` : "Pending ruling"}</strong></div><div class="key-value"><span>Decision</span><strong>${s.ruling ? (s.ruling.outcome === "provider-breached" ? "Provider breached" : s.ruling.outcome === "provider-cleared" ? "Provider cleared" : "No majority · refunded") : "Not finalized"}</strong></div><p class="table-note">Three of the five appointed jurors decide the ruling. A hung jury refunds the customer, so escrow can never stay locked.</p>${s.rulingRoot ? `<p class="micro muted">Published precedent root</p>${hash(s.rulingRoot)}` : ""}</section></div><section class="panel"><div class="panel-title"><h2>The jury</h2><span class="micro muted">COMMIT → REVEAL</span></div><div class="jury">${Array.from(
      { length: 5 },
      (_, i) => {
        const v = s.votes[i];
        return `<div class="juror"><span class="agent-avatar">J${i + 1}</span><h3>Juror ${i + 1}</h3><p>${v?.revealed ? "Vote revealed" : v?.committed ? "Vote sealed" : "Awaiting vote"}</p></div>`;
      }
    ).join(
      ""
    )}</div><p class="table-note">Commitments bind the dispute address, juror identity, vote, and a random 32-byte nonce.</p></section><section class="panel"><h2>Ruling explanation</h2><p class="sub">Optional Gemini summary. It has no authority over votes, arithmetic, or escrow.</p>${s.summary ? `<div class="summary">${escape(s.summary.text)}<small>${escape(s.summary.model)} · Advisory explanation</small></div>` : `<div class="empty">${s.geminiConfigured ? (s.stage >= 6 ? "Use Explain with Gemini to request an advisory summary." : "Gemini is configured. Finalize the ruling to request an explanation.") : "No Gemini key configured. The complete protocol loop still works."}</div>`}</section>`
  );
}
function renderActivity() {
  const s = state!;
  return (
    intro(
      "Every step leaves a receipt.",
      `${s.receipts.length} confirmed transactions in this run. Inspect signatures and committed account addresses.`
    ) +
    `<section class="panel"><div class="panel-title"><h2>Localnet transaction ledger</h2><span class="micro muted">SLOT ${s.slot.toLocaleString()}</span></div>${s.receipts
      .slice()
      .reverse()
      .map(
        (r, i) =>
          `<div class="receipt"><strong>${String(s.receipts.length - i).padStart(2, "0")} &nbsp; ${escape(r.label)}</strong><span class="ledger">${escape(r.signature)}</span></div>`
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
    `<section class="panel"><div class="panel-title"><h2>Contracts in this run</h2><span class="micro muted">${s.contracts.length} ON-CHAIN RECORDS</span></div><p class="sub">Balances and status come from the validator. Prices are in SOL; deadlines are Solana slots.</p>${s.contracts.map((c, i) => `<details class="contract-detail" data-detail="contract-${i}" ${i === 0 ? "open" : ""}><summary><span>${escape(c.label)}</span>${status(c.status)}</summary><div class="contract-facts"><div><span>Agreed price</span><strong>${sol(c.priceLamports)} SOL</strong></div><div><span>Locked escrow</span><strong>${sol(c.escrowLamports)} SOL</strong></div><div><span>Deadline slot</span><strong>${c.deadlineSlot.toLocaleString()}</strong></div></div><p class="micro muted">Contract account</p>${hash(c.address)}<p class="table-note">${i === 0 ? "Client → Agent A. The report obligation remains independent of the compute purchase." : i === 1 ? "Agent A → Agent B. OCR extraction is a separate, funded child obligation." : "Agent A → compute provider. The recorded result or dispute outcome determines settlement."}</p></details>`).join("")}${s.stage === 0 ? '<div class="empty">Start the first job to fund the parent and create the specialist and compute contracts.</div>' : ""}</section>
    <section class="storage-section"><h2>Two paths to a final outcome.</h2><div class="pair-grid"><article><h3>Successful delivery</h3><ol class="state-path"><li>Draft</li><li>Funded</li><li>Running</li><li>Submitted</li><li>Verified</li><li>Settled</li></ol><p>The provider commits a result, the customer verifies it, and the program transfers the agreed price.</p></article><article><h3>Disputed delivery</h3><ol class="state-path"><li>Running / submitted</li><li>Disputed</li><li>Jury ruling</li><li>Refund or payout</li></ol><p>A breach refunds compute escrow. A cleared provider is paid. No majority also refunds the customer.</p>${link("dispute", "Inspect dispute & precedent")}</article></div></section>`
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
    ? "Connected · Localnet"
    : "Localnet disconnected";
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
    content.innerHTML = `<section class="connection-empty"><p class="eyebrow">PROTOCOL EXPLORER</p><h1>${connected ? "Loading protocol state." : "Connect to your local demo."}</h1><p>The live explorer reads real localnet accounts. Start <code>pnpm dev</code> in the repository, then retry the connection.</p><div class="actions"><button class="button primary" data-retry>Retry connection</button>${link("docs", "View setup guide")}</div></section>`;
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
    state.stage > 0 && state.stage < 8 ? ` ${button("Start a fresh run", "/demo/reset")}` : "";
  notice.innerHTML =
    localError || state.error
      ? `<div class="notice error">${escape(localError || state.error)}${recover}</div>`
      : state.busy || requesting
        ? `<div class="notice"><span class="spinner"></span>${escape(state.stageLabel)} · Confirming localnet transactions. Jury phases wait for their on-chain slot deadlines.</div>`
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
