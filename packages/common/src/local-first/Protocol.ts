/**
 * Evolu Protocol
 *
 * Evolu Protocol is a local-first, end-to-end encrypted binary synchronization
 * protocol optimized for minimal size and maximum speed. It enables data sync
 * between a client and a relay. In the future, direct peer-to-peer (P2P) sync
 * between clients will be possible without a relay.
 *
 * Relays don't need to sync with each other—clients using those relays will
 * sync them eventually. If a relay is offline (e.g., for maintenance), it will
 * sync automatically later via client sync logic. For relay backup using
 * SQLite, see https://sqlite.org/rsync.html (uses a similar algorithm to Evolu
 * RBSR).
 *
 * Evolu Protocol is designed for SQLite but can be extended to any database. It
 * implements [Range-Based Set
 * Reconciliation](https://arxiv.org/abs/2212.13567). To learn how RBSR works,
 * check [Negentropy](https://logperiodic.com/rbsr.html). Evolu Protocol is
 * similar to Negentropy but uses different encoding and also provides data
 * transfer, ownership, real-time broadcasting, request-response semantics, and
 * error handling.
 *
 * ### Message structure
 *
 * | Field                          | Notes                     |
 * | :----------------------------- | :------------------------ |
 * | **Header**                     |                           |
 * | - {@link protocolVersion}      |                           |
 * | - {@link OwnerId}              | {@link Owner}             |
 * | - messageType                  | {@link MessageType}       |
 * | **Request (messageType=0)**    |                           |
 * | - hasWriteKey                  | 0 = no, 1 = yes           |
 * | - {@link OwnerWriteKey}        | If hasWriteKey = 1        |
 * | - subscriptionFlag             | {@link SubscriptionFlags} |
 * | **Response (messageType=1)**   |                           |
 * | - {@link ProtocolErrorCode}    |                           |
 * | **Broadcast (messageType=2)**  |                           |
 * | - (no additional fields)       |                           |
 * | **Messages**                   |                           |
 * | - {@link NonNegativeInt}       | A number of messages.     |
 * | - {@link EncryptedCrdtMessage} |                           |
 * | **Ranges**                     |                           |
 * | - {@link NonNegativeInt}       | Number of ranges.         |
 * | - {@link Range}                |                           |
 *
 * ### WriteKey validation
 *
 * The initiator sends a hasWriteKey flag and optionally a WriteKey. The
 * WriteKey is required when sending messages as a secure token proving the
 * initiator can write changes. It's ok to not send a WriteKey if the initiator
 * is only syncing (read-only) and not sending messages. The non-initiator
 * validates the WriteKey immediately after parsing the initiator header, before
 * processing any messages or ranges.
 *
 * ### Synchronization
 *
 * - **Messages**: Sends {@link EncryptedCrdtMessage}s in either direction.
 * - **Ranges**: Determines messages to sync. Usage varies by transport—e.g., sent
 *   only on WebSocket connection open or with every fetch request.
 *
 * Synchronization involves an initiator and a non-initiator. The **initiator**
 * is typically a client, and the **non-initiator** is typically a relay. Each
 * side processes the received message and responds with a new `ProtocolMessage`
 * if further sync is needed or possible, continuing until both sides are
 * synchronized.
 *
 * The **non-initiator always responds** to provide sync completion feedback,
 * even with empty messages containing only the header and no error. This allows
 * the initiator to detect when synchronization is complete.
 *
 * Both **Messages** and **Ranges** are optional, allowing each side to send,
 * sync, or only subscribe data as needed.
 *
 * When the initiator sends data, the {@link OwnerWriteKey} is required as a
 * secure token proving the initiator can write changes. The non-initiator
 * responds without a {@link OwnerWriteKey}, since the initiator’s request
 * already signals it wants data. If the non-initiator detects an issue, it
 * sends an error code via the `Error` field in the header back to the
 * initiator. In relay-to-relay or P2P sync, both sides may require the
 * {@link OwnerWriteKey} depending on who is the initiator.
 *
 * ### Protocol errors
 *
 * The protocol uses error codes in the header to signal issues:
 *
 * - {@link ProtocolWriteKeyError}: The provided WriteKey is invalid or missing.
 * - {@link ProtocolWriteError}: A serious relay-side write failure occurred.
 * - {@link ProtocolQuotaError}: Storage or billing quota exceeded.
 * - {@link ProtocolSyncError}: A serious relay-side synchronization failure
 *   occurred.
 * - {@link ProtocolVersionError}: Protocol version mismatch.
 * - {@link ProtocolInvalidDataError}: The message is malformed or corrupted.
 *
 * All protocol errors except `ProtocolInvalidDataError` include the `OwnerId`
 * to allow clients to associate errors with the correct owner.
 *
 * ### Message size limit
 *
 * The protocol enforces a strict maximum size for all messages, defined by
 * {@link ProtocolMessageMaxSize}. This ensures every {@link ProtocolMessage} is
 * less than or equal to this limit, enabling stateless transports, simplified
 * relay implementation, and predictable memory usage. When all messages don't
 * fit within the limit, the protocol automatically continues synchronization in
 * subsequent rounds using range-based reconciliation.
 *
 * Database mutations are limited to 640KB, which is smaller than the protocol
 * message limit to ensure efficient sync with
 * {@link defaultProtocolMessageRangesMaxSize}.
 *
 * ### Why Binary?
 *
 * The protocol avoids JSON because:
 *
 * - Encrypted data doesn’t compress well, unlike plain JSON.
 * - Message size must be controlled during creation.
 * - Sequential byte reading is faster than parsing and avoids conversions.
 *
 * It uses structure-aware encoding, significantly outperforming generic binary
 * serialization formats with the following optimizations:
 *
 * - **NonNegativeInt:** Up to 33% smaller than MessagePack.
 * - **DateIso:** Up to 75% smaller.
 * - **Timestamp Encoding:** Delta encoding for milliseconds and run-length
 *   encoding (RLE) for counters and NodeIds.
 * - **Small Integers (0 to 19):** Reduces size by 1 byte per integer.
 *
 * To avoid reinventing serialization where it’s unnecessary—like for JSON and
 * certain numbers—the Evolu Protocol relies on MessagePack.
 *
 * ### Versioning
 *
 * Evolu Protocol uses explicit versioning to ensure compatibility between
 * clients and relays (or peers). Each protocol message begins with a version
 * number and an `ownerId` in its header.
 *
 * **How version negotiation works:**
 *
 * - The initiator (usually a client) sends a `ProtocolMessage` that includes its
 *   protocol version and the `ownerId`.
 * - The non-initiator (usually a relay or peer) checks the version.
 *
 *   - If the versions match, synchronization proceeds as normal.
 *   - If the versions do not match, the non-initiator responds with a message
 *       containing **its own protocol version and the same `ownerId`**.
 * - The initiator can then detect the version mismatch for that specific owner
 *   and handle it appropriately (e.g., prompt for an update or halt sync).
 *
 * Version negotiation is per-owner, allowing Evolu Protocol to evolve safely
 * over time and provide clear feedback about version mismatches.
 *
 * ### Credible exit
 *
 * The protocol specification is intentionally non-configurable to ensure
 * universal compatibility. This design allows applications (users) to switch
 * between any compliant relay without negotiation or compatibility checks
 * beyond version matching. Relays are generic infrastructure that any
 * application can use interchangeably making exit from any single provider
 * technically feasible and economically viable.
 *
 * @module
 */

/**
 * TODO:
 *
 * - The client-relay naming convention in functions like
 *   `applyProtocolMessageAsClient` and `applyProtocolMessageAsRelay` is not
 *   ideal. In the future, clients will be able to sync directly with each other
 *   (P2P), making the current naming misleading. Consider using
 *   initiator/non-initiator terminology instead, and consolidate into a single
 *   `applyProtocolMessage` function with conditional arguments to reduce code
 *   duplication.
 * - Replace try-catch with Result + new Error (to preserve stacktraces). Measure
 *   Result overhead, it should be super small.
 * - Allow clients to broadcast messages that are not persisted by relays. This
 *   would enable real-time ephemeral data (like cursor positions, typing
 *   indicators) to be forwarded by relays without storage overhead.
 */

