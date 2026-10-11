export type Cluster = "localnet" | "devnet";

/** Devnet's genesis hash. Checked at startup so a mislabeled RPC URL cannot reach mainnet. */
export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

/** Resolves the demo cluster from SOLANA_CLUSTER, or from the RPC host when unset. */
export function resolveCluster(rpcUrl: string, declared?: string): Cluster {
  let host: string;
  try {
    host = new URL(rpcUrl).hostname;
  } catch {
    throw new Error("SOLANA_RPC_URL is not a valid URL.");
  }
  if (/mainnet/i.test(rpcUrl) || (declared && /mainnet/i.test(declared)))
    throw new Error("Mainnet is not supported. Use localnet or devnet.");
  const local = host === "127.0.0.1" || host === "localhost";
  const cluster = declared || (local ? "localnet" : /devnet/i.test(host) ? "devnet" : undefined);
  if (cluster !== "localnet" && cluster !== "devnet")
    throw new Error("Set SOLANA_CLUSTER to localnet or devnet for this SOLANA_RPC_URL.");
  if ((cluster === "localnet") !== local)
    throw new Error(
      `SOLANA_CLUSTER=${cluster} does not match the SOLANA_RPC_URL host (${host}). Localnet must use 127.0.0.1 or localhost.`
    );
  return cluster;
}

// Localnet confirms in well under a slot, so short windows keep the full run near one
// minute. Devnet confirmations take seconds, so every window gets more slots.
export const TIMING: Readonly<
  Record<
    Cluster,
    {
      readonly firstJobDeadlineSlots: number;
      readonly secondJobDeadlineSlots: number;
      readonly commitWindowSlots: number;
      readonly revealWindowSlots: number;
    }
  >
> = {
  localnet: {
    firstJobDeadlineSlots: 20,
    secondJobDeadlineSlots: 1_000,
    commitWindowSlots: 35,
    revealWindowSlots: 70
  },
  devnet: {
    firstJobDeadlineSlots: 90,
    secondJobDeadlineSlots: 1_500,
    commitWindowSlots: 150,
    revealWindowSlots: 300
  }
};

// Localnet wallets are airdropped. Devnet's faucet is rate-limited, so one pre-funded
// owner wallet tops up the disposable wallets by transfer instead.
export const FUNDING = {
  localnet: { minLamports: 500_000_000, topUpLamports: 2_000_000_000 },
  devnet: { minLamports: 30_000_000, topUpLamports: 60_000_000, ownerReserveLamports: 150_000_000 }
} as const;

/**
 * A Solana Explorer link. Localnet uses Explorer's custom-cluster mode. Devnet always
 * uses Explorer's public endpoint, so a private RPC URL (which may embed an API key)
 * never appears in a link.
 */
export function explorerUrl(
  kind: "tx" | "address",
  value: string,
  cluster: Cluster,
  rpcUrl: string
): string {
  const query =
    cluster === "devnet"
      ? "cluster=devnet"
      : `cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;
  return `https://explorer.solana.com/${kind}/${encodeURIComponent(value)}?${query}`;
}
