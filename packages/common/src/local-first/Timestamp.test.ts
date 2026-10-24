import { Buffer } from "node:buffer";
import { describe, it, mock, test } from "node:test";
import {
  assertEqual,
  assertErr,
  assertFalse,
  assertNotSame,
  assertOk,
  assertThrowsInstanceOf,
  assertTrue,
} from "../Assert.ts";
import { bytesToHex } from "../Bytes.ts";
import { increment } from "../Number.ts";
import { orderNumber } from "../Order.ts";
import type { Result } from "../Result.ts";
import { testCreateDeps } from "../Task.ts";
import { maxMillis, Millis, minMillis } from "../Time.ts";
import { assertType } from "../Type.ts";
import type {
  Timestamp,
  TimestampConfigDep,
  TimestampDriftError,
} from "./Timestamp.ts";
import {
  Counter,
  createInitialTimestamp,
  createTimestamp,
  defaultTimestampMaxDrift,
  isTimestampBeyondMaxDrift,
  maxCounter,
  maxNodeId,
  minCounter,
  NodeId,
  nodeIdBytesToNodeId,
  nodeIdToNodeIdBytes,
  orderTimestamp,
  orderTimestampBytes,
  receiveTimestamp,
  sendTimestamp,
  TimestampBytes,
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

describe("orderTimestamp", () => {
  it("compares equal timestamps regardless of object identity", () => {
    const timestamp = createTimestamp({
      millis: maxMillis,
      counter: maxCounter,
      nodeId: maxNodeId,
    });
    const copy = { ...timestamp };

    assertNotSame(timestamp, copy);
    assertEqual(orderTimestamp(timestamp, timestamp), 0);
    assertEqual(orderTimestamp(timestamp, copy), 0);
    assertEqual(orderTimestamp(copy, timestamp), 0);
  });

  it("orders millis, counter, then nodeId consistently with timestamp bytes", () => {
    const timestamps = [
      createTimestamp(),
      createTimestamp({ nodeId: NodeId.orThrow("9999999999999999") }),
      createTimestamp({ nodeId: NodeId.orThrow("aaaaaaaaaaaaaaaa") }),
      createTimestamp({ nodeId: maxNodeId }),
      createTimestamp({ counter: Counter.orThrow(255), nodeId: maxNodeId }),
      createTimestamp({ counter: Counter.orThrow(256) }),
      createTimestamp({ counter: maxCounter, nodeId: maxNodeId }),
      createTimestamp({ millis: Millis.orThrow(1) }),
      createTimestamp({
        millis: Millis.orThrow(2 ** 32 - 1),
        counter: maxCounter,
        nodeId: maxNodeId,
      }),
      createTimestamp({ millis: Millis.orThrow(2 ** 32) }),
      createTimestamp({
        millis: maxMillis,
        counter: maxCounter,
        nodeId: maxNodeId,
      }),
    ];
    const bytes = timestamps.map(timestampToTimestampBytes);

    for (const [i, a] of timestamps.entries()) {
      for (const [j, b] of timestamps.entries()) {
        const order = orderTimestamp(a, b);
        assertEqual(order, orderNumber(i, j));
        assertEqual(order, orderTimestampBytes(bytes[i], bytes[j]));
      }
    }
  });
});

const makeMillis = (millis: number): Millis => Millis.orThrow(millis);

describe("isTimestampBeyondMaxDrift", () => {
  it("accepts past timestamps and the exact future limit", () => {
    const isBeyondMaxDrift = isTimestampBeyondMaxDrift({
      timestampConfig: { maxDrift: 10 },
    });
    const now = makeMillis(100);

    assertFalse(isBeyondMaxDrift(makeMillis(0), now));
    assertFalse(isBeyondMaxDrift(now, now));
    assertFalse(isBeyondMaxDrift(makeMillis(109), now));
    assertFalse(isBeyondMaxDrift(makeMillis(110), now));
    assertTrue(isBeyondMaxDrift(makeMillis(111), now));
  });

  it("rejects any future timestamp when the limit is zero", () => {
    const isBeyondMaxDrift = isTimestampBeyondMaxDrift({
      timestampConfig: { maxDrift: 0 },
    });
    const now = makeMillis(100);

    assertFalse(isBeyondMaxDrift(makeMillis(99), now));
    assertFalse(isBeyondMaxDrift(now, now));
    assertTrue(isBeyondMaxDrift(makeMillis(101), now));
  });
});

const config: TimestampConfigDep = {
  timestampConfig: { maxDrift: defaultTimestampMaxDrift },
};

describe("sendTimestamp", () => {
  it("sends monotonically with a monotonic clock", () => {
    assertOk(sendTimestamp(config)(createTimestamp(), makeMillis(1)), {
      counter: 0,
      millis: 1,
      nodeId: "0000000000000000",
    });
  });

  it("sends monotonically with a stuttering clock", () => {
    assertOk(sendTimestamp(config)(createTimestamp(), minMillis), {
      counter: 1,
      millis: 0,
      nodeId: "0000000000000000",
    });
  });

  it("sends monotonically with a regressing clock", () => {
    assertOk(
      sendTimestamp(config)(
        createTimestamp({ millis: makeMillis(minMillis + 1) }),
        minMillis,
      ),
      {
        counter: 1,
        millis: 1,
        nodeId: "0000000000000000",
      },
    );
  });

  it("continues past a full counter with fixed wall time", () => {
    let timestamp = createTimestamp();
    for (let i = 0; i <= maxCounter; i++) {
      const next = sendTimestamp(config)(timestamp, minMillis);
      assertOk(next);
      timestamp = next.value;
    }
    assertEqual(timestamp, createTimestamp({ millis: makeMillis(1) }));
    assertOk(
      sendTimestamp(config)(timestamp, minMillis),
      createTimestamp({ millis: makeMillis(1), counter: Counter.orThrow(1) }),
    );
  });

  it("continues past a full counter while the clock is ahead of advancing wall time", () => {
    // Wall time advances by one millisecond per send, while the clock stays two
    // minutes ahead, as after receiving a timestamp from a fast peer. Every
    // send keeps the pinned millis, so the counter alone must carry ordering.
    const pinnedMillis = makeMillis(2 * 60 * 1000);
    let timestamp = createTimestamp({ millis: pinnedMillis });
    for (let i = 0; i <= maxCounter; i++) {
      const next = sendTimestamp(config)(timestamp, makeMillis(i));
      assertOk(next);
      assertEqual(
        orderTimestampBytes(
          timestampToTimestampBytes(timestamp),
          timestampToTimestampBytes(next.value),
        ),
        -1,
      );
      if (i < maxCounter) assertEqual(next.value.millis, pinnedMillis);
      timestamp = next.value;
    }
    assertEqual(
      timestamp,
      createTimestamp({ millis: makeMillis(pinnedMillis + 1) }),
    );
  });

  it("returns TimestampDriftError for an ahead local clock", () => {
    assertErr(
      sendTimestamp(config)(
        createTimestamp({
          millis: makeMillis(minMillis + defaultTimestampMaxDrift + 1),
        }),
        minMillis,
      ),
      {
        type: "TimestampDriftError",
        now: minMillis,
        timestamp: createTimestamp({
          millis: makeMillis(300001),
          counter: Counter.orThrow(1),
        }),
        cause: "local",
      },
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
      receiveTimestamp(config)(
        makeNode1Timestamp(),
        makeNode2Timestamp(),
        makeMillis(1),
      ),
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
        receiveTimestamp(config)(
          makeNode1Timestamp(1, 0),
          makeNode2Timestamp(1, 1),
          makeMillis(1),
        ),
        {
          counter: 2,
          millis: 1,
          nodeId: "0000000000000001",
        },
      );

      assertOk(
        receiveTimestamp(config)(
          makeNode1Timestamp(1, 1),
          makeNode2Timestamp(1, 0),
          minMillis,
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
        receiveTimestamp(config)(
          makeNode1Timestamp(2),
          makeNode2Timestamp(1),
          minMillis,
        ),
        {
          counter: 1,
          millis: 2,
          nodeId: "0000000000000001",
        },
      );
    });

    it("increments the counter when remote millis is later", () => {
      assertOk(
        receiveTimestamp(config)(
          makeNode1Timestamp(1),
          makeNode2Timestamp(2),
          minMillis,
        ),
        {
          counter: 1,
          millis: 2,
          nodeId: "0000000000000001",
        },
      );
    });

    it("returns local drift when an accepted remote timestamp leaves the clock ahead", () => {
      assertErr(
        receiveTimestamp(config)(
          createTimestamp({
            millis: makeMillis(minMillis + defaultTimestampMaxDrift + 1),
          }),
          makeNode2Timestamp(),
          minMillis,
        ),
        {
          type: "TimestampDriftError",
          now: minMillis,
          timestamp: createTimestamp({
            millis: makeMillis(300001),
            counter: Counter.orThrow(1),
          }),
          cause: "local",
        },
      );
    });

    it("rejects remote drift without a separate caller check", () => {
      const remote = createTimestamp({
        millis: makeMillis(minMillis + defaultTimestampMaxDrift + 1),
      });
      const local = makeNode2Timestamp();
      const before = { ...local };
      assertErr(receiveTimestamp(config)(local, remote, minMillis), {
        type: "TimestampDriftError",
        timestamp: remote,
        cause: "remote",
        now: minMillis,
      });
      assertEqual(local, before);
    });

    it("rejects remote drift before arithmetic at the range ceiling", () => {
      const remote = createTimestamp({
        millis: maxMillis,
        counter: maxCounter,
      });
      assertErr(
        receiveTimestamp(config)(createTimestamp(), remote, minMillis),
        {
          type: "TimestampDriftError",
          timestamp: remote,
          cause: "remote",
          now: minMillis,
        },
      );
    });

    it("uses the configured drift boundary, including a zero limit", () => {
      for (const maxDrift of [0, 10]) {
        const deps = { timestampConfig: { maxDrift } };
        const now = makeMillis(100);
        const local = makeNode1Timestamp();
        const accepted = makeNode2Timestamp(100 + maxDrift);
        assertOk(
          receiveTimestamp(deps)(local, accepted, now),
          makeNode1Timestamp(100 + maxDrift, 1),
        );
        const rejected = makeNode2Timestamp(101 + maxDrift);
        assertErr(receiveTimestamp(deps)(local, rejected, now), {
          type: "TimestampDriftError",
          timestamp: rejected,
          cause: "remote",
          now: makeMillis(100),
        });
      }
    });

    for (const [
      label,
      localMillis,
      remoteMillis,
      localCounter,
      remoteCounter,
    ] of [
      ["equal millis with the local counter exhausted", 1, 1, maxCounter, 0],
      ["equal millis with the remote counter exhausted", 1, 1, 0, maxCounter],
      [
        "equal millis with both counters exhausted",
        1,
        1,
        maxCounter,
        maxCounter,
      ],
      ["later local millis", 1, 0, maxCounter, 0],
      ["later remote millis", 0, 1, 0, maxCounter],
    ] as const) {
      it(`rolls over for ${label}`, () => {
        const local = makeNode1Timestamp(localMillis, localCounter);
        const remote = makeNode2Timestamp(remoteMillis, remoteCounter);
        const result = receiveTimestamp(config)(local, remote, minMillis);
        assertOk(result, makeNode1Timestamp(2, 0));
        const bytes = timestampToTimestampBytes(result.value);
        assertEqual(
          orderTimestampBytes(timestampToTimestampBytes(local), bytes),
          -1,
        );
        assertEqual(
          orderTimestampBytes(timestampToTimestampBytes(remote), bytes),
          -1,
        );
      });
    }
    it("resets exhausted counters when wall time is newer", () => {
      assertOk(
        receiveTimestamp(config)(
          makeNode1Timestamp(1, maxCounter),
          makeNode2Timestamp(1, maxCounter),
          makeMillis(2),
        ),
        makeNode1Timestamp(2, 0),
      );
    });
  });
});

