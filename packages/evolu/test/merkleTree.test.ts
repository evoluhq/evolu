import { pipe } from "fp-ts/lib/function.js";
import { expect, test } from "vitest";
import {
  createInitialMerkleTree,
  diffMerkleTrees,
  insertIntoMerkleTree,
} from "../src/merkleTree.js";
import { createNode1Timestamp } from "./testUtils.js";

const initialMerkleTree = createInitialMerkleTree();

test("createInitialMerkleTree", () => {
  expect(initialMerkleTree).toMatchSnapshot();
});

test("insertIntoMerkleTree", () => {
  const ts1 = createNode1Timestamp();
  const ts2 = createNode1Timestamp(1656873738591);

  expect(insertIntoMerkleTree(ts1)(initialMerkleTree)).toMatchSnapshot();
  expect(insertIntoMerkleTree(ts2)(initialMerkleTree)).toMatchSnapshot();
  expect(
    pipe(
      initialMerkleTree,
      insertIntoMerkleTree(ts1),
      insertIntoMerkleTree(ts2)
    )
  ).toMatchSnapshot();

  expect(
    pipe(
      initialMerkleTree,
      insertIntoMerkleTree(ts1),
      insertIntoMerkleTree(ts2)
    )
  ).toEqual(
    pipe(
      initialMerkleTree,
      insertIntoMerkleTree(ts2),
      insertIntoMerkleTree(ts1)
    )
  );
});

test("diffMerkleTrees", () => {
  expect(
    diffMerkleTrees(initialMerkleTree, initialMerkleTree)
  ).toMatchSnapshot();

  const ts = createNode1Timestamp(1656873738591);
  const mt = pipe(initialMerkleTree, insertIntoMerkleTree(ts));

  expect(diffMerkleTrees(initialMerkleTree, mt)).toMatchSnapshot();

  expect(diffMerkleTrees(initialMerkleTree, mt)).toEqual(
    diffMerkleTrees(mt, initialMerkleTree)
  );
});

// TODO: Add more tests.
// Check https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/server/merkle.test.js
