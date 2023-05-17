import { pipe } from "@effect/data/Function";
import fs from "fs";
import { describe, expect, test } from "vitest";
import {
  createInitialMerkleTree,
  diffMerkleTrees,
  insertIntoMerkleTree,
} from "../src/MerkleTree.js";
import { createNode1Timestamp, createNode2Timestamp } from "./testUtils.js";

const now = 1684318195723;
const node1TimestampStart = createNode1Timestamp();
const node2Timestamp2022 = createNode2Timestamp(1656873738591);

const initialMerkleTree = createInitialMerkleTree();
const someMerkleTree = pipe(
  initialMerkleTree,
  insertIntoMerkleTree(node2Timestamp2022)
);

test("createInitialMerkleTree", () => {
  expect(initialMerkleTree).toMatchInlineSnapshot("{}");
});

describe("insertIntoMerkleTree", () => {
  test("node1TimestampStart", () => {
    expect(insertIntoMerkleTree(node1TimestampStart)(initialMerkleTree))
      .toMatchInlineSnapshot(`
      {
        "0": {
          "hash": -1416139081,
        },
        "hash": -1416139081,
      }
    `);
  });

  test("node2Timestamp2022", () => {
    expect(
      insertIntoMerkleTree(node2Timestamp2022)(initialMerkleTree)
    ).toMatchSnapshot();
  });

  test("node1TimestampStart then node2Timestamp2022", () => {
    expect(
      pipe(
        initialMerkleTree,
        insertIntoMerkleTree(node1TimestampStart),
        insertIntoMerkleTree(node2Timestamp2022)
      )
    ).toMatchSnapshot();
  });

  test("the order does not matter", () => {
    expect(
      pipe(
        initialMerkleTree,
        insertIntoMerkleTree(node1TimestampStart),
        insertIntoMerkleTree(node2Timestamp2022)
      )
    ).toEqual(
      pipe(
        initialMerkleTree,
        insertIntoMerkleTree(node2Timestamp2022),
        insertIntoMerkleTree(node1TimestampStart)
      )
    );

    const merkle0 = fs.readFileSync("./test/fixtures/merkle0.json", "utf8");
    const merkle1 = fs.readFileSync("./test/fixtures/merkle1.json", "utf8");
    const merkle2 = fs.readFileSync("./test/fixtures/merkle2.json", "utf8");
    const merkle3 = fs.readFileSync("./test/fixtures/merkle3.json", "utf8");

    expect(merkle0).toEqual(merkle1);
    expect(merkle1).toEqual(merkle2);
    expect(merkle2).toEqual(merkle3);
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
    expect(diffMerkleTrees(initialMerkleTree, someMerkleTree))
      .toMatchInlineSnapshot(`
      {
        "_tag": "Some",
        "value": 0,
      }
    `);
  });

  test("diff for mt1 and initialMerkleTree", () => {
    expect(diffMerkleTrees(someMerkleTree, initialMerkleTree))
      .toMatchInlineSnapshot(`
      {
        "_tag": "Some",
        "value": 0,
      }
    `);
  });

  test("minute window", () => {
    expect(
      diffMerkleTrees(
        someMerkleTree,
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
        someMerkleTree,
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

  test("find the most recent time when trees were the same", () => {
    const t1 = pipe(
      initialMerkleTree,
      insertIntoMerkleTree(createNode1Timestamp(now)),
      insertIntoMerkleTree(createNode1Timestamp(now + 10000))
    );
    const t2 = pipe(
      initialMerkleTree,
      insertIntoMerkleTree(createNode1Timestamp(now))
    );
    expect(diffMerkleTrees(t1, t2)).toMatchInlineSnapshot(`
      {
        "_tag": "Some",
        "value": 561439380000,
      }
    `);

    const hundredYears = 1000 * 60 * 60 * 24 * 365 * 100;
    const t3 = pipe(
      initialMerkleTree,
      insertIntoMerkleTree(createNode1Timestamp(now + hundredYears)),
      insertIntoMerkleTree(createNode1Timestamp(now + hundredYears + 10000))
    );
    const t4 = pipe(
      initialMerkleTree,
      insertIntoMerkleTree(createNode1Timestamp(now + hundredYears))
    );
    expect(diffMerkleTrees(t3, t4)).toMatchInlineSnapshot(`
      {
        "_tag": "Some",
        "value": 1612639380000,
      }
    `);
  });

  test("sync", () => {
    expect(1).toBe(1);
  });
});
