/**
 * Hybrid logical clock timestamps for CRDT ordering.
 *
 * @module
 */

import { bytesToHex, hexToBytes } from "../Bytes.ts";
import type { RandomBytesDep } from "../Crypto.ts";
import { createEqObject, eqNumber, eqString } from "../Eq.ts";
import { increment } from "../Number.ts";
import type { Order } from "../Order.ts";
import { orderUint8Array } from "../Order.ts";
import type { Result } from "../Result.ts";
import { err, ok } from "../Result.ts";
import type { TimeDep } from "../Time.ts";
import { Millis, minMillis } from "../Time.ts";
import {
  brand,
  type DateIso,
  type InferType,
  length,
  lessThanOrEqualTo,
  NonNegativeInt,
  object,
  type ObjectType,
  regex,
  String,
  type Typed,
  Uint8Array,
} from "../Type.ts";

export interface TimestampConfig {
  /**
   * Maximum physical clock drift allowed in ms.
   *
   * The default value is 5 * 60 * 1000 (5 minutes).
   */
  readonly maxDrift: number;
}

/** Default value for {@link TimestampConfig.maxDrift}. */
export const defaultTimestampMaxDrift = 5 * 60 * 1000;

export interface TimestampConfigDep {
  readonly timestampConfig: TimestampConfig;
}

export type TimestampError = TimestampDriftError | TimestampTimeOutOfRangeError;

export interface TimestampDriftError extends Typed<"TimestampDriftError"> {
  readonly next: Millis;
  readonly now: Millis;
}

export interface TimestampTimeOutOfRangeError extends Typed<"TimestampTimeOutOfRangeError"> {}

export const Counter = /*#__PURE__*/ brand(
  "Counter",
  /*#__PURE__*/ lessThanOrEqualTo(65535)(NonNegativeInt),
);
export type Counter = typeof Counter.Output;

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
export const NodeId = /*#__PURE__*/ regex("NodeId", /^[a-f0-9]{16}$/u)(String);
export type NodeId = typeof NodeId.Output;

export const minNodeId = "0000000000000000" as NodeId;
export const maxNodeId = "ffffffffffffffff" as NodeId;

/** Binary representation of {@link NodeId}. */
export const NodeIdBytes = /*#__PURE__*/ brand(
  "NodeIdBytes",
  /*#__PURE__*/ length(8)(Uint8Array),
);
export type NodeIdBytes = typeof NodeIdBytes.Output;

/** Length of {@link NodeIdBytes}. */
export const nodeIdBytesLength = /*#__PURE__*/ NonNegativeInt.orThrow(8);

/** Converts {@link NodeId} to {@link NodeIdBytes}. */
export const nodeIdToNodeIdBytes = (nodeId: NodeId): NodeIdBytes =>
  hexToBytes(nodeId) as NodeIdBytes;

/** Converts {@link NodeIdBytes} to {@link NodeId}. */
export const nodeIdBytesToNodeId = (nodeIdBytes: NodeIdBytes): NodeId =>
  bytesToHex(nodeIdBytes) as NodeId;

