import { assert } from "../Assert.js";
import { Brand } from "../Brand.js";
import { createEqObject, eqNumber, eqString } from "../Eq.js";
import { NanoIdLibDep } from "../NanoId.js";
import { increment } from "../Number.js";
import { Order, orderUint8Array } from "../Order.js";
import { err, ok, Result } from "../Result.js";
import { TimeDep } from "../Time.js";
import {
  brand,
  lessThanOrEqualTo,
  NonNegativeInt,
  object,
  regex,
  String,
} from "../Type.js";

export interface TimestampConfig {
  /**
   * Maximum physical clock drift allowed in ms.
   *
   * The default value is 5 * 60 * 1000 (5 minutes).
   */
  readonly maxDrift: number;
}

export interface TimestampConfigDep {
  readonly timestampConfig: TimestampConfig;
}

export type TimestampError =
  | TimestampDriftError
  | TimestampCounterOverflowError
  | TimestampTimeOutOfRangeError;

export interface TimestampDriftError {
  readonly type: "TimestampDriftError";
  readonly next: Millis;
  readonly now: Millis;
}

export interface TimestampCounterOverflowError {
  readonly type: "TimestampCounterOverflowError";
}

export interface TimestampTimeOutOfRangeError {
  readonly type: "TimestampTimeOutOfRangeError";
}

/**
 * Millis is a timestamp in milliseconds, like `Date.now()`, but limited to the
 * maximum value representable in 6 bytes (281474976710655) minus 1 (reserved
 * for infinity). This enables more efficient binary serialization, saving 2
 * bytes compared to the typical 8-byte (64-bit) timestamp representation.
 *
 * This limit is enforced to prevent data corruption. If a device's clock
 * exceeds this range, Evolu will stop saving data until the clock is
 * corrected.
 *
 * `new Date(281474976710654).toString()` = Tue Aug 02 10889 07:31:49
 */
export const Millis = brand(
  "Millis",
  lessThanOrEqualTo(281474976710655 - 1)(NonNegativeInt),
);
export type Millis = typeof Millis.Type;

export const minMillis = 0 as Millis;
export const maxMillis = (281474976710655 - 1) as Millis;

export const Counter = brand(
  "Counter",
  lessThanOrEqualTo(65535)(NonNegativeInt),
);
export type Counter = typeof Counter.Type;

export const minCounter = 0 as Counter;
export const maxCounter = 65535 as Counter;

/**
 * A NodeId uniquely identifies an owner's device. Generated once per device
 * using cryptographic randomness.
 *
 * Collision probability (birthday paradox):
 *
 * - 1,000 devices: ~0.00000000000271% (negligible).
 * - 1M devices: ~0.00000271% (1 in 37M chance).
 * - 135M devices: ~1% chance.
 * - 4.29B devices: ~50% chance.
 *
 * https://lemire.me/blog/2019/12/12/are-64-bit-random-identifiers-free-from-collision
 *
 * What happens if different devices generate the same NodeId?
 *
 * If devices with the same NodeId use different owners, no issues occur.
 *
 * If devices with the same NodeId use the same owner, problems only arise when
 * they generate CRDT messages with identical timestamps (same millis, counter,
 * and NodeId). In this case, the protocol sync algorithm treats them as the
 * same message: the first will be synced with the relay, while the affected
 * message will not be delivered. The affected devices will see different data
 * yet they will think they are synced. This is extremely rare and can be
 * resolved by resetting one device to generate a new NodeId.
 */
export const NodeId = regex("NodeId", /^[a-f0-9]{16}$/)(String);
export type NodeId = typeof NodeId.Type;

export const minNodeId = "0000000000000000" as NodeId;
export const maxNodeId = "ffffffffffffffff" as NodeId;

/**
 * Hybrid Logical Clock timestamp.
 *
 * - https://muratbuffalo.blogspot.com/2014/07/hybrid-logical-clocks.html
 * - https://sergeiturukin.com/2017/06/26/hybrid-logical-clocks.html
 * - https://jaredforsyth.com/posts/hybrid-logical-clocks/
 */
export const Timestamp = object({
  millis: Millis,
  counter: Counter,
  nodeId: NodeId,
});
export type Timestamp = typeof Timestamp.Type;

/** Equality function for comparing {@link Timestamp}. */
export const eqTimestamp = createEqObject<Timestamp>({
  millis: eqNumber,
  counter: eqNumber,
  nodeId: eqString,
});

export const createTimestamp = ({
  millis = minMillis,
  counter = minCounter,
  nodeId = minNodeId,
}: Partial<Timestamp> = {}): Timestamp => ({ millis, counter, nodeId });

const hexAlphabet = "0123456789abcdef";

export const createInitialTimestamp = (deps: NanoIdLibDep): Timestamp => {
  const nodeId = deps.nanoIdLib.customAlphabet(hexAlphabet, 16)() as NodeId;
  return createTimestamp({ nodeId });
};

/** TimestampString is a sortable string version of {@link Timestamp}. */
export type TimestampString = string & Brand<"TimestampString">;

export const timestampToTimestampString = (t: Timestamp): TimestampString =>
  [
    new Date(t.millis).toISOString(),
    t.counter.toString(16).toUpperCase().padStart(4, "0"),
    t.nodeId,
  ].join("-") as TimestampString;

