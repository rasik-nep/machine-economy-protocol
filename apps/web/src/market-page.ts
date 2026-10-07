import type { UtilityBreakdown } from "@mep/protocol";

import type { MarketScreenModel, RouterScreenModel } from "./index.ts";

const escapeHtml = (value: string | number): string =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character] ?? character;
  });

function renderScoreRows(scores: readonly UtilityBreakdown[]): string {
  return scores
    .map(
      (score, index) => `<tr${index === 0 ? ' class="selected"' : ""}>
        <th scope="row">${escapeHtml(score.offerId)}${index === 0 ? ' <span class="badge">SELECTED</span>' : ""}</th>
        <td>${escapeHtml(score.effectiveFailureProbabilityBps / 100)}%</td>
        <td>${score.priceLamports.toLocaleString("en-US")}</td>
        <td>${score.expectedFailureLossLamports.toLocaleString("en-US")}</td>
        <td>${score.expectedDelayLossLamports.toLocaleString("en-US")}</td>
        <td>${score.trustPenaltyLamports.toLocaleString("en-US")}</td>
        <td>${score.reservationAdjustmentLamports.toLocaleString("en-US")}</td>
        <td><strong>${score.totalExpectedCostLamports.toLocaleString("en-US")}</strong></td></tr>`
    )
    .join("\n");
}

