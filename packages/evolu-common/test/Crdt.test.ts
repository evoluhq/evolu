import * as S from "@effect/schema/Schema";
import { Context, Effect, Either, pipe } from "effect";
import fs from "fs";
import { describe, expect, test } from "vitest";
import { Config, ConfigLive } from "../src/Config.js";
import {
  AllowedTimeRange,
  Millis,
  Time,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampTimeOutOfRangeError,
  diffMerkleTrees,
  initialMerkleTree,
  initialMillis,
  insertIntoMerkleTree,
  makeInitialTimestamp,
  makeSyncTimestamp,
  millisToMerkleTreePath,
  receiveTimestamp,
  sendTimestamp,
  timestampToHash,
  timestampToString,
  unsafeTimestampFromString,
} from "../src/Crdt.js";
import { NanoId, NodeId } from "../src/Crypto.js";
import { makeNode1Timestamp, makeNode2Timestamp } from "./utils.js";

test("InitialTimestampLive", () => {
  const timestamp = makeInitialTimestamp.pipe(
    Effect.provideService(
      NanoId,
      NanoId.of({
        nanoid: Effect.succeed("nanoid"),
        nanoidAsNodeId: Effect.succeed("nanoidAsNodeId" as NodeId),
      }),
    ),
    Effect.runSync,
  );
  expect(timestamp.counter).toBe(0);
  expect(timestamp.millis).toBe(860934420000);
  expect(timestamp.node).toBe("nanoidAsNodeId");
});

test("createSyncTimestamp", () => {
  const ts = makeSyncTimestamp();
  expect(ts.counter).toBe(0);
  expect(ts.millis).toBe(860934420000);
  expect(ts.node).toBe("0000000000000000");
});

test("timestampToString", () => {
  expect(pipe(makeSyncTimestamp(), timestampToString)).toMatchInlineSnapshot(
    '"1997-04-13T12:27:00.000Z-0000-0000000000000000"',
  );
});

test("timestampFromString", () => {
  const t = makeSyncTimestamp();
  expect(t).toEqual(pipe(t, timestampToString, unsafeTimestampFromString));
});

test("timestampToHash", () => {
  expect(timestampToHash(makeSyncTimestamp())).toMatchInlineSnapshot(
    "512511670",
  );
});

const config = Config.pipe(Effect.provide(ConfigLive()), Effect.runSync);

const makeMillis = (millis: number): Millis => S.decodeSync(Millis)(millis);

const context0 = pipe(
  Context.empty(),
  Context.add(Config, config),
  Context.add(Time, { now: Effect.succeed(initialMillis) }),
);

const context1 = pipe(
  Context.empty(),
  Context.add(Config, config),
  Context.add(Time, { now: Effect.succeed(makeMillis(initialMillis + 1)) }),
);

describe("sendTimestamp", () => {
  test("should send monotonically with a monotonic clock", () => {
    expect(
      pipe(
        makeSyncTimestamp(),
        sendTimestamp,
        Effect.provide(context1),
        Effect.runSync,
      ),
    ).toMatchSnapshot();
  });

  test("should send monotonically with a stuttering clock", () => {
    expect(
      pipe(
        makeSyncTimestamp(),
        sendTimestamp,
        Effect.provide(context0),
        Effect.runSync,
      ),
    ).toMatchSnapshot();
  });

  test("should send monotonically with a regressing clock", () => {
    expect(
      pipe(
        makeSyncTimestamp(makeMillis(initialMillis + 1)),
        sendTimestamp,
        Effect.provide(context0),
        Effect.runSync,
      ),
    ).toMatchSnapshot();
  });

  test("should fail with counter overflow", () => {
    let timestamp: Either.Either<
      Timestamp,
      | TimestampDriftError
      | TimestampCounterOverflowError
      | TimestampTimeOutOfRangeError
    > = Either.right(makeSyncTimestamp());

    for (let i = 0; i < 65536; i++) {
      timestamp = pipe(
        timestamp,
        Effect.flatMap(sendTimestamp),
        Effect.map(Either.right),
        Effect.catchAll((e) => Effect.succeed(Either.left(e))),
        Effect.provide(context0),
        Effect.runSync,
      );
    }

    expect(timestamp).toMatchSnapshot();
  });

  test("should fail with clock drift", () => {
    expect(
      pipe(
        makeSyncTimestamp(makeMillis(initialMillis + config.maxDrift + 1)),
        sendTimestamp,
        Effect.catchAll((e) => Effect.succeed(Either.left(e))),
        Effect.provide(context0),
        Effect.runSync,
      ),
    ).toMatchSnapshot();
  });
});

