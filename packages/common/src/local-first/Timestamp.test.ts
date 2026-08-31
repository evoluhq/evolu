import { describe, it, test } from "node:test";
import {
  assertEqual,
  assertErr,
  assertFalse,
  assertOk,
  assertTrue,
} from "../Assert.ts";
import { increment } from "../Number.ts";
import { orderNumber } from "../Order.ts";
import type { Result } from "../Result.ts";
import { ok } from "../Result.ts";
import { testCreateDeps } from "../Task.ts";
import type { Time, TimeDep } from "../Time.ts";
import { maxMillis, Millis, minMillis, testCreateTime } from "../Time.ts";
import type {
  Timestamp,
  TimestampBytes,
  TimestampConfigDep,
  TimestampCounterOverflowError,
  TimestampDriftError,
  TimestampTimeOutOfRangeError,
} from "./Timestamp.ts";
import {
  Counter,
  createInitialTimestamp,
  createTimestamp,
  defaultTimestampMaxDrift,
  maxCounter,
  minCounter,
  NodeId,
  nodeIdBytesToNodeId,
  nodeIdToNodeIdBytes,
  orderTimestampBytes,
  receiveTimestamp,
  sendTimestamp,
  timestampBytesToTimestamp,
  timestampToDateIso,
  timestampToTimestampBytes,
} from "./Timestamp.ts";

test("validates Millis", () => {
  assertFalse(Millis.fromUnknown(-1).ok);
  assertTrue(Millis.fromUnknown(0).ok);
  assertTrue(Millis.fromUnknown(maxMillis).ok);
  assertFalse(Millis.fromUnknown(maxMillis + 1).ok);
});

test("validates Counter", () => {
  assertFalse(Counter.fromUnknown(-1).ok);
  assertTrue(Counter.fromUnknown(0).ok);
  assertTrue(Counter.fromUnknown(maxCounter).ok);
  assertFalse(Counter.fromUnknown(maxCounter + 1).ok);
});

test("validates NodeId", () => {
  assertFalse(NodeId.fromUnknown("").ok);
  assertTrue(NodeId.fromUnknown("0000000000000000").ok);
  assertTrue(NodeId.fromUnknown("aaaaaaaaaaaaaaaa").ok);
  assertFalse(NodeId.fromUnknown("Aaaaaaaaaaaaaaaa").ok);
  assertFalse(NodeId.fromUnknown("aaaaaaaaaaaaaaaaa").ok);
});

describe("NodeId bytes", () => {
  it("round-trips NodeId", () => {
    const deps = testCreateDeps();
    const nodeIds = Array.from(
      { length: 100 },
      () => createInitialTimestamp(deps).nodeId,
    );

    for (const nodeId of nodeIds) {
      assertEqual(nodeIdBytesToNodeId(nodeIdToNodeIdBytes(nodeId)), nodeId);
    }
  });
});

test("creates the minimum Timestamp by default", () => {
  assertEqual(createTimestamp(), {
    counter: 0,
    millis: 0,
    nodeId: "0000000000000000",
  });
});

test("creates an initial Timestamp", () => {
  const timestamp = createInitialTimestamp(testCreateDeps());

  assertEqual(timestamp, {
    counter: 0,
    millis: 0,
    nodeId: "9dca8c435bb0779f",
  });
});

const makeMillis = (millis: number): Millis => Millis.orThrow(millis);

const deps0: TimeDep & TimestampConfigDep = {
  time: testCreateTime({ startAt: minMillis }),
  timestampConfig: { maxDrift: defaultTimestampMaxDrift },
};

const deps1: TimeDep & TimestampConfigDep = {
  time: testCreateTime({ startAt: (minMillis + 1) as Millis }),
  timestampConfig: { maxDrift: defaultTimestampMaxDrift },
};

