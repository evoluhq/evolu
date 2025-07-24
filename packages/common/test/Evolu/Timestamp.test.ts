import SQLite from "better-sqlite3";
import { describe, expect, test } from "vitest";
import { defaultConfig } from "../../src/Evolu/Config.js";
import {
  BinaryTimestamp,
  Counter,
  Millis,
  NodeId,
  Timestamp,
  TimestampConfigDep,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampTimeOutOfRangeError,
  binaryTimestampToTimestamp,
  createInitialTimestamp,
  createTimestamp,
  maxCounter,
  maxMillis,
  minCounter,
  minMillis,
  orderBinaryTimestamp,
  receiveTimestamp,
  sendTimestamp,
  timestampToBinaryTimestamp,
  timestampToTimestampString,
} from "../../src/Evolu/Timestamp.js";
import { increment } from "../../src/Number.js";
import { orderNumber } from "../../src/Order.js";
import { Result, getOrThrow, ok } from "../../src/Result.js";
import { TimeDep } from "../../src/Time.js";
import { testNanoIdLibDep, testRandomLib } from "../_deps.js";

test("Millis", () => {
  expect(Millis.from(-1).ok).toBe(false);
  expect(Millis.from(0).ok).toBe(true);
  expect(Millis.from(maxMillis).ok).toBe(true);
  expect(Millis.from(maxMillis + 1).ok).toBe(false);
});

test("Counter", () => {
  expect(Counter.from(-1).ok).toBe(false);
  expect(Counter.from(0).ok).toBe(true);
  expect(Counter.from(maxCounter).ok).toBe(true);
  expect(Counter.from(maxCounter + 1).ok).toBe(false);
});

test("NodeId", () => {
  expect(NodeId.from("").ok).toBe(false);
  expect(NodeId.from("0000000000000000").ok).toBe(true);
  expect(NodeId.from("aaaaaaaaaaaaaaaa").ok).toBe(true);
  expect(NodeId.from("Aaaaaaaaaaaaaaaa").ok).toBe(false);
  expect(NodeId.from("aaaaaaaaaaaaaaaaa").ok).toBe(false);
});

test("createTimestamp", () => {
  expect(createTimestamp()).toMatchInlineSnapshot(`
      {
        "counter": 0,
        "millis": 0,
        "nodeId": "0000000000000000",
      }
    `);
});

test("createInitialTimestamp", () => {
  const timestamp = createInitialTimestamp(testNanoIdLibDep);
  expect(timestamp).toMatchInlineSnapshot(`
    {
      "counter": 0,
      "millis": 0,
      "nodeId": "b979667a46de90e1",
    }
  `);
});

test("timestampToTimestampString", () => {
  expect(timestampToTimestampString(createTimestamp())).toMatchInlineSnapshot(
    `"1970-01-01T00:00:00.000Z-0000-0000000000000000"`,
  );
});

const makeMillis = (millis: number): Millis => getOrThrow(Millis.from(millis));

const deps0: TimeDep & TimestampConfigDep = {
  time: { now: () => minMillis },
  timestampConfig: { maxDrift: defaultConfig.maxDrift },
};

const deps1: TimeDep & TimestampConfigDep = {
  time: { now: () => minMillis + 1 },
  timestampConfig: { maxDrift: defaultConfig.maxDrift },
};

