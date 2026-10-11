import anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { ActiveEscrowError, DemoChain } from "./chain.ts";

const address = (byte: number) => new PublicKey(new Uint8Array(32).fill(byte));

function setup(balances: number[]) {
  const chain = new DemoChain();
  chain.parent = address(1);
  chain.child = address(2);
  chain.contract = address(3);
  chain.second = address(4);
  chain.stage = 4;
  chain.nonces = [[1, 2, 3]];
  const fetchNullable = vi.fn((key: PublicKey) =>
    Promise.resolve({
      escrowLamports: new anchor.BN(balances[(key.toBytes()[0] ?? 0) - 1] ?? 0)
    })
  );
  chain.program = {
    account: { workContract: { fetchNullable } }
  } as unknown as DemoChain["program"];
  const topUp = vi.spyOn(chain, "topUpWallets").mockResolvedValue();
  return { chain, fetchNullable, topUp };
}

describe("reset escrow guard", () => {
  it.each([0, 1, 2, 3])("preserves the run when contract %i still holds escrow", async (index) => {
    const balances = [0, 0, 0, 0];
    balances[index] = 5_000_000;
    const { chain, topUp } = setup(balances);
    const before = {
      run: chain.run,
      stage: chain.stage,
      parent: chain.parent,
      nonces: chain.nonces
    };
    await expect(chain.reset()).rejects.toBeInstanceOf(ActiveEscrowError);
    expect(chain).toMatchObject(before);
    expect(chain.nonces).toBe(before.nonces);
    expect(topUp).not.toHaveBeenCalled();
  });

  it("permits initial setup and runs whose escrow has all been released", async () => {
    await expect(new DemoChain().assertResetAllowed()).resolves.toBeUndefined();
    const { chain, fetchNullable } = setup([0, 0, 0, 0]);
    await expect(chain.assertResetAllowed()).resolves.toBeUndefined();
    expect(fetchNullable).toHaveBeenCalledTimes(4);
  });

  it("lets a localnet run that missed an on-chain window be abandoned, but not on devnet", async () => {
    const { chain } = setup([5_000_000, 0, 0, 0]);
    expect(chain.unrecoverable("Window closed.").message).toContain("Start a fresh run");
    await expect(chain.assertResetAllowed()).resolves.toBeUndefined();
    chain.cluster = "devnet";
    await expect(chain.assertResetAllowed()).rejects.toBeInstanceOf(ActiveEscrowError);
  });

  it("fails closed on an RPC error without replacing vote secrets", async () => {
    const { chain, fetchNullable, topUp } = setup([0, 0, 0, 0]);
    fetchNullable.mockRejectedValueOnce(new Error("RPC unavailable"));
    const nonces = chain.nonces;
    await expect(chain.reset()).rejects.toThrow("RPC unavailable");
    expect(chain.nonces).toBe(nonces);
    expect(topUp).not.toHaveBeenCalled();
  });
});
