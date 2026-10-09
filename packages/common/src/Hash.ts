/**
 * Non-cryptographic hashing.
 *
 * @module
 */

/**
 * Computes the 32-bit FNV-1a hash of bytes.
 *
 * FNV-1a is fast and deterministic, so it suits hash tables, bucketing, and
 * fingerprints that detect accidental changes. It is not collision resistant:
 * different bytes with the same hash are easy to construct, so never use it for
 * integrity, authentication, or deduplication that trusts the hash alone; use
 * `sha256` from `@noble/hashes` for those.
 *
 * Pass a previous result as `hash` to continue hashing, so hashing several
 * arrays in turn equals hashing their concatenation.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual, fnv1a32, utf8ToBytes } from "@evolu/common";
 *
 * assertEqual(fnv1a32(utf8ToBytes("")), 0x811c9dc5);
 * assertEqual(fnv1a32(utf8ToBytes("foobar")), 0xbf9cf968);
 * assertEqual(
 *   fnv1a32(utf8ToBytes("bar"), fnv1a32(utf8ToBytes("foo"))),
 *   fnv1a32(utf8ToBytes("foobar")),
 * );
 * ```
 */
export const fnv1a32 = (bytes: Uint8Array, hash = 0x811c9dc5): number => {
  for (let index = 0; index < bytes.length; index++) {
    hash = Math.imul(hash ^ bytes[index], 0x01000193);
  }
  return hash >>> 0;
};