describe("sendTimestamp", () => {
  it("sends monotonically with a monotonic clock", () => {
    assertOk(sendTimestamp(deps1)(createTimestamp()), {
      counter: 0,
      millis: 1,
      nodeId: "0000000000000000",
    });
  });

  it("sends monotonically with a stuttering clock", () => {
    assertOk(sendTimestamp(deps0)(createTimestamp()), {
      counter: 1,
      millis: 0,
      nodeId: "0000000000000000",
    });
  });

  it("sends monotonically with a regressing clock", () => {
    assertOk(
      sendTimestamp(deps0)(
        createTimestamp({ millis: makeMillis(minMillis + 1) }),
      ),
      {
        counter: 1,
        millis: 1,
        nodeId: "0000000000000000",
      },
    );
  });

  it("returns TimestampCounterOverflowError for counter overflow", () => {
    let timestamp: Result<
      Timestamp,
      | TimestampDriftError
      | TimestampCounterOverflowError
      | TimestampTimeOutOfRangeError
    > = ok(createTimestamp());

    // Note +1 in 65536.
    for (let i = 0; i < 65536; i++) {
      if (timestamp.ok) timestamp = sendTimestamp(deps0)(timestamp.value);
    }

    assertErr(timestamp, { type: "TimestampCounterOverflowError" });
  });

  it("returns TimestampDriftError for excessive clock drift", () => {
    assertErr(
      sendTimestamp(deps0)(
        createTimestamp({
          millis: makeMillis(minMillis + defaultTimestampMaxDrift + 1),
        }),
      ),
      {
        next: 300001,
        now: 0,
        type: "TimestampDriftError",
      },
    );
  });

  it("returns TimestampTimeOutOfRangeError for an invalid clock", () => {
    const time = testCreateTime();
    const invalidTime: Time = {
      ...time,
      now: (() => -1) as Time["now"],
    };

    assertErr(
      sendTimestamp({
        time: invalidTime,
        timestampConfig: { maxDrift: defaultTimestampMaxDrift },
      })(createTimestamp()),
      { type: "TimestampTimeOutOfRangeError" },
    );
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

  it("uses a wall clock later than both timestamps", () => {
    assertOk(
      receiveTimestamp(deps1)(makeNode1Timestamp(), makeNode2Timestamp()),
      {
        counter: 0,
        millis: 1,
        nodeId: "0000000000000001",
      },
    );
  });

  describe("wall clock is behind", () => {
    it("increments the maximum counter when millis are equal", () => {
      assertOk(
        receiveTimestamp(deps1)(
          makeNode1Timestamp(1, 0),
          makeNode2Timestamp(1, 1),
        ),
        {
          counter: 2,
          millis: 1,
          nodeId: "0000000000000001",
        },
      );

      assertOk(
        receiveTimestamp(deps0)(
          makeNode1Timestamp(1, 1),
          makeNode2Timestamp(1, 0),
        ),
        {
          counter: 2,
          millis: 1,
          nodeId: "0000000000000001",
        },
      );
    });

    it("increments the counter when local millis is later", () => {
      assertOk(
        receiveTimestamp(deps0)(makeNode1Timestamp(2), makeNode2Timestamp(1)),
        {
          counter: 1,
          millis: 2,
          nodeId: "0000000000000001",
        },
      );
    });

    it("increments the counter when remote millis is later", () => {
      assertOk(
        receiveTimestamp(deps0)(makeNode1Timestamp(1), makeNode2Timestamp(2)),
        {
          counter: 1,
          millis: 2,
          nodeId: "0000000000000001",
        },
      );
    });

    it("returns TimestampDriftError for excessive clock drift", () => {
      const expected = {
        next: 300001,
        now: 0,
        type: "TimestampDriftError",
      } as const;

      assertErr(
        receiveTimestamp(deps0)(
          createTimestamp({
            millis: makeMillis(minMillis + defaultTimestampMaxDrift + 1),
          }),
          makeNode2Timestamp(),
        ),
        expected,
      );

      assertErr(
        receiveTimestamp(deps0)(
          makeNode2Timestamp(),
          createTimestamp({
            millis: makeMillis(minMillis + defaultTimestampMaxDrift + 1),
          }),
        ),
        expected,
      );
    });

    it("returns TimestampCounterOverflowError for counter overflow", () => {
      assertErr(
        receiveTimestamp(deps0)(
          makeNode1Timestamp(0, maxCounter),
          makeNode2Timestamp(0, maxCounter),
        ),
        { type: "TimestampCounterOverflowError" },
      );
    });
  });
});

describe("TimestampBytes", () => {
  it("round-trips and preserves Timestamp order", () => {
    const decodeFromEncoded = (timestamp: TimestampBytes) =>
      timestampBytesToTimestamp(timestamp);

    const timestamp = createTimestamp();
    assertEqual(
      decodeFromEncoded(timestampToTimestampBytes(timestamp)),
      timestamp,
    );

    const lastSafeTimestampEncodedDecoded = decodeFromEncoded(
      timestampToTimestampBytes(createTimestamp({ millis: maxMillis })),
    );
    assertEqual(lastSafeTimestampEncodedDecoded.millis, maxMillis);

    const t1 = timestampToTimestampBytes(
      createTimestamp({ millis: minMillis }),
    );
    const t2 = timestampToTimestampBytes(
      createTimestamp({
        millis: Millis.orThrow(increment(minMillis)),
      }),
    );
    assertEqual(orderTimestampBytes(t1, t2), -1);
    assertEqual(orderTimestampBytes(t2, t1), 1);
    assertEqual(orderTimestampBytes(t1, t1), 0);

    const t3 = timestampToTimestampBytes(
      createTimestamp({ counter: minCounter }),
    );
    const t4 = timestampToTimestampBytes(
      createTimestamp({
        counter: Counter.orThrow(increment(minCounter)),
      }),
    );
    assertEqual(orderTimestampBytes(t3, t4), -1);
    assertEqual(orderTimestampBytes(t4, t3), 1);
    assertEqual(orderTimestampBytes(t3, t3), 0);

    const t5 = timestampToTimestampBytes(
      createTimestamp({ nodeId: "0000000000000000" as NodeId }),
    );
    const t6 = timestampToTimestampBytes(
      createTimestamp({ nodeId: "0000000000000001" as NodeId }),
    );
    assertEqual(orderTimestampBytes(t5, t6), -1);
    assertEqual(orderTimestampBytes(t6, t5), 1);
    assertEqual(orderTimestampBytes(t5, t5), 0);

    const deps = testCreateDeps();
    const randomMillis = new Set<Millis>();
    for (let i = 0; i < 1000; i++) {
      randomMillis.add(deps.randomLib.int(0, 10000) as Millis);
    }

    const sortedMillis = [...randomMillis].toSorted(orderNumber);
    const sortedEncodedMillis = [...randomMillis]
      .map((millis) => createTimestamp({ millis }))
      .map(timestampToTimestampBytes)
      .toSorted(orderTimestampBytes)
      .map(decodeFromEncoded)
      .map(({ millis }) => millis);

    assertEqual(sortedEncodedMillis, sortedMillis);
  });
});

test("converts Timestamp to DateIso", () => {
  assertEqual(
    timestampToDateIso(createTimestamp()),
    "1970-01-01T00:00:00.000Z",
  );
});
