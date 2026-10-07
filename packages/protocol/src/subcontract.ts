function lamports(value: number, name: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return BigInt(value);
}

export function calculateAgentMarginLamports(
  parentRevenueLamports: number,
  childCostLamports: number,
  computeCostLamports: number
): bigint {
  const revenue = lamports(parentRevenueLamports, "parentRevenueLamports");
  const cost = lamports(childCostLamports, "childCostLamports");
  const computeCost = lamports(computeCostLamports, "computeCostLamports");
  if (cost === 0n || cost > revenue) {
    throw new Error("childCostLamports must be positive and no greater than parent revenue");
  }
  return revenue - cost - computeCost;
}