import { Packr } from "msgpackr";
import { isNonEmptyReadonlyArray, NonEmptyReadonlyArray } from "../Array.js";
import { assert } from "../Assert.js";
import { Brand } from "../Brand.js";
import {
  Buffer,
  bytesToHex,
  bytesToUtf8,
  createBuffer,
  hexToBytes,
  utf8ToBytes,
} from "../Buffer.js";
import {
  createPadmePadding,
  EncryptionKey,
  RandomBytesDep,
  SymmetricCryptoDecryptError,
  SymmetricCryptoDep,
} from "../Crypto.js";
import { eqArrayNumber } from "../Eq.js";
import { computeBalancedBuckets } from "../Number.js";
import { createRecord, objectToEntries } from "../Object.js";
import { err, ok, Result } from "../Result.js";
import { SqliteValue } from "../Sqlite.js";
import {
  Base64Url,
  base64UrlToUint8Array,
  between,
  DateIso,
  Id,
  IdBytes,
  idBytesToId,
  idBytesTypeValueLength,
  idToIdBytes,
  Int,
  Json,
  jsonToJsonValue,
  NonNegativeInt,
  Number,
  PositiveInt,
  uint8ArrayToBase64Url,
} from "../Type.js";
import { Predicate } from "../Types.js";
import {
  Owner,
  OwnerError,
  OwnerId,
  OwnerIdBytes,
  ownerIdToOwnerIdBytes,
  OwnerWriteKey,
  ownerWriteKeyLength,
} from "./Owner.js";
import {
  BaseRange,
  CrdtMessage,
  DbChange,
  EncryptedCrdtMessage,
  EncryptedDbChange,
  Fingerprint,
  FingerprintRange,
  fingerprintSize,
  InfiniteUpperBound,
  Range,
  RangeType,
  RangeUpperBound,
  SkipRange,
  StorageDep,
  TimestampsRange,
} from "./Storage.js";
import {
  Counter,
  eqTimestamp,
  Millis,
  NodeId,
  Timestamp,
  TimestampBytes,
  timestampBytesLength,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "./Timestamp.js";

/**
 * Evolu uses MessagePack for numbers and JSONs.
 *
 * - `variableMapSize: true` - More compact maps, ~5-10% slower encoding
 * - `useRecords: false` - Standard MessagePack without extensions
 */
const packr = new Packr({ variableMapSize: true, useRecords: false });

const minProtocolMessageMaxSize = 1_000_000;
const maxProtocolMessageMaxSize = 100_000_000;

/**
 * Protocol message maximum size.
 *
 * Defines the upper limit for how large a single protocol message can be.
 * Implementations must enforce a maximum size between 1MB and 100MB to ensure
 * compatibility across all Evolu implementations (the maximum size of mutation
 * change is hardcoded and enforced hence the maximum size can't be smaller).
 *
 * Larger maximum sizes can be configured by relays to reduce roundtrips. For
 * example, a dedicated relay with ample resources could configure a 100MB
 * maximum to minimize roundtrips for large syncs.
 *
 * Only relays can safely configure larger sizes, as clients will handle them.
 * Increasing this value on the client side would break compatibility with
 * relays that enforce smaller limits.
 */
export const ProtocolMessageMaxSize = between(
  minProtocolMessageMaxSize,
  maxProtocolMessageMaxSize,
)(Int);

export type ProtocolMessageMaxSize = typeof ProtocolMessageMaxSize.Type;

/**
 * Default {@link ProtocolMessageMaxSize} (1MB).
 *
 * The standard size used across Evolu implementations. Relays with more
 * resources can configure larger sizes to reduce roundtrips.
 */
export const defaultProtocolMessageMaxSize =
  minProtocolMessageMaxSize as ProtocolMessageMaxSize;

/**
 * Protocol message ranges maximum size.
 *
 * Defines the upper limit for how large the ranges section of a protocol
 * message can be. Implementations must enforce a maximum size between 3KB and
 * 100KB to ensure compatibility.
 *
 * The upper bound is set to ensure ranges fit within the default 1MB
 * {@link defaultProtocolMessageMaxSize}, maintaining compatibility between all
 * clients and relays.
 */
export const ProtocolMessageRangesMaxSize = between(3_000, 100_000)(Int);
export type ProtocolMessageRangesMaxSize =
  typeof ProtocolMessageRangesMaxSize.Type;

/**
 * Default {@link ProtocolMessageRangesMaxSize} (30KB).
 *
 * The standard size used across Evolu implementations. Relays with more
 * resources can configure larger sizes to reduce roundtrips.
 */
export const defaultProtocolMessageRangesMaxSize =
  30_000 as ProtocolMessageRangesMaxSize;

/** Evolu Protocol Message. */
export type ProtocolMessage = Uint8Array & Brand<"ProtocolMessage">;

/** Evolu Protocol version. */
export const protocolVersion = NonNegativeInt.orThrow(1);

export const MessageType = {
  /** Request message from initiator (client) to non-initiator (relay). */
  Request: 0,
  /** Response message from non-initiator (relay) to initiator (client). */
  Response: 1,
  /** Broadcast message from non-initiator (relay) to subscribed clients. */
  Broadcast: 2,
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const SubscriptionFlags = {
  /** No subscription changes for this owner. */
  None: 0,
  /** Subscribe to updates for this owner. */
  Subscribe: 1,
  /** Unsubscribe from updates for this owner. */
  Unsubscribe: 2,
} as const;

export type SubscriptionFlag =
  (typeof SubscriptionFlags)[keyof typeof SubscriptionFlags];

export const ProtocolErrorCode = {
  NoError: 0,
  /** A code for {@link ProtocolWriteKeyError}. */
  WriteKeyError: 1,
  /** A code for {@link ProtocolWriteError}. */
  WriteError: 2,
  /** A code for {@link ProtocolQuotaError}. */
  QuotaError: 3,
  /** A code for {@link ProtocolSyncError}. */
  SyncError: 4,
} as const;

type ProtocolErrorCode =
  (typeof ProtocolErrorCode)[keyof typeof ProtocolErrorCode];

export type ProtocolError =
  | ProtocolVersionError
  | ProtocolInvalidDataError
  | ProtocolWriteKeyError
  | ProtocolWriteError
  | ProtocolSyncError
  | ProtocolQuotaError
  | ProtocolTimestampMismatchError;

/**
 * Represents a version mismatch in the Evolu Protocol. Occurs when the
 * initiator and non-initiator are using incompatible protocol versions.
 */
export interface ProtocolVersionError extends OwnerError {
  readonly type: "ProtocolVersionError";
  readonly version: NonNegativeInt;
  /** Indicates which side is obsolete and should update. */
  readonly isInitiator: boolean;
}

/** Error for invalid or corrupted protocol message data. */
export interface ProtocolInvalidDataError {
  readonly type: "ProtocolInvalidDataError";
  readonly data: globalThis.Uint8Array;
  readonly error: unknown;
}

/** Error when a {@link OwnerWriteKey} is invalid, missing, or fails validation. */
export interface ProtocolWriteKeyError extends OwnerError {
  readonly type: "ProtocolWriteKeyError";
}

/**
 * Error indicating a serious relay-side write failure. Clients should log this
 * error and show a generic sync error to the user.
 */
export interface ProtocolWriteError extends OwnerError {
  readonly type: "ProtocolWriteError";
}

/**
 * Error when storage or billing quota is exceeded.
 *
 * When relay rejects writes due to quota, the affected device stops syncing
 * because RBSR requires both sides to converge—if the relay won't accept the
 * client's data, they can never reach the same state. Only the device with
 * excess local data is affected. Other devices that haven't exceeded quota can
 * still sync normally.
 *
 * Clients should prompt the user to contact the relay provider or upgrade their
 * plan. Quota monitoring and management is the relay provider's
 * responsibility.
 */
export interface ProtocolQuotaError extends OwnerError {
  readonly type: "ProtocolQuotaError";
}

/**
 * Error indicating a serious relay-side synchronization failure. Clients should
 * log this error and show a generic sync error to the user.
 */
export interface ProtocolSyncError extends OwnerError {
  readonly type: "ProtocolSyncError";
}

/**
 * Error when embedded timestamp doesn't match expected timestamp in
 * EncryptedDbChange. Indicates potential tampering or corruption of CRDT
 * messages.
 */
export interface ProtocolTimestampMismatchError {
  readonly type: "ProtocolTimestampMismatchError";
  readonly expected: Timestamp;
  readonly timestamp: Timestamp;
}

/**
 * Creates a {@link ProtocolMessage} from CRDT messages.
 *
 * If the message size would exceed {@link defaultProtocolMessageMaxSize}, the
 * protocol ensures all messages will be sent in the next round(s) even over
 * unidirectional and stateless transports.
 */
export const createProtocolMessageFromCrdtMessages =
  (deps: RandomBytesDep & SymmetricCryptoDep) =>
  (
    owner: Owner,
    messages: NonEmptyReadonlyArray<CrdtMessage>,
    maxSize?: ProtocolMessageMaxSize,
  ): ProtocolMessage => {
    const buffer = createProtocolMessageBuffer(owner.id, {
      messageType: MessageType.Request,
      totalMaxSize: maxSize ?? defaultProtocolMessageMaxSize,
      writeKey: owner.writeKey,
    });

    let notAllMessagesSent = false;

    for (const message of messages) {
      const change = encodeAndEncryptDbChange(deps)(
        message,
        owner.encryptionKey,
      );
      const encryptedCrdtMessage = { timestamp: message.timestamp, change };
      if (buffer.canAddMessage(encryptedCrdtMessage)) {
        buffer.addMessage(encryptedCrdtMessage);
      } else {
        notAllMessagesSent = true;
        break;
      }
    }

    if (notAllMessagesSent) {
      /**
       * DEV: If not all messages fit due to size limits, we trigger a sync
       * continuation by appending a Range with a random fingerprint. This
       * ensures the receiver always responds with ranges, prompting another
       * sync round.
       *
       * The ideal approach would be to send three ranges (skip, fingerprint,
       * skip) where the fingerprint of unsent messages would act as narrow sync
       * probe. I think we can send `zeroFingerprint` which can be interpreted
       * as an indication that the other side should reply with
       * {@link TimestampsRange}, so no need to restart syncing.
       *
       * For now, using a random fingerprint avoids extra complexity and is good
       * enough for this case.
       */
      const randomFingerprint = deps.randomBytes.create(
        fingerprintSize,
      ) as unknown as Fingerprint;

      // There is always a space for Fingerprint with InfiniteUpperBound.
      buffer.addRange({
        type: RangeType.Fingerprint,
        upperBound: InfiniteUpperBound,
        fingerprint: randomFingerprint,
      });
    }

    return buffer.unwrap();
  };

/** Creates a {@link ProtocolMessage} for sync. */
export const createProtocolMessageForSync =
  (deps: StorageDep) =>
  (
    ownerId: OwnerId,
    subscriptionFlag?: SubscriptionFlag,
  ): ProtocolMessage | null => {
    const buffer = createProtocolMessageBuffer(ownerId, {
      messageType: MessageType.Request,
      subscriptionFlag: subscriptionFlag ?? SubscriptionFlags.None,
    });
    const ownerIdBytes = ownerIdToOwnerIdBytes(ownerId);

    const size = deps.storage.getSize(ownerIdBytes);
    // Errors are handled by the storage.
    if (size == null) return null;

    splitRange(deps)(
      ownerIdBytes,
      NonNegativeInt.orThrow(0),
      size,
      InfiniteUpperBound,
      buffer,
    );

    return buffer.unwrap();
  };

export const createProtocolMessageForUnsubscribe = (
  ownerId: OwnerId,
): ProtocolMessage =>
  createProtocolMessageBuffer(ownerId, {
    messageType: MessageType.Request,
    subscriptionFlag: SubscriptionFlags.Unsubscribe,
  }).unwrap();

/**
 * Mutable builder for constructing {@link ProtocolMessage} respecting size
 * limits.
 */
export interface ProtocolMessageBuffer {
  readonly canAddMessage: (message: EncryptedCrdtMessage) => boolean;

  readonly addMessage: (message: EncryptedCrdtMessage) => void;

  readonly canSplitRange: () => boolean;

  readonly canAddTimestampsRangeAndMessage: (
    timestamps: TimestampsBuffer,
    message: EncryptedCrdtMessage | null,
  ) => boolean;

  readonly addRange: (
    range: SkipRange | FingerprintRange | TimestampsRangeWithTimestampsBuffer,
  ) => void;

  readonly unwrap: () => ProtocolMessage;
  readonly getSize: () => PositiveInt;
}

export const createProtocolMessageBuffer = (
  ownerId: OwnerId,
  options: {
    readonly totalMaxSize?: ProtocolMessageMaxSize | undefined;
    readonly rangesMaxSize?: ProtocolMessageRangesMaxSize | undefined;
    readonly version?: NonNegativeInt;
  } & (
    | {
        readonly messageType: typeof MessageType.Request;
        readonly writeKey?: OwnerWriteKey;
        readonly subscriptionFlag?: SubscriptionFlag;
      }
    | {
        readonly messageType: typeof MessageType.Response;
        readonly errorCode: ProtocolErrorCode;
      }
    | {
        readonly messageType: typeof MessageType.Broadcast;
      }
  ),
): ProtocolMessageBuffer => {
  const {
    totalMaxSize = defaultProtocolMessageMaxSize,
    rangesMaxSize = defaultProtocolMessageRangesMaxSize,
    version = protocolVersion,
  } = options;

  const buffers = {
    header: createBuffer(),
    messages: {
      timestamps: createTimestampsBuffer(),
      dbChanges: createBuffer(),
    },
    ranges: {
      timestamps: createTimestampsBuffer(),
      types: createBuffer(),
      payloads: createBuffer(),
    },
  };

  encodeNonNegativeInt(buffers.header, version);
  buffers.header.extend(ownerIdToOwnerIdBytes(ownerId));
  buffers.header.extend([options.messageType]);

  if (options.messageType === MessageType.Request) {
    if (!options.writeKey) {
      buffers.header.extend([0]);
    } else {
      buffers.header.extend([1]);
      buffers.header.extend(options.writeKey);
    }
    const subscriptionFlag = options.subscriptionFlag ?? SubscriptionFlags.None;
    buffers.header.extend([subscriptionFlag]);
  } else if (options.messageType === MessageType.Response) {
    buffers.header.extend([options.errorCode]);
  }

  let isLastRangeInfinite = false;

  const isWithinSizeLimits = () => getSize() <= totalMaxSize;

  const getSize = () =>
    PositiveInt.orThrow(getHeaderAndMessagesSize() + getRangesSize());

  const getHeaderAndMessagesSize = () =>
    buffers.header.getLength() +
    buffers.messages.timestamps.getLength() +
    buffers.messages.dbChanges.getLength();

  const getRangesSize = () =>
    buffers.ranges.timestamps.getCount() > 0
      ? buffers.ranges.timestamps.getLength() +
        buffers.ranges.types.getLength() +
        buffers.ranges.payloads.getLength() +
        safeMargins.remainingRange
      : 0;

  /**
   * We calculated worst-case sizes as closely as possible and added a small
   * safety margin, since computing exact worst cases is difficult due to
   * variable-length, run-length, and delta encoding.
   *
   * Runtime assertions (`assert`) are used to guarantee that size limits are
   * never exceeded. If a limit is exceeded, the assertion will fail at the
   * precise location, making it easy to identify and fix the issue.
   *
   * While it would be possible to avoid the safety margin by snapshotting
   * buffer states and rolling back changes, this would likely impact
   * performance. If someone has time and wants to experiment with this
   * approach, contributions are welcome.
   */
  const safeMargins = {
    remainingRange: fingerprintSize + 10, // bytes: range type + possible increased count varint
    timestamp: 30, // bytes: max millis + max count + NodeId
    dbChangeLength: 8, // bytes: maximum encoded DbChange length varint
    splitRange: 800, // bytes: worst case is around 650 bytes
    timestampsRange: 50, // bytes: range type + its upperBound + possible increased count varint
  };

  const addMessageSafeMargin =
    safeMargins.timestamp +
    safeMargins.dbChangeLength +
    safeMargins.remainingRange;

  return {
    canAddMessage: (message) =>
      getSize() + addMessageSafeMargin + message.change.length <= totalMaxSize,

    addMessage: (message) => {
      buffers.messages.timestamps.add(message.timestamp);
      encodeLength(buffers.messages.dbChanges, message.change);
      buffers.messages.dbChanges.extend(message.change);
      assert(isWithinSizeLimits(), "the message is too big");
    },

    canSplitRange: () => {
      return getRangesSize() + safeMargins.splitRange <= rangesMaxSize;
    },

    canAddTimestampsRangeAndMessage: (timestamps, message) => {
      const rangesNewSize =
        getRangesSize() + timestamps.getLength() + safeMargins.timestampsRange;

      return (
        rangesNewSize <= rangesMaxSize &&
        (message
          ? getHeaderAndMessagesSize() +
              rangesNewSize +
              addMessageSafeMargin +
              message.change.length <=
            totalMaxSize
          : true)
      );
    },

    addRange: (range) => {
      assert(
        options.messageType !== MessageType.Broadcast,
        "Cannot add a range into broadcast message",
      );
      assert(
        !isLastRangeInfinite,
        "Cannot add a range after an InfiniteUpperBound range",
      );

      isLastRangeInfinite = range.upperBound === InfiniteUpperBound;

      /**
       * We don't have to encode InfiniteUpperBound timestamp since it's always
       * the last because ranges cover the whole universe. For partial sync, we
       * use SkipRange.
       */
      if (range.upperBound !== InfiniteUpperBound)
        buffers.ranges.timestamps.add(
          timestampBytesToTimestamp(range.upperBound),
        );
      else {
        buffers.ranges.timestamps.addInfinite();
      }

      encodeNonNegativeInt(
        buffers.ranges.types,
        NonNegativeInt.orThrow(range.type),
      );

      switch (range.type) {
        case RangeType.Skip:
          break;
        case RangeType.Fingerprint:
          buffers.ranges.payloads.extend(range.fingerprint);
          break;
        case RangeType.Timestamps: {
          range.timestamps.append(buffers.ranges.payloads);
          break;
        }
      }

      assert(isWithinSizeLimits(), `the range ${range.type} is too big`);
    },

    unwrap: () => {
      if (buffers.ranges.timestamps.getCount() > 0) {
        assert(
          isLastRangeInfinite,
          "The last range's upperBound must be InfiniteUpperBound",
        );
      }

      buffers.messages.timestamps.append(buffers.header);
      buffers.header.extend(buffers.messages.dbChanges.unwrap());

      if (buffers.ranges.timestamps.getCount() > 0) {
        buffers.ranges.timestamps.append(buffers.header);
        buffers.header.extend(buffers.ranges.types.unwrap());
        buffers.header.extend(buffers.ranges.payloads.unwrap());
      }

      return buffers.header.unwrap() as ProtocolMessage;
    },

    getSize,
  };
};

export interface TimestampsRangeWithTimestampsBuffer extends BaseRange {
  readonly type: typeof RangeType.Timestamps;
  readonly timestamps: TimestampsBuffer;
}

export interface TimestampsBuffer {
  readonly add: (timestamp: Timestamp) => void;
  readonly addInfinite: () => void;
  readonly getCount: () => NonNegativeInt;
  readonly getLength: () => number;
  readonly append: (buffer: Buffer) => void;
}

export const createTimestampsBuffer = (): TimestampsBuffer => {
  let count = NonNegativeInt.orThrow(0);
  const countBuffer = createBuffer();

  const syncCount = () => {
    countBuffer.reset();
    encodeNonNegativeInt(countBuffer, count);
  };

  syncCount();

  const millisBuffer = createBuffer();
  let previousMillis = 0 as Millis;

  const counterEncoder = createRunLengthEncoder<Counter>((buffer, value) => {
    encodeNonNegativeInt(buffer, value);
  });
  const nodeIdEncoder = createRunLengthEncoder<NodeId>((buffer, value) => {
    encodeNodeId(buffer, value);
  });

  return {
    add: (timestamp) => {
      const delta = timestamp.millis - previousMillis;
      assert(NonNegativeInt.is(delta), "The delta must be NonNegativeInt");

      count++;
      syncCount();

      previousMillis = timestamp.millis;
      encodeNonNegativeInt(millisBuffer, delta);

      counterEncoder.add(timestamp.counter);
      nodeIdEncoder.add(timestamp.nodeId);
    },

    addInfinite: () => {
      count++;
      syncCount();
    },

    getCount: () => count,

    getLength: () =>
      countBuffer.getLength() +
      millisBuffer.getLength() +
      counterEncoder.getLength() +
      nodeIdEncoder.getLength(),

    append: (buffer) => {
      buffer.extend(countBuffer.unwrap());
      buffer.extend(millisBuffer.unwrap());
      buffer.extend(counterEncoder.unwrap());
      buffer.extend(nodeIdEncoder.unwrap());
    },
  };
};

interface RunLengthEncoder<T> {
  add: (value: T) => void;
  getLength: () => NonNegativeInt;
  unwrap: () => Uint8Array;
}

const createRunLengthEncoder = <T>(
  encodeValue: (buffer: Buffer, value: T) => void,
): RunLengthEncoder<T> => {
  const buffer = createBuffer();
  let previousLength = NonNegativeInt.orThrow(0);
  let previousValue = null as T | null;
  let runLength = NonNegativeInt.orThrow(0);

  return {
    add: (value) => {
      if (value === previousValue) {
        runLength++;
        buffer.truncate(previousLength);
      } else {
        previousValue = value;
        runLength = NonNegativeInt.orThrow(1);
      }
      previousLength = buffer.getLength();
      encodeValue(buffer, value);
      encodeNonNegativeInt(buffer, runLength);
    },

    getLength: () => buffer.getLength(),

    unwrap: () => buffer.unwrap(),
  };
};

export interface ApplyProtocolMessageAsClientOptions {
  getWriteKey?: (ownerId: OwnerId) => OwnerWriteKey | null;

  rangesMaxSize?: ProtocolMessageRangesMaxSize;

  /** For tests only. */
  version?: NonNegativeInt;
}

/**
 * Result type for {@link applyProtocolMessageAsClient} that distinguishes
 * between responses to client requests and broadcast messages.
 */
export type ApplyProtocolMessageAsClientResult =
  | { readonly type: "response"; readonly message: ProtocolMessage }
  | { readonly type: "no-response" }
  | { readonly type: "broadcast" };

export const applyProtocolMessageAsClient =
  (deps: StorageDep) =>
  async (
    inputMessage: Uint8Array,
    options: ApplyProtocolMessageAsClientOptions = {},
  ): Promise<
    Result<
      ApplyProtocolMessageAsClientResult,
      | ProtocolInvalidDataError
      | ProtocolSyncError
      | ProtocolVersionError
      | ProtocolWriteError
      | ProtocolWriteKeyError
      | ProtocolQuotaError
    >
  > => {
    try {
      const input = createBuffer(inputMessage);
      const [requestedVersion, ownerId] = decodeVersionAndOwner(input);
      const version = options.version ?? protocolVersion;

      if (requestedVersion !== version) {
        return err<ProtocolVersionError>({
          type: "ProtocolVersionError",
          version: requestedVersion,
          isInitiator: version < requestedVersion,
          ownerId,
        });
      }

      const messageType = input.shift() as MessageType;
      assert(
        messageType === MessageType.Response ||
          messageType === MessageType.Broadcast,
        "Invalid MessageType",
      );

      if (messageType === MessageType.Response) {
        const errorCode = input.shift() as ProtocolErrorCode;
        if (errorCode !== ProtocolErrorCode.NoError) {
          switch (errorCode) {
            case ProtocolErrorCode.WriteKeyError:
              return err<ProtocolWriteKeyError>({
                type: "ProtocolWriteKeyError",
                ownerId,
              });
            case ProtocolErrorCode.WriteError:
              return err<ProtocolWriteError>({
                type: "ProtocolWriteError",
                ownerId,
              });
            case ProtocolErrorCode.QuotaError:
              return err<ProtocolQuotaError>({
                type: "ProtocolQuotaError",
                ownerId,
              });
            case ProtocolErrorCode.SyncError:
              return err<ProtocolSyncError>({
                type: "ProtocolSyncError",
                ownerId,
              });
            default:
              throw new ProtocolDecodeError(
                `Invalid ProtocolErrorCode: ${errorCode}`,
              );
          }
        }
      }

      const messages = decodeMessages(input);
      const ownerIdBytes = ownerIdToOwnerIdBytes(ownerId);

      if (isNonEmptyReadonlyArray(messages)) {
        const writeResult = await deps.storage.writeMessages(
          ownerIdBytes,
          messages,
        );
        // Errors are handled by the Storage. Here we just stop syncing.
        if (!writeResult.ok) return ok({ type: "no-response" });
      }

      // Now: No writeKey, no sync.
      // TODO: Allow to sync SharedReadonlyOwner
      // Without local changes, writeKey will not be required.
      // With local changes, writeKey will be required and if not provided,
      // the sync will stop.
      const writeKey = options.getWriteKey?.(ownerId);
      if (writeKey == null) {
        return ok({ type: "no-response" });
      }

      if (messageType === MessageType.Broadcast) {
        return ok({ type: "broadcast" });
      }

      const ranges = decodeRanges(input);

      if (!isNonEmptyReadonlyArray(ranges)) {
        return ok({ type: "no-response" });
      }

      const output = createProtocolMessageBuffer(ownerId, {
        messageType: MessageType.Request,
        writeKey,
        rangesMaxSize: options.rangesMaxSize,
      });

      const syncResult = sync(deps)(ranges, output, ownerIdBytes);

      // Client sync error (handled via Storage) or no changes.
      if (!syncResult.ok || !syncResult.value) {
        return ok({ type: "no-response" });
      }

      return ok({ type: "response", message: output.unwrap() });
    } catch (error) {
      return err<ProtocolInvalidDataError>({
        type: "ProtocolInvalidDataError",
        data: inputMessage,
        error,
      });
    }
  };

export interface ApplyProtocolMessageAsRelayOptions {
  /** To subscribe an owner for broadcasting. */
  subscribe?: (ownerId: OwnerId) => void;

  /** To unsubscribe an owner from broadcasting. */
  unsubscribe?: (ownerId: OwnerId) => void;

  /** To broadcast a protocol message to all subscribers. */
  broadcast?: (ownerId: OwnerId, message: ProtocolMessage) => void;

  totalMaxSize?: ProtocolMessageMaxSize;
  rangesMaxSize?: ProtocolMessageRangesMaxSize;
}

/**
 * Result type for {@link applyProtocolMessageAsRelay}.
 *
 * Unlike {@link ApplyProtocolMessageAsClientResult}, relays always respond with
 * a message to provide sync completion feedback. This ensures the initiator can
 * reliably detect when synchronization is complete, even when there's nothing
 * to sync. Clients may choose not to respond in certain cases (like when they
 * receive broadcast messages or when they lack a write key for syncing).
 */
export interface ApplyProtocolMessageAsRelayResult {
  readonly type: "response";
  readonly message: ProtocolMessage;
}

export const applyProtocolMessageAsRelay =
  (deps: StorageDep) =>
  async (
    inputMessage: Uint8Array,
    options: ApplyProtocolMessageAsRelayOptions = {},
    /** For tests only. */
    version = protocolVersion,
  ): Promise<
    Result<ApplyProtocolMessageAsRelayResult, ProtocolInvalidDataError>
  > => {
    try {
      const input = createBuffer(inputMessage);
      const [requestedVersion, ownerId] = decodeVersionAndOwner(input);
      const ownerIdBytes = ownerIdToOwnerIdBytes(ownerId);

      if (requestedVersion !== version) {
        // Non-initiator responds with its version and ownerId.
        const output = createBuffer();
        encodeNonNegativeInt(output, version);
        output.extend(ownerIdBytes);
        return ok({
          type: "response",
          message: output.unwrap() as ProtocolMessage,
        });
      }

      const messageType = input.shift() as MessageType;
      assert(messageType === MessageType.Request, "Invalid MessageType");

      const hasWriteKey = input.shift();
      let writeKey: OwnerWriteKey | undefined;

      if (hasWriteKey === 1) {
        writeKey = input.shiftN(ownerWriteKeyLength) as OwnerWriteKey;
      }

      const subscriptionFlag = input.shift() as SubscriptionFlag;

      switch (subscriptionFlag) {
        case SubscriptionFlags.Subscribe:
          options.subscribe?.(ownerId);
          break;
        case SubscriptionFlags.Unsubscribe:
          options.unsubscribe?.(ownerId);
          break;
        case SubscriptionFlags.None:
          break;
      }

      if (writeKey) {
        const isValid = deps.storage.validateWriteKey(ownerIdBytes, writeKey);
        if (!isValid) {
          return ok({
            type: "response",
            message: createProtocolMessageBuffer(ownerId, {
              messageType: MessageType.Response,
              errorCode: ProtocolErrorCode.WriteKeyError,
            }).unwrap(),
          });
        }
      }

      const messages = decodeMessages(input);

      if (isNonEmptyReadonlyArray(messages)) {
        if (!writeKey) {
          return ok({
            type: "response",
            message: createProtocolMessageBuffer(ownerId, {
              messageType: MessageType.Response,
              errorCode: ProtocolErrorCode.WriteKeyError,
            }).unwrap(),
          });
        }

        const writeResult = await deps.storage.writeMessages(
          ownerIdBytes,
          messages,
        );

        if (!writeResult.ok) {
          const errorCode =
            writeResult.error.type === "StorageWriteError"
              ? ProtocolErrorCode.WriteError
              : ProtocolErrorCode.QuotaError;
          const message = createProtocolMessageBuffer(ownerId, {
            messageType: MessageType.Response,
            errorCode,
          }).unwrap();
          return ok({ type: "response", message });
        }

        /**
         * Broadcast messages to all subscribed owners for real-time
         * synchronization between clients.
         *
         * Messages are only broadcasted after successful write to ensure
         * devices that can still sync aren't affected by quota errors, and to
         * prevent using a half-working relay service (broadcasting without
         * persistence).
         *
         * When a relay's database is deleted or clients migrate to a new relay
         * (without data migration), clients will sync their data to the relay,
         * and the relay will broadcast those messages to other connected
         * clients. Those clients may receive messages they already have, but
         * this is safe because Evolu sync is idempotent. As the relay becomes
         * more synchronized with clients over time, fewer duplicate messages
         * will be broadcasted.
         */
        if (options.broadcast) {
          const broadcastBuffer = createProtocolMessageBuffer(ownerId, {
            messageType: MessageType.Broadcast,
            totalMaxSize: options.totalMaxSize,
            rangesMaxSize: options.rangesMaxSize,
            version,
          });
          for (const message of messages) {
            broadcastBuffer.addMessage(message);
          }
          options.broadcast(ownerId, broadcastBuffer.unwrap());
        }
      }

      const ranges = decodeRanges(input);

      const output = createProtocolMessageBuffer(ownerId, {
        messageType: MessageType.Response,
        errorCode: ProtocolErrorCode.NoError,
        totalMaxSize: options.totalMaxSize,
        rangesMaxSize: options.rangesMaxSize,
      });

      // Non-initiators always respond to provide sync completion feedback,
      // even when there's nothing to sync.
      if (!isNonEmptyReadonlyArray(ranges)) {
        return ok({ type: "response", message: output.unwrap() });
      }

      const syncResult = sync(deps)(ranges, output, ownerIdBytes);

      const message = syncResult.ok
        ? output.unwrap()
        : createProtocolMessageBuffer(ownerId, {
            messageType: MessageType.Response,
            errorCode: syncResult.error,
          }).unwrap();

      // Non-initiators always respond to provide sync completion feedback,
      return ok({ type: "response", message });
    } catch (error) {
      return err<ProtocolInvalidDataError>({
        type: "ProtocolInvalidDataError",
        data: inputMessage,
        error,
      });
    }
  };

const decodeVersionAndOwner = (input: Buffer): [NonNegativeInt, OwnerId] => {
  // This structure must never change across protocol versions. The version
  // and owner ID must always be the first two fields in every protocol message
  // to enable version negotiation and owner identification before any other
  // processing occurs.
  const version = decodeNonNegativeInt(input);
  const ownerId = decodeId(input) as OwnerId;
  return [version, ownerId];
};

/**
 * Error thrown for internal protocol validation failures, such as invalid data
 * or type errors.
 */
class ProtocolDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;

    Error.captureStackTrace(this, this.constructor);
  }
}

