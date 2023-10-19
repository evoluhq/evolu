import { Brand, Option } from "effect";
import {
  Millis,
  Timestamp,
  TimestampHash,
  timestampToHash,
} from "./Timestamp.js";

// Technically, it's not Merkle Tree but “merkleized” prefix tree (trie)
// aka merkle radix trie.
// https://decomposition.al/blog/2019/05/31/how-i-learned-about-merklix-trees-without-having-to-become-a-cryptocurrency-enthusiast/#fnref:1

export interface MerkleTree {
  readonly hash?: TimestampHash;
  readonly "0"?: MerkleTree;
  readonly "1"?: MerkleTree;
  readonly "2"?: MerkleTree;
}

export type MerkleTreeString = string & Brand.Brand<"MerkleTreeString">;

export const initialMerkleTree = Object.create(null) as MerkleTree;

const timestampToKey = (timestamp: Timestamp): string =>
  Math.floor(timestamp.millis / 1000 / 60).toString(3);

// The internal function [ToInt32] is called on all operands for all bitwise
// operators. ToInt32(undefined) === 0.
// https://es5.github.io/#x9.5
const xorTimestampHashes = (
  a: TimestampHash | undefined,
  b: TimestampHash,
): TimestampHash => ((a || 0) ^ b) as TimestampHash;

const insertKey = (
  tree: MerkleTree,
  key: string,
  hash: TimestampHash,
): MerkleTree => {
  if (key.length === 0) return tree;
  const childKey = key[0] as "0" | "1" | "2";
  const child = tree[childKey] || {};
  return {
    ...tree,
    [childKey]: {
      ...child,
      ...insertKey(child, key.slice(1), hash),
      hash: xorTimestampHashes(child.hash, hash),
    },
  };
};

export const insertIntoMerkleTree =
  (timestamp: Timestamp) =>
  (tree: MerkleTree): MerkleTree => {
    const key = timestampToKey(timestamp);
    const hash = timestampToHash(timestamp);
    return insertKey(
      { ...tree, hash: xorTimestampHashes(tree.hash, hash) },
      key,
      hash,
    );
  };

const keyToTimestamp = (key: string): Millis =>
  (parseInt(key.length > 0 ? key : "0", 3) * 1000 * 60) as Millis;

export const diffMerkleTrees = (
  tree1: MerkleTree,
  tree2: MerkleTree,
): Option.Option<Millis> => {
  if (tree1.hash === tree2.hash) return Option.none();
  for1: for (let node1 = tree1, node2 = tree2, key = ""; ; ) {
    for (const k of ["0", "1", "2"] as const) {
      const next1 = node1[k];
      const next2 = node2[k];
      if (!next1 && !next2) continue;
      if (!next1 || !next2) break;
      if (next1.hash !== next2.hash) {
        key += k;
        node1 = next1;
        node2 = next2;
        continue for1;
      }
    }
    return Option.some(keyToTimestamp(key));
  }
};

export const merkleTreeToString = (m: MerkleTree): MerkleTreeString =>
  JSON.stringify(m) as MerkleTreeString;

export const unsafeMerkleTreeFromString = (m: MerkleTreeString): MerkleTree =>
  JSON.parse(m) as MerkleTree;
