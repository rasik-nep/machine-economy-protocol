// An agent's profit and loss, computed from on-chain contract prices and statuses.

export type PnlContract = {
  readonly label: string;
  /** "revenue": the agent is the supplier. "cost": the agent funded the escrow. */
  readonly role: "revenue" | "cost";
  readonly priceLamports: number;
  readonly status: string;
};

export type PnlLine = {
  readonly label: string;
  readonly lamports: bigint;
  readonly kind: "revenue" | "cost" | "refund";
};

export type ProfitAndLoss = {
  readonly lines: readonly PnlLine[];
  readonly totalLamports: bigint;
  readonly refundedLamports: bigint;
  /** What the agent would have made had the breached job's escrow not been refunded. */
  readonly withoutRefundsLamports: bigint;
};

const REFUNDED = new Set(["breached", "refunded"]);

export function agentProfitAndLoss(contracts: readonly PnlContract[]): ProfitAndLoss {
  const lines: PnlLine[] = [];
  for (const contract of contracts) {
    if (!Number.isSafeInteger(contract.priceLamports) || contract.priceLamports < 0)
      throw new Error(`${contract.label}: price must be a non-negative safe integer`);
    const price = BigInt(contract.priceLamports);
    if (contract.role === "revenue") {
      // Revenue is earned only when the parent escrow settles to the agent.
      if (contract.status === "settled")
        lines.push({ label: contract.label, lamports: price, kind: "revenue" });
      continue;
    }
    if (contract.status === "draft") continue;
    lines.push({ label: contract.label, lamports: -price, kind: "cost" });
    if (REFUNDED.has(contract.status))
      lines.push({ label: `${contract.label} · escrow refund`, lamports: price, kind: "refund" });
  }
  const totalLamports = lines.reduce((sum, line) => sum + line.lamports, 0n);
  const refundedLamports = lines
    .filter((line) => line.kind === "refund")
    .reduce((sum, line) => sum + line.lamports, 0n);
  return {
    lines,
    totalLamports,
    refundedLamports,
    withoutRefundsLamports: totalLamports - refundedLamports
  };
}
