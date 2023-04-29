import { pipe } from "@effect/data/Function";
import arrayShuffle from "array-shuffle";
import { expect, test } from "vitest";
import {
  createInitialMerkleTree,
  diffMerkleTrees,
  insertIntoMerkleTree,
} from "../src/_merkleTree.js";
import { unsafeTimestampFromString } from "../src/_Timestamp.js";
import { MerkleTree, TimestampString } from "../src/Types.js";
import { messages1 } from "./fixtures/messages.js";
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

test("createMerkleWithRandomOrder", () => {
  const createMerkleWithRandomOrder = (): MerkleTree =>
    arrayShuffle(messages1).reduce((a, b) => {
      const t = unsafeTimestampFromString(b[0] as TimestampString);
      return insertIntoMerkleTree(t)(a);
    }, initialMerkleTree);

  const merkle1 = createMerkleWithRandomOrder();
  const merkle2 = createMerkleWithRandomOrder();
  const merkle3 = createMerkleWithRandomOrder();
  const merkle4 = createMerkleWithRandomOrder();

  expect(merkle1).toEqual(merkle2);
  expect(merkle2).toEqual(merkle3);
  expect(merkle3).toEqual(merkle4);
  // expect(merkle4).toEqual({"1":{"2":{"2":{"1":{"1":{"1":{"1":{"0":{"2":{"0":{"1":{"2":{"2":{"0":{"2":{"1":{"hash":-169010333},"2":{"hash":649112122},"hash":-748834471},"hash":-748834471},"1":{"1":{"0":{"hash":377944043},"1":{"hash":1147783348},"2":{"hash":1525152929},"hash":134792190},"2":{"0":{"hash":1577275680},"1":{"hash":-1480497077},"hash":-104711829},"hash":-238355819},"hash":580340684},"hash":580340684},"hash":580340684},"2":{"0":{"1":{"0":{"1":{"0":{"hash":-465261924},"1":{"hash":133164022},"2":{"hash":1218159491},"hash":-1422859543},"2":{"0":{"hash":-1823882561},"1":{"hash":-1646835198},"2":{"hash":632792653},"hash":724119280},"hash":-2145792999},"hash":-2145792999},"hash":-2145792999},"hash":-2145792999},"hash":-1567717419},"2":{"0":{"0":{"1":{"1":{"2":{"1":{"hash":1517528758},"hash":1517528758},"hash":1517528758},"hash":1517528758},"hash":1517528758},"1":{"1":{"0":{"2":{"1":{"hash":-754797806},"2":{"hash":-637106273},"hash":151270541},"hash":151270541},"1":{"0":{"1":{"hash":-1067287288},"2":{"hash":179247386},"hash":-892509166},"hash":-892509166},"2":{"1":{"1":{"hash":-1625930593},"hash":-1625930593},"hash":-1625930593},"hash":1558123520},"2":{"1":{"0":{"0":{"hash":1488646040},"hash":1488646040},"1":{"1":{"hash":-658882256},"2":{"hash":-155236997},"hash":772080715},"hash":1992289235},"hash":1992289235},"hash":711000019},"2":{"0":{"2":{"0":{"1":{"hash":1304081394},"hash":1304081394},"1":{"0":{"hash":834544378},"hash":834544378},"hash":2080674056},"hash":2080674056},"1":{"0":{"2":{"2":{"hash":-157334036},"hash":-157334036},"hash":-157334036},"1":{"0":{"0":{"hash":-1060685951},"1":{"hash":870880093},"hash":-214981412},"hash":-214981412},"hash":95478064},"hash":2041868344},"hash":161950045},"hash":161950045},"hash":-1423331704},"hash":-1423331704},"hash":-1423331704},"hash":-1423331704},"hash":-1423331704},"hash":-1423331704},"hash":-1423331704},"hash":-1423331704},"hash":-1423331704},"hash":-1423331704})
});