describe("timestamp rollover boundaries", () => {
  for (const operation of ["send", "receive"] as const) {
    const nextTimestamp = (timestamp: Timestamp, now = minMillis) =>
      operation === "send"
        ? sendTimestamp(config)(timestamp, now)
        : receiveTimestamp(config)(timestamp, timestamp, now);

    it(`${operation} uses the last counter before rolling over`, () => {
      const lastCounter = createTimestamp({ counter: maxCounter });
      assertOk(
        nextTimestamp(
          createTimestamp({ counter: Counter.orThrow(maxCounter - 1) }),
        ),
        lastCounter,
      );
      const result = nextTimestamp(lastCounter);
      assertOk(result, createTimestamp({ millis: makeMillis(1) }));
      assertEqual(
        timestampBytesToTimestamp(timestampToTimestampBytes(result.value)),
        result.value,
      );
    });

    it(`${operation} permits rollover at the drift limit and rejects the next millisecond`, () => {
      assertOk(
        nextTimestamp(
          createTimestamp({
            millis: makeMillis(defaultTimestampMaxDrift - 1),
            counter: maxCounter,
          }),
        ),
        createTimestamp({ millis: makeMillis(defaultTimestampMaxDrift) }),
      );
      assertErr(
        nextTimestamp(
          createTimestamp({
            millis: makeMillis(defaultTimestampMaxDrift),
            counter: maxCounter,
          }),
        ),
        {
          type: "TimestampDriftError",
          now: minMillis,
          timestamp: createTimestamp({
            millis: makeMillis(defaultTimestampMaxDrift + 1),
          }),
          cause: "local",
        },
      );
    });

    it(`${operation} permits the maximum millis and throws on rollover beyond it`, () => {
      const now = makeMillis(maxMillis - 1);
      assertOk(
        nextTimestamp(
          createTimestamp({
            millis: makeMillis(maxMillis - 1),
            counter: maxCounter,
          }),
          now,
        ),
        createTimestamp({ millis: maxMillis }),
      );
      assertThrowsInstanceOf(() => {
        nextTimestamp(
          createTimestamp({ millis: maxMillis, counter: maxCounter }),
          now,
        );
      }, Error);
    });
  }

  it("exposes the failures of each operation", () => {
    assertType<
      ReturnType<ReturnType<typeof sendTimestamp>>,
      Result<Timestamp, TimestampDriftError>
    >();
    assertType<
      ReturnType<ReturnType<typeof receiveTimestamp>>,
      Result<Timestamp, TimestampDriftError>
    >();
    assertType<Parameters<typeof sendTimestamp>, [TimestampConfigDep]>();
    assertType<
      Parameters<ReturnType<typeof sendTimestamp>>,
      [Timestamp, Millis]
    >();
    assertType<Parameters<typeof receiveTimestamp>, [TimestampConfigDep]>();
    assertType<
      Parameters<ReturnType<typeof receiveTimestamp>>,
      [Timestamp, Timestamp, Millis]
    >();
    // @ts-expect-error TimestampCounterOverflowError is no longer exported; counters roll over.
    type _RemovedError = import("../index.ts").TimestampCounterOverflowError;
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

  it("rejects millis bytes that Millis reserves for infinity", () => {
    const reserved = new Uint8Array(16).fill(0xff, 0, 6);
    const result = TimestampBytes.fromUnknown(reserved);
    assertErr(result, { type: "TimestampBytes", value: reserved });
    assertEqual(
      TimestampBytes.formatError(result.error),
      "The millis part of ffffffffffff00000000000000000000 is 2^48 - 1, which Millis reserves for infinity.",
    );
    assertFalse(TimestampBytes.is(new Uint8Array(16).fill(0xff)));

    // The largest Millis with any counter and NodeId bytes is valid.
    const largest = new Uint8Array(16).fill(0xff);
    largest[5] = 0xfe;
    assertEqual(timestampBytesToTimestamp(TimestampBytes.orThrow(largest)), {
      millis: maxMillis,
      counter: maxCounter,
      nodeId: maxNodeId,
    });
  });

  it("writes millis, counter, and NodeId as big-endian bytes", () => {
    const nodeId = NodeId.orThrow("0123456789abcdef");

    for (const millis of [
      0,
      0xff,
      0x100,
      2 ** 31 - 1,
      2 ** 31,
      2 ** 32 - 1,
      2 ** 32,
      2 ** 40 + 1,
      maxMillis,
    ]) {
      const timestamp = createTimestamp({
        millis: Millis.orThrow(millis),
        counter: Counter.orThrow(0x1234),
        nodeId,
      });
      const bytes = timestampToTimestampBytes(timestamp);

      assertEqual(
        bytesToHex(bytes),
        `${millis.toString(16).padStart(12, "0")}1234${nodeId}`,
      );
      assertEqual(timestampBytesToTimestamp(bytes), timestamp);
    }
  });

  it("converts without BigInt", () => {
    const bigInt = mock.method(globalThis, "BigInt", () => {
      throw new Error("BigInt must not be called.");
    });

    try {
      const timestamp = createTimestamp({
        millis: maxMillis,
        counter: maxCounter,
        nodeId: maxNodeId,
      });
      assertEqual(
        timestampBytesToTimestamp(timestampToTimestampBytes(timestamp)),
        timestamp,
      );
      assertEqual(bigInt.mock.callCount(), 0);
    } finally {
      bigInt.mock.restore();
    }
  });

  it("converts the NodeId of each timestamp", () => {
    const a = NodeId.orThrow("0123456789abcdef");
    const b = NodeId.orThrow("fedcba9876543210");

    for (const nodeId of [a, a, b, a, b, b]) {
      const bytes = timestampToTimestampBytes(createTimestamp({ nodeId }));
      assertEqual(bytesToHex(bytes.subarray(8)), nodeId);
      assertEqual(timestampBytesToTimestamp(bytes).nodeId, nodeId);
    }

    for (const bytes of [new Uint8Array(16), Buffer.alloc(16)]) {
      // The last conversion is of another NodeId, so decoding stores this one.
      timestampToTimestampBytes(createTimestamp({ nodeId: b }));
      bytes.set(nodeIdToNodeIdBytes(a), 8);
      assertEqual(
        timestampBytesToTimestamp(TimestampBytes.orThrow(bytes)).nodeId,
        a,
      );

      // Bytes changed after a conversion convert to their new NodeId, also
      // those of a Node.js Buffer, whose slice shares them.
      bytes.set(nodeIdToNodeIdBytes(b), 8);
      assertEqual(
        timestampBytesToTimestamp(TimestampBytes.orThrow(bytes)).nodeId,
        b,
      );
      assertEqual(
        bytesToHex(
          timestampToTimestampBytes(createTimestamp({ nodeId: a })).subarray(8),
        ),
        a,
      );
    }
  });

  it("decodes a NodeId that differs from the last one in a single byte", () => {
    const nodeIdBytes = nodeIdToNodeIdBytes(NodeId.orThrow("0123456789abcdef"));
    for (let i = 0; i < nodeIdBytes.length; i++) {
      const changed = new Uint8Array(nodeIdBytes);
      changed[i] ^= 0xff;
      for (const expected of [nodeIdBytes, changed, nodeIdBytes]) {
        const bytes = new Uint8Array(16);
        bytes.set(expected, 8);
        assertEqual(
          timestampBytesToTimestamp(TimestampBytes.orThrow(bytes)).nodeId,
          bytesToHex(expected),
        );
      }
    }
  });

  it("decodes the NodeId from the 8 bytes after the counter only", () => {
    const a = NodeId.orThrow("0123456789abcdef");
    // The last conversion is of another NodeId, so decoding stores this one.
    timestampToTimestampBytes(
      createTimestamp({ nodeId: NodeId.orThrow("fedcba9876543210") }),
    );

    // A wrongly typed value, longer than TimestampBytes.
    const longer = new Uint8Array(17);
    longer.set(nodeIdToNodeIdBytes(a), 8);
    assertEqual(timestampBytesToTimestamp(longer as TimestampBytes).nodeId, a);

    const bytes = new Uint8Array(16);
    bytes.set(nodeIdToNodeIdBytes(a), 8);
    const timestamp = timestampBytesToTimestamp(TimestampBytes.orThrow(bytes));
    assertEqual(timestamp.nodeId, a);
    assertEqual(timestampToTimestampBytes(timestamp), bytes);
  });
});

test("converts Timestamp to DateIso", () => {
  assertEqual(
    timestampToDateIso(createTimestamp()),
    "1970-01-01T00:00:00.000Z",
  );
});
