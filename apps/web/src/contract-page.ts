import type { ContractFlowScreenModel } from "./index.ts";

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

export function renderContractPage(contract: ContractFlowScreenModel): string {
  const steps = contract.steps
    .map(
      (step, index) => `<li><div class="number">${escapeHtml(index + 1)}</div><div>
        <div class="meta">${escapeHtml(step.actor)} instruction</div><h3>${escapeHtml(step.status)}</h3>
        <p>${escapeHtml(step.detail)}</p><div class="balance">Escrow held <strong>${escapeHtml(step.escrowLamports.toLocaleString("en-US"))} lamports</strong></div>
      </div></li>`
    )
    .join("\n");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Work Contract and Escrow · Machine Economy Protocol</title>
<style>
:root{font-family:ui-sans-serif,system-ui,sans-serif;color:#172521;background:#f5f5ef}*{box-sizing:border-box}body{margin:0}
main{max-width:1100px;margin:auto;padding:48px 24px 90px}.eyebrow{font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#457567;font-weight:700}
h1{font-size:clamp(38px,6vw,70px);line-height:1;letter-spacing:-.055em;max-width:780px;margin:16px 0 20px}.intro{font-size:18px;line-height:1.5;color:#4d625a;max-width:750px}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#cbd7cf;border:1px solid #cbd7cf;margin:46px 0 55px}.summary div{background:#fff;padding:20px;min-width:0}
.label,.meta{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#638074;font-weight:700}.value{margin-top:10px;font-size:17px;font-weight:650;overflow-wrap:anywhere}
section{border-top:1px solid #afc0b5;padding-top:23px;margin-top:42px}h2{font-size:26px;letter-spacing:-.03em;margin:0 0 14px}
.roots{display:grid;grid-template-columns:1fr 1fr;gap:16px}.root{background:#fff;border:1px solid #d7e0d8;border-radius:7px;padding:18px}.root strong{display:block;margin:8px 0}.root code{font-size:12px;overflow-wrap:anywhere;color:#3b6252}
ol{list-style:none;padding:0;margin:24px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:16px}li{display:flex;gap:16px;background:#fff;border:1px solid #d7e0d8;border-radius:7px;padding:20px;min-height:192px}
.number{background:#d7eadf;color:#285640;font-weight:750;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;flex:none}h3{font-size:22px;margin:8px 0}li p{font-size:14px;line-height:1.5;color:#53675d;margin:0 0 22px}.balance{font-size:12px;color:#587066}.balance strong{display:block;font-size:15px;color:#183d2e;margin-top:3px}
.note{background:#e4eee7;border-left:3px solid #3d705a;padding:18px;font-size:14px;line-height:1.5;color:#315746;margin-top:38px}
@media(max-width:800px){.summary{grid-template-columns:repeat(2,1fr)}ol{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.summary,.roots,ol{grid-template-columns:1fr}}
</style></head><body><main>
<div class="eyebrow">Machine Economy Protocol / Demo stage 06</div><h1>Work contract and escrow</h1>
<p class="intro">The procurement agent selects a provider offer, commits the job terms, funds the contract in SOL, and releases payment only after the customer verifies a submitted result.</p>
<div class="summary"><div><span class="label">Customer agent</span><div class="value">${escapeHtml(contract.customerAgentName)}</div></div>
<div><span class="label">Provider</span><div class="value">${escapeHtml(contract.providerId)}</div></div>
<div><span class="label">Selected offer</span><div class="value">${escapeHtml(contract.offerId)}</div></div>
<div><span class="label">Quoted price</span><div class="value">${escapeHtml(contract.priceLamports.toLocaleString("en-US"))} lamports</div></div></div>
<section><h2>Committed terms</h2><p>The task, verification rule, and liability rule stay off-chain as structured data. Their SHA-256 roots are stored in the contract account. The deadline is set ${escapeHtml(contract.deadlineOffsetSlots)} slots after creation in this example.</p>
<div class="roots"><div class="root"><span class="label">Task</span><strong>Evidence summary</strong><code>${escapeHtml(contract.taskRoot)}</code></div>
<div class="root"><span class="label">Verification</span><strong>Customer attests result root</strong><code>${escapeHtml(contract.verificationRuleRoot)}</code></div>
<div class="root"><span class="label">Liability</span><strong>Missed deadline · limit ${escapeHtml(contract.terms.liabilityRule.limitLamports.toLocaleString("en-US"))} lamports</strong><code>${escapeHtml(contract.liabilityRuleRoot)}</code></div>
<div class="root"><span class="label">Submitted result</span><strong>Result commitment</strong><code>${escapeHtml(contract.resultRoot)}</code></div></div></section>
<section><h2>Contract lifecycle</h2><p>Each transition is a separate Anchor instruction with signer and status checks.</p><ol>${steps}</ol></section>
<div class="note">This is a deterministic flow preview. LiteSVM tests execute the real instructions and check exact escrow balances. The page does not read live localnet accounts. Breach refunds and dispute settlement are later stages; funds in an unfinished contract have no recovery instruction yet.</div>
</main></body></html>`;
}
