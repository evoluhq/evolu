/**
 * Hybrid logical clock timestamps for CRDT ordering.
 *
 * Every change to a synced table becomes a CRDT message stamped with a
 * {@link Timestamp}. The timestamp is the message's identity for sync, which
 * reconciles sets of timestamps between devices and relays, and its order for
 * conflicts, which last-writer-wins resolves per column by comparing
 * timestamps. Each database keeps one clock. It advances when stamping local
 * changes to synced tables and accepting incoming messages, so later writes
 * sort after earlier local writes and accepted messages.
 *
 * A device whose system clock is ahead produces future timestamps. They can
 * override edits made later in real time on devices that have not yet accepted
 * them. Accepting one advances the receiver's logical clock, so its later
 * writes sort after the accepted message and carry future timestamps too, even
 * before system time catches up. That propagation preserves ordering, and it
 * does not compound: each device checks an incoming timestamp against its own
 * system time. Counter rollover or a backwards system-clock adjustment can
 * still put such a write in quarantine.
 *
 * ### Clock drift
 *
 * {@link sendTimestamp} and {@link receiveTimestamp} check the resulting clock
 * against {@link TimestampConfig.maxDrift}, returning {@link TimestampDriftError}
 * when it exceeds the limit. Receipt also checks the remote timestamp before
 * arithmetic. The database uses the same {@link isTimestampBeyondMaxDrift}
 * predicate to decide whether a message can be applied. Two situations matter
 * here:
 *
 * - An incoming message has a timestamp too far ahead of the receiving device's
 *   system time. It can come from another device of the same owner or from a
 *   collaborator, and the check cannot tell whether the sender is ahead or the
 *   receiver behind.
 * - The device's own system time is ahead and a write advances its logical clock.
 *   Drift is measured against the device's own system time, so the device
 *   accepts such writes as normal and stamps them ahead; other devices
 *   quarantine them. Only if system time then moves back far enough does the
 *   logical clock remain ahead and subsequent local changes go to quarantine.
 *   Ordinary incoming messages are still applied when their own timestamps are
 *   within the limit, even when the local clock is ahead. The clock is shared
 *   by all owners in the database.
 *
 * System time is usually wrong by hours, rarely by years. A person sets the
 * clock by hand, often misreading daylight saving time or the year, or picks a
 * wrong time zone while the clock is set manually. A virtual machine resumes
 * from a snapshot. Time synchronization corrects a clock that ran fast. A
 * device with a dead clock battery boots into the past. Daylight saving time
 * itself changes nothing, because timestamps use epoch milliseconds. Drift of
 * years comes from a clock set to the wrong year, a bug, or, in collaboration,
 * a vandalizing collaborator.
 *
 * The database uses a five-minute limit. It tolerates a few minutes of
 * difference between device clocks and quarantines messages hours or days ahead
 * of system time. The limit is a trade-off: a smaller one quarantines more; a
 * larger one admits more future skew and releases sooner. No limit orders
 * independent offline edits by real time. Five minutes is a policy choice: the
 * [HLC paper, Section 4.2](https://cse.buffalo.edu/tech-reports/2014-04.pdf)
 * leaves the tolerance to application semantics and suggests at most seconds
 * for NTP-synchronized servers, which user devices are not. [Actual
 * Budget](https://github.com/actualbudget/actual/blob/master/packages/crdt/src/crdt/timestamp.ts)
 * uses the same default, a precedent rather than proof.
 *
 * ### Quarantine
 *
 * When a message's own timestamp exceeds the limit, Evolu stores the message in
 * quarantine without applying it to application tables. The database queue and
 * sync continue; other messages and requests are processed normally. Completing
 * a mutation means its changes are stored; some may be quarantined rather than
 * visible in application queries.
 *
 * Quarantine is state, not an error. Nothing is reported through the error
 * channel; the quarantine table records each unapplied message with its reason,
 * whether this database stamped it for a local mutation or received it, and the
 * system time when it was quarantined. Applications watch that table through
 * queries, and a subscribed query reflects a local mutation's quarantined rows
 * before its completion callback runs. Quarantine works offline, independently
 * of sync state, so the application can explain why the user's change is not
 * visible.
 *
 * A local change still receives the next logical timestamp, and that clock
 * advance is persisted with the quarantined message. Further local changes also
 * go to quarantine while their timestamps exceed the drift limit. New mutations
 * apply normally once their timestamps fall within it; existing drift
 * quarantine still waits for database worker startup. An incoming message is
 * quarantined only when its own timestamp exceeds system time by more than the
 * limit. `receiveTimestamp` rejects that timestamp before calculating the next
 * clock, so the message keeps its original timestamp, quarantining it does not
 * advance the local clock, and a timestamp at the range ceiling is quarantined
 * rather than failing its batch with a range error. For a message within the
 * limit, the database applies the message and persists the next clock even if
 * an already-ahead local clock or counter rollover produces a timestamp beyond
 * the limit. An ahead local clock surfaces through local changes. A message
 * whose timestamp is already in the owner's set is not written again: it was
 * applied or quarantined before, and a duplicate cannot change that decision.
 * Quarantined messages count as stored for sync and can be forwarded normally;
 * each receiving device decides whether to apply or quarantine them. A
 * quarantined timestamp far in the future also becomes the owner's last stored
 * timestamp on every device and relay that stores it, so their later timestamps
 * take the slower insert path of the timestamp skiplist instead of append until
 * system time passes it. One device whose clock is set ahead is enough to cause
 * this for the whole owner. The cost is a constant factor per stored message,
 * the `insert` versus `append` workloads of the storage benchmark; ordering and
 * sync are unaffected. Relays store and forward messages without checking clock
 * drift: acceptance belongs to clients and must not depend on an honest relay
 * or its system clock.
 *
 * Quarantine does not itself make sync fail: completing sync does not mean
 * every stored message has been applied to application tables.
 *
 * ### Release
 *
 * Drift quarantine is checked only when the database worker starts, as schema
 * quarantine is. At that point, messages are released if their timestamps are
 * no more than the drift limit ahead of system time, matching acceptance on a
 * fresh receipt. Devices can therefore converge on the same visible state after
 * their workers restart, regardless of delivery timing.
 *
 * On the web, the tab holding the leader lock hosts the database worker. When
 * that tab closes or reloads, a tab taking over leadership starts a
 * replacement, and other open tabs refresh their subscribed queries. Reloading
 * a non-leader tab does not restart the database worker.
 *
 * Release checks use one captured system time. The logical clock advances over
 * distinct released timestamps in timestamp order, as receipts do, so later
 * local changes sort after them even before system time catches up. Released
 * columns use last-writer-wins, so a future-stamped message overrides edits any
 * device stamped before accepting or releasing it. Columns the schema does not
 * define move to schema quarantine and are applied after a schema update.
 * Duplicate delivery does not release: the timestamp is already in the owner's
 * set. Release during a running database worker's session is outside this
 * change's scope. Correcting system time does not trigger release; eligible
 * messages are released when the database worker next starts.
 *
 * Release runs before the database worker reports its clock, so fresh requests
 * start from the clock advanced by release. The stored clock never moves
 * backwards. A replacement database worker's clock is adopted only if newer, so
 * an empty `memoryOnly` replacement does not reset the session clock. Pending
 * writes keep their captured inputs, so a replay reproduces the timestamps of
 * the original attempt. Responses report their computed clock, which the
 * SharedWorker adopts only if newer. Acquiring the replacement refreshes
 * subscribed queries, because a startup release or a committed write whose
 * response was lost would otherwise stay invisible.
 *
 * ### Recovery
 *
 * Recovery for messages further ahead than the drift limit is not implemented
 * yet. These constraints shape it. Deleting quarantine rows is not a safe
 * primitive: the timestamp stays in the owner's set and on relays, and a stored
 * timestamp must be able to produce its message. Recovery therefore applies the
 * rows early, re-authors them as a new mutation with a fresh timestamp, or
 * marks them discarded. Re-authoring is only right for a local origin. All
 * three leave the future-stamped message stored for sync with its original
 * timestamp, so on other devices it still overrides edits stamped before they
 * accept it. Applying early is acceptable while the rows are a short time
 * ahead, as after a manual clock change; how short is an application decision,
 * measured as the row's timestamp minus current time. Rows far ahead, from a
 * clock set to the wrong year, a bug, or a vandalizing collaborator, require
 * migrating the owner's visible state to a new owner with fresh timestamps; the
 * old owner is abandoned. How relays treat an abandoned owner is not specified
 * yet.
 *
 * ### Range error
 *
 * {@link TimestampTimeOutOfRangeError} means counter rollover would move the
 * next logical timestamp past the {@link Millis} ceiling. `receiveTimestamp`
 * checks remote drift before arithmetic, so a far-future message is quarantined
 * before it can cause a range error. With ordinary system time and stored
 * timestamps, the database does not approach the range ceiling.
 *
 * It is an {@link EvoluError}. The application tells the user to fix the clock
 * and restart the app. On receipt, the batch is not written and the connection
 * continues; the timestamps are missing from the owner's set, so range
 * reconciliation resends the batch in a later round. The shared worker requests
 * one round after the failure; after that, a round runs when a connection
 * opens, as after a restart or a reconnect, or when the application calls
 * {@link Evolu.requestSync}. A local mutation that hits it is rolled back and
 * reported, but the database worker posts no queued response for it, so the
 * shared worker never completes that request: later requests for the database
 * wait, the mutation's completion callbacks stay registered, and replacing the
 * leader replays the request with the captured system time and fails the same
 * way; a restart discards the queue and the mutation. This is left as is
 * because the condition is unreachable with a real system clock. Completing the
 * queue requires a rejection response from the database worker that the shared
 * worker turns into queue completion and releases the mutation's completion
 * callbacks without invoking them.
 *
 * ### Duplicate node IDs
 *
 * Detection and recovery are deliberately deferred to separate work. This
 * includes the receive-first collision below, where a local mutation can
 * complete without being stored.
 *
 * The node ID is random per database and persisted in the clock. A database
 * copied to another device, as when an operating system backup is restored to a
 * new phone while the old one stays in use, leaves both independent copies
 * stamping from the same node ID and clock. Tabs and Evolu instances sharing
 * one database coordinate their writes through its shared clock.
 *
 * For the same owner, two changes stamped in the same logical millisecond with
 * the same counter get identical timestamps. If both copies write before
 * receiving the other's change, each keeps its own version, while relays and
 * third devices keep the first arrival. The copies can diverge with no error.
 * This is likely while the copied clock is ahead of both devices' system time,
 * because both stamp counters 1, 2, 3 in the same millisecond.
 *
 * Receiving first can instead lose a local change. A copy quarantines an
 * incoming timestamp beyond the drift limit without advancing its clock. Its
 * next local mutation can then produce that same timestamp. The timestamp is
 * already in the owner's set, so the local change is skipped: it is stored in
 * neither application tables, history, nor quarantine, but `onComplete` still
 * runs. The previously received change remains stored under that timestamp.
 *
 * Detection: a received message whose timestamp is new to the owner's set but
 * carries the local node ID cannot be ours, because every timestamp authored
 * locally is already in the set before it can be sent, and a restored or
 * recreated database mints a fresh node ID. `applyMessages` knows both facts
 * when `insertTimestamp` reports a new timestamp. Messages whose timestamps are
 * already stored are invisible to this rule; a new timestamp from the copy
 * trips it.
 *
 * An empty `memoryOnly` replacement is an exception: it can retain the
 * SharedWorker's previous clock and node ID while losing the timestamp set.
 * Detection must account for this before rotation, or our own earlier messages
 * could be mistaken for another database's changes.
 *
 * Handling: rotate the local node ID to a fresh random one, which changes only
 * future timestamps, and report the copy through sync state or the error store
 * so the application can warn that edits before detection may have diverged or
 * been lost. Both copies detect each other and rotate, after which detection
 * stops because messages with the old ID are no longer ours. Rotation cannot
 * heal past collisions. Deleting and resyncing the database automatically is
 * rejected: it drops unsynced changes and local-only tables, needs a relay, and
 * does not recover the dropped half of a collision; restore from mnemonic is
 * its manual form. The rotation must not happen inside the replayed write: a
 * replay sees nothing new and would save the input clock with the old node ID
 * again. The write's response flags the detection and the SharedWorker enqueues
 * a separate rotation request, which is harmless to replay.
 *
 * @module
 */