export function renderMarketPage(market: MarketScreenModel, router: RouterScreenModel): string {
  const providerRows = market.providers
    .map(
      (provider) => `<tr><th scope="row">${escapeHtml(provider.displayName)}</th>
        <td>${escapeHtml(provider.id)}</td><td>${escapeHtml(provider.hardwareTrustBps / 100)}%</td>
        <td>${escapeHtml(provider.executionTrustBps / 100)}%</td><td>${escapeHtml(provider.breachCount)}</td></tr>`
    )
    .join("\n");
  const instanceRows = market.modelInstances
    .map(
      (instance) => `<tr><th scope="row">${escapeHtml(instance.id)}</th>
        <td>${escapeHtml(instance.providerId)}</td><td>${escapeHtml(instance.stockModelName)}</td>
        <td>${escapeHtml(instance.modelTrustBps / 100)}%</td><td title="${escapeHtml(instance.stockModelRoot)}">${escapeHtml(instance.stockModelRoot.slice(0, 19))}…</td></tr>`
    )
    .join("\n");
  const offerRows = market.offers
    .map(
      (offer) => `<tr><th scope="row">${escapeHtml(offer.id)}</th>
        <td>${escapeHtml(offer.modelInstanceId)}</td><td>${escapeHtml(offer.reservationClass)}</td>
        <td>${(offer.priceLamports / 1_000_000).toFixed(1)}M</td>
        <td>${escapeHtml(offer.expectedLatencyMs)}</td><td>${escapeHtml(offer.failureProbabilityBps / 100)}%</td></tr>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Provider and Model Market · Machine Economy Protocol</title>
<style>
:root{color-scheme:light;font-family:ui-sans-serif,system-ui,sans-serif;background:#f6f5f0;color:#182322}
*{box-sizing:border-box}body{margin:0}main{max-width:1180px;margin:auto;padding:48px 24px 80px}
.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#52736d;font-weight:700}
h1{font-size:clamp(38px,6vw,72px);line-height:1;letter-spacing:-.06em;margin:14px 0 20px;max-width:850px}
.intro{font-size:18px;line-height:1.5;max-width:720px;color:#485d58;margin-bottom:52px}
section{border-top:1px solid #b9c5bf;padding-top:25px;margin-top:42px}h2{font-size:27px;letter-spacing:-.03em;margin:0 0 8px}
section p{color:#52645f;margin:0 0 18px}.table-wrap{overflow-x:auto;background:#fff;border:1px solid #d9dfda;border-radius:8px}
table{border-collapse:collapse;width:100%;min-width:760px;text-align:left}th,td{padding:15px 17px;border-bottom:1px solid #e8ece7;font-size:14px;white-space:nowrap}
thead th{background:#e9f0eb;color:#38574e;text-transform:uppercase;letter-spacing:.08em;font-size:11px}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}tbody th{font-weight:650}td{font-variant-numeric:tabular-nums}
.note{margin-top:40px;padding:18px;border-left:3px solid #52736d;background:#e9f0eb;color:#38574e;font-size:14px}
.selected{background:#e5f1ea}.badge{font-size:10px;letter-spacing:.08em;background:#27594a;color:#fff;padding:4px 6px;border-radius:3px;margin-left:6px}
.formula{background:#182d27;color:#f4f6ed;padding:22px;border-radius:8px;line-height:1.55;font-size:14px;max-width:950px}
.subhead{font-weight:700;color:#243f36;margin:28px 0 10px}
</style></head><body><main>
<div class="eyebrow">Machine Economy Protocol / Demo stages 04–05</div>
<h1>Market and utility router</h1>
<p class="intro">A provider operates compute. A model instance runs a stock model on that provider. An offer sets the commercial terms. The agent then compares eligible offers by expected cost.</p>
<section aria-labelledby="providers"><h2 id="providers">01 / Compute providers</h2><p>Operator identity and infrastructure trust.</p><div class="table-wrap"><table><thead><tr><th>Provider</th><th>ID</th><th>Hardware trust</th><th>Execution trust</th><th>Breaches</th></tr></thead><tbody>${providerRows}</tbody></table></div></section>
<section aria-labelledby="instances"><h2 id="instances">02 / Model instances</h2><p>Each instance links one provider to a registered stock model.</p><div class="table-wrap"><table><thead><tr><th>Instance</th><th>Provider ID</th><th>Stock model</th><th>Model trust</th><th>Manifest root</th></tr></thead><tbody>${instanceRows}</tbody></table></div></section>
<section aria-labelledby="offers"><h2 id="offers">03 / Compute offers</h2><p>Commercial terms for each instance. Price is shown in millions of lamports.</p><div class="table-wrap"><table><thead><tr><th>Offer</th><th>Instance ID</th><th>Reservation</th><th>Price</th><th>Latency, ms</th><th>Failure risk</th></tr></thead><tbody>${offerRows}</tbody></table></div></section>
<section aria-labelledby="router"><h2 id="router">04 / Risk adjusted choice</h2>
<p>${escapeHtml(router.agentName)} needs ${router.requiredCapabilities.map(escapeHtml).join(", ")}. Only models with that capability and offers within the agent's price cap are ranked. Lowest expected cost wins.</p>
<div class="formula"><strong>Expected cost, in lamports</strong><br>Price + ceil(failure loss × failure probability / 10,000) + ceil(delay cost per second × latency ms / 1,000) + trust penalty + reservation adjustment.<br>Trust penalty uses the average deficit of hardware, model, and execution trust, weighted by the agent's privacy preference. Reservation adjustment adds 2% of failure loss for spot, 0.5% for reserved, and 0% for dedicated.</div>
<p class="subhead">Published risk estimates</p><div class="table-wrap"><table><thead><tr><th>Offer</th><th>Failure</th><th>Price</th><th>Expected failure loss</th><th>Expected delay loss</th><th>Trust penalty</th><th>Reservation</th><th>Total</th></tr></thead><tbody>${renderScoreRows(router.baseline)}</tbody></table></div>
<p class="subhead">What if Provider Y's failure estimate rises to 25%?</p><p>This is a deterministic scenario, not an observed breach or a memory update.</p>
<div class="table-wrap"><table><thead><tr><th>Offer</th><th>Failure</th><th>Price</th><th>Expected failure loss</th><th>Expected delay loss</th><th>Trust penalty</th><th>Reservation</th><th>Total</th></tr></thead><tbody>${renderScoreRows(router.riskUpdate)}</tbody></table></div></section>
<div class="note">These pages use deterministic demo fixtures. The scoring is local TypeScript logic; escrow and settlement are separate protocol steps.</div>
</main></body></html>`;
}