export const timestampStringToTimestamp = (
  timestampString: TimestampString,
): Timestamp => {
  const array = timestampString.split("-");
  const timestamp = {
    millis: Date.parse(array.slice(0, 3).join("-")).valueOf(),
    counter: parseInt(array[3], 16),
    nodeId: array[4],
  };
  assert(Timestamp.is(timestamp), "timestampString is malformed");
  return timestamp;
};

const getNextMillis =
  (deps: TimeDep & TimestampConfigDep) =>
  (
    millis: ReadonlyArray<Millis>,
  ): Result<Millis, TimestampTimeOutOfRangeError | TimestampDriftError> => {
    const now = Millis.from(deps.time.now());
    if (!now.ok) {
      return err({ type: "TimestampTimeOutOfRangeError" });
    }
    const next = Math.max(now.value, ...millis) as Millis;
    return next - now.value > deps.timestampConfig.maxDrift
      ? err<TimestampDriftError>({
          type: "TimestampDriftError",
          now: now.value,
          next,
        })
      : ok(next);
  };

const incrementCounter = (
  counter: Counter,
): Result<Counter, TimestampCounterOverflowError> => {
  const next = Counter.from(increment(counter));
  if (!next.ok) return err({ type: "TimestampCounterOverflowError" });
  return ok(next.value);
};

export const sendTimestamp =
  (deps: TimeDep & TimestampConfigDep) =>
  (
    timestamp: Timestamp,
  ): Result<
    Timestamp,
    | TimestampDriftError
    | TimestampCounterOverflowError
    | TimestampTimeOutOfRangeError
  > => {
    const millis = getNextMillis(deps)([timestamp.millis]);
    if (!millis.ok) return millis;

    const counter =
      millis.value === timestamp.millis
        ? incrementCounter(timestamp.counter)
        : ok(minCounter);
    if (!counter.ok) return counter;

    return ok({
      millis: millis.value,
      counter: counter.value,
      nodeId: timestamp.nodeId,
    });
  };

export const receiveTimestamp =
  (deps: TimeDep & TimestampConfigDep) =>
  (
    local: Timestamp,
    remote: Timestamp,
  ): Result<
    Timestamp,
    | TimestampDriftError
    | TimestampCounterOverflowError
    | TimestampTimeOutOfRangeError
  > => {
    const millis = getNextMillis(deps)([local.millis, remote.millis]);
    if (!millis.ok) return millis;

    const counter =
      millis.value === local.millis && millis.value === remote.millis
        ? incrementCounter(Math.max(local.counter, remote.counter) as Counter)
        : millis.value === local.millis
          ? incrementCounter(local.counter)
          : millis.value === remote.millis
            ? incrementCounter(remote.counter)
            : ok(minCounter);

    if (!counter.ok) return counter;

    return ok({
      millis: millis.value,
      counter: counter.value,
      nodeId: local.nodeId,
    });
  };

/** BinaryTimestamp is a binary and sortable version of {@link Timestamp} for DB. */
export type BinaryTimestamp = Uint8Array & Brand<"BinaryTimestamp">;

export const binaryTimestampLength = NonNegativeInt.orThrow(16);

export const timestampToBinaryTimestamp = (
  timestamp: Timestamp,
): BinaryTimestamp => {
  const { millis, counter, nodeId } = timestamp;

  // 6 bytes for millis, 2 bytes for counter, 8 bytes for nodeId.
  const value = new Uint8Array(16);

  // Encode `millis` into the first 6 bytes.
  const millisBigInt = BigInt(millis);
  value[0] = Number((millisBigInt >> 40n) & 0xffn);
  value[1] = Number((millisBigInt >> 32n) & 0xffn);
  value[2] = Number((millisBigInt >> 24n) & 0xffn);
  value[3] = Number((millisBigInt >> 16n) & 0xffn);
  value[4] = Number((millisBigInt >> 8n) & 0xffn);
  value[5] = Number(millisBigInt & 0xffn);

  // Encode `counter` into the next 2 bytes.
  value[6] = (counter >> 8) & 0xff;
  value[7] = counter & 0xff;

  // Encode `nodeId` (16-character hex string) into the next 8 bytes.
  for (let i = 0; i < 8; i++) {
    const byte = parseInt(nodeId.slice(i * 2, i * 2 + 2), 16);
    value[8 + i] = byte;
  }

  return value as BinaryTimestamp;
};

export const binaryTimestampToTimestamp = (
  timestamp: BinaryTimestamp,
): Timestamp => {
  // Decode `millis` from the first 6 bytes.
  const millis =
    (BigInt(timestamp[0]) << 40n) |
    (BigInt(timestamp[1]) << 32n) |
    (BigInt(timestamp[2]) << 24n) |
    (BigInt(timestamp[3]) << 16n) |
    (BigInt(timestamp[4]) << 8n) |
    BigInt(timestamp[5]);

  // Decode `counter` from the next 2 bytes.
  const counter = (timestamp[6] << 8) | timestamp[7];

  // Decode `nodeId` from the last 8 bytes.
  let nodeId = "";
  for (let i = 8; i < 16; i++) {
    nodeId += timestamp[i].toString(16).padStart(2, "0");
  }

  return { millis: Number(millis), counter, nodeId } as Timestamp;
};

export const orderBinaryTimestamp: Order<BinaryTimestamp> = orderUint8Array;
