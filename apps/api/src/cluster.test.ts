import { describe, expect, it } from "vitest";

import { TIMING, explorerUrl, resolveCluster } from "./cluster.ts";

describe("demo cluster selection", () => {
  it("infers localnet and devnet and honors an explicit SOLANA_CLUSTER", () => {
    expect(resolveCluster("http://127.0.0.1:8899")).toBe("localnet");
    expect(resolveCluster("https://api.devnet.solana.com")).toBe("devnet");
    expect(resolveCluster("https://rpc.example.com/key", "devnet")).toBe("devnet");
    expect(TIMING.devnet.commitWindowSlots).toBeGreaterThan(TIMING.localnet.commitWindowSlots);
    expect(TIMING.devnet.firstJobDeadlineSlots).toBeGreaterThan(
      TIMING.localnet.firstJobDeadlineSlots
    );
  });

  it("refuses mainnet, unknown hosts, and mismatched declarations", () => {
    expect(() => resolveCluster("https://api.mainnet-beta.solana.com")).toThrow("Mainnet");
    expect(() => resolveCluster("http://127.0.0.1:8899", "mainnet-beta")).toThrow("Mainnet");
    expect(() => resolveCluster("https://rpc.example.com")).toThrow("SOLANA_CLUSTER");
    expect(() => resolveCluster("https://api.devnet.solana.com", "localnet")).toThrow(
      "does not match"
    );
    expect(() => resolveCluster("http://127.0.0.1:8899", "devnet")).toThrow("does not match");
    expect(() => resolveCluster("not a url")).toThrow("valid URL");
  });

  it("links devnet receipts without exposing a private RPC URL", () => {
    expect(explorerUrl("tx", "abc", "devnet", "https://rpc.example.com/?api-key=secret")).toBe(
      "https://explorer.solana.com/tx/abc?cluster=devnet"
    );
    expect(explorerUrl("address", "def", "localnet", "http://127.0.0.1:8899")).toBe(
      "https://explorer.solana.com/address/def?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899"
    );
  });
});
