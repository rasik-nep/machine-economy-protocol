import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  ReceiptReplayGuard,
  signReceipt,
  verifyReceipt,
  type ReceiptBody,
  type ReceiptExpectation
} from "../src/receipt.ts";

// Disposable keys generated per test run; never funded, never persisted.
const provider = Keypair.generate();
const stranger = Keypair.generate();
const CONTRACT = "contract-address-1";
const RESULT_ROOT = `sha256:${"ab".repeat(32)}` as const;

const body: ReceiptBody = {
  kind: "mep.receipt.v1",
  signerRole: "provider",
  signer: provider.publicKey.toBase58(),
  contract: CONTRACT,
  sequence: 0,
  modelInstance: "instance-address",
  requestHash: `sha256:${"cd".repeat(32)}`,
  resultRoot: RESULT_ROOT,
  startedAt: 1_791_130_000_000,
  finishedAt: 1_791_130_042_000,
  tokensIn: 5_132,
  tokensOut: 1_201,
  hardwareClaim: "simulated demo daemon"
};

const expected: ReceiptExpectation = {
  contract: CONTRACT,
  role: "provider",
  signer: { address: provider.publicKey.toBase58(), publicKey: provider.publicKey.toBytes() },
  resultRoot: RESULT_ROOT
};

describe("portable signed receipts", () => {
  it("verifies a provider receipt without the chain", async () => {
    const receipt = await signReceipt(body, provider.secretKey);
    expect(receipt.signature).toMatch(/^ed25519:[0-9a-f]{128}$/);
    expect(await verifyReceipt(receipt, expected, new ReceiptReplayGuard())).toEqual(receipt);
  });

  it("rejects a signer that is not the contract's provider authority", async () => {
    const strangerReceipt = await signReceipt(
      { ...body, signer: stranger.publicKey.toBase58() },
      stranger.secretKey
    );
    await expect(
      verifyReceipt(strangerReceipt, expected, new ReceiptReplayGuard())
    ).rejects.toThrow("not the contract's provider authority");
    // Claiming the provider's address does not help: the signature is not the provider's.
    const impersonation = await signReceipt(body, stranger.secretKey);
    await expect(verifyReceipt(impersonation, expected, new ReceiptReplayGuard())).rejects.toThrow(
      "signature is invalid"
    );
  });

  it("rejects a valid receipt from another contract", async () => {
    const other = await signReceipt(
      { ...body, contract: "contract-address-2" },
      provider.secretKey
    );
    await expect(verifyReceipt(other, expected, new ReceiptReplayGuard())).rejects.toThrow(
      "another contract"
    );
  });

  it("rejects a replayed receipt and a reused sequence number", async () => {
    const guard = new ReceiptReplayGuard();
    const receipt = await signReceipt(body, provider.secretKey);
    await verifyReceipt(receipt, expected, guard);
    await expect(verifyReceipt(receipt, expected, guard)).rejects.toThrow("Receipt replay");
    const reused = await signReceipt(
      { ...body, finishedAt: body.finishedAt + 1 },
      provider.secretKey
    );
    await expect(verifyReceipt(reused, expected, guard)).rejects.toThrow("Receipt replay");
    const next = await signReceipt({ ...body, sequence: 1 }, provider.secretKey);
    await expect(verifyReceipt(next, expected, guard)).resolves.toEqual(next);
  });

  it("breaks the signature when any field is tampered with", async () => {
    const receipt = await signReceipt(body, provider.secretKey);
    for (const tampered of [
      { ...receipt, tokensOut: receipt.tokensOut + 1 },
      { ...receipt, hardwareClaim: "H100 attested" },
      { ...receipt, requestHash: `sha256:${"ee".repeat(32)}` },
      { ...receipt, startedAt: receipt.startedAt - 1 }
    ])
      await expect(verifyReceipt(tampered, expected, new ReceiptReplayGuard())).rejects.toThrow(
        "signature is invalid"
      );
    // A receipt for a different result root, even correctly signed, does not bind this one.
    const otherResult = await signReceipt(
      { ...body, resultRoot: `sha256:${"99".repeat(32)}` },
      provider.secretKey
    );
    await expect(verifyReceipt(otherResult, expected, new ReceiptReplayGuard())).rejects.toThrow(
      "result root"
    );
  });

  it("never accepts an observer receipt as a provider receipt", async () => {
    // Even signed with the provider authority's own key, an observer receipt is an
    // observation, not the host's signature.
    const observed = await signReceipt({ ...body, signerRole: "observer" }, provider.secretKey);
    await expect(verifyReceipt(observed, expected, new ReceiptReplayGuard())).rejects.toThrow(
      "observer-signed; a provider-signed receipt is required"
    );
    const observer = Keypair.generate();
    const asObserver = await signReceipt(
      { ...body, signerRole: "observer", signer: observer.publicKey.toBase58() },
      observer.secretKey
    );
    await expect(
      verifyReceipt(
        asObserver,
        {
          ...expected,
          role: "observer",
          signer: {
            address: observer.publicKey.toBase58(),
            publicKey: observer.publicKey.toBytes()
          }
        },
        new ReceiptReplayGuard()
      )
    ).resolves.toMatchObject({ signerRole: "observer" });
  });

  it("rejects malformed receipts before checking signatures", async () => {
    const receipt = await signReceipt(body, provider.secretKey);
    await expect(
      verifyReceipt({ ...receipt, sequence: -1 }, expected, new ReceiptReplayGuard())
    ).rejects.toThrow("Malformed receipt: sequence");
    await expect(
      verifyReceipt({ ...receipt, extra: true }, expected, new ReceiptReplayGuard())
    ).rejects.toThrow("unexpected extra");
    await expect(
      verifyReceipt(
        { ...receipt, finishedAt: receipt.startedAt - 1 },
        expected,
        new ReceiptReplayGuard()
      )
    ).rejects.toThrow("finishedAt");
    await expect(signReceipt(body, provider.secretKey.slice(0, 32))).rejects.toThrow("64-byte");
  });
});
