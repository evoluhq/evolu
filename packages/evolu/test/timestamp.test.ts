import { either } from "fp-ts";
import { pipe } from "fp-ts/lib/function.js";
import { describe, expect, test } from "vitest";
import { ConfigEnv, createConfig } from "../src/to-migrate/config.js";
import {
  createInitialTimestamp,
  createSyncTimestamp,
  Millis,
  receiveTimestamp,
  sendTimestamp,
  TimeEnv,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  unsafeTimestampFromString,
  timestampToHash,
  timestampToString,
} from "../src/to-migrate/timestamp.js";
import { createNode1Timestamp, createNode2Timestamp } from "./testUtils.js";

const config = createConfig();

test("createInitialTimestamp", () => {
  const ts = createInitialTimestamp();
  expect(ts.counter).toBe(0);
  expect(ts.millis).toBe(0);
  expect(ts.node.length).toBe(16);
});

test("createSyncTimestamp", () => {
  const ts = createSyncTimestamp();
  expect(ts.counter).toBe(0);
  expect(ts.millis).toBe(0);
  expect(ts.node).toBe("0000000000000000");
});

test("timestampToString", () => {
  expect(pipe(createSyncTimestamp(), timestampToString)).toMatchSnapshot();
});

test("timestampFromString", () => {
  const t = createSyncTimestamp();
  expect(t).toEqual(pipe(t, timestampToString, unsafeTimestampFromString));
});

test("timestampToHash", () => {
  expect(timestampToHash(createSyncTimestamp())).toMatchSnapshot();
});

const now0 = { now: () => 0, config } as TimeEnv & ConfigEnv;
const now1 = { now: () => 1, config } as TimeEnv & ConfigEnv;

describe("sendTimestamp", () => {
  test("should send monotonically with a monotonic clock", () => {
    expect(pipe(createSyncTimestamp(), sendTimestamp)(now1)).toMatchSnapshot();
  });

  test("should send monotonically with a stuttering clock", () => {
    expect(pipe(createSyncTimestamp(), sendTimestamp)(now0)).toMatchSnapshot();
  });

  test("should send monotonically with a regressing clock", () => {
    expect(
      pipe(createSyncTimestamp(1 as Millis), sendTimestamp)(now0)
    ).toMatchSnapshot();
  });

  test("should fail with counter overflow", () => {
    let timestamp = either.right<
      TimestampDriftError | TimestampCounterOverflowError,
      Timestamp
    >(createSyncTimestamp());
    for (let i = 0; i < 65536; i++) {
      timestamp = pipe(
        timestamp,
        either.chain((t) => sendTimestamp(t)(now0))
      );
    }
    expect(timestamp).toMatchSnapshot();
  });

  test("should fail with clock drift", () => {
    expect(
      pipe(
        createSyncTimestamp((config.maxDrift + 1) as Millis),
        sendTimestamp
      )(now0)
    ).toMatchSnapshot();
  });
});

describe("receiveTimestamp", () => {
  test("wall clock is later than both the local and remote timestamps", () => {
    expect(
      receiveTimestamp(createNode1Timestamp(), createNode2Timestamp(0, 0))(now1)
    ).toMatchSnapshot();
  });

  describe("wall clock is somehow behind", () => {
    test("for the same timestamps millis, we take the bigger counter", () => {
      expect(
        receiveTimestamp(
          createNode1Timestamp(1, 0),
          createNode2Timestamp(1, 1)
        )(now0)
      ).toMatchSnapshot();

      expect(
        receiveTimestamp(
          createNode1Timestamp(1, 1),
          createNode2Timestamp(1, 0)
        )(now0)
      ).toMatchSnapshot();
    });

    test("local millis is later than remote", () => {
      expect(
        receiveTimestamp(createNode1Timestamp(2), createNode2Timestamp(1))(now0)
      ).toMatchSnapshot();
    });

    test("remote millis is later than local", () => {
      expect(
        receiveTimestamp(createNode1Timestamp(1), createNode2Timestamp(2))(now0)
      ).toMatchSnapshot();
    });
  });

  test("TimestampDuplicateNodeError", () => {
    expect(
      receiveTimestamp(createNode1Timestamp(), createNode1Timestamp())(now1)
    ).toMatchSnapshot();
  });

  test("should fail with clock drift", () => {
    expect(
      receiveTimestamp(
        createSyncTimestamp((config.maxDrift + 1) as Millis),
        createNode2Timestamp()
      )(now0)
    ).toMatchSnapshot();

    expect(
      receiveTimestamp(
        createNode2Timestamp(),
        createSyncTimestamp((config.maxDrift + 1) as Millis)
      )(now0)
    ).toMatchSnapshot();
  });
});
