import * as Effect from "@effect/io/Effect";
import { Context, Either, pipe } from "effect";
import { describe, expect, test } from "vitest";
import { Config, ConfigLive } from "../src/Config.js";
import { NanoId, NodeId } from "../src/Crypto.js";
import {
  Millis,
  Time,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
  makeInitialTimestamp,
  makeSyncTimestamp,
  receiveTimestamp,
  sendTimestamp,
  timestampToHash,
  timestampToString,
  unsafeTimestampFromString,
} from "../src/Timestamp.js";
import { makeNode1Timestamp, makeNode2Timestamp } from "./testUtils.js";

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
  expect(timestamp.millis).toBe(0);
  expect(timestamp.node).toBe("nanoidAsNodeId");
});

test("createSyncTimestamp", () => {
  const ts = makeSyncTimestamp();
  expect(ts.counter).toBe(0);
  expect(ts.millis).toBe(0);
  expect(ts.node).toBe("0000000000000000");
});

test("timestampToString", () => {
  expect(pipe(makeSyncTimestamp(), timestampToString)).toMatchInlineSnapshot(
    '"1970-01-01T00:00:00.000Z-0000-0000000000000000"',
  );
});

test("timestampFromString", () => {
  const t = makeSyncTimestamp();
  expect(t).toEqual(pipe(t, timestampToString, unsafeTimestampFromString));
});

test("timestampToHash", () => {
  expect(timestampToHash(makeSyncTimestamp())).toMatchInlineSnapshot(
    "4179357717",
  );
});

const config = Config.pipe(Effect.provideLayer(ConfigLive()), Effect.runSync);

const context0 = pipe(
  Context.empty(),
  Context.add(Config, config),
  Context.add(Time, { now: Effect.succeed(0 as Millis) }),
);

const context1 = pipe(
  Context.empty(),
  Context.add(Config, config),
  Context.add(Time, { now: Effect.succeed(1 as Millis) }),
);

describe("sendTimestamp", () => {
  test("should send monotonically with a monotonic clock", () => {
    expect(
      pipe(
        makeSyncTimestamp(),
        sendTimestamp,
        Effect.provideContext(context1),
        Effect.runSync,
      ),
    ).toMatchSnapshot();
  });

  test("should send monotonically with a stuttering clock", () => {
    expect(
      pipe(
        makeSyncTimestamp(),
        sendTimestamp,
        Effect.provideContext(context0),
        Effect.runSync,
      ),
    ).toMatchSnapshot();
  });

  test("should send monotonically with a regressing clock", () => {
    expect(
      pipe(
        makeSyncTimestamp(1 as Millis),
        sendTimestamp,
        Effect.provideContext(context0),
        Effect.runSync,
      ),
    ).toMatchSnapshot();
  });

  test("should fail with counter overflow", () => {
    let timestamp: Either.Either<
      TimestampDriftError | TimestampCounterOverflowError,
      Timestamp
    > = Either.right(makeSyncTimestamp());

    for (let i = 0; i < 65536; i++) {
      timestamp = pipe(
        timestamp,
        Effect.flatMap(sendTimestamp),
        Effect.map(Either.right),
        Effect.catchAll((e) => Effect.succeed(Either.left(e))),
        Effect.provideContext(context0),
        Effect.runSync,
      );
    }

    expect(timestamp).toMatchSnapshot();
  });

  test("should fail with clock drift", () => {
    expect(
      pipe(
        makeSyncTimestamp((config.maxDrift + 1) as Millis),
        sendTimestamp,
        Effect.catchAll((e) => Effect.succeed(Either.left(e))),
        Effect.provideContext(context0),
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
        Effect.provideContext(context1),
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
          Effect.provideContext(context1),
          Effect.runSync,
        ),
      ).toMatchSnapshot();

      expect(
        pipe(
          receiveTimestamp({
            local: makeNode1Timestamp(1, 1),
            remote: makeNode2Timestamp(1, 0),
          }),
          Effect.provideContext(context0),
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
          Effect.provideContext(context0),
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
          Effect.provideContext(context0),
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
        Effect.provideContext(context1),
        Effect.runSync,
      ),
    ).toMatchSnapshot();
  });

  test("should fail with clock drift", () => {
    expect(
      pipe(
        receiveTimestamp({
          local: makeSyncTimestamp((config.maxDrift + 1) as Millis),
          remote: makeNode2Timestamp(),
        }),
        Effect.catchAll((e) => Effect.succeed(Either.left(e))),
        Effect.provideContext(context0),
        Effect.runSync,
      ),
    ).toMatchSnapshot();

    expect(
      pipe(
        receiveTimestamp({
          local: makeNode2Timestamp(),
          remote: makeSyncTimestamp((config.maxDrift + 1) as Millis),
        }),
        Effect.catchAll((e) => Effect.succeed(Either.left(e))),
        Effect.provideContext(context0),
        Effect.runSync,
      ),
    ).toMatchSnapshot();
  });
});