import { bytesToHex, hexToBytes } from "../Bytes.ts";
import type { RandomBytesDep } from "../Crypto.ts";
import { createEqObject, eqNumber, eqString } from "../Eq.ts";
import { increment } from "../Number.ts";
import type { Order } from "../Order.ts";
import { orderNumber, orderString, orderUint8Array } from "../Order.ts";
import type { Result } from "../Result.ts";
import { err, ok } from "../Result.ts";
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
import type { Evolu, EvoluError } from "./Evolu.ts";

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

/** Errors from advancing a {@link Timestamp}. */
export type TimestampError = TimestampDriftError | TimestampTimeOutOfRangeError;

/**
 * A timestamp exceeds {@link TimestampConfig.maxDrift}.
 *
 * For local drift, the failed operation includes its candidate for explicit
 * recovery by the database. For remote drift, it includes the rejected input;
 * the local clock must not advance from it.
 *
 * Local drift stays an error even when the database recovers: callers can rely
 * on successful timestamp operations satisfying the drift limit without a
 * separate check.
 */
export interface TimestampDriftError extends Typed<"TimestampDriftError"> {
  /** The computed candidate for local drift, or the rejected remote input. */
  readonly timestamp: Timestamp;
  readonly cause: "local" | "remote";
  /** Captured system time used for the drift check. */
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
 * {@link Millis}. If rollover exceeds {@link TimestampConfig.maxDrift},
 * {@link sendTimestamp} and {@link receiveTimestamp} return
 * {@link TimestampDriftError} with the candidate timestamp for the database to
 * handle. Rollover preserves deterministic ordering even when a batch uses one
 * captured wall time.
 *
 * Vector clocks can accurately track causality and detect concurrent
 * operations, but they require unbounded space in peer-to-peer systems and
 * crucially, still don't solve our fundamental problem: when they detect
 * operations as concurrent, we still need a deterministic way to choose a
 * winner. Additionally, any deterministic conflict resolution can be gamed by
 * malicious actors.
 *
 * HLC timestamps work well in practice because modern device clocks accurately
 * reflect the order of sequential edits in the common case. The database uses
 * the drift limit to quarantine messages whose own timestamps are too far ahead
 * of its system time without applying them to application tables. Quarantined
 * messages remain stored and synchronized; each receiving device checks drift
 * against its own system time.
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
 *   logical millisecond, subject to the timestamp range.
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

/**
 * Orders {@link Timestamp} by milliseconds, counter, then node ID.
 *
 * Matches {@link orderTimestampBytes} without encoding timestamps. Distinct
 * objects with identical fields compare as equal.
 *
 * ### Example
 *
 * ```ts
 * import { assertEqual } from "@evolu/common";
 * import {
 *   createTimestamp,
 *   orderTimestamp,
 * } from "@evolu/common/local-first";
 *
 * const timestamp = createTimestamp();
 * assertEqual(orderTimestamp(timestamp, { ...timestamp }), 0);
 * ```
 */
export const orderTimestamp: Order<Timestamp> = (a, b) =>
  orderNumber(a.millis, b.millis) ||
  orderNumber(a.counter, b.counter) ||
  orderString(a.nodeId, b.nodeId);

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
 * Counter exhaustion rolls into the next logical millisecond. Rollover past the
 * timestamp range returns {@link TimestampTimeOutOfRangeError}. The resulting
 * timestamp is checked for drift, including after rollover; a failure returns
 * {@link TimestampDriftError} with the candidate and `cause: "local"`. Pass the
 * request's captured system time so replay produces the same result.
 *
 * ### Example
 *
 * ```ts
 * import { assertOk, Millis } from "@evolu/common";
 * import {
 *   createTimestamp,
 *   maxCounter,
 *   sendTimestamp,
 * } from "@evolu/common/local-first";
 *
 * const before = createTimestamp({ counter: maxCounter });
 * const result = sendTimestamp({ timestampConfig: { maxDrift: 1 } })(
 *   before,
 *   Millis.orThrow(0),
 * );
 * assertOk(result, { ...before, millis: Millis.orThrow(1), counter: 0 });
 * ```
 */
export const sendTimestamp =
  (deps: TimestampConfigDep) =>
  (timestamp: Timestamp, now: Millis): Result<Timestamp, TimestampError> => {
    let millis = Math.max(now, timestamp.millis) as Millis;
    let counter =
      millis === timestamp.millis ? increment(timestamp.counter) : minCounter;
    if (counter > maxCounter) {
      const nextMillis = Millis.fromUnknown(increment(millis));
      if (!nextMillis.ok) return err({ type: "TimestampTimeOutOfRangeError" });
      millis = nextMillis.value;
      counter = minCounter;
    }
    const nextTimestamp: Timestamp = {
      millis,
      counter: counter as Counter,
      nodeId: timestamp.nodeId,
    };
    if (isTimestampBeyondMaxDrift(deps)(millis, now)) {
      return err({
        type: "TimestampDriftError",
        timestamp: nextTimestamp,
        cause: "local",
        now,
      });
    }
    return ok(nextTimestamp);
  };

/**
 * Advances a {@link Timestamp} for a received one.
 *
 * Rejects remote drift with {@link TimestampDriftError} and `cause: "remote"`
 * before clock arithmetic. Merges the later clock state, preserves the local
 * node ID, and uses {@link sendTimestamp} to advance and validate the result. An
 * already-ahead local clock or rollover beyond the drift limit returns local
 * drift. Pass one captured time for a batch or replay.
 *
 * ### Example
 *
 * ```ts
 * import { assertErr, Millis } from "@evolu/common";
 * import {
 *   createTimestamp,
 *   receiveTimestamp,
 * } from "@evolu/common/local-first";
 *
 * const receive = receiveTimestamp({ timestampConfig: { maxDrift: 10 } });
 * const local = createTimestamp();
 * const remote = createTimestamp({ millis: Millis.orThrow(111) });
 * assertErr(receive(local, remote, Millis.orThrow(100)), {
 *   type: "TimestampDriftError",
 *   timestamp: remote,
 *   cause: "remote",
 *   now: Millis.orThrow(100),
 * });
 * ```
 */
export const receiveTimestamp =
  (deps: TimestampConfigDep) =>
  (
    local: Timestamp,
    remote: Timestamp,
    now: Millis,
  ): Result<Timestamp, TimestampError> => {
    if (isTimestampBeyondMaxDrift(deps)(remote.millis, now)) {
      return err({
        type: "TimestampDriftError",
        timestamp: remote,
        cause: "remote",
        now,
      });
    }
    const latest = orderTimestamp(local, remote) >= 0 ? local : remote;
    return sendTimestamp(deps)({ ...latest, nodeId: local.nodeId }, now);
  };

/**
 * Whether timestamp milliseconds exceed {@link TimestampConfig.maxDrift} ahead
 * of the supplied reference time. The exact limit and past timestamps are
 * accepted.
 *
 * ### Example
 *
 * ```ts
 * import { assertFalse, assertTrue, Millis } from "@evolu/common";
 * import { isTimestampBeyondMaxDrift } from "@evolu/common/local-first";
 *
 * const isBeyondMaxDrift = isTimestampBeyondMaxDrift({
 *   timestampConfig: { maxDrift: 10 },
 * });
 * const now = Millis.orThrow(100);
 * assertFalse(isBeyondMaxDrift(Millis.orThrow(110), now));
 * assertTrue(isBeyondMaxDrift(Millis.orThrow(111), now));
 * ```
 */
export const isTimestampBeyondMaxDrift =
  (deps: TimestampConfigDep) =>
  (millis: Millis, now: Millis): boolean =>
    millis - now > deps.timestampConfig.maxDrift;

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
