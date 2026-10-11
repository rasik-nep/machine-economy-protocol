import { bytesFromHex, canonicalize, hexFromBytes, type HashHex } from "./hash.ts";

// Portable execution receipts (whitepaper §27). A receipt binds one job's details to
// a signature that anyone can check without the chain.
//
// - "provider": signed with the provider authority key recorded on the contract.
//   The demo daemon simulates the provider, so in fixture mode it signs as one.
// - "observer": a party that called a third-party host signs what it observed. It
//   is that observer's statement, never the host's, and never counts as one.

export type ReceiptSignerRole = "provider" | "observer";

export type ReceiptBody = {
  readonly kind: "mep.receipt.v1";
  readonly signerRole: ReceiptSignerRole;
  /** Base58 address of the signing key. */
  readonly signer: string;
  readonly contract: string;
  /** Per contract and signer. With the contract address it makes every receipt single-use. */
  readonly sequence: number;
  readonly modelInstance: string;
  readonly requestHash: HashHex;
  readonly resultRoot: HashHex;
  /** Unix milliseconds. */
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  /** What the signer claims about hardware. Recorded, never verified here. */
  readonly hardwareClaim: string;
};

export type ExecutionReceipt = ReceiptBody & { readonly signature: `ed25519:${string}` };

/** A public key with the address it was decoded from, as read from the chain. */
export type SignerKey = { readonly address: string; readonly publicKey: Uint8Array };

export type ReceiptExpectation = {
  readonly contract: string;
  readonly role: ReceiptSignerRole;
  /** For "provider", the contract's provider_authority. For "observer", the observer's key. */
  readonly signer: SignerKey;
  /** The result root the provider committed on-chain. */
  readonly resultRoot: HashHex;
};

const DOMAIN = "mep.receipt.v1\n";

export function receiptMessage(body: ReceiptBody): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(DOMAIN + canonicalize(body));
}

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Signs with a 64-byte Solana keypair secret (32-byte seed followed by the public key). */
export async function signReceipt(
  body: ReceiptBody,
  secretKey: Uint8Array
): Promise<ExecutionReceipt> {
  if (secretKey.length !== 64) throw new Error("Expected a 64-byte Ed25519 keypair secret");
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "OKP",
      crv: "Ed25519",
      d: base64Url(secretKey.slice(0, 32)),
      x: base64Url(secretKey.slice(32))
    },
    { name: "Ed25519" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, key, receiptMessage(body));
  return { ...body, signature: `ed25519:${hexFromBytes(new Uint8Array(signature))}` };
}

/** Rejects a receipt seen before, by its contract, signer, and sequence number. */
export class ReceiptReplayGuard {
  private readonly seen = new Set<string>();
  /** Throws if the receipt was already claimed, without claiming it. */
  assertUnused(receipt: ExecutionReceipt) {
    if (this.seen.has(this.key(receipt)))
      throw new Error(
        `Receipt replay: sequence ${String(receipt.sequence)} was already used for this contract`
      );
  }
  claim(receipt: ExecutionReceipt) {
    this.assertUnused(receipt);
    this.seen.add(this.key(receipt));
  }
  private key(receipt: ExecutionReceipt) {
    return `${receipt.contract}:${receipt.signer}:${String(receipt.sequence)}`;
  }
}

const isCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;

function parseReceipt(value: unknown): ExecutionReceipt {
  if (value === null || typeof value !== "object") throw new Error("Receipt is not an object");
  const r = value as Record<string, unknown>;
  const fields: [string, boolean][] = [
    ["kind", r.kind === "mep.receipt.v1"],
    ["signerRole", r.signerRole === "provider" || r.signerRole === "observer"],
    ["signer", typeof r.signer === "string" && r.signer !== ""],
    ["contract", typeof r.contract === "string" && r.contract !== ""],
    ["sequence", isCount(r.sequence)],
    ["modelInstance", typeof r.modelInstance === "string"],
    [
      "requestHash",
      typeof r.requestHash === "string" && /^sha256:[0-9a-f]{64}$/.test(r.requestHash)
    ],
    ["resultRoot", typeof r.resultRoot === "string" && /^sha256:[0-9a-f]{64}$/.test(r.resultRoot)],
    ["startedAt", isCount(r.startedAt)],
    ["finishedAt", isCount(r.finishedAt) && (r.finishedAt as number) >= (r.startedAt as number)],
    ["tokensIn", isCount(r.tokensIn)],
    ["tokensOut", isCount(r.tokensOut)],
    ["hardwareClaim", typeof r.hardwareClaim === "string"],
    ["signature", typeof r.signature === "string" && /^ed25519:[0-9a-f]{128}$/.test(r.signature)]
  ];
  const invalid = fields.filter(([, ok]) => !ok).map(([name]) => name);
  const known = new Set(fields.map(([name]) => name));
  const extra = Object.keys(r).filter((key) => !known.has(key));
  if (invalid.length || extra.length)
    throw new Error(
      `Malformed receipt: ${[...invalid, ...extra.map((k) => `unexpected ${k}`)].join(", ")}`
    );
  return value as ExecutionReceipt;
}

/**
 * Checks a receipt before any scoring: its role, signer, contract, signature, and
 * result root, then claims it in the replay guard. Returns the typed receipt.
 */
export async function verifyReceipt(
  value: unknown,
  expected: ReceiptExpectation,
  guard: Pick<ReceiptReplayGuard, "claim">
): Promise<ExecutionReceipt> {
  const receipt = parseReceipt(value);
  if (receipt.signerRole !== expected.role)
    throw new Error(
      `Receipt is ${receipt.signerRole}-signed; a ${expected.role}-signed receipt is required`
    );
  if (receipt.signer !== expected.signer.address)
    throw new Error(
      expected.role === "provider"
        ? "Receipt signer is not the contract's provider authority"
        : "Receipt signer is not the expected observer"
    );
  if (receipt.contract !== expected.contract) throw new Error("Receipt is for another contract");
  const { signature, ...body } = receipt;
  if (expected.signer.publicKey.length !== 32)
    throw new Error("Signer public key must be 32 bytes");
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(expected.signer.publicKey),
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    bytesFromHex(signature.slice("ed25519:".length)),
    receiptMessage(body)
  );
  if (!valid) throw new Error("Receipt signature is invalid");
  if (receipt.resultRoot !== expected.resultRoot)
    throw new Error("Receipt result root differs from the on-chain result root");
  guard.claim(receipt);
  return receipt;
}