const decodeMessages = (
  buffer: Buffer,
): ReadonlyArray<EncryptedCrdtMessage> => {
  const timestamps = decodeTimestamps(buffer);

  const messages: Array<EncryptedCrdtMessage> = [];
  for (const timestamp of timestamps) {
    const changeLength = decodeLength(buffer);
    const change = buffer.shiftN(changeLength) as EncryptedDbChange;
    messages.push({ timestamp, change });
  }

  return messages;
};

const sync =
  (deps: StorageDep) =>
  (
    ranges: NonEmptyReadonlyArray<Range>,
    output: ProtocolMessageBuffer,
    ownerIdBytes: OwnerIdBytes,
  ): Result<boolean, typeof ProtocolErrorCode.SyncError> => {
    const outputInitialSize = output.getSize();

    const storageSize = deps.storage.getSize(ownerIdBytes);
    if (storageSize == null) return err(ProtocolErrorCode.SyncError);

    let prevUpperBound: RangeUpperBound | null = null;
    let prevIndex = NonNegativeInt.orThrow(0);

    let skip = false;
    let nonSkipRangeAdded = false;

    const skipRange = (
      range: SkipRange | FingerprintRange | TimestampsRange,
    ) => {
      // The last range, if any non skip was added, must have InfiniteUpperBound.
      if (nonSkipRangeAdded && range.upperBound === InfiniteUpperBound) {
        output.addRange({
          type: RangeType.Skip,
          upperBound: InfiniteUpperBound,
        });
      } else {
        skip = true;
      }
    };

    const coalesceSkipsBeforeAdd = () => {
      // Set to true because we are going to add a non skip range.
      nonSkipRangeAdded = true;
      if (skip) {
        skip = false;
        assert(prevUpperBound != null, "prevUpperBound is null");
        // There is always a space for a skip range before adding.
        output.addRange({
          type: RangeType.Skip,
          upperBound: prevUpperBound,
        });
      }
    };

    // When we don't have a space...
    const addFingerprintForRemainingRange = (
      begin: NonNegativeInt,
    ): boolean => {
      const fingerprint = deps.storage.fingerprint(
        ownerIdBytes,
        begin,
        storageSize,
      );
      if (!fingerprint) return false;
      // There is always a space for a ramaining range.
      output.addRange({
        type: RangeType.Fingerprint,
        upperBound: InfiniteUpperBound,
        fingerprint,
      });
      return true;
    };

    for (const range of ranges) {
      const currentUpperBound = range.upperBound;

      const lower = prevIndex;
      let upper = deps.storage.findLowerBound(
        ownerIdBytes,
        prevIndex,
        storageSize,
        currentUpperBound,
      );
      if (upper == null) return err(ProtocolErrorCode.SyncError);

      switch (range.type) {
        case RangeType.Skip: {
          skipRange(range);
          break;
        }

        case RangeType.Fingerprint: {
          const ourFingerprint = deps.storage.fingerprint(
            ownerIdBytes,
            lower,
            upper,
          );
          if (ourFingerprint == null) return err(ProtocolErrorCode.SyncError);

          if (eqArrayNumber(range.fingerprint, ourFingerprint)) {
            skipRange(range);
          } else {
            if (output.canSplitRange()) {
              coalesceSkipsBeforeAdd();
              splitRange(deps)(
                ownerIdBytes,
                lower,
                upper,
                currentUpperBound,
                output,
              );
            } else {
              return addFingerprintForRemainingRange(upper)
                ? ok(true)
                : err(ProtocolErrorCode.SyncError);
            }
          }
          break;
        }

        case RangeType.Timestamps: {
          let endBound = currentUpperBound;

          const timestampsWeNeed = new Map(
            range.timestamps.map((t) => [t.join(), true]),
          );
          const ourTimestamps = createTimestampsBuffer();

          let cantReadDbChange = false as boolean;
          let exceeded = false as boolean;

          deps.storage.iterate(
            ownerIdBytes,
            lower,
            upper,
            (timestamp, index) => {
              const timestampString = timestamp.join();
              const timestampBinary = timestampBytesToTimestamp(timestamp);

              let message: EncryptedCrdtMessage | null = null;

              if (timestampsWeNeed.has(timestampString)) {
                timestampsWeNeed.delete(timestampString);
              } else {
                const dbChange = deps.storage.readDbChange(
                  ownerIdBytes,
                  timestamp,
                );
                if (dbChange == null) {
                  cantReadDbChange = true;
                  return false;
                }
                message = {
                  timestamp: timestampBinary,
                  change: dbChange,
                };
              }

              if (
                !output.canAddTimestampsRangeAndMessage(ourTimestamps, message)
              ) {
                exceeded = true;
                endBound = timestamp;
                upper = index;
                return false;
              }

              ourTimestamps.add(timestampBinary);
              if (message) output.addMessage(message);
              return true;
            },
          );

          if (cantReadDbChange) {
            return err(ProtocolErrorCode.SyncError);
          }

          const addRange = () => {
            coalesceSkipsBeforeAdd();
            output.addRange({
              type: RangeType.Timestamps,
              upperBound: endBound,
              timestamps: ourTimestamps,
            });
          };

          if (exceeded) {
            addRange();
            if (!addFingerprintForRemainingRange(upper)) {
              return err(ProtocolErrorCode.SyncError);
            }
            return ok(true);
          }

          // If we need something, we have to respond with our timestamps.
          if (timestampsWeNeed.size > 0) {
            addRange();
          } else {
            skipRange(range);
          }

          break;
        }
      }

      prevIndex = upper;
      prevUpperBound = currentUpperBound;
    }

    // If all ranges were skipped, there are no changes and sync is complete.
    const hasChange = output.getSize() > outputInitialSize;

    return ok(hasChange);
  };

