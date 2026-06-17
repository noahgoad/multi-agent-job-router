import { keccak256, stringToBytes, toHex, type Hex } from "viem";

/**
 * Deterministic hashing helpers.
 *
 * The router never signs, persists, or compares a workflow object
 * without first computing a content hash. The hash is used to anchor
 * the assignment and the terminal job receipt on Pharos.
 *
 * - `canonicalJson` produces a deterministic JSON string with sorted
 *   keys and stable number encoding.
 * - `contentHash` is keccak256 of the canonical JSON, hex-encoded.
 * - `combineHashes` is a left-folded keccak used to fold many fields
 *   into a single root hash (e.g., for the DAG root).
 */

export type Hash = `0x${string}`;

const ZERO_HASH: Hash = ("0x" + "00".repeat(32)) as Hash;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value), replacer);
}

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = sortValue(obj[k]);
    }
    return out;
  }
  return v;
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return { __bigint: value.toString() };
  }
  return value;
}

export function contentHash(value: unknown): Hash {
  const json = canonicalJson(value);
  return keccak256(stringToBytes(json));
}

export function hashString(input: string): Hash {
  return keccak256(stringToBytes(input));
}

export function hashHex(input: Hex): Hash {
  return keccak256(input);
}

export function combineHashes(...hashes: ReadonlyArray<Hash>): Hash {
  if (hashes.length === 0) return ZERO_HASH;
  const concat = hashes.map((h) => h.slice(2)).join("");
  return keccak256(("0x" + concat) as Hex);
}

export function toHashString(input: string | bigint | number): Hash {
  if (typeof input === "bigint") return toHex(input) as Hash;
  if (typeof input === "number") return toHex(BigInt(input)) as Hash;
  return toHex(stringToBytes(input)) as Hash;
}