import type { Brand } from "@effect/data/Brand";
import { option } from "fp-ts";
import { Option } from "fp-ts/lib/Option.js";
import {
  Millis,
  Timestamp,
  TimestampHash,
  timestampToHash,
} from "./timestamp.js";

// TODO: Add Schema and use it in Evolu Server.
export interface MerkleTree {
  readonly hash?: TimestampHash;
  readonly "0"?: MerkleTree;
  readonly "1"?: MerkleTree;
  readonly "2"?: MerkleTree;
}

export type MerkleTreeString = string & Brand<"MerkleTreeString">;

export const merkleTreeToString = (m: MerkleTree): MerkleTreeString =>
  JSON.stringify(m) as MerkleTreeString;

export const merkleTreeFromString = (m: MerkleTreeString): MerkleTree =>
  JSON.parse(m) as MerkleTree;

export const createInitialMerkleTree = (): MerkleTree => Object.create(null);

const insertKey = ({
  tree,
  key,
  hash,
}: {
  readonly tree: MerkleTree;
  readonly key: string;
  readonly hash: TimestampHash;
}): MerkleTree => {
  if (key.length === 0) return tree;
  const c = key[0] as "0" | "1" | "2";
  const n = tree[c] || {};
  return {
    ...tree,
    [c]: {
      ...n,
      ...insertKey({ tree: n, key: key.slice(1), hash }),
      // @ts-expect-error undefined is OK
      hash: n.hash ^ hash,
    },
  };
};

export const insertIntoMerkleTree =
  (timestamp: Timestamp) =>
  (tree: MerkleTree): MerkleTree => {
    const key = Number(Math.floor(timestamp.millis / 1000 / 60)).toString(3);
    const hash = timestampToHash(timestamp);
    return insertKey({
      tree: {
        ...tree,
        // @ts-expect-error undefined is OK
        hash: (tree.hash ^ hash) as TimestampHash,
      },
      key,
      hash,
    });
  };

const getKeys = (tree: MerkleTree): readonly ("0" | "1" | "2")[] =>
  Object.keys(tree).filter((x) => x !== "hash") as readonly ("0" | "1" | "2")[];

const keyToTimestamp = (key: string): Millis => {
  // 16 is the length of the base 3 value of the current time in
  // minutes. Ensure it's padded to create the full value.
  const fullkey = key + "0".repeat(16 - key.length);
  // Parse the base 3 representation.
  return (parseInt(fullkey, 3) * 1000 * 60) as Millis;
};

export const diffMerkleTrees = (
  tree1: MerkleTree,
  tree2: MerkleTree
): Option<Millis> => {
  if (tree1.hash === tree2.hash) return option.none;

  let node1 = tree1;
  let node2 = tree2;
  let k = "";

  // eslint-disable-next-line no-constant-condition
  while (1) {
    const keyset = new Set([...getKeys(node1), ...getKeys(node2)]);
    const keys = Array.from(keyset).sort();
    const diffkey = keys.find((key) => {
      const next1 = node1[key] || {};
      const next2 = node2[key] || {};
      return next1.hash !== next2.hash;
    });
    if (!diffkey) return option.some(keyToTimestamp(k));
    k += diffkey;
    node1 = node1[diffkey] || {};
    node2 = node2[diffkey] || {};
  }

  return option.none;
};
