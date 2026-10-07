import type { SubcontractScreenModel } from "./index.ts";

function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character] ?? character;
  });
}

function amount(value: number | bigint): string {
  return value.toLocaleString("en-US");
}

export function renderSubcontractPage(model: SubcontractScreenModel): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Subcontract · Machine Economy Protocol</title>
<style>
:root{font-family:ui-sans-serif,system-ui,sans-serif;color:#1a2523;background:#f5f5f0}*{box-sizing:border-box}body{margin:0}main{max-width:1080px;margin:auto;padding:48px 24px 90px}
.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#55716b;font-weight:700}h1{font-size:clamp(40px,6vw,72px);letter-spacing:-.06em;line-height:1;margin:16px 0 20px;max-width:780px}
.intro{color:#52635e;font-size:18px;line-height:1.5;max-width:740px}section{border-top:1px solid #b5c4bb;padding-top:24px;margin-top:48px}h2{font-size:27px;letter-spacing:-.03em;margin:0 0 12px}section>p{color:#52635e;line-height:1.5;max-width:730px}
.graph{display:grid;grid-template-columns:1fr 55px 1fr 55px 1fr;align-items:stretch;gap:0;margin:35px 0}.node{background:#fff;border:1px solid #d6e0d8;border-radius:8px;padding:21px;min-height:184px}
.node.child{background:#e8f0e9;border-color:#91b29d}.tag{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#5b7869;font-weight:750}.node h3{font-size:22px;line-height:1.15;margin:12px 0}.node p{color:#52685d;line-height:1.45;font-size:14px;margin:0}.arrow{align-self:center;text-align:center;color:#50745e;font-size:28px}
.ledger{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d6e0d8}.ledger th,.ledger td{padding:17px;text-align:left;border-bottom:1px solid #e6ebe5;font-size:14px;font-variant-numeric:tabular-nums}.ledger thead th{background:#e8f0e9;color:#395c4a;text-transform:uppercase;letter-spacing:.07em;font-size:11px}.ledger tbody tr:last-child th,.ledger tbody tr:last-child td{border-bottom:0}.ledger strong{color:#1b6040;font-size:18px}
.details{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:24px}.detail{background:#fff;border:1px solid #d6e0d8;padding:18px;border-radius:7px}.detail strong{display:block;margin:8px 0}.detail code{font-size:12px;color:#486d58;overflow-wrap:anywhere}.note{margin-top:42px;background:#e8f0e9;border-left:3px solid #547c60;padding:18px;color:#405d4a;font-size:14px;line-height:1.5}
@media(max-width:800px){.graph{grid-template-columns:1fr;gap:10px}.arrow{transform:rotate(90deg)}.details{grid-template-columns:1fr}}
</style></head><body><main>
<div class="eyebrow">Machine Economy Protocol / Demo stage 07</div><h1>Agent to agent subcontract</h1>
<p class="intro">An external client pays ${escapeHtml(model.agentAName)} for an evidence summary. Agent A budgets for compute from ${escapeHtml(model.computeProviderId)} and hires ${escapeHtml(model.supplierAgentName)} for the OCR dependency.</p>
<section><h2>Dependency graph</h2><p>The client funded parent contract pays Agent A. The linked child contract pays Agent B. The compute provider is a separate purchase by Agent A.</p>
<div class="graph"><div class="node"><span class="tag">Client · customer</span><h3>External client agent</h3><p>Funds the parent service contract for ${escapeHtml(amount(model.parentRevenueLamports))} lamports.</p></div>
<div class="arrow" aria-hidden="true">→</div><div class="node"><span class="tag">Parent · agent service</span><h3>${escapeHtml(model.parentId)}</h3><p>${escapeHtml(model.agentAName)} earns the parent quote after client verification · deadline +${escapeHtml(model.parentDeadlineOffsetSlots)} slots.</p></div>
<div class="arrow" aria-hidden="true">↳</div><div class="node child"><span class="tag">Child · agent service</span><h3>${escapeHtml(model.childId)}</h3><p>${escapeHtml(model.supplierAgentName)} performs OCR · cost ${escapeHtml(amount(model.childCostLamports))} lamports · deadline +${escapeHtml(model.childDeadlineOffsetSlots)} slots.</p></div></div>
<p>Agent A's selected compute offer from ${escapeHtml(model.computeProviderId)} quotes ${escapeHtml(amount(model.computeCostLamports))} lamports. It is a projected cost in this margin view.</p>
<div class="details"><div class="detail"><span class="tag">Parent task commitment</span><strong>Evidence summary</strong><code>${escapeHtml(model.parentTaskRoot)}</code></div><div class="detail"><span class="tag">Child task commitment</span><strong>OCR extraction</strong><code>${escapeHtml(model.childTaskRoot)}</code></div></div></section>
<section><h2>Expected agent margin</h2><p>Parent revenue minus compute cost and child subcontract price. This excludes transaction fees and breach losses. Revenue is realized only if the parent settles.</p>
<table class="ledger"><thead><tr><th>Scenario</th><th>Parent revenue</th><th>Compute cost</th><th>Child price</th><th>Agent A margin</th></tr></thead><tbody>
<tr><th scope="row">Demo quote</th><td>${escapeHtml(amount(model.parentRevenueLamports))}</td><td>${escapeHtml(amount(model.computeCostLamports))}</td><td>${escapeHtml(amount(model.childCostLamports))}</td><td><strong>${escapeHtml(amount(model.marginLamports))}</strong></td></tr>
<tr><th scope="row">Child price rises</th><td>${escapeHtml(amount(model.parentRevenueLamports))}</td><td>${escapeHtml(amount(model.computeCostLamports))}</td><td>${escapeHtml(amount(model.alternateChildCostLamports))}</td><td><strong>${escapeHtml(amount(model.alternateMarginLamports))}</strong></td></tr>
</tbody></table></section>
<div class="note">Deterministic fixture preview. LiteSVM tests create linked accounts, pay Agent B through the child, and pay Agent A through the client funded parent. The compute cost is a selected market quote, not a settled purchase in this preview. Dependency order is not automatically enforced by the program.</div>
</main></body></html>`;
}
