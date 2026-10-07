/* Rendering is gated on state and uses the fixed dashboard DOM and fixture rows. */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
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
let view = "overview";
let requesting = false;
let localError = "";
const content = document.querySelector<HTMLElement>("#content")!;
const notice = document.querySelector<HTMLElement>("#notice")!;
const titles: Record<string, string> = {
  overview: "Overview",
  market: "Compute market",
  agents: "Agent passports",
  dispute: "Dispute & precedent",
  activity: "Transaction ledger"
};
const descriptions = [
  "Stock agents and model offers are registered on localnet. Start a funded job to see the economy in motion.",
  "Agent A hired an OCR specialist and reserved compute from Provider X. Trigger the controlled SLA failure.",
  "Provider X missed its deadline. The structured failure receipt is ready for the five-juror panel.",
  "The jury is in its commit window. Each vote is hidden behind a salted commitment.",
  "Five votes are committed. Waiting for the reveal window protects the independent ballot.",
  "All votes are revealed. Escrow stays frozen until the reveal window closes.",
  "Five jurors confirmed the breach. The compute escrow has been refunded to the customer.",
  "The ruling is published and committed to agent memory. Run the same task with the same scoring policy.",
  "Provider Z completed job two. Compute, subcontract, and parent escrow are settled. The learning loop is complete."
];
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
  `<button class="button ${kind}" data-action="${action}" ${state?.busy || requesting ? "disabled" : ""}>${escape(label)}</button>`;
