import { pipe } from "@effect/data/Function";
import arrayShuffle from "array-shuffle";
import { expect, test, describe } from "vitest";
import {
  createInitialMerkleTree,
  diffMerkleTrees,
  insertIntoMerkleTree,
} from "../src/MerkleTree.js";
import { unsafeTimestampFromString } from "../src/Timestamp.js";
import { MerkleTree, TimestampString } from "../src/Types.js";
import { messages1 } from "./fixtures/messages.js";
import { createNode1Timestamp, createNode2Timestamp } from "./testUtils.js";

const initialMerkleTree = createInitialMerkleTree();
const ts1 = createNode1Timestamp();
const ts2 = createNode2Timestamp(1656873738591);
const mt1 = pipe(initialMerkleTree, insertIntoMerkleTree(ts2));

test("createInitialMerkleTree", () => {
  expect(initialMerkleTree).toMatchInlineSnapshot("{}");
});

describe("insertIntoMerkleTree", () => {
  test("ts1", () => {
    expect(insertIntoMerkleTree(ts1)(initialMerkleTree)).toMatchInlineSnapshot(`
      {
        "0": {
          "hash": -1416139081,
        },
        "hash": -1416139081,
      }
    `);
  });

  test("ts2", () => {
    expect(insertIntoMerkleTree(ts2)(initialMerkleTree)).toMatchSnapshot();
  });

  test("ts1 then ts2", () => {
    expect(
      pipe(
        initialMerkleTree,
        insertIntoMerkleTree(ts1),
        insertIntoMerkleTree(ts2)
      )
    ).toMatchSnapshot();
  });

  test("the order does not matter", () => {
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

  test("random order", () => {
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
  });
});

describe("diffMerkleTrees", () => {
  test("diff for two initial Merkle Trees", () => {
    expect(diffMerkleTrees(initialMerkleTree, initialMerkleTree))
      .toMatchInlineSnapshot(`
      {
        "_tag": "None",
      }
    `);
  });

  test("diff for initialMerkleTree and mt1", () => {
    expect(diffMerkleTrees(initialMerkleTree, mt1)).toMatchInlineSnapshot(`
      {
        "_tag": "Some",
        "value": 0,
      }
    `);
  });

  test("diff for mt1 and initialMerkleTree", () => {
    expect(diffMerkleTrees(mt1, initialMerkleTree)).toMatchInlineSnapshot(`
      {
        "_tag": "Some",
        "value": 0,
      }
    `);
  });

  test("minute window", () => {
    expect(
      diffMerkleTrees(
        mt1,
        pipe(
          initialMerkleTree,
          insertIntoMerkleTree(createNode2Timestamp(60000 - 1))
        )
      )
    ).toMatchInlineSnapshot(`
      {
        "_tag": "Some",
        "value": 0,
      }
    `);

    expect(
      diffMerkleTrees(
        mt1,
        pipe(
          initialMerkleTree,
          insertIntoMerkleTree(createNode2Timestamp(60000))
        )
      )
    ).toMatchInlineSnapshot(`
      {
        "_tag": "Some",
        "value": 60000,
      }
    `);
  });
});