const splitRange =
  (deps: StorageDep) =>
  (
    ownerId: OwnerIdBytes,
    lower: NonNegativeInt,
    upper: NonNegativeInt,
    upperBound: RangeUpperBound,
    buffer: ProtocolMessageBuffer,
  ): void => {
    const itemCount = NonNegativeInt.orThrow(upper - lower);
    const buckets = computeBalancedBuckets(itemCount);

    if (!buckets.ok) {
      const range: TimestampsRangeWithTimestampsBuffer = {
        type: RangeType.Timestamps,
        upperBound,
        timestamps: createTimestampsBuffer(),
      };

      deps.storage.iterate(
        ownerId,
        NonNegativeInt.orThrow(0),
        itemCount,
        (timestamp) => {
          range.timestamps.add(timestampBytesToTimestamp(timestamp));
          return true;
        },
      );

      buffer.addRange(range);
      return;
    }

    // Check Storage.ts `fingerprint` and `fingerprintRanges` docs.
    const fingerprintRangesBuckets =
      lower === 0
        ? buckets.value
        : [
            lower,
            ...buckets.value.map((b) => NonNegativeInt.orThrow(b + lower)),
          ];

    const fingerprintRanges = deps.storage.fingerprintRanges(
      ownerId,
      fingerprintRangesBuckets,
      upperBound,
    );
    // Errors are handled by the storage.
    if (fingerprintRanges == null) return;

    const rangesToUse =
      lower > 0 ? fingerprintRanges.slice(1) : fingerprintRanges;

    for (const range of rangesToUse) {
      buffer.addRange(range);
    }
  };