describe("sendTimestamp", () => {
  test("should send monotonically with a monotonic clock", () => {
    expect(sendTimestamp(deps1)(createTimestamp())).toMatchInlineSnapshot(`
      {
        "ok": true,
        "value": {
          "counter": 0,
          "millis": 1,
          "nodeId": "0000000000000000",
        },
      }
    `);
  });

  test("should send monotonically with a stuttering clock", () => {
    expect(sendTimestamp(deps0)(createTimestamp())).toMatchInlineSnapshot(`
      {
        "ok": true,
        "value": {
          "counter": 1,
          "millis": 0,
          "nodeId": "0000000000000000",
        },
      }
    `);
  });

  test("should send monotonically with a regressing clock", () => {
    expect(
      sendTimestamp(deps0)(
        createTimestamp({ millis: makeMillis(minMillis + 1) }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "ok": true,
        "value": {
          "counter": 1,
          "millis": 1,
          "nodeId": "0000000000000000",
        },
      }
    `);
  });

  test("should fail with counter overflow", () => {
    let timestamp: Result<
      Timestamp,
      | TimestampDriftError
      | TimestampCounterOverflowError
      | TimestampTimeOutOfRangeError
    > = ok(createTimestamp());

    // Note +1 in 65536
    for (let i = 0; i < 65536; i++) {
      if (timestamp.ok) {
        timestamp = sendTimestamp(deps0)(timestamp.value);
      }
    }

    expect(timestamp).toMatchInlineSnapshot(`
      {
        "error": {
          "type": "TimestampCounterOverflowError",
        },
        "ok": false,
      }
    `);
  });

  test("should fail with clock drift", () => {
    expect(
      sendTimestamp(deps0)(
        createTimestamp({
          millis: makeMillis(minMillis + defaultConfig.maxDrift + 1),
        }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "error": {
          "next": 300001,
          "now": 0,
          "type": "TimestampDriftError",
        },
        "ok": false,
      }
    `);
  });
});

describe("receiveTimestamp", () => {
  const makeNode1Timestamp = (
    millis = 0,
    counter = 0,
    nodeId = "0000000000000001",
  ): Timestamp =>
    ({
      millis: makeMillis(minMillis + millis),
      counter,
      nodeId,
    }) as Timestamp;

  const makeNode2Timestamp = (millis = 0, counter = 0): Timestamp =>
    makeNode1Timestamp(millis, counter, "0000000000000002");

  test("wall clock is later than both the local and remote timestamps", () => {
    expect(receiveTimestamp(deps1)(makeNode1Timestamp(), makeNode2Timestamp()))
      .toMatchInlineSnapshot(`
      {
        "ok": true,
        "value": {
          "counter": 0,
          "millis": 1,
          "nodeId": "0000000000000001",
        },
      }
    `);
  });

  describe("wall clock is somehow behind", () => {
    test("for the same timestamps millis, we increment the max counter", () => {
      expect(
        receiveTimestamp(deps1)(
          makeNode1Timestamp(1, 0),
          makeNode2Timestamp(1, 1),
        ),
      ).toMatchInlineSnapshot(`
        {
          "ok": true,
          "value": {
            "counter": 2,
            "millis": 1,
            "nodeId": "0000000000000001",
          },
        }
      `);

      expect(
        receiveTimestamp(deps0)(
          makeNode1Timestamp(1, 1),
          makeNode2Timestamp(1, 0),
        ),
      ).toMatchInlineSnapshot(`
        {
          "ok": true,
          "value": {
            "counter": 2,
            "millis": 1,
            "nodeId": "0000000000000001",
          },
        }
      `);
    });

    test("local millis is later than remote", () => {
      expect(
        receiveTimestamp(deps0)(makeNode1Timestamp(2), makeNode2Timestamp(1)),
      ).toMatchInlineSnapshot(`
        {
          "ok": true,
          "value": {
            "counter": 1,
            "millis": 2,
            "nodeId": "0000000000000001",
          },
        }
      `);
    });

    test("remote millis is later than local", () => {
      expect(
        receiveTimestamp(deps0)(makeNode1Timestamp(1), makeNode2Timestamp(2)),
      ).toMatchInlineSnapshot(`
        {
          "ok": true,
          "value": {
            "counter": 1,
            "millis": 2,
            "nodeId": "0000000000000001",
          },
        }
      `);
    });

    test("TimestampDuplicateNodeError", () => {
      expect(
        receiveTimestamp(deps1)(makeNode1Timestamp(), makeNode1Timestamp()),
      ).toMatchInlineSnapshot(`
        {
          "error": {
            "nodeId": "0000000000000001",
            "type": "TimestampDuplicateNodeError",
          },
          "ok": false,
        }
      `);
    });

    test("should fail with clock drift", () => {
      expect(
        receiveTimestamp(deps0)(
          createTimestamp({
            millis: makeMillis(minMillis + defaultConfig.maxDrift + 1),
          }),
          makeNode2Timestamp(),
        ),
      ).toMatchInlineSnapshot(`
        {
          "error": {
            "next": 300001,
            "now": 0,
            "type": "TimestampDriftError",
          },
          "ok": false,
        }
      `);

      expect(
        receiveTimestamp(deps0)(
          makeNode2Timestamp(),
          createTimestamp({
            millis: makeMillis(minMillis + defaultConfig.maxDrift + 1),
          }),
        ),
      ).toMatchInlineSnapshot(`
        {
          "error": {
            "next": 300001,
            "now": 0,
            "type": "TimestampDriftError",
          },
          "ok": false,
        }
      `);
    });
  });

  test("timestampToBinaryTimestamp/binaryTimestampToTimestamp", () => {
    const decodeFromEncoded = (t: BinaryTimestamp) =>
      binaryTimestampToTimestamp(t);

    const t = createTimestamp();
    expect(t).toStrictEqual(decodeFromEncoded(timestampToBinaryTimestamp(t)));

    const lastSafeTimestampEncodedDecoded = decodeFromEncoded(
      timestampToBinaryTimestamp(createTimestamp({ millis: maxMillis })),
    );
    expect(lastSafeTimestampEncodedDecoded.millis).toBe(maxMillis);

    const t1 = timestampToBinaryTimestamp(
      createTimestamp({ millis: minMillis }),
    );
    const t2 = timestampToBinaryTimestamp(
      createTimestamp({
        millis: getOrThrow(Millis.from(increment(minMillis))),
      }),
    );
    expect(orderBinaryTimestamp(t1, t2)).toBe(-1);
    expect(orderBinaryTimestamp(t2, t1)).toBe(1);
    expect(orderBinaryTimestamp(t1, t1)).toBe(0);

    const t3 = timestampToBinaryTimestamp(
      createTimestamp({ counter: minCounter }),
    );
    const t4 = timestampToBinaryTimestamp(
      createTimestamp({
        counter: getOrThrow(Counter.from(increment(minCounter))),
      }),
    );
    expect(orderBinaryTimestamp(t3, t4)).toBe(-1);
    expect(orderBinaryTimestamp(t4, t3)).toBe(1);
    expect(orderBinaryTimestamp(t3, t3)).toBe(0);

    const t5 = timestampToBinaryTimestamp(
      createTimestamp({ nodeId: "0000000000000000" as NodeId }),
    );
    const t6 = timestampToBinaryTimestamp(
      createTimestamp({ nodeId: "0000000000000001" as NodeId }),
    );
    expect(orderBinaryTimestamp(t5, t6)).toBe(-1);
    expect(orderBinaryTimestamp(t6, t5)).toBe(1);
    expect(orderBinaryTimestamp(t5, t5)).toBe(0);

    const randomMillis = new Set<Millis>();
    Array.from({ length: 1000 }).forEach(() => {
      randomMillis.add(testRandomLib.int(0, 10000) as Millis);
    });

    const sortedMillis = [...randomMillis].toSorted(orderNumber);

    const randomBinaryTimestamps = [...randomMillis]
      .map((millis) => createTimestamp({ millis }))
      .map(timestampToBinaryTimestamp);

    expect(
      randomBinaryTimestamps
        .toSorted(orderBinaryTimestamp)
        .map(decodeFromEncoded)
        .map((a) => a.millis),
    ).toEqual(sortedMillis);

    const db = new SQLite();
    db.prepare(
      `
      create table "Message" (
        "t" blob primary key
      )
      strict;
    `,
    ).run();

    const insertTimestamp = db.prepare(`insert into Message (t) values (@t)`);
    randomBinaryTimestamps.forEach((t) => {
      insertTimestamp.run({ t });
    });
    const sqliteMillis = db
      .prepare<[], { t: BinaryTimestamp }>(`select t from Message order by t`)
      .all()
      .map((a) => decodeFromEncoded(a.t).millis);
    expect(sqliteMillis).toEqual(sortedMillis);
  });
});
