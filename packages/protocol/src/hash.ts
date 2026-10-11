// Canonical JSON and SHA-256 roots. Kept in their own module, with no imports, so
// the verification checker's code root covers exactly the hashing it relies on.

export type HashHex = `sha256:${string}`;

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortForCanonicalJson(value));
}

export function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bytesFromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex)) throw new Error("Malformed hex string");
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

export async function sha256Bytes(bytes: Uint8Array<ArrayBuffer>): Promise<HashHex> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${hexFromBytes(new Uint8Array(digest))}`;
}

export async function sha256Hex(value: string): Promise<HashHex> {
  return sha256Bytes(new TextEncoder().encode(value));
}

/** The 32 digest bytes of a root, as the program stores them. */
export function rootBytes(root: HashHex): Uint8Array<ArrayBuffer> {
  const hex = root.slice("sha256:".length);
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`Malformed root: ${root}`);
  return bytesFromHex(hex);
}

function sortForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortForCanonicalJson(item));
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      // Code-unit order (as in RFC 8785), never locale collation, so every runtime
      // and language computes the same roots.
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, sortForCanonicalJson(item)])
  );
}
