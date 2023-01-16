import { option } from "fp-ts";
import { Option } from "fp-ts/Option";
import { timestampToHash } from "./timestamp.js";
import { MerkleTree, Millis, Timestamp, TimestampHash } from "./types.js";

// DebugMerkleTree
// export const createInitialMerkleTree = (): MerkleTree => ({});
// export const insertIntoMerkleTree =
//   (timestamp: Timestamp) =>
//   (tree: MerkleTree): MerkleTree => {
//     // if (tree.test && tree.test.includes(timestampToString(timestamp)))
//     //   return tree;
//     const t = tree.test || [];
//     return {
//       test: [...t, timestampToString(timestamp)],
//     };
//   };
// export const diffMerkleTrees = (
//   tree1: MerkleTree,
//   tree2: MerkleTree
// ): Option<Millis> => {
//   const a = [...(tree1.test || [])].sort();
//   const b = [...(tree2.test || [])].sort();
//   if (JSON.stringify(a) === JSON.stringify(b)) return option.none;
//   return option.some(0 as Millis);
// };

export const createInitialMerkleTree = (): MerkleTree => ({});

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
    // This is a quick way of converting the floating-point value to an integer (the bitwise
    // operators only work on 32-bit integers, so it causes the 64-bit float to be converted
    // to an integer). In this case, it ensures the base-3 encoded timestamp strings end up
    // looking like "1211121022121110" instead of "1211121022121110.11221000121012222".
    // https://github.com/jlongster/crdt-example-app/issues/3#issuecomment-599064327
    const key = Number((timestamp.millis / 1000 / 60) | 0).toString(3);
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