const decodeRanges = (buffer: Buffer): ReadonlyArray<Range> => {
  if (buffer.getLength() === 0) return [];

  const rangesCount = decodeNonNegativeInt(buffer);
  if (rangesCount === 0) return [];

  const timestampsCount = NonNegativeInt.orThrow(rangesCount - 1);
  const timestamps = decodeTimestamps(buffer, timestampsCount);
  const rangeTypes: Array<RangeType> = [];

  for (let i = 0; i < rangesCount; i++) {
    const rangeType = decodeNonNegativeInt(buffer);
    switch (rangeType) {
      case RangeType.Fingerprint:
      case RangeType.Skip:
      case RangeType.Timestamps:
        rangeTypes.push(rangeType as RangeType);
        break;
      default:
        throw new ProtocolDecodeError(`Invalid RangeType: ${rangeType}`);
    }
  }

  const ranges: Array<Range> = [];

  for (let i = 0; i < rangesCount; i++) {
    const upperBound =
      i < timestampsCount
        ? timestampToTimestampBytes(timestamps[i])
        : InfiniteUpperBound;

    const rangeType = rangeTypes[i];

    switch (rangeType) {
      case RangeType.Skip:
        ranges.push({ type: RangeType.Skip, upperBound });
        break;

      case RangeType.Fingerprint: {
        const fingerprint = buffer.shiftN(fingerprintSize) as Fingerprint;
        ranges.push({
          type: RangeType.Fingerprint,
          upperBound,
          fingerprint,
        });
        break;
      }

      case RangeType.Timestamps: {
        const timestamps = decodeTimestamps(buffer).map(
          timestampToTimestampBytes,
        );
        ranges.push({
          type: RangeType.Timestamps,
          upperBound,
          timestamps,
        });
        break;
      }
    }
  }

  return ranges;
};