/**
 * Hybrid Logical Clock timestamp.
 *
 * Timestamps serve as globally unique, causally ordered identifiers for CRDT
 * messages in Evolu's sync protocol.
 *
 * ## Why Hybrid Logical Clocks
 *
 * Evolu uses Hybrid Logical Clocks (HLC), which combine physical time (millis)
 * with a logical counter. This hybrid approach preserves causality like logical
 * clocks while staying close to physical time for better human
 * interpretability.
 *
 * The counter component ensures causality is maintained even when physical
 * clocks are imperfect. When clocks drift or operations occur concurrently, the
 * counter increments to establish a total order. This means Evolu achieves
 * well-defined, eventually-consistent behavior regardless of physical clock
 * accuracy.
 *
 * When the 16-bit counter is exhausted, the logical millisecond advances by one
 * and the counter resets to zero. The resulting timestamp must still fit within
 * {@link Millis} and {@link TimestampConfig.maxDrift}. This preserves
 * deterministic ordering even when a batch uses one captured wall time.
 *
 * Vector clocks can accurately track causality and detect concurrent
 * operations, but they require unbounded space in peer-to-peer systems and
 * crucially, still don't solve our fundamental problem: when they detect
 * operations as concurrent, we still need a deterministic way to choose a
 * winner. Additionally, any deterministic conflict resolution can be gamed by
 * malicious actors.
 *
 * HLC timestamps work well in practice because modern device clocks accurately
 * reflect the order of sequential edits in the common case. Evolu's `maxDrift`
 * configuration protects against buggy clocks and prevents problematic
 * future-dated entries from propagating through the network.
 *
 * ## References
 *
 * - Kulkarni, Demirbas, Madeppa, Avva, Leone: [Logical Physical Clocks and
 *   Consistent Snapshots in Globally Distributed
 *   Databases](https://cse.buffalo.edu/tech-reports/2014-04.pdf) (OPODIS 2014,
 *   [doi:10.1007/978-3-319-14472-6_2](https://doi.org/10.1007/978-3-319-14472-6_2)).
 *   The paper proposes 48 significant bits of an NTP timestamp plus a 16-bit
 *   counter and argues that the counter is sufficient under its assumptions.
 *   Evolu uses 48-bit milliseconds and rolls counter exhaustion into the next
 *   logical millisecond, subject to the timestamp range and drift limit.
 * - https://muratbuffalo.blogspot.com/2014/07/hybrid-logical-clocks.html
 * - https://sergeiturukin.com/2017/06/26/hybrid-logical-clocks.html
 * - https://jaredforsyth.com/posts/hybrid-logical-clocks/
 * - https://willowprotocol.org/more/timestamps_really/index.html
 *
 * ## Privacy Considerations
 *
 * Timestamps are metadata visible to relays and collaborators. While it can be
 * considered a privacy leak, let us explain why it's necessary, and how to
 * avoid it if maximum privacy is required.
 *
 * With real-time communication, participants always see activity (receiving
 * bytes). We cannot trust anyone not to store that information, so explicitly
 * exposing timestamps doesn't add additional risk.
 *
 * If we really want not to leak user activity, we can implement a local write
 * queue:
 *
 * 1. Write changes immediately to a local-only table
 * 2. Periodically and randomly flush messages to sync tables
 *
 * **Trade-off:** It breaks real-time collaboration.
 *
 * Another technique is generating fake random activity (dummy messages) to mask
 * real usage patterns. This preserves real-time collaboration but increases
 * storage and bandwidth usage.
 */
export const Timestamp: ObjectType<{
  readonly millis: typeof Millis;
  readonly counter: typeof Counter;
  readonly nodeId: typeof NodeId;
}> = /*#__PURE__*/ object({
  millis: Millis,
  counter: Counter,
  nodeId: NodeId,
});
export interface Timestamp extends InferType<typeof Timestamp> {}

/** Equality function for comparing {@link Timestamp}. */
export const eqTimestamp = /*#__PURE__*/ createEqObject<Timestamp>({
  millis: eqNumber,
  counter: eqNumber,
  nodeId: eqString,
});

export const createTimestamp = ({
  millis = minMillis,
  counter = minCounter,
  nodeId = minNodeId,
}: Partial<Timestamp> = {}): Timestamp => ({ millis, counter, nodeId });

export const createInitialTimestamp = (deps: RandomBytesDep): Timestamp => {
  const nodeId = bytesToHex(deps.randomBytes.create(8)) as NodeId;
  return createTimestamp({ nodeId });
};

/**
 * Advances a {@link Timestamp} for a local event.
 *
 * Counter exhaustion rolls into the next logical millisecond. Failures are
 * limited to the drift and timestamp-range errors in {@link TimestampError}.
 *
 * ### Example
 *
 * ```ts
 * import { assertOk, Millis, testCreateTime } from "@evolu/common";
 * import {
 *   createTimestamp,
 *   maxCounter,
 *   sendTimestamp,
 * } from "@evolu/common/local-first";
 *
 * const before = createTimestamp({ counter: maxCounter });
 * const result = sendTimestamp({
 *   time: testCreateTime(),
 *   timestampConfig: { maxDrift: 1 },
 * })(before);
 * assertOk(result, { ...before, millis: Millis.orThrow(1), counter: 0 });
 * ```
 */