describe("receiveTimestamp", () => {
  test("wall clock is later than both the local and remote timestamps", () => {
    expect(
      pipe(
        receiveTimestamp({
          local: makeNode1Timestamp(),
          remote: makeNode2Timestamp(0, 0),
        }),
        Effect.provide(context1),
        Effect.runSync,
      ),
    ).toMatchSnapshot();
  });

  describe("wall clock is somehow behind", () => {
    test("for the same timestamps millis, we take the bigger counter", () => {
      expect(
        pipe(
          receiveTimestamp({
            local: makeNode1Timestamp(1, 0),
            remote: makeNode2Timestamp(1, 1),
          }),
          Effect.provide(context1),
          Effect.runSync,
        ),
      ).toMatchSnapshot();

      expect(
        pipe(
          receiveTimestamp({
            local: makeNode1Timestamp(1, 1),
            remote: makeNode2Timestamp(1, 0),
          }),
          Effect.provide(context0),
          Effect.runSync,
        ),
      ).toMatchSnapshot();
    });

    test("local millis is later than remote", () => {
      expect(
        pipe(
          receiveTimestamp({
            local: makeNode1Timestamp(2),
            remote: makeNode2Timestamp(1),
          }),
          Effect.provide(context0),
          Effect.runSync,
        ),
      ).toMatchSnapshot();
    });

    test("remote millis is later than local", () => {
      expect(
        pipe(
          receiveTimestamp({
            local: makeNode1Timestamp(1),
            remote: makeNode2Timestamp(2),
          }),
          Effect.provide(context0),
          Effect.runSync,
        ),
      ).toMatchSnapshot();
    });
  });

  test("TimestampDuplicateNodeError", () => {
    expect(
      pipe(
        receiveTimestamp({
          local: makeNode1Timestamp(),
          remote: makeNode1Timestamp(),
        }),
        Effect.catchAll((e) => Effect.succeed(Either.left(e))),
        Effect.provide(context1),
        Effect.runSync,
      ),
    ).toMatchSnapshot();
  });

  test("should fail with clock drift", () => {
    expect(
      pipe(
        receiveTimestamp({
          local: makeSyncTimestamp(
            makeMillis(initialMillis + config.maxDrift + 1),
          ),
          remote: makeNode2Timestamp(),
        }),
        Effect.catchAll((e) => Effect.succeed(Either.left(e))),
        Effect.provide(context0),
        Effect.runSync,
      ),
    ).toMatchSnapshot();

    expect(
      pipe(
        receiveTimestamp({
          local: makeNode2Timestamp(),
          remote: makeSyncTimestamp(
            makeMillis(initialMillis + config.maxDrift + 1),
          ),
        }),
        Effect.catchAll((e) => Effect.succeed(Either.left(e))),
        Effect.provide(context0),
        Effect.runSync,
      ),
    ).toMatchSnapshot();
  });
});

const node1TimestampStart = makeNode1Timestamp();
const node2Timestamp2022 = makeNode2Timestamp(1656873738591);

const someMerkleTree = pipe(
  initialMerkleTree,
  insertIntoMerkleTree(node2Timestamp2022),
);

test("createInitialMerkleTree", () => {
  expect(initialMerkleTree).toMatchSnapshot();
});

