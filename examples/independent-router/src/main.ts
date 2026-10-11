// Independent precedent consumer. Usage, from the repository root:
//
//   pnpm router:verify --bundle <evidence-bundle.json> [--rpc <url>] [--idl <path>]
//
// It reads accounts from the RPC, checks the bundle's documents against them,
// re-runs the committed checker, and prints its own routing decision. It never
// contacts the demo server and never signs or sends a transaction.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { PublicKey } from "@solana/web3.js";

import { checkerCodeRoot } from "../../../packages/protocol/src/verifier.ts";
import { rpcReader } from "./rpc.ts";
import { decide, type RankedOffer } from "./verify.ts";

const { values } = parseArgs({
  options: {
    bundle: { type: "string" },
    rpc: { type: "string", default: process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899" },
    idl: { type: "string", default: "target/idl/machine_economy_protocol.json" }
  }
});

const sol = (lamports: bigint) => (Number(lamports) / 1e9).toFixed(6);
const table = (rows: readonly RankedOffer[]) =>
  rows
    .map(
      (r, i) =>
        `  ${i === 0 ? "→" : " "} ${r.offerId}  ${r.trust.hardware}/${r.trust.model}/${r.trust.execution}  failure ${String(r.effectiveFailureProbabilityBps / 100)}%  price ${sol(r.priceLamports)}  expected ${sol(r.totalExpectedCostLamports)} SOL`
    )
    .join("\n");

async function readJson(path: string, label: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new Error(`${label} not found at ${path}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} at ${path} is not valid JSON`);
  }
}

try {
  if (!values.bundle) throw new Error("Pass --bundle <path to evidence-bundle.json>");
  const idl = (await readJson(values.idl, "Program IDL (run `pnpm anchor:build`)")) as {
    address?: string;
  };
  if (!idl.address) throw new Error(`IDL at ${values.idl} has no program address`);
  // The program is pinned by this checkout's IDL, never by the bundle.
  const programId = new PublicKey(idl.address);
  const codeRoot = await checkerCodeRoot((path) => readFile(path, "utf8"));
  const decision = await decide(
    await readJson(values.bundle, "Evidence bundle"),
    rpcReader(values.rpc, idl as never, programId),
    programId.toBase58(),
    codeRoot
  );
  const p = decision.precedent;
  console.log(`Verified precedent ${p.account}
  ruling root   ${p.rulingRoot} (recomputed from dispute ${p.dispute})
  contract      ${p.contract} · provider ${p.provider}
  ruling        ${p.providerBreached ? "provider breached" : "no breach"} · ${String(p.breachVotes)} of ${String(p.reveals)} votes
  checks        evidence root, contract task/policy/result roots, provider-signed receipt,
                canary pool from the contracted model,
                checker ${codeRoot} re-run and reproduced

Ranking before the precedent:
${table(decision.before)}

Ranking after applying it to this router's own memory:
${table(decision.after)}

Decision: ${decision.choiceBefore === decision.choiceAfter ? `keep ${decision.choiceAfter ?? "none"}` : `switch from ${decision.choiceBefore ?? "none"} to ${decision.choiceAfter ?? "none"}`}`);
  if (decision.rejectedOffers.length)
    console.log(
      `\nOffers not ranked: ${decision.rejectedOffers.map((r) => `${r.offer} (${r.reason})`).join(", ")}`
    );
} catch (error) {
  console.error(
    `Precedent NOT accepted: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
}
