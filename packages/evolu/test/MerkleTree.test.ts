import { pipe } from "effect";
import fs from "fs";
import { describe, expect, test } from "vitest";
import {
  diffMerkleTrees,
  initialMerkleTree,
  insertIntoMerkleTree,
} from "../src/MerkleTree.js";
import { Millis, Timestamp } from "../src/Timestamp.js";
import { makeNode1Timestamp, makeNode2Timestamp } from "./testUtils.js";

const now = 1684318195723;
const node1TimestampStart = makeNode1Timestamp();
const node2Timestamp2022 = makeNode2Timestamp(1656873738591);

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
          insertIntoMerkleTree(makeNode2Timestamp(60000 - 1))
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
        pipe(initialMerkleTree, insertIntoMerkleTree(makeNode2Timestamp(60000)))
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
      insertIntoMerkleTree(makeNode1Timestamp(now)),
      insertIntoMerkleTree(makeNode1Timestamp(now + 10000))
    );
    const t2 = pipe(
      initialMerkleTree,
      insertIntoMerkleTree(makeNode1Timestamp(now))
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
      insertIntoMerkleTree(makeNode1Timestamp(now + hundredYears)),
      insertIntoMerkleTree(makeNode1Timestamp(now + hundredYears + 10000))
    );
    const t4 = pipe(
      initialMerkleTree,
      insertIntoMerkleTree(makeNode1Timestamp(now + hundredYears))
    );
    expect(diffMerkleTrees(t3, t4)).toMatchInlineSnapshot(`
      {
        "_tag": "Some",
        "value": 1612639380000,
      }
    `);
  });

  test("sync", () => {
    const getRandomTime = (): number => {
      const startTime = new Date(1971, 0, 0).getTime();
      const endTime = new Date(2400, 11, 31).getTime();
      const randomTime = Math.random() * (endTime - startTime) + startTime;
      return new Date(randomTime).getTime();
    };

    const randomTimes: Array<number> = [];
    for (let i = 0; i < 1000; i++) {
      randomTimes.push(getRandomTime());
    }
    randomTimes.sort((a, b) => a - b);

    const timestamps = randomTimes.map((time) =>
      (Math.random() >= 0.5 ? makeNode1Timestamp : makeNode2Timestamp)(
        time as Millis
      )
    );

    const db1: Array<Timestamp> = [];
    let t1 = initialMerkleTree;
    const addTo1 = (timestamp: Timestamp): void => {
      if (!db1.some((t) => t.millis === timestamp.millis)) {
        db1.push(timestamp);
        t1 = insertIntoMerkleTree(timestamp)(t1);
      }
    };

    const db2: Array<Timestamp> = [];
    let t2 = initialMerkleTree;
    const addTo2 = (timestamp: Timestamp): void => {
      if (!db2.some((t) => t.millis === timestamp.millis)) {
        db2.push(timestamp);
        t2 = insertIntoMerkleTree(timestamp)(t2);
      }
    };

    const getRandomNumber = (min: number, max: number): number => {
      return Math.random() * (max - min) + min;
    };

    while (timestamps.length > 0) {
      timestamps.splice(0, getRandomNumber(0, 10)).forEach((timestamp) => {
        if (timestamp.node === "0000000000000001") addTo1(timestamp);
        else addTo2(timestamp);
      });

      // eslint-disable-next-line no-constant-condition
      while (1) {
        const diff = diffMerkleTrees(t1, t2);
        if (diff._tag === "None") break;
        [...db1, ...db2]
          .filter((t) => t.millis >= diff.value)
          .forEach((timestamp) => {
            addTo1(timestamp);
            addTo2(timestamp);
          });
      }
    }

    expect(timestamps.length).toBe(0);
  });
});