/** Decodes an array of sorted timestamps with delta-encoded millis. */
const decodeTimestamps = (
  buffer: Buffer,
  length?: NonNegativeInt,
): ReadonlyArray<Timestamp> => {
  length ??= decodeNonNegativeInt(buffer);

  let previousMillis = 0 as Millis;

  const millises: Array<Millis> = [];
  for (let i = 0; i < length; i++) {
    const deltaMillis = decodeNonNegativeInt(buffer);
    const millis = Millis.from(previousMillis + deltaMillis);
    if (!millis.ok) throw new ProtocolDecodeError(millis.error.type);
    millises.push(millis.value);
    previousMillis = millis.value;
  }

  const counters: Array<Counter> = [];
  let counterIndex = 0;
  while (counterIndex < length) {
    const counter = Counter.from(decodeNonNegativeInt(buffer));
    if (!counter.ok) throw new ProtocolDecodeError(counter.error.type);
    const runLength = decodeNonNegativeInt(buffer);
    for (let i = 0; i < runLength; i++) {
      counters.push(counter.value);
      counterIndex++;
    }
  }

  const nodeIds: Array<NodeId> = [];
  let nodeIdIndex = 0;
  while (nodeIdIndex < length) {
    const nodeId = decodeNodeId(buffer);
    const runLength = decodeNonNegativeInt(buffer);
    for (let i = 0; i < runLength; i++) {
      nodeIds.push(nodeId);
      nodeIdIndex++;
    }
  }

  const timestamps: Array<Timestamp> = [];
  for (let i = 0; i < length; i++) {
    timestamps.push({
      millis: millises[i],
      counter: counters[i],
      nodeId: nodeIds[i],
    });
  }

  return timestamps;
};