describe("insertIntoMerkleTree", () => {
  test("node1TimestampStart", () => {
    expect(
      insertIntoMerkleTree(node1TimestampStart)(initialMerkleTree),
    ).toMatchSnapshot();
  });

  test("node2Timestamp2022", () => {
    expect(
      insertIntoMerkleTree(node2Timestamp2022)(initialMerkleTree),
    ).toMatchSnapshot();
  });

  test("node1TimestampStart then node2Timestamp2022", () => {
    expect(
      pipe(
        initialMerkleTree,
        insertIntoMerkleTree(node1TimestampStart),
        insertIntoMerkleTree(node2Timestamp2022),
      ),
    ).toMatchSnapshot();
  });

  test("the order does not matter", () => {
    expect(
      pipe(
        initialMerkleTree,
        insertIntoMerkleTree(node1TimestampStart),
        insertIntoMerkleTree(node2Timestamp2022),
      ),
    ).toEqual(
      pipe(
        initialMerkleTree,
        insertIntoMerkleTree(node2Timestamp2022),
        insertIntoMerkleTree(node1TimestampStart),
      ),
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
    expect(
      diffMerkleTrees(initialMerkleTree, initialMerkleTree),
    ).toMatchSnapshot();
  });

  test("diff for initialMerkleTree and mt1", () => {
    expect(
      diffMerkleTrees(initialMerkleTree, someMerkleTree),
    ).toMatchSnapshot();
  });

  test("diff for mt1 and initialMerkleTree", () => {
    expect(
      diffMerkleTrees(someMerkleTree, initialMerkleTree),
    ).toMatchSnapshot();
  });

  test("minute window", () => {
    expect(
      diffMerkleTrees(
        someMerkleTree,
        pipe(
          initialMerkleTree,
          insertIntoMerkleTree(makeNode2Timestamp(60000 - 1)),
        ),
      ),
    ).toMatchSnapshot();

    expect(
      diffMerkleTrees(
        someMerkleTree,
        pipe(
          initialMerkleTree,
          insertIntoMerkleTree(makeNode2Timestamp(60000)),
        ),
      ),
    ).toMatchSnapshot();
  });

  const twentyYears = 1000 * 60 * 60 * 24 * 365 * 20;

  test("find the most recent time when trees were the same", () => {
    // May 17 2023 12:09:55
    const now = 1684318195723 - initialMillis;

    const t1 = pipe(
      initialMerkleTree,
      insertIntoMerkleTree(makeNode1Timestamp(now)),
      insertIntoMerkleTree(makeNode1Timestamp(now + 10000)),
    );
    const t2 = pipe(
      initialMerkleTree,
      insertIntoMerkleTree(makeNode1Timestamp(now)),
    );
    expect(diffMerkleTrees(t1, t2)).toMatchInlineSnapshot(`
      {
        "_id": "Option",
        "_tag": "Some",
        "value": 1684318140000,
      }
    `);

    const t3 = pipe(
      initialMerkleTree,
      insertIntoMerkleTree(makeNode1Timestamp(now + twentyYears)),
      insertIntoMerkleTree(makeNode1Timestamp(now + twentyYears + 10000)),
    );
    const t4 = pipe(
      initialMerkleTree,
      insertIntoMerkleTree(makeNode1Timestamp(now + twentyYears)),
    );
    expect(diffMerkleTrees(t3, t4)).toMatchInlineSnapshot(`
      {
        "_id": "Option",
        "_tag": "Some",
        "value": 2315038140000,
      }
    `);
  });

  // TODO: Make this test deterministic.
  test("sync", () => {
    const startTime = 0;
    const endTime = twentyYears;

    const getRandomTime = (): number => {
      const randomTime = Math.random() * (endTime - startTime) + startTime;
      return new Date(randomTime).getTime();
    };

    const randomTimes: Array<number> = [];
    for (let i = 0; i < 100; i++) {
      randomTimes.push(getRandomTime());
    }
    randomTimes.sort((a, b) => a - b);

    const timestamps = randomTimes.map((time) =>
      (Math.random() >= 0.5 ? makeNode1Timestamp : makeNode2Timestamp)(time),
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

test("millisToMinutesBase3", () => {
  expect(
    millisToMerkleTreePath(AllowedTimeRange.greaterThan as Millis).length,
  ).toEqual(15);
  expect(
    millisToMerkleTreePath((AllowedTimeRange.greaterThan + 1) as Millis).length,
  ).toEqual(16);
  expect(
    millisToMerkleTreePath((AllowedTimeRange.lessThan - 1) as Millis).length,
  ).toEqual(16);
  expect(
    millisToMerkleTreePath(AllowedTimeRange.lessThan as Millis).length,
  ).toEqual(17);
});