function intro(title: string, description: string, controls = "") {
  return `<section class="intro"><div><p class="eyebrow">MACHINE ECONOMY / LIVE DEMO</p><h1>${title}</h1><p>${description}</p></div><div class="actions">${controls}</div></section>`;
}
function status(value: string) {
  return `<span class="status ${["disputed", "breached"].includes(value) ? "warning" : value === "draft" ? "neutral" : ""}">${escape(value[0]!.toUpperCase() + value.slice(1))}</span>`;
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
    `<div class="hero-grid"><section class="experiment"><div class="kicker"><span>THE ECONOMIC LEARNING LOOP</span><span class="tag">On-chain proof</span></div><h2>Same agent. Same task. <br><em>A different decision.</em></h2><div class="choice-track"><div class="choice"><small>First procurement</small><strong>Provider X</strong><p>Lowest expected cost</p></div><div class="choice-line"></div><div class="choice"><small>${s.stage >= 7 ? "After learning" : "Learning target"}</small><strong>${s.stage >= 7 ? "Provider Z" : "Experience"}</strong><p>${s.stage >= 7 ? "Memory changes the winner" : "Breach → precedent → memory"}</p></div></div></section><section class="run-panel"><div class="panel-title"><h3 class="micro">CURRENT RUN</h3><span class="step-count">${String(s.stage + 1).padStart(2, "0")} / 09</span></div><h3>${escape(s.stageLabel)}</h3><p>${descriptions[s.stage]}</p><div class="step-bars" aria-label="${s.stage + 1} of 9 stages">${s.stages.map((_, i) => `<span class="${i <= s.stage ? "done" : ""}"></span>`).join("")}</div>${button(s.busy ? "Processing on localnet…" : actions[s.stage]!, s.stage === 1 ? "/demo/preempt" : s.stage === 2 ? "/demo/resolve" : s.stage === 8 ? "/demo/reset" : "/demo/next", s.stage === 1 ? "danger" : "primary")}</section></div>
  <section class="metrics" aria-label="Protocol statistics"><div class="metric"><span class="label">ACTIVE AGENTS <span>◎</span></span><strong>04</strong><p>Procurement, twin, specialist, client</p></div><div class="metric"><span class="label">COMPUTE OFFERS <span>▦</span></span><strong>03</strong><p>Two models · three providers</p></div><div class="metric"><span class="label">LOCKED ESCROW <span>◇</span></span><strong>${sol(total)}<small>SOL</small></strong><p>${s.stage === 8 ? "All work settled" : "Actual on-chain contract balances"}</p></div><div class="metric"><span class="label">MEMORY CHECKPOINTS <span>↗</span></span><strong>${String(s.agent.checkpoints).padStart(2, "0")}</strong><p>${s.agent.checkpoints ? "Experience committed on-chain" : "Ready to learn from the first job"}</p></div></section>
  <div class="section-grid"><section class="panel"><div class="panel-title"><h2>Work, composed.</h2><span class="micro muted">AGENT → AGENT → COMPUTE</span></div><p class="sub">Independent obligations. Explicit escrow. Verifiable outcomes.</p><div class="flow">${s.contracts.map((c, i) => `<div class="flow-row"><span class="flow-icon">${i === 0 ? "A" : i === 1 ? "B" : i === 2 ? "X" : "Z"}</span><div class="flow-copy"><h3>${escape(c.label)}</h3><p>${sol(c.priceLamports)} SOL · <code>${short(c.address)}</code></p></div>${status(c.status)}</div>`).join("")}${s.stage === 0 ? '<div class="flow-row"><span class="flow-icon">B</span><div class="flow-copy"><h3>OCR specialist subcontract</h3><p>Created and funded when the first job starts</p></div>' + status("pending") + "</div>" : ""}</div><p class="table-note">Parent revenue: 0.020 SOL · Specialist cost: 0.003 SOL. Each contract settles independently.</p></section><section class="panel"><div class="panel-title"><h2>From work to experience</h2><span class="micro muted">LIVE</span></div><ol class="timeline">${[
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
  <section class="panel"><div class="panel-title"><h2>${s.stage >= 7 ? "The next decision has changed." : "Why Provider X wins the first job"}</h2><button class="subtle-link" data-view="market">Explore utility calculation ↗</button></div>${costTable(s.stage >= 7)}<p class="table-note">Expected cost = price + failure loss + delay loss + trust penalty + reservation adjustment. All values in SOL.</p></section>`
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
    `<section class="panel"><div class="panel-title"><h2>${after ? "After the memory update" : "First-job utility ranking"}</h2>${status(after ? "learned" : "baseline")}</div>${costTable(after)}<div class="explain">A failure costs this agent 0.05 SOL. Provider X’s learned failure probability rises from 1% to 25% after the finalized breach. Prices, capabilities, and policy stay fixed.</div><details data-detail="formula"><summary>Inspect every term in the deterministic score</summary><div class="table-wrap"><table><thead><tr><th scope="col">Provider</th><th scope="col">Price</th><th scope="col">Failure loss</th><th scope="col">Delay loss</th><th scope="col">Trust penalty</th><th scope="col">Reservation</th><th scope="col">Total (SOL)</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escape(r.providerId)}</td>${[r.priceLamports, r.expectedFailureLossLamports, r.expectedDelayLossLamports, r.trustPenaltyLamports, r.reservationAdjustmentLamports, r.totalExpectedCostLamports].map((v) => `<td class="amount">${sol(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details></section>
  <div class="pair-grid"><section class="panel"><h2>Before experience</h2>${scoreChart(s.before)}</section><section class="panel"><h2>${after ? "After experience" : "After experience · not yet recorded"}</h2>${after ? scoreChart(s.after) : '<div class="empty">Finalize the dispute and checkpoint memory to reveal the second decision.</div>'}</section></div>
  <section class="panel"><h2>The supply side</h2><p class="sub">Hardware identity and model identity remain separate.</p><div class="table-wrap"><table><thead><tr><th scope="col">Provider</th><th scope="col">Hardware trust</th><th scope="col">Execution trust</th><th scope="col">Model instance</th><th scope="col">Model trust</th></tr></thead><tbody>${s.providers.map((p, i) => `<tr><td><strong>${escape(p.displayName)}</strong></td><td>${p.hardwareTrustBps / 100}%</td><td>${p.executionTrustBps / 100}%</td><td>${escape(s.instances[i]!.id)}<small>${escape(s.instances[i]!.stockModelId)}</small></td><td>${s.instances[i]!.modelTrustBps / 100}%</td></tr>`).join("")}</tbody></table></div></section>`
  );
}
function scoreChart(rows: State["before"]) {
  // SVG width values are bounded numeric score data, not user-authored markup.
  const max = Math.max(...rows.map((r) => Number(r.totalExpectedCostLamports)));
  return `<div class="cost-chart">${rows.map((r) => `<div class="cost-row"><span>Provider ${r.providerId.slice(-1).toUpperCase()}</span><svg viewBox="0 0 200 20" width="100%" height="20" role="img" aria-label="Price ${sol(r.priceLamports)}, total expected cost ${sol(r.totalExpectedCostLamports)} SOL"><rect width="${(Number(r.priceLamports) / max) * 200}" height="20" fill="#3d6a4d"/><rect x="${(Number(r.priceLamports) / max) * 200}" width="${((Number(r.totalExpectedCostLamports) - Number(r.priceLamports)) / max) * 200}" height="20" fill="#adc695"/></svg><span class="amount">${sol(r.totalExpectedCostLamports)}</span></div>`).join("")}</div><div class="legend"><span><i></i>Price</span><span><i class="risk"></i>Risk, delay & trust</span><span>SOL</span></div>`;
}
function renderAgents() {
  const s = state!;
  return (
    intro(
      "Identity stays. Experience evolves.",
      "Two procurement agents share the same stock origin. Their memory roots tell different stories."
    ) +
    `<div class="pair-grid"><section class="panel"><div class="passport-heading"><span class="agent-avatar">A</span><div><h2>Procurement Agent A</h2><span class="micro muted">ACTIVE LEARNING AGENT</span></div></div><span class="micro muted">Passport address</span>${hash(s.agent.address)}<span class="micro muted">Stock origin · immutable</span>${hash(s.agent.genesisRoot)}<span class="micro muted">Current memory · checkpoint ${s.agent.checkpoints}</span>${hash(s.agent.memoryRoot)}<div class="key-value"><span>Initial failure estimate · X</span><strong>1%</strong></div><div class="key-value"><span>Current failure estimate · X</span><strong>${s.memory ? "25%" : "1%"}</strong></div><div class="key-value"><span>Scoring policy</span><strong>Unchanged</strong></div></section><section class="panel"><div class="passport-heading"><span class="agent-avatar">A′</span><div><h2>Independent Agent A′</h2><span class="micro muted">SAME STOCK CODE</span></div></div><span class="micro muted">Passport address</span>${hash(s.agent.twin)}<span class="micro muted">Shared genesis root</span>${hash(s.agent.genesisRoot)}<span class="micro muted">Independent memory root</span>${hash(s.agent.twinMemoryRoot)}<div class="explain">This passport has its own memory root and no checkpoint from this dispute. Stock identity is reproducible; experience belongs to an individual agent.</div><h3 class="table-note">What changed for Agent A?</h3>${s.memory ? `<pre class="evidence">${escape(JSON.stringify(s.memory, null, 2))}</pre>` : '<div class="empty">No learned precedent yet. Run the experiment to create the first memory checkpoint.</div>'}</section></div><section class="panel"><h2>Foundation registry</h2><p class="sub">Canonical manifests are hashed before registration. Demo models use deterministic outputs.</p>${s.registry.map((r) => `<details data-detail="${escape(r.id)}"><summary>${escape(r.id)} · ${r.verified ? "Root verified against chain" : "Root mismatch"}</summary>${hash(r.root)}</details>`).join("")}<div class="table-wrap"><table><thead><tr><th scope="col">Manifest</th><th scope="col">Kind</th><th scope="col">Version</th><th scope="col">Capabilities / role</th></tr></thead><tbody>${[...s.models, ...s.stockAgents].map((m) => `<tr><td><strong>${escape(m.displayName)}</strong><small>${escape(m.id)}</small></td><td>${m.kind.includes("model") ? "Stock model" : "Stock agent"}</td><td>${m.version}</td><td>${escape("capabilities" in m ? m.capabilities.join(", ") : m.role)}</td></tr>`).join("")}</tbody></table></div></section>`
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
    `<div class="pair-grid"><section class="panel"><div class="panel-title"><h2>Disputed obligation</h2>${status(s.stage >= 6 ? "finalized" : s.stage >= 3 ? "disputed" : "pending")}</div><h3>Provider X · missed delivery deadline</h3><p class="sub">Clause: deliver a committed result before the contract’s deadline slot. A controlled preemption prevents submission.</p>${s.evidence ? `<pre class="evidence">${escape(JSON.stringify(s.evidence, null, 2))}</pre><span class="micro muted">Evidence commitment</span>${hash(s.evidenceRoot)}` : '<div class="empty">Failure evidence will appear after the controlled preemption.</div>'}</section><section class="panel"><h2>Deterministic ruling</h2><p class="sub">The jury determines the objective breach. Program code routes the escrow.</p><div class="key-value"><span>Jurors appointed</span><strong>5 controlled accounts</strong></div><div class="key-value"><span>Commitments</span><strong>${s.votes.filter((v) => v.committed).length} / 5</strong></div><div class="key-value"><span>Reveals</span><strong>${s.votes.filter((v) => v.revealed).length} / 5</strong></div><div class="key-value"><span>Refund</span><strong>${s.stage >= 6 ? "0.005 SOL paid" : "Pending ruling"}</strong></div><div class="key-value"><span>Decision</span><strong>${s.stage >= 6 ? "Provider breached" : "Not finalized"}</strong></div><p class="table-note">An absolute majority of the five appointed jurors is required. A non-majority keeps funds frozen.</p>${s.rulingRoot ? `<p class="micro muted">Published precedent root</p>${hash(s.rulingRoot)}` : ""}</section></div><section class="panel"><div class="panel-title"><h2>The jury</h2><span class="micro muted">COMMIT → REVEAL</span></div><div class="jury">${Array.from(
      { length: 5 },
      (_, i) => {
        const v = s.votes[i];
        return `<div class="juror"><span class="agent-avatar">J${i + 1}</span><h3>Juror ${i + 1}</h3><p>${v?.revealed ? "Breach confirmed" : v?.committed ? "Vote sealed" : "Awaiting vote"}</p></div>`;
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
function render() {
  if (!state) return;
  const openDetails = new Set(
    Array.from(content.querySelectorAll<HTMLDetailsElement>("details[open]")).map(
      (d) => d.dataset.detail
    )
  );
  const active =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.dataset.action
      : undefined;
  notice.innerHTML =
    localError || state.error
      ? `<div class="notice error">${escape(localError || state.error)}</div>`
      : state.busy || requesting
        ? `<div class="notice"><span class="spinner"></span>${escape(state.stageLabel)} · Confirming localnet transactions. Jury phases wait for their on-chain slot deadlines.</div>`
        : "";
  content.innerHTML =
    view === "market"
      ? renderMarket()
      : view === "agents"
        ? renderAgents()
        : view === "dispute"
          ? renderDispute()
          : view === "activity"
            ? renderActivity()
            : renderOverview();
  content.querySelectorAll<HTMLDetailsElement>("details").forEach((d) => {
    if (openDetails.has(d.dataset.detail)) d.open = true;
  });
  document.querySelector("#page-name")!.textContent = titles[view]!;
  document
    .querySelectorAll(".nav")
    .forEach((n) => n.classList.toggle("active", (n as HTMLElement).dataset.view === view));
  if (active) content.querySelector<HTMLElement>(`[data-action="${active}"]`)?.focus();
}
async function refresh() {
  try {
    const response = await fetch("/api/state");
    if (!response.ok)
      throw new Error("Localnet is unavailable. Check the demo server and refresh.");
    const next = (await response.json()) as State;
    const changed = JSON.stringify({ ...state, slot: 0 }) !== JSON.stringify({ ...next, slot: 0 });
    state = next;
    if (changed) render();
  } catch (error) {
    localError = error instanceof Error ? error.message : "Connection failed";
    notice.innerHTML = `<div class="notice error">${escape(localError)}</div>`;
  }
}
document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-view], [data-action]");
  if (!target) return;
  if (target.dataset.view) {
    view = target.dataset.view;
    render();
    return;
  }
  if (target.dataset.action && !requesting && state && !state.busy) {
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
            typeof data === "object" && data && "error" in data
              ? typeof data.error === "string"
                ? data.error
                : "Request failed"
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
void refresh();
setInterval(() => {
  if (!document.hidden) void refresh();
}, 3000);
