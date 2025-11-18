import SQLite from "better-sqlite3";
import { describe, expect, test } from "vitest";
import { defaultDbConfig } from "../../src/Evolu/Db.js";
import {
  Counter,
  Millis,
  NodeId,
  Timestamp,
  TimestampBytes,
  TimestampConfigDep,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampTimeOutOfRangeError,
  createInitialTimestamp,
  createTimestamp,
  maxCounter,
  maxMillis,
  minCounter,
  minMillis,
  orderTimestampBytes,
  receiveTimestamp,
  sendTimestamp,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "../../src/Evolu/Timestamp.js";
import { increment } from "../../src/Number.js";
import { orderNumber } from "../../src/Order.js";
import { Result, getOrThrow, ok } from "../../src/Result.js";
import { TimeDep } from "../../src/Time.js";
import { dateToDateIso } from "../../src/Type.js";
import { testDeps, testRandomLib } from "../_deps.js";

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
  const timestamp = createInitialTimestamp(testDeps);
  expect(timestamp).toMatchInlineSnapshot(`
    {
      "counter": 0,
      "millis": 0,
      "nodeId": "4febdfb5d0782bfa",
    }
  `);
});

const makeMillis = (millis: number): Millis => Millis.orThrow(millis);

const deps0: TimeDep & TimestampConfigDep = {
  time: {
    now: () => minMillis,
    nowIso: () => getOrThrow(dateToDateIso(new Date(minMillis))),
  },
  timestampConfig: { maxDrift: defaultDbConfig.maxDrift },
};

const deps1: TimeDep & TimestampConfigDep = {
  time: {
    now: () => minMillis + 1,
    nowIso: () => getOrThrow(dateToDateIso(new Date(minMillis + 1))),
  },
  timestampConfig: { maxDrift: defaultDbConfig.maxDrift },
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
          millis: makeMillis(minMillis + defaultDbConfig.maxDrift + 1),
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

    test("should fail with clock drift", () => {
      expect(
        receiveTimestamp(deps0)(
          createTimestamp({
            millis: makeMillis(minMillis + defaultDbConfig.maxDrift + 1),
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
            millis: makeMillis(minMillis + defaultDbConfig.maxDrift + 1),
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

  test("timestampToTimestampBytes/timestampBytesToTimestamp", () => {
    const decodeFromEncoded = (t: TimestampBytes) =>
      timestampBytesToTimestamp(t);

    const t = createTimestamp();
    expect(t).toStrictEqual(decodeFromEncoded(timestampToTimestampBytes(t)));

    const lastSafeTimestampEncodedDecoded = decodeFromEncoded(
      timestampToTimestampBytes(createTimestamp({ millis: maxMillis })),
    );
    expect(lastSafeTimestampEncodedDecoded.millis).toBe(maxMillis);

    const t1 = timestampToTimestampBytes(
      createTimestamp({ millis: minMillis }),
    );
    const t2 = timestampToTimestampBytes(
      createTimestamp({
        millis: Millis.orThrow(increment(minMillis)),
      }),
    );
    expect(orderTimestampBytes(t1, t2)).toBe(-1);
    expect(orderTimestampBytes(t2, t1)).toBe(1);
    expect(orderTimestampBytes(t1, t1)).toBe(0);

    const t3 = timestampToTimestampBytes(
      createTimestamp({ counter: minCounter }),
    );
    const t4 = timestampToTimestampBytes(
      createTimestamp({
        counter: Counter.orThrow(increment(minCounter)),
      }),
    );
    expect(orderTimestampBytes(t3, t4)).toBe(-1);
    expect(orderTimestampBytes(t4, t3)).toBe(1);
    expect(orderTimestampBytes(t3, t3)).toBe(0);

    const t5 = timestampToTimestampBytes(
      createTimestamp({ nodeId: "0000000000000000" as NodeId }),
    );
    const t6 = timestampToTimestampBytes(
      createTimestamp({ nodeId: "0000000000000001" as NodeId }),
    );
    expect(orderTimestampBytes(t5, t6)).toBe(-1);
    expect(orderTimestampBytes(t6, t5)).toBe(1);
    expect(orderTimestampBytes(t5, t5)).toBe(0);

    const randomMillis = new Set<Millis>();
    Array.from({ length: 1000 }).forEach(() => {
      randomMillis.add(testRandomLib.int(0, 10000) as Millis);
    });

    const sortedMillis = [...randomMillis].toSorted(orderNumber);

    const randomTimestampsBytes = [...randomMillis]
      .map((millis) => createTimestamp({ millis }))
      .map(timestampToTimestampBytes);

    expect(
      randomTimestampsBytes
        .toSorted(orderTimestampBytes)
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
    randomTimestampsBytes.forEach((t) => {
      insertTimestamp.run({ t });
    });
    const sqliteMillis = db
      .prepare<[], { t: TimestampBytes }>(`select t from Message order by t`)
      .all()
      .map((a) => decodeFromEncoded(a.t).millis);
    expect(sqliteMillis).toEqual(sortedMillis);
  });
});