export const sendTimestamp =
  (deps: TimeDep & TimestampConfigDep) =>
  (timestamp: Timestamp): Result<Timestamp, TimestampError> => {
    const now = Millis.fromUnknown(deps.time.now());
    if (!now.ok) return err({ type: "TimestampTimeOutOfRangeError" });
    const millis = Math.max(now.value, timestamp.millis) as Millis;
    const counter =
      millis === timestamp.millis ? increment(timestamp.counter) : minCounter;

    return createNextTimestamp(deps)({
      millis,
      counter,
      nodeId: timestamp.nodeId,
      now: now.value,
    });
  };

export const receiveTimestamp =
  (deps: TimeDep & TimestampConfigDep) =>
  (local: Timestamp, remote: Timestamp): Result<Timestamp, TimestampError> => {
    const now = Millis.fromUnknown(deps.time.now());
    if (!now.ok) return err({ type: "TimestampTimeOutOfRangeError" });
    const millis = Math.max(now.value, local.millis, remote.millis) as Millis;
    const counter =
      millis === local.millis && millis === remote.millis
        ? increment(Math.max(local.counter, remote.counter))
        : millis === local.millis
          ? increment(local.counter)
          : millis === remote.millis
            ? increment(remote.counter)
            : minCounter;

    return createNextTimestamp(deps)({
      millis,
      counter,
      nodeId: local.nodeId,
      now: now.value,
    });
  };

const createNextTimestamp =
  (deps: TimestampConfigDep) =>
  ({
    millis,
    counter,
    nodeId,
    now,
  }: {
    millis: Millis;
    counter: number;
    nodeId: NodeId;
    now: Millis;
  }): Result<Timestamp, TimestampError> => {
    const nextCounter = Counter.fromUnknown(counter);
    const nextMillis = nextCounter.ok
      ? ok(millis)
      : Millis.fromUnknown(increment(millis));
    if (!nextMillis.ok) return err({ type: "TimestampTimeOutOfRangeError" });
    if (nextMillis.value - now > deps.timestampConfig.maxDrift) {
      return err({ type: "TimestampDriftError", now, next: nextMillis.value });
    }
    return ok({
      millis: nextMillis.value,
      counter: nextCounter.ok ? nextCounter.value : minCounter,
      nodeId,
    });
  };

/** Sortable bytes representation of {@link Timestamp}. */
export const TimestampBytes = /*#__PURE__*/ brand(
  "TimestampBytes",
  /*#__PURE__*/ length(16)(Uint8Array),
);
export type TimestampBytes = typeof TimestampBytes.Output;

export const timestampBytesLength = /*#__PURE__*/ NonNegativeInt.orThrow(16);

export const timestampToTimestampBytes = (
  timestamp: Timestamp,
): TimestampBytes => {
  const { millis, counter, nodeId } = timestamp;

  // 6 bytes for millis, 2 bytes for counter, 8 bytes for nodeId.
  const value = new globalThis.Uint8Array(16);

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

  // Encode `nodeId` into the next 8 bytes.
  value.set(nodeIdToNodeIdBytes(nodeId), 8);

  return value as TimestampBytes;
};

export const timestampBytesToTimestamp = (
  timestamp: TimestampBytes,
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
  const nodeId = nodeIdBytesToNodeId(timestamp.subarray(8) as NodeIdBytes);

  return { millis: Number(millis), counter, nodeId } as Timestamp;
};

/**
 * An {@link Order} for {@link TimestampBytes}.
 *
 * This `Order` uses lexicographic byte order to compare serialized
 * {@link TimestampBytes} produced by {@link timestampToTimestampBytes}. See
 * {@link orderUint8Array} for the underlying implementation.
 */
export const orderTimestampBytes: Order<TimestampBytes> = orderUint8Array;

/**
 * Convert a {@link Timestamp} to an ISO 8601 {@link DateIso} string.
 *
 * The conversion uses the timestamp's `millis` (a {@link Millis} value) and
 * `Date.prototype.toISOString()` to produce a `DateIso`.
 */
export const timestampToDateIso = (timestamp: Timestamp): DateIso =>
  // `as DateIso` is safe because Timestamp guarantees a valid `millis`
  new Date(timestamp.millis).toISOString() as DateIso;