const decodeId = (buffer: Buffer): Id => {
  const bytes = buffer.shiftN(idBytesTypeValueLength);
  return idBytesToId(bytes as IdBytes);
};

/**
 * Evolu uses MessagePack to handle all number variants except for
 * NonNegativeInt. For NonNegativeInt, Evolu provides more efficient encoding.
 */
export const encodeNumber = (buffer: Buffer, number: number): void => {
  buffer.extend(packr.pack(number));
};

export const decodeNumber = (buffer: Buffer): number => {
  let number: unknown;
  let end: unknown;

  packr.unpackMultiple(
    buffer.unwrap(),
    (n: unknown, _: unknown, e: unknown) => {
      number = n;
      end = e;
      return false;
    },
  );

  const endResult = NonNegativeInt.fromUnknown(end);
  if (!endResult.ok) throw new ProtocolDecodeError(endResult.error.type);

  const numberResult = Number.fromUnknown(number);
  if (!numberResult.ok) throw new ProtocolDecodeError(numberResult.error.type);

  buffer.shiftN(endResult.value);
  return numberResult.value;
};

/**
 * Encodes an array of boolean flags into a single byte.
 *
 * Each element in the array corresponds to a bit (0-7). Array can have 0-8
 * elements.
 *
 * ### Example
 *
 * ```ts
 * encodeFlags(buffer, [true, false, true]); // Encodes bits 0, 1, 2
 * ```
 */
export const encodeFlags = (
  buffer: Buffer,
  flags: ReadonlyArray<boolean>,
): void => {
  let byte = 0;
  for (let i = 0; i < flags.length && i < 8; i++) {
    if (flags[i]) {
      byte |= 1 << i;
    }
  }
  buffer.extend([byte]);
};

/**
 * Decodes a byte into an array of boolean flags.
 *
 * ### Example
 *
 * ```ts
 * const flags = decodeFlags(buffer, 3); // Decode 3 flags
 * ```
 */
export const decodeFlags = (
  buffer: Buffer,
  count: PositiveInt,
): ReadonlyArray<boolean> => {
  const byte = buffer.shift();
  const flags: Array<boolean> = [];
  for (let i = 0; i < count && i < 8; i++) {
    flags.push((byte & (1 << i)) !== 0);
  }
  return flags;
};

/**
 * Encodes and encrypts a {@link DbChange} using the provided owner's encryption
 * key. Returns an encrypted binary representation as {@link EncryptedDbChange}.
 *
 * The format includes the protocol version for backward compatibility and the
 * timestamp for tamper-proof verification that the timestamp matches the change
 * data.
 */
export const encodeAndEncryptDbChange =
  (deps: SymmetricCryptoDep) =>
  (message: CrdtMessage, key: EncryptionKey): EncryptedDbChange => {
    const buffer = createBuffer();

    encodeNonNegativeInt(buffer, protocolVersion);

    // Encode the timestamp to prevent tampering (e.g., a malicious relay
    // assigning this EncryptedDbChange to a different EncryptedCrdtMessage)
    buffer.extend(timestampToTimestampBytes(message.timestamp));

    encodeFlags(buffer, [
      message.change.isInsert,
      message.change.isDelete != null,
      message.change.isDelete ?? false,
    ]);

    encodeString(buffer, message.change.table);
    buffer.extend(idToIdBytes(message.change.id));

    const entries = objectToEntries(message.change.values);

    encodeLength(buffer, entries);
    for (const [column, value] of entries) {
      encodeString(buffer, column);
      encodeSqliteValue(buffer, value);
    }

    // Add PADMÉ padding (ignored during decoding)
    buffer.extend(createPadmePadding(buffer.getLength()));

    const { nonce, ciphertext } = deps.symmetricCrypto.encrypt(
      buffer.unwrap(),
      key,
    );

    buffer.reset();
    buffer.extend(nonce);
    encodeLength(buffer, ciphertext);
    buffer.extend(ciphertext);

    return buffer.unwrap() as EncryptedDbChange;
  };

/**
 * Decrypts and decodes an {@link EncryptedCrdtMessage} using the provided
 * owner's encryption key. Verifies that the embedded timestamp matches the
 * expected timestamp to ensure message integrity.
 */
export const decryptAndDecodeDbChange =
  (deps: SymmetricCryptoDep) =>
  (
    message: EncryptedCrdtMessage,
    key: EncryptionKey,
  ): Result<
    DbChange,
    | SymmetricCryptoDecryptError
    | ProtocolInvalidDataError
    | ProtocolTimestampMismatchError
  > => {
    try {
      const buffer = createBuffer(message.change);

      const nonce = buffer.shiftN(deps.symmetricCrypto.nonceLength);
      const ciphertext = buffer.shiftN(decodeLength(buffer));

      const plaintextBytes = deps.symmetricCrypto.decrypt(
        ciphertext,
        key,
        nonce,
      );
      if (!plaintextBytes.ok) return plaintextBytes;

      buffer.reset();
      buffer.extend(plaintextBytes.value);

      // Decode version (for future compatibility, not need yet)
      decodeNonNegativeInt(buffer);

      const timestamp = timestampBytesToTimestamp(
        buffer.shiftN(timestampBytesLength) as TimestampBytes,
      );

      if (!eqTimestamp(timestamp, message.timestamp)) {
        return err<ProtocolTimestampMismatchError>({
          type: "ProtocolTimestampMismatchError",
          expected: message.timestamp,
          timestamp,
        });
      }

      const flags = decodeFlags(buffer, PositiveInt.orThrow(3));
      const table = decodeString(buffer);
      const id = decodeId(buffer);

      const length = decodeLength(buffer);
      const values = createRecord<string, SqliteValue>();

      for (let i = 0; i < length; i++) {
        const column = decodeString(buffer);
        const value = decodeSqliteValue(buffer);
        values[column] = value;
      }

      const dbChange = DbChange.orThrow({
        table,
        id,
        values,
        isInsert: flags[0],
        isDelete: flags[1] ? flags[2] : null,
      });

      return ok(dbChange);
    } catch (error) {
      return err<ProtocolInvalidDataError>({
        type: "ProtocolInvalidDataError",
        data: message.change,
        error,
      });
    }
  };

/**
 * Encodes a non-negative integer into a variable-length integer format. It's
 * more efficient than encoding via {@link encodeNumber}.
 *
 * https://en.wikipedia.org/wiki/Variable-length_quantity
 */
export const encodeNonNegativeInt = (
  buffer: Buffer,
  int: NonNegativeInt,
): void => {
  if (int === 0) {
    buffer.extend([0]);
    return;
  }

  let remaining = BigInt(int);
  const bytes: Array<number> = [];

  while (remaining !== 0n) {
    const byte = globalThis.Number(remaining & 127n);
    bytes.push(byte);
    remaining >>= 7n;
  }

  for (let i = 0; i < bytes.length - 1; i++) {
    bytes[i] |= 128;
  }

  buffer.extend(bytes);
};

