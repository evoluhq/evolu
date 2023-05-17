import * as Context from "@effect/data/Context";
import * as Either from "@effect/data/Either";
import { pipe } from "@effect/data/Function";
import { describe, expect, test } from "vitest";
import { createNode1Timestamp, createNode2Timestamp } from "./testUtils.js";
import { createConfig } from "../src/Config.js";
import {
  createInitialTimestamp,
  createSyncTimestamp,
  receiveTimestamp,
  sendTimestamp,
  timestampToHash,
  timestampToString,
  unsafeTimestampFromString,
} from "../src/Timestamp.js";
import * as Effect from "@effect/io/Effect";
import {
  Config,
  Millis,
  Time,
  Timestamp,
  TimestampCounterOverflowError,
  TimestampDriftError,
} from "../src/Types.js";

test("createInitialTimestamp", () => {
  const ts = Effect.runSync(createInitialTimestamp);
  expect(ts.counter).toBe(0);
  expect(ts.millis).toBe(0);
  expect(ts.node.length).toBe(16);
});

// test("createSyncTimestamp", () => {
//   const ts = createSyncTimestamp();
//   expect(ts.counter).toBe(0);
//   expect(ts.millis).toBe(0);
//   expect(ts.node).toBe("0000000000000000");
// });

// test("timestampToString", () => {
//   expect(pipe(createSyncTimestamp(), timestampToString)).toMatchSnapshot();
// });

// test("timestampFromString", () => {
//   const t = createSyncTimestamp();
//   expect(t).toEqual(pipe(t, timestampToString, unsafeTimestampFromString));
// });

// test("timestampToHash", () => {
//   expect(timestampToHash(createSyncTimestamp())).toMatchSnapshot();
// });

// const config = createConfig();

// const context0 = pipe(
//   Context.empty(),
//   Context.add(Config, config),
//   Context.add(Time, { now: () => 0 as Millis })
// );

// const context1 = pipe(
//   Context.empty(),
//   Context.add(Config, config),
//   Context.add(Time, { now: () => 1 as Millis })
// );

// describe("sendTimestamp", () => {
//   test("should send monotonically with a monotonic clock", () => {
//     expect(
//       pipe(
//         createSyncTimestamp(),
//         sendTimestamp,
//         Effect.provideContext(context1),
//         Effect.runSyncEither
//       )
//     ).toMatchSnapshot();
//   });

//   test("should send monotonically with a stuttering clock", () => {
//     expect(
//       pipe(
//         createSyncTimestamp(),
//         sendTimestamp,
//         Effect.provideContext(context0),
//         Effect.runSyncEither
//       )
//     ).toMatchSnapshot();
//   });

//   test("should send monotonically with a regressing clock", () => {
//     expect(
//       pipe(
//         createSyncTimestamp(1 as Millis),
//         sendTimestamp,
//         Effect.provideContext(context0),
//         Effect.runSyncEither
//       )
//     ).toMatchSnapshot();
//   });

//   test("should fail with counter overflow", () => {
//     let timestamp: Either.Either<
//       TimestampDriftError | TimestampCounterOverflowError,
//       Timestamp
//     > = Either.right(createSyncTimestamp());

//     for (let i = 0; i < 65536; i++) {
//       timestamp = pipe(
//         timestamp,
//         Either.flatMap((t) =>
//           pipe(
//             sendTimestamp(t),
//             Effect.provideContext(context0),
//             Effect.runSyncEither
//           )
//         )
//       );
//     }

//     expect(timestamp).toMatchSnapshot();
//   });

//   test("should fail with clock drift", () => {
//     expect(
//       pipe(
//         createSyncTimestamp((config.maxDrift + 1) as Millis),
//         sendTimestamp,
//         Effect.provideContext(context0),
//         Effect.runSyncEither
//       )
//     ).toMatchSnapshot();
//   });
// });

// describe("receiveTimestamp", () => {
//   test("wall clock is later than both the local and remote timestamps", () => {
//     expect(
//       pipe(
//         receiveTimestamp(createNode1Timestamp(), createNode2Timestamp(0, 0)),
//         Effect.provideContext(context1),
//         Effect.runSyncEither
//       )
//     ).toMatchSnapshot();
//   });

//   describe("wall clock is somehow behind", () => {
//     test("for the same timestamps millis, we take the bigger counter", () => {
//       expect(
//         pipe(
//           receiveTimestamp(
//             createNode1Timestamp(1, 0),
//             createNode2Timestamp(1, 1)
//           ),
//           Effect.provideContext(context1),
//           Effect.runSyncEither
//         )
//       ).toMatchSnapshot();

//       expect(
//         pipe(
//           receiveTimestamp(
//             createNode1Timestamp(1, 1),
//             createNode2Timestamp(1, 0)
//           ),
//           Effect.provideContext(context0),
//           Effect.runSyncEither
//         )
//       ).toMatchSnapshot();
//     });

//     test("local millis is later than remote", () => {
//       expect(
//         pipe(
//           receiveTimestamp(createNode1Timestamp(2), createNode2Timestamp(1)),
//           Effect.provideContext(context0),
//           Effect.runSyncEither
//         )
//       ).toMatchSnapshot();
//     });

//     test("remote millis is later than local", () => {
//       expect(
//         pipe(
//           receiveTimestamp(createNode1Timestamp(1), createNode2Timestamp(2)),
//           Effect.provideContext(context0),
//           Effect.runSyncEither
//         )
//       ).toMatchSnapshot();
//     });
//   });

//   test("TimestampDuplicateNodeError", () => {
//     expect(
//       pipe(
//         receiveTimestamp(createNode1Timestamp(), createNode1Timestamp()),
//         Effect.provideContext(context1),
//         Effect.runSyncEither
//       )
//     ).toMatchSnapshot();
//   });

//   test("should fail with clock drift", () => {
//     expect(
//       pipe(
//         receiveTimestamp(
//           createSyncTimestamp((config.maxDrift + 1) as Millis),
//           createNode2Timestamp()
//         ),
//         Effect.provideContext(context0),
//         Effect.runSyncEither
//       )
//     ).toMatchSnapshot();

//     expect(
//       pipe(
//         receiveTimestamp(
//           createNode2Timestamp(),
//           createSyncTimestamp((config.maxDrift + 1) as Millis)
//         ),
//         Effect.provideContext(context0),
//         Effect.runSyncEither
//       )
//     ).toMatchSnapshot();
//   });
// });
