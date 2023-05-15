import * as Option from "@effect/data/Option";
import { timestampToHash } from "./Timestamp.js";
import {
  MerkleTree,
  MerkleTreeString,
  Millis,
  Timestamp,
  TimestampHash,
} from "./Types.js";

// Technically, it's not Merkle Tree but “merkleized” prefix tree (trie).
// https://decomposition.al/blog/2019/05/31/how-i-learned-about-merklix-trees-without-having-to-become-a-cryptocurrency-enthusiast/#fnref:1
// https://github.com/clintharris/crdt-example-app_annotated/blob/master/shared/merkle.js
// https://github.com/actualbudget/actual/discussions/257

export const merkleTreeToString = (m: MerkleTree): MerkleTreeString =>
  JSON.stringify(m) as MerkleTreeString;

export const unsafeMerkleTreeFromString = (m: MerkleTreeString): MerkleTree =>
  JSON.parse(m) as MerkleTree;

export const createInitialMerkleTree = (): MerkleTree => Object.create(null);

const timestampToKey = (timestamp: Timestamp): string =>
  Math.floor(timestamp.millis / 1000 / 60).toString(3);

const keyToTimestamp = (key: string): Millis =>
  (parseInt(key.padEnd(16, "0"), 3) * 1000 * 60) as Millis;

const insertKey = (
  tree: MerkleTree,
  key: string,
  hash: TimestampHash
): MerkleTree => {
  if (key.length === 0) return tree;
  const childKey = key[0] as "0" | "1" | "2";
  const child = tree[childKey] || {};
  return {
    ...tree,
    [childKey]: {
      ...child,
      ...insertKey(child, key.slice(1), hash),
      // @ts-expect-error undefined is OK
      hash: child.hash ^ hash,
    },
  };
};

export const insertIntoMerkleTree =
  (timestamp: Timestamp) =>
  (tree: MerkleTree): MerkleTree => {
    const key = timestampToKey(timestamp);
    const hash = timestampToHash(timestamp);
    // @ts-expect-error undefined is OK
    return insertKey({ ...tree, hash: tree.hash ^ hash }, key, hash);
  };

export const diffMerkleTrees = (
  tree1: MerkleTree,
  tree2: MerkleTree
): Option.Option<Millis> => {
  if (tree1.hash === tree2.hash) return Option.none();

  let node1 = tree1;
  let node2 = tree2;
  let key = "";

  // eslint-disable-next-line no-constant-condition
  while (1) {
    const keys = ["0", "1", "2"].filter(
      (k) => k in node1 || k in node2
    ) as ReadonlyArray<"0" | "1" | "2">;

    const diffKey = keys.find((key) => {
      const next1 = node1[key] || {};
      const next2 = node2[key] || {};
      return next1.hash !== next2.hash;
    });
    if (!diffKey) return Option.some(keyToTimestamp(key));

    key += diffKey;
    node1 = node1[diffKey] || {};
    node2 = node2[diffKey] || {};
  }

  // nenasel shodu, tak imho vracet 0, ale test na to
  // muze se to stat? pokud jsou empty, maji stejny hash
  // pokud to dojde sem, jsou jine a nikdy nebyly stejne
  // pokud ma jeden vlastni, druhej jine, co to udela? test!
  // nenajde
  return Option.some(123 as Millis);
};