/**
 * Decodes a non-negative integer from a variable-length integer format.
 *
 * https://en.wikipedia.org/wiki/Variable-length_quantity
 */
export const decodeNonNegativeInt = (buffer: Buffer): NonNegativeInt => {
  let result = 0n;
  let shift = 0n;
  let byte;

  // 8 is the smallest required count
  for (let byteCount = 0; byteCount < 8; byteCount++) {
    byte = buffer.shift();
    result |= BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) break;
    shift += 7n;
  }

  const int = NonNegativeInt.from(globalThis.Number(result));
  if (!int.ok) throw new ProtocolDecodeError(int.error.type);

  return int.value;
};

export const encodeLength = (buffer: Buffer, value: ArrayLike<any>): void => {
  encodeNonNegativeInt(buffer, NonNegativeInt.orThrow(value.length));
};

export const decodeLength = decodeNonNegativeInt;

export const encodeString = (buffer: Buffer, value: string): void => {
  const bytes = utf8ToBytes(value);
  encodeLength(buffer, bytes);
  buffer.extend(bytes);
};

export const decodeString = (buffer: Buffer): string => {
  const length = decodeLength(buffer);
  const bytes = buffer.shiftN(length);
  return bytesToUtf8(bytes);
};

export const encodeNodeId = (buffer: Buffer, nodeId: NodeId): void => {
  buffer.extend(hexToBytes(nodeId));
};

export const decodeNodeId = (buffer: Buffer): NodeId => {
  const bytes = buffer.shiftN(NonNegativeInt.orThrow(8));
  return bytesToHex(bytes) as NodeId;
};

// Small ints are encoded into ProtocolValueType, saving one byte per int.
const isSmallInt: Predicate<number> = (value: number) =>
  value >= 0 && value < 20;

export const ProtocolValueType = {
  // 0-19 small ints

  // SQLite types
  String: NonNegativeInt.orThrow(20),
  Number: NonNegativeInt.orThrow(21),
  Null: NonNegativeInt.orThrow(22),
  Bytes: NonNegativeInt.orThrow(23),
  // We can add more types for other DBs or anything else later.

  // Optimized types
  NonNegativeInt: NonNegativeInt.orThrow(30),

  // String optimizations
  EmptyString: NonNegativeInt.orThrow(31), // 1 byte vs 2 bytes (50% reduction)
  Base64Url: NonNegativeInt.orThrow(32),
  Id: NonNegativeInt.orThrow(33),
  Json: NonNegativeInt.orThrow(34),

  // new Date().toISOString()   - 24 bytes
  // encoded with fixed length  - 8 bytes
  // encode as NonNegativeInt   - 6 bytes (additional 25% reduction)
  DateIsoWithNonNegativeTime: NonNegativeInt.orThrow(35),
  DateIsoWithNegativeTime: NonNegativeInt.orThrow(36), // 9 bytes

  // TODO: Operations (from 40)
  // Increment, Decrement, Patch, whatever.
} as const;

export const encodeSqliteValue = (buffer: Buffer, value: SqliteValue): void => {
  if (value === null) {
    encodeNonNegativeInt(buffer, ProtocolValueType.Null);
    return;
  }

  switch (typeof value) {
    case "string": {
      if (value === "") {
        encodeNonNegativeInt(buffer, ProtocolValueType.EmptyString);
        return;
      }

      const dateIso = DateIso.fromParent(value);
      if (dateIso.ok) {
        const time = new Date(dateIso.value).getTime();
        if (NonNegativeInt.is(time)) {
          encodeNonNegativeInt(
            buffer,
            ProtocolValueType.DateIsoWithNonNegativeTime,
          );
          encodeNonNegativeInt(buffer, time);
        } else {
          encodeNonNegativeInt(
            buffer,
            ProtocolValueType.DateIsoWithNegativeTime,
          );
          encodeNumber(buffer, time);
        }
        return;
      }

      const id = Id.fromParent(value);
      if (id.ok) {
        encodeNonNegativeInt(buffer, ProtocolValueType.Id);
        buffer.extend(idToIdBytes(id.value));
        return;
      }

      const json = Json.fromParent(value);
      // Only encode as Json if it survives JSON.parse/JSON.stringify round-trip.
      // Some valid JSON strings like "-0E0" get normalized to "0" during parsing,
      // which would cause data corruption if we don't verify round-trip safety.
      if (json.ok && JSON.stringify(jsonToJsonValue(json.value)) === value) {
        const jsonBytes = packr.pack(jsonToJsonValue(json.value));
        encodeNonNegativeInt(buffer, ProtocolValueType.Json);
        encodeLength(buffer, jsonBytes);
        buffer.extend(jsonBytes);
        return;
      }

      const base64Url = Base64Url.fromParent(value);
      if (base64Url.ok) {
        encodeNonNegativeInt(buffer, ProtocolValueType.Base64Url);
        const bytes = base64UrlToUint8Array(base64Url.value);
        encodeLength(buffer, bytes);
        buffer.extend(bytes);
        return;
      }

      encodeNonNegativeInt(buffer, ProtocolValueType.String);
      encodeString(buffer, value);
      return;
    }

    case "number": {
      if (NonNegativeInt.is(value)) {
        if (isSmallInt(value)) {
          encodeNonNegativeInt(buffer, value);
          return;
        }
        encodeNonNegativeInt(buffer, ProtocolValueType.NonNegativeInt);
        encodeNonNegativeInt(buffer, value);
        return;
      }
      encodeNonNegativeInt(buffer, ProtocolValueType.Number);
      encodeNumber(buffer, value);
      return;
    }
  }

  encodeNonNegativeInt(buffer, ProtocolValueType.Bytes);
  encodeLength(buffer, value);
  buffer.extend(value);
};

export const decodeSqliteValue = (buffer: Buffer): SqliteValue => {
  const type = decodeNonNegativeInt(buffer);

  if (isSmallInt(type)) {
    return type;
  }

  switch (type) {
    case ProtocolValueType.String:
      return decodeString(buffer);

    case ProtocolValueType.Number:
      return decodeNumber(buffer);

    case ProtocolValueType.Null:
      return null;

    case ProtocolValueType.Bytes: {
      const length = decodeLength(buffer);
      return buffer.shiftN(length);
    }

    case ProtocolValueType.Id:
      return decodeId(buffer);

    case ProtocolValueType.NonNegativeInt:
      return decodeNonNegativeInt(buffer);

    case ProtocolValueType.Json: {
      const length = decodeLength(buffer);
      const bytes = buffer.shiftN(length);
      return JSON.stringify(packr.unpack(bytes));
    }

    case ProtocolValueType.DateIsoWithNonNegativeTime:
    case ProtocolValueType.DateIsoWithNegativeTime: {
      const time =
        type === ProtocolValueType.DateIsoWithNonNegativeTime
          ? decodeNonNegativeInt(buffer)
          : decodeNumber(buffer);
      const dateIso = DateIso.fromParent(new Date(time).toISOString());
      if (!dateIso.ok) throw new ProtocolDecodeError(dateIso.error.type);
      return dateIso.value;
    }

    case ProtocolValueType.EmptyString:
      return "";

    case ProtocolValueType.Base64Url: {
      const length = decodeLength(buffer);
      const bytes = buffer.shiftN(length);
      return uint8ArrayToBase64Url(bytes);
    }

    default:
      throw new ProtocolDecodeError("invalid ProtocolValueType");
  }
};

/**
 * Decodes a ProtocolMessage into a readable JSON object for debugging.
 *
 * Note: This is a stub for future implementation. It should use:
 *
 * - DecodeVersionAndOwner
 * - DecodeError or decodeWriteKeys (depending on context)
 * - DecodeMessages
 * - DecodeRanges
 *
 * If you want to help, please contribute to this function.
 */
export const decodeProtocolMessageToJson = (
  _protocolMessage: ProtocolMessage,
  _isInitiator: boolean,
): unknown => {
  // TODO: Implement using
  // - decodeVersionAndOwner
  // -- decodeError or decodeWriteKeys (should be refactored out),
  // -- decodeMessages, and decodeRanges.
  // This is a stub for PRs and community contributions.
  throw new Error("decodeProtocolMessageToJson is not implemented yet.");
};
