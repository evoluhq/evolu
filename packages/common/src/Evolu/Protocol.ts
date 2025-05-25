/**
 * Evolu Protocol
 *
 * Evolu Protocol is a local-first, end-to-end encrypted binary synchronization
 * protocol optimized for minimal size and maximum speed. It enables data sync
 * between a client and a relay, clients in a peer-to-peer (P2P) setup, or
 * relays with each other.
 *
 * Evolu Protocol is designed for SQLite but can be extended to any database. It
 * implements [Range-Based Set Reconciliation](https://arxiv.org/abs/2212.13567)
 * by Aljoscha Meyer.
 *
 * To learn how RBSR works, check
 * [Negentropy](https://logperiodic.com/rbsr.html). Evolu Protocol is similar to
 * Negentropy but uses different encoding and also provides data transfer and
 * ownership.
 *
 * ### Message Structure
 *
 * | Field                          | Notes                      |
 * | :----------------------------- | :------------------------- |
 * | **Header**                     |                            |
 * | - {@link protocolVersion}      |                            |
 * | - {@link OwnerId}              |                            |
 * | - {@link ProtocolErrorCode}    | In non-initiator response. |
 * | **Messages**                   |                            |
 * | - {@link NonNegativeInt}       | A number of messages.      |
 * | - {@link EncryptedCrdtMessage} |                            |
 * | - {@link WriteKey}             | In initiator request.      |
 * | **Ranges**                     |                            |
 * | - {@link NonNegativeInt}       | Number of ranges.          |
 * | - {@link Range}                |                            |
 *
 * Every protocol message belongs to an owner.
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
 * Both **Messages** and **Ranges** are optional, allowing each side to send,
 * sync, or only subscribe data as needed.
 *
 * When the initiator sends data, the {@link WriteKey} is **required** in
 * **Messages** as a secure token proving the initiator can write changes. The
 * non-initiator responds without a {@link WriteKey}, since the initiator’s
 * request already signals it wants data. If the non-initiator detects an issue
 * (e.g., an invalid {@link WriteKey} causing a {@link ProtocolWriteKeyError}, or
 * a write failure causing a {@link ProtocolWriteError}), it sends an error code
 * via the `Error` field in the header back to the initiator. In relay-to-relay
 * or P2P sync, both sides may require the {@link WriteKey} depending on who is
 * the initiator.
 *
 * ### Message Size Limit
 *
 * The protocol enforces a strict maximum size for all messages, defined by
 * {@link maxProtocolMessageSize}. This ensures every `ProtocolMessage` is less
 * than or equal to this limit, eliminating the need for applications to
 * fragment and reconstruct messages during transmission.
 *
 * ### Why Binary?
 *
 * The protocol avoids JSON because:
 *
 * - Encrypted data doesn’t compress well, unlike plain JSON.
 * - Message size must be controlled during creation.
 * - Sequential byte reading is faster than parsing and can avoid conversions.
 *
 * It uses structure-aware encoding, significantly outperforming generic binary
 * serialization formats with the following optimizations:
 *
 * - **NonNegativeInt:** Up to 33% smaller than MessagePack.
 * - **Base64Url Strings:** Up to 25% size reduction.
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
 * The initiator sends a versioned `ProtocolMessage`. If the non-initiator uses
 * a different version, it responds with a message containing only its protocol
 * version—**without an `ownerId`**. This allows the initiator to check protocol
 * compatibility, for example, by sending version-only messages to multiple
 * relays before starting synchronization.
 *
 * ### Storages
 *
 * TODO: Explain Evolu Protocol Storages.
 *
 * @module
 */

import { sha256 } from "@noble/hashes/sha2";
import { pack, unpack, unpackMultiple } from "msgpackr";
import { isNonEmptyReadonlyArray, NonEmptyReadonlyArray } from "../Array.js";
import { assert } from "../Assert.js";
import {
  Buffer,
  BufferError,
  bytesToHex,
  bytesToUtf8,
  concatBytes,
  createBuffer,
  hexToBytes,
  utf8ToBytes,
} from "../Buffer.js";
import {
  CreateRandomBytesDep,
  EncryptionKey,
  SymmetricCryptoDecryptError,
  SymmetricCryptoDep,
} from "../Crypto.js";
import { computeBalancedBuckets } from "../Number.js";
import { objectToEntries, ReadonlyRecord } from "../Object.js";
import { err, ok, Result } from "../Result.js";
import { SqliteValue } from "../Sqlite.js";
import {
  Base64Url,
  brand,
  DateIsoString,
  Id,
  idTypeValueLength,
  JsonValueFromString,
  maxLength,
  minLength,
  NanoId,
  NonNegativeInt,
  Number,
  PositiveInt,
} from "../Type.js";
import { Brand, Predicate } from "../Types.js";
import {
  OwnerId,
  OwnerWithWriteAccess,
  WriteKey,
  writeKeyLength,
} from "./Owner.js";
import {
  BinaryTimestamp,
  binaryTimestampToTimestamp,
  Counter,
  Millis,
  NodeId,
  Timestamp,
  timestampToBinaryTimestamp,
} from "./Timestamp.js";
import { eqArrayNumber } from "../Eq.js";

/**
 * Maximum size of the entire protocol message (header, messages, and ranges) in
 * bytes (1 MB).
 */
export const maxProtocolMessageSize = (1024 * 1024) as PositiveInt;

/**
 * Maximum size of the ranges portion (timestamps, types, and payloads) in bytes
 * (50 KB).
 */
export const maxProtocolMessageRangesSize = (50 * 1024) as PositiveInt;

/** Evolu Protocol Message. */
export type ProtocolMessage = Uint8Array & Brand<"ProtocolMessage">;

/** Evolu Protocol version. */
export const protocolVersion = 0 as NonNegativeInt;

export const ProtocolErrorCode = {
  NoError: 0,
  /** A code for {@link ProtocolWriteKeyError}. */
  WriteKeyError: 1,
  /** A code for {@link ProtocolWriteError}. */
  WriteError: 2,
  /** A code for {@link ProtocolSyncError}. */
  SyncError: 3,
} as const;

type ProtocolErrorCode =
  (typeof ProtocolErrorCode)[keyof typeof ProtocolErrorCode];

/**
 * Evolu Protocol Storage
 *
 * The protocol is agnostic to storage implementation details—any storage can be
 * plugged in, as long as it implements this interface. Implementations must
 * handle their own errors; return values only indicates overall success or
 * failure.
 */
export interface Storage {
  readonly getSize: (ownerId: BinaryOwnerId) => NonNegativeInt | null;

  readonly fingerprint: (
    ownerId: BinaryOwnerId,
    begin: NonNegativeInt,
    end: NonNegativeInt,
  ) => Fingerprint | null;

  /**
   * Computes fingerprints with their upper bounds in one call.
   *
   * This function can be replaced with many fingerprint/findLowerBound calls,
   * but implementations can leverage it for batching and more efficient
   * fingerprint computation.
   */
  readonly fingerprintRanges: (
    ownerId: BinaryOwnerId,
    buckets: ReadonlyArray<NonNegativeInt>,
    upperBound?: RangeUpperBound,
  ) => ReadonlyArray<FingerprintRange> | null;

  readonly findLowerBound: (
    ownerId: BinaryOwnerId,
    begin: NonNegativeInt,
    end: NonNegativeInt,
    upperBound: RangeUpperBound,
  ) => NonNegativeInt | null;

  readonly iterate: (
    ownerId: BinaryOwnerId,
    begin: NonNegativeInt,
    end: NonNegativeInt,
    callback: (timestamp: BinaryTimestamp, index: NonNegativeInt) => boolean,
  ) => void;

  /**
   * Authorizes the initiator's {@link WriteKey} for the given
   * {@link BinaryOwnerId}.
   *
   * For a client that does not expect foreign writes, return `false`.
   */
  readonly validateWriteKey: (
    ownerId: BinaryOwnerId,
    writeKey: WriteKey,
  ) => boolean;

  /** Write encrypted {@link CrdtMessage}s to storage. */
  readonly writeMessages: (
    ownerId: BinaryOwnerId,
    messages: NonEmptyReadonlyArray<EncryptedCrdtMessage>,
  ) => boolean;

  /** Read encrypted {@link DbChange}s from storage. */
  readonly readDbChange: (
    ownerId: BinaryOwnerId,
    timestamp: BinaryTimestamp,
  ) => EncryptedDbChange | null;
}

export interface StorageDep {
  readonly storage: Storage;
}

/** An encrypted {@link CrdtMessage}. */
export interface EncryptedCrdtMessage {
  readonly timestamp: Timestamp;
  readonly change: EncryptedDbChange;
}

/** Encrypted DbChange */
export type EncryptedDbChange = Uint8Array & Brand<"EncryptedDbChange">;

/**
 * A CRDT message that combines a unique {@link Timestamp} with a
 * {@link DbChange}.
 */
export interface CrdtMessage {
  readonly timestamp: Timestamp;
  readonly change: DbChange;
}

/**
 * A DbChange is a change to a table row. Together with a unique
 * {@link Timestamp}, it forms a {@link CrdtMessage}.
 *
 * TODO: Remove schema from DbChange and use NonNegativeInts instead. There is
 * really no reason why we should encode table and column names. App knows it.
 */
export interface DbChange {
  readonly table: TableName;
  readonly id: Id;
  readonly values: ReadonlyRecord<ColumnName, SqliteValue>;
}

/**
 * `DbIdentifier` is used for database (tables and columns) names. It enforces
 * that the string length is at least 1 character and does not exceed 42.
 */
export const DbIdentifier = minLength(1)(maxLength(42)(Base64Url));
export type DbIdentifier = typeof DbIdentifier.Type;

export const TableName = brand("TableName", DbIdentifier);
export type TableName = typeof TableName.Type;

export const ColumnName = brand("ColumnName", DbIdentifier);
export type ColumnName = typeof ColumnName.Type;

export const RangeType = {
  Fingerprint: 1,
  Skip: 0,
  Timestamps: 2,
} as const;

export type RangeType = (typeof RangeType)[keyof typeof RangeType];

export const InfiniteUpperBound = Symbol("InfiniteUpperBound");
export type InfiniteUpperBound = typeof InfiniteUpperBound;

/**
 * Union type for Range's upperBound: either a {@link BinaryTimestamp} or
 * {@link InfiniteUpperBound}.
 */
export type RangeUpperBound = BinaryTimestamp | InfiniteUpperBound;

interface BaseRange {
  readonly upperBound: RangeUpperBound;
}

export interface SkipRange extends BaseRange {
  readonly type: typeof RangeType.Skip;
}

export interface FingerprintRange extends BaseRange {
  readonly type: typeof RangeType.Fingerprint;
  readonly fingerprint: Fingerprint;
}

/**
 * A cryptographic hash used for efficiently comparing collections of
 * {@link BinaryTimestamp}s.
 *
 * It consists of the first {@link fingerprintSize} bytes of the SHA-256 hash of
 * one or more timestamps.
 */
export type Fingerprint = Uint8Array & Brand<"Fingerprint">;

export const fingerprintSize = 12 as NonNegativeInt;

/** A fingerprint of an empty range. */
export const zeroFingerprint = new Uint8Array(fingerprintSize) as Fingerprint;

export interface TimestampsRange extends BaseRange {
  readonly type: typeof RangeType.Timestamps;
  readonly timestamps: ReadonlyArray<BinaryTimestamp>;
}

export interface TimestampsRangeWithTimestampsBuffer extends BaseRange {
  readonly type: typeof RangeType.Timestamps;
  readonly timestamps: TimestampsBuffer;
}

export type Range = SkipRange | FingerprintRange | TimestampsRange;

export type ProtocolError =
  | ProtocolUnsupportedVersionError
  | ProtocolInvalidDataError
  | ProtocolWriteKeyError
  | ProtocolWriteError
  | ProtocolSyncError;

/**
 * Represents a version mismatch in the Evolu Protocol. Occurs when the
 * initiator and non-initiator are using incompatible protocol versions.
 */
export interface ProtocolUnsupportedVersionError {
  readonly type: "ProtocolUnsupportedVersionError";
  readonly unsupportedVersion: NonNegativeInt;
  /** Indicates which side is obsolete and should update. */
  readonly isInitiator: boolean;
}

/** Error for invalid or corrupted protocol message data. */
export interface ProtocolInvalidDataError {
  readonly type: "ProtocolInvalidDataError";
  readonly data: globalThis.Uint8Array;
  readonly error: unknown;
}

/** Error when a {@link WriteKey} is invalid, missing, or fails validation. */
export interface ProtocolWriteKeyError {
  readonly type: "ProtocolWriteKeyError";
}

/**
 * Error when a write fails due to storage limits or billing requirements.
 * Indicates the need to expand capacity or resolve payment issues.
 */
export interface ProtocolWriteError {
  readonly type: "ProtocolWriteError";
}

/**
 * Error indicating a synchronization failure during the protocol exchange. Used
 * for unexpected or generic sync errors not covered by other error types.
 */
export interface ProtocolSyncError {
  readonly type: "ProtocolSyncError";
}

/**
 * Creates a {@link ProtocolMessage} from CRDT messages.
 *
 * If the message size would exceed {@link maxProtocolMessageSize}, the protocol
 * ensures all messages will be sent in the next round(s) even over
 * unidirectional and stateless transports.
 */
export const createProtocolMessageFromCrdtMessages =
  (deps: SymmetricCryptoDep & CreateRandomBytesDep) =>
  (
    owner: OwnerWithWriteAccess,
    messages: NonEmptyReadonlyArray<CrdtMessage>,
    maxSize?: PositiveInt,
  ): ProtocolMessage => {
    const buffer = createProtocolMessageBuffer(owner.id, {
      totalMaxSize: maxSize ?? maxProtocolMessageSize,
      writeKey: owner.writeKey,
    });

    let notAllMessagesSent = false;

    for (const message of messages) {
      const change = encryptDbChange(deps)(message.change, owner.encryptionKey);
      if (!buffer.addMessage({ timestamp: message.timestamp, change })) {
        notAllMessagesSent = true;
        break;
      }
    }

    // TODO: Add test.
    if (notAllMessagesSent) {
      /**
       * DEV: If not all messages fit due to size limits, we trigger a sync
       * continuation by appending a Range with a random fingerprint. This
       * ensures the receiver always responds with ranges, prompting another
       * sync round.
       *
       * The ideal approach would be to send three ranges (skip, fingerprint,
       * skip) where the fingerprint of unsent messages would act as narrow sync
       * probe. I think we can send {@link zeroFingerprint} which can be
       * interpreted as an indication that the other side should reply with
       * {@link TimestampsRange}, so no need to restart syncing.
       *
       * For now, using a random fingerprint avoids extra complexity and is good
       * enough for this IMHO rare case.
       */
      const randomFingerprint = deps.createRandomBytes(
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
  (ownerId: OwnerId): ProtocolMessage | null => {
    const buffer = createProtocolMessageBuffer(ownerId);
    const binaryOwnerId = ownerIdToBinaryOwnerId(ownerId);

    const size = deps.storage.getSize(binaryOwnerId);
    // Errors are handled by the storage.
    if (size == null) return null;

    splitRange(deps)(
      binaryOwnerId,
      0 as NonNegativeInt,
      size,
      InfiniteUpperBound,
      buffer,
    );

    return buffer.unwrap();
  };

/**
 * Mutable builder for constructing {@link ProtocolMessage} respecting size
 * limits.
 */
export interface ProtocolMessageBuffer {
  /**
   * Add an encrypted message to the buffer. Returns false if adding would
   * exceed size limits.
   */
  readonly addMessage: (message: EncryptedCrdtMessage) => boolean;

  /**
   * Adds a range to the protocol message.
   *
   * Returns false if adding the range exceeds maxSize.
   */
  readonly addRange: (
    range: SkipRange | FingerprintRange | TimestampsRangeWithTimestampsBuffer,
  ) => boolean;

  /** Finalize and return the {@link ProtocolMessage}. */
  readonly unwrap: () => ProtocolMessage;

  /**
   * Checks if there is enough space left in the buffer.
   *
   * We want to skip processing the whole range in case there is no available
   * space.
   */
  readonly hasEnoughSpaceForSplitRange: () => boolean;

  // hasEnoughSpaceForTimestampsRange

  readonly getSize: () => PositiveInt;
}

export const createProtocolMessageBuffer = (
  ownerId: OwnerId,
  options: {
    readonly errorCode?: ProtocolErrorCode;
    readonly writeKey?: WriteKey;
    readonly totalMaxSize?: PositiveInt;
    readonly rangesMaxSize?: PositiveInt;
    readonly version?: NonNegativeInt;
  } = {},
): ProtocolMessageBuffer => {
  const {
    errorCode,
    writeKey,
    totalMaxSize = maxProtocolMessageSize,
    rangesMaxSize = maxProtocolMessageRangesSize,
    version = protocolVersion,
  } = options;

  const headerBuffer = createBuffer();
  encodeNonNegativeInt(headerBuffer, version);
  headerBuffer.extend(ownerIdToBinaryOwnerId(ownerId));
  if (errorCode != null) headerBuffer.extend([errorCode]);

  const messagesTimestamps = createTimestampsBuffer();
  const messagesChanges = createBuffer();

  const rangesTimestamps = createTimestampsBuffer();
  const rangesTypes = createBuffer();
  const rangesPayloads = createBuffer();

  let prevRangesPayloadsLength = 0 as NonNegativeInt;

  let isLastRangeInfinite = false;
  let rangesLimitExceeded = false;

  const isWithinSizeLimits = () => {
    const rangesSize = getRangesSize();
    if (rangesSize > rangesMaxSize) {
      rangesLimitExceeded = true;
      return false;
    }
    const totalSize = getHeaderAndMessagesSize() + rangesSize;
    return totalSize <= totalMaxSize;
  };

  const getRangesSize = () =>
    rangesTimestamps.getCount() > 0
      ? rangesTimestamps.getLength() +
        rangesTypes.getLength() +
        rangesPayloads.getLength() +
        reservedLastFingerprintRangeSize
      : 0;

  // Size reserved for the last FingerprintRange with InfiniteUpperBound.
  const reservedLastFingerprintRangeSize =
    // type + fingerprintSize + 1 byte for potential count varint increase.
    (1 + fingerprintSize + 1) as PositiveInt;

  const getHeaderAndMessagesSize = () =>
    headerBuffer.getLength() +
    messagesTimestamps.getLength() +
    messagesChanges.getLength() +
    (messagesTimestamps.getCount() > 0 && writeKey ? writeKeyLength : 0);

  return {
    addMessage: ({ timestamp, change }) => {
      messagesTimestamps.add(timestamp);

      const prevChangesLength = messagesChanges.getLength();
      encodeLength(messagesChanges, change);
      messagesChanges.extend(change);

      if (!isWithinSizeLimits()) {
        messagesTimestamps.rollback();
        messagesChanges.truncate(prevChangesLength);
        return false;
      }

      return true;
    },

    addRange: (range) => {
      assert(
        !isLastRangeInfinite,
        "Cannot add a range after an InfiniteUpperBound range",
      );

      if (rangesLimitExceeded) {
        assert(
          range.type === RangeType.Fingerprint,
          "The last range must be a FingerprintRange with InfiniteUpperBound when rangesMaxSize was exceeded",
        );
      }

      // We don't have to encode InfiniteUpperBound since it's always the last.
      // That's how we save 16 bytes. Also, ranges must cover the full universe.
      // For partial sync, we use SkipRange.
      if (range.upperBound !== InfiniteUpperBound)
        rangesTimestamps.add(binaryTimestampToTimestamp(range.upperBound));
      else {
        rangesTimestamps.addInfinite();
      }

      const prevRangesTypesLength = rangesTypes.getLength();
      prevRangesPayloadsLength = rangesPayloads.getLength();

      encodeNonNegativeInt(rangesTypes, range.type as NonNegativeInt);

      switch (range.type) {
        case RangeType.Skip:
          break;
        case RangeType.Fingerprint:
          rangesPayloads.extend(range.fingerprint);
          break;
        case RangeType.Timestamps: {
          range.timestamps.append(rangesPayloads);
          break;
        }
      }

      if (!rangesLimitExceeded && !isWithinSizeLimits()) {
        if (range.upperBound !== InfiniteUpperBound)
          rangesTimestamps.rollback();
        rangesTypes.truncate(prevRangesTypesLength);
        rangesPayloads.truncate(prevRangesPayloadsLength);
        return false;
      }

      isLastRangeInfinite = range.upperBound === InfiniteUpperBound;

      return true;
    },

    unwrap: () => {
      if (rangesTimestamps.getCount() > 0) {
        assert(
          isLastRangeInfinite,
          "The last range's upperBound must be InfiniteUpperBound",
        );
      }

      messagesTimestamps.append(headerBuffer);
      headerBuffer.extend(messagesChanges.unwrap());
      if (messagesTimestamps.getCount() > 0 && writeKey)
        headerBuffer.extend(writeKey);

      if (rangesTimestamps.getCount() > 0) {
        rangesTimestamps.append(headerBuffer);
        headerBuffer.extend(rangesTypes.unwrap());
        headerBuffer.extend(rangesPayloads.unwrap());
      }

      return headerBuffer.unwrap() as ProtocolMessage;
    },

    hasEnoughSpaceForSplitRange: () => {
      /**
       * The {@link splitRange} can add 31 {@link TimestampsRange}s (max 16 bytes
       * per {@link Timestamp}) or 16 {@link FingerprintRange}s (max 29 bytes per
       * range). It's around 500 bytes, but because we use RLE often much less
       * or slightly more in the worst case (unique NodeIds), 1000 bytes is a
       * safe magic constant for now.
       *
       * TODO: We should compute the worst case and add a test for it.
       */
      const reservedSpaceForSplitRange = 1000;
      return getRangesSize() + reservedSpaceForSplitRange <= rangesMaxSize;
    },

    getSize: () => {
      return (getHeaderAndMessagesSize() + getRangesSize()) as PositiveInt;
    },
  };
};

export interface TimestampsBuffer {
  readonly add: (timestamp: Timestamp) => void;
  readonly addInfinite: () => void;
  readonly rollback: () => void;
  readonly getCount: () => NonNegativeInt;
  readonly getLength: () => number;
  readonly append: (buffer: Buffer) => void;
}

export const createTimestampsBuffer = (): TimestampsBuffer => {
  let count = 0 as NonNegativeInt;
  const countBuffer = createBuffer();

  const syncCount = () => {
    countBuffer.reset();
    encodeNonNegativeInt(countBuffer, count);
  };
  syncCount();

  const millisBuffer = createBuffer();
  let previousMillis = 0 as Millis;
  let previousMillisLength = 0 as NonNegativeInt;

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
      previousMillisLength = millisBuffer.getLength();
      encodeNonNegativeInt(millisBuffer, delta);

      counterEncoder.add(timestamp.counter);
      nodeIdEncoder.add(timestamp.nodeId);
    },

    addInfinite: () => {
      count++;
      syncCount();
    },

    rollback: () => {
      count--;
      syncCount();
      millisBuffer.truncate(previousMillisLength);
      counterEncoder.rollback();
      nodeIdEncoder.rollback();
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
  rollback: () => void;
  unwrap: () => Uint8Array;
}

const createRunLengthEncoder = <T>(
  encodeValue: (buffer: Buffer, value: T) => void,
): RunLengthEncoder<T> => {
  const buffer = createBuffer();
  let previousLength = 0 as NonNegativeInt;
  let previousValue = null as T | null;
  let runLength = 0 as NonNegativeInt;

  return {
    add: (value) => {
      if (value === previousValue) {
        runLength++;
        buffer.truncate(previousLength);
      } else {
        previousValue = value;
        runLength = 1 as NonNegativeInt;
      }
      previousLength = buffer.getLength();
      encodeValue(buffer, value);
      encodeNonNegativeInt(buffer, runLength);
    },

    getLength: () => buffer.getLength(),

    rollback: () => {
      buffer.truncate(previousLength);
      if (previousValue != null && runLength > 1) {
        runLength--;
        encodeValue(buffer, previousValue);
        encodeNonNegativeInt(buffer, runLength);
      }
    },

    unwrap: () => buffer.unwrap(),
  };
};

export interface ApplyProtocolMessageAsClientOptions {
  getWriteKey?: (ownerId: OwnerId) => WriteKey | null;

  /** For testing purposes only; should not be used in production. */
  version?: NonNegativeInt;
}

export const applyProtocolMessageAsClient =
  (deps: StorageDep) =>
  (
    inputMessage: Uint8Array,
    {
      getWriteKey,
      version = protocolVersion,
    }: ApplyProtocolMessageAsClientOptions = {},
  ): Result<ProtocolMessage | null, ProtocolError> =>
    tryDecodeProtocolData<ProtocolMessage | null, ProtocolError>(
      inputMessage,
      (input) => {
        const requestedVersion = decodeNonNegativeInt(input);

        if (requestedVersion !== version) {
          return err<ProtocolUnsupportedVersionError>({
            type: "ProtocolUnsupportedVersionError",
            unsupportedVersion: requestedVersion,
            isInitiator: version < requestedVersion,
          });
        }

        const ownerId = decodeOwnerId(input);
        const binaryOwnerId = ownerIdToBinaryOwnerId(ownerId);

        const errorCode = input.shift() as ProtocolErrorCode;
        if (errorCode !== ProtocolErrorCode.NoError) {
          switch (errorCode) {
            case ProtocolErrorCode.WriteKeyError:
              return err<ProtocolWriteKeyError>({
                type: "ProtocolWriteKeyError",
              });
            case ProtocolErrorCode.WriteError:
              return err<ProtocolWriteError>({
                type: "ProtocolWriteError",
              });
            case ProtocolErrorCode.SyncError:
              return err<ProtocolSyncError>({
                type: "ProtocolSyncError",
              });
            default:
              throw new ProtocolDecodeError(
                `Invalid ProtocolErrorCode: ${errorCode}`,
              );
          }
        }

        const messages = decodeMessages(input);

        if (
          isNonEmptyReadonlyArray(messages) &&
          !deps.storage.writeMessages(binaryOwnerId, messages)
        ) {
          return ok(null);
        }

        if (!getWriteKey) return ok(null);
        const writeKey = getWriteKey(ownerId);
        if (writeKey == null) return ok(null);

        const output = createProtocolMessageBuffer(ownerId, { writeKey });

        return sync(deps)(input, output, binaryOwnerId);
      },
    );

export interface ApplyProtocolMessageAsRelayOptions {
  /** To subscribe an owner for broadcasting. */
  subscribe?: (ownerId: OwnerId) => void;

  /** To broadcast a protocol message to all subscribers. */
  broadcast?: (ownerId: OwnerId, message: ProtocolMessage) => void;
}

export const applyProtocolMessageAsRelay =
  (deps: StorageDep) =>
  (
    inputMessage: Uint8Array,
    options: ApplyProtocolMessageAsRelayOptions = {},
    /** For testing purposes only; should not be used in production. */
    version = protocolVersion,
  ): Result<ProtocolMessage | null, ProtocolInvalidDataError> =>
    tryDecodeProtocolData(inputMessage, (input) => {
      const requestedVersion = decodeNonNegativeInt(input);

      if (requestedVersion !== version) {
        // Non-initiator responds with its version.
        const output = createBuffer();
        encodeNonNegativeInt(output, version);
        return ok(output.unwrap() as ProtocolMessage);
      }

      const ownerId = decodeOwnerId(input);
      const binaryOwnerId = ownerIdToBinaryOwnerId(ownerId);

      options.subscribe?.(ownerId);

      const messages = decodeMessages(input);

      if (isNonEmptyReadonlyArray(messages)) {
        const messagesEnd = inputMessage.length - input.getLength();
        const writeKey = input.shiftN(writeKeyLength) as WriteKey;

        const writeKeyIsValid = deps.storage.validateWriteKey(
          binaryOwnerId,
          writeKey,
        );

        if (!writeKeyIsValid)
          return ok(
            createProtocolMessageBuffer(ownerId, {
              errorCode: ProtocolErrorCode.WriteKeyError,
            }).unwrap(),
          );

        if (options.broadcast) {
          // Instead of encoding a new protocol message, we reuse the inputMessage.
          const broadcastMessage = concatBytes(
            inputMessage.slice(0, 17),
            new Uint8Array([ProtocolErrorCode.NoError]),
            inputMessage.slice(17, messagesEnd),
          ) as ProtocolMessage;

          options.broadcast(ownerId, broadcastMessage);
        }

        if (!deps.storage.writeMessages(binaryOwnerId, messages))
          return ok(
            createProtocolMessageBuffer(ownerId, {
              errorCode: ProtocolErrorCode.WriteError,
            }).unwrap(),
          );
      }

      const output = createProtocolMessageBuffer(ownerId, {
        errorCode: ProtocolErrorCode.NoError,
      });

      return sync(deps)(input, output, binaryOwnerId);
    });

/**
 * Wraps Evolu Protocol decoding functions, which use exceptions instead of
 * {@link Result} to provide stack traces for debugging and reduce allocation
 * overhead in success cases.
 */
const tryDecodeProtocolData = <T, E>(
  data: Uint8Array,
  callback: (buffer: Buffer) => Result<T, E | ProtocolInvalidDataError>,
) => {
  try {
    return callback(createBuffer(data));
  } catch (error: unknown) {
    if (error instanceof ProtocolDecodeError || error instanceof BufferError)
      return err<ProtocolInvalidDataError>({
        type: "ProtocolInvalidDataError",
        data,
        error,
      });

    throw error;
  }
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
    input: Buffer,
    output: ProtocolMessageBuffer,
    ownerId: BinaryOwnerId,
  ): Result<ProtocolMessage | null, never> => {
    const ranges = decodeRanges(input);
    // console.log("ranges", ranges);

    if (!isNonEmptyReadonlyArray(ranges)) {
      return ok(null);
    }
    const binaryOwnerId = binaryOwnerIdToOwnerId(ownerId);
    const outputInitialSize = output.getSize();

    const storageSize = deps.storage.getSize(ownerId);
    if (storageSize == null) return ok(null);

    let prevUpperBound: RangeUpperBound | null = null;
    let prevIndex = 0 as NonNegativeInt;

    let skip = false;
    let rangeAdded = false;

    const skipRange = (
      range: SkipRange | FingerprintRange | TimestampsRange,
    ) => {
      // If nothing has been added, sync is completed and there is no
      // reason to add a Skip range with InfiniteUpperBound.
      // But if something has been added, then we have to ensure the
      // last range is a Skip range with InfiniteUpperBound.
      if (rangeAdded && range.upperBound === InfiniteUpperBound) {
        output.addRange({
          type: RangeType.Skip,
          upperBound: InfiniteUpperBound,
        });
      } else {
        skip = true;
      }
    };

    const coalesceSkipBeforeAdd = () => {
      rangeAdded = true;
      if (!skip) return;
      skip = false;
      // We always have to set `skip` to true; otherwise, there is nothing to skip.
      // And when we set `skip`, we have `prevUpperBound != null` in the next step.
      assert(prevUpperBound != null, "a bug");
      // TODO: Terminate pokud nejde pridat skip.
      output.addRange({
        type: RangeType.Skip,
        upperBound: prevUpperBound,
      });
    };

    for (const range of ranges) {
      const currentUpperBound = range.upperBound;

      const lower = prevIndex;
      const upper = deps.storage.findLowerBound(
        ownerId,
        prevIndex,
        storageSize,
        currentUpperBound,
      );
      if (upper == null) return ok(null);

      switch (range.type) {
        case RangeType.Skip: {
          skipRange(range);
          break;
        }

        case RangeType.Fingerprint: {
          const ourFingerprint = deps.storage.fingerprint(
            ownerId,
            lower,
            upper,
          );
          if (ourFingerprint == null) return ok(null);

          if (eqArrayNumber(range.fingerprint, ourFingerprint)) {
            skipRange(range);
          } else {
            coalesceSkipBeforeAdd();
            // TODO: output.hasEnoughSpaceForSplitRange a terminate
            splitRange(deps)(ownerId, lower, upper, currentUpperBound, output);
          }
          break;
        }

        case RangeType.Timestamps: {
          const endBound = currentUpperBound;
          const theirTimestamps = new Map(
            range.timestamps.map((t) => [t.join(), true]),
          );
          let theyNeed = 0;
          const ourTimestamps = createTimestampsBuffer();

          let storageError = false as boolean;

          deps.storage.iterate(
            ownerId,
            lower,
            upper,
            (ourTimestamp, _index) => {
              const ourTimestampString = ourTimestamp.join();
              ourTimestamps.add(binaryTimestampToTimestamp(ourTimestamp));

              if (theirTimestamps.has(ourTimestampString)) {
                theirTimestamps.delete(ourTimestampString);
              } else {
                theyNeed++;

                const dbChange = deps.storage.readDbChange(
                  ownerId,
                  ourTimestamp,
                );
                if (dbChange == null) {
                  storageError = true;
                  return false;
                }

                // console.log("dbChange", dbChange);

                // TODO: Check size
                output.addMessage({
                  timestamp: binaryTimestampToTimestamp(ourTimestamp),
                  change: dbChange,
                });
              }

              return true;
            },
          );

          if (storageError) {
            const message = createProtocolMessageBuffer(binaryOwnerId, {
              errorCode: ProtocolErrorCode.SyncError,
            });
            return ok(message.unwrap());
          }

          const weNeed = theirTimestamps.size > 0;
          if (weNeed || theyNeed > 0) {
            coalesceSkipBeforeAdd();
            // TODO: Tohle pujde pridat, ale checkovat assertem pro jistotu
            const _added = output.addRange({
              type: RangeType.Timestamps,
              upperBound: endBound,
              timestamps: ourTimestamps,
            });
            // console.log(added, endBound);
          } else {
            skipRange(range);
          }

          break;
        }
      }

      prevIndex = upper;
      prevUpperBound = currentUpperBound;
    }

    return ok(output.getSize() > outputInitialSize ? output.unwrap() : null);
  };

const splitRange =
  (deps: StorageDep) =>
  (
    ownerId: BinaryOwnerId,
    lower: NonNegativeInt,
    upper: NonNegativeInt,
    upperBound: RangeUpperBound,
    buffer: ProtocolMessageBuffer,
  ): void => {
    const itemCount = (upper - lower) as NonNegativeInt;
    const buckets = computeBalancedBuckets(itemCount);

    if (!buckets.ok) {
      const range: TimestampsRangeWithTimestampsBuffer = {
        type: RangeType.Timestamps,
        upperBound,
        timestamps: createTimestampsBuffer(),
      };

      deps.storage.iterate(
        ownerId,
        0 as NonNegativeInt,
        itemCount,
        (timestamp) => {
          range.timestamps.add(binaryTimestampToTimestamp(timestamp));
          return true;
        },
      );

      assertMaxProtocolMessageRangesSize(buffer.addRange(range));
      return;
    }

    // Check Storage.ts `fingerprint` and `fingerprintRanges` docs.
    // TLDR; It's smart performance improvement.
    const fingerprintRangesBuckets =
      lower === 0
        ? buckets.value
        : [lower, ...buckets.value.map((b) => (b + lower) as NonNegativeInt)];

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
      assertMaxProtocolMessageRangesSize(buffer.addRange(range));
    }
  };

/**
 * Asserts that the protocol message ranges portion does not exceed
 * {@link maxProtocolMessageRangesSize}.
 */
const assertMaxProtocolMessageRangesSize = (added: boolean) => {
  assert(added, "maxProtocolMessageRangesSize is too small");
};

export const decodeRanges = (buffer: Buffer): ReadonlyArray<Range> => {
  if (buffer.getLength() === 0) return [];

  const rangesCount = decodeNonNegativeInt(buffer);
  if (rangesCount === 0) return [];

  const timestampsCount = (rangesCount - 1) as NonNegativeInt;
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
        ? timestampToBinaryTimestamp(timestamps[i])
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
          timestampToBinaryTimestamp,
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
    if (!millis.ok) throw new Error(millis.error.type);
    millises.push(millis.value);
    previousMillis = millis.value;
  }

  const counters: Array<Counter> = [];
  let counterIndex = 0;
  while (counterIndex < length) {
    const counter = Counter.from(decodeNonNegativeInt(buffer));
    if (!counter.ok) throw new Error(counter.error.type);
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

/** Binary representation of {@link Id}. */
export type BinaryId = Uint8Array & Brand<"BinaryId">;

export const binaryIdLength = 16 as NonNegativeInt;

export const idToBinaryId = (id: Id): BinaryId =>
  base64Url256ToBytes(id) as BinaryId;

export const binaryIdToId = (binaryId: BinaryId): Id =>
  decodeId(createBuffer(binaryId));

/** Binary representation of {@link OwnerId}. */
export type BinaryOwnerId = Uint8Array & Brand<"BinaryOwnerId">;

export const ownerIdToBinaryOwnerId = (ownerId: OwnerId): BinaryOwnerId =>
  base64Url256ToBytes(ownerId) as BinaryOwnerId;

export const binaryOwnerIdToOwnerId = (binaryOwnerId: BinaryOwnerId): OwnerId =>
  decodeOwnerId(createBuffer(binaryOwnerId));

/**
 * Base64Url string with maximum length of 256 characters. Encoding strings as
 * Base64UrlString saves up to 25% in size compared to regular strings.
 */
export const Base64Url256 = maxLength(256)(Base64Url);
export type Base64Url256 = typeof Base64Url256.Type;

/**
 * Union type for all variants of Base64Url strings with limited length. All
 * these types use Base64Url alphabet and are < 256 characters.
 */
export type Base64Url256Variant =
  | Base64Url256
  | Id
  | NanoId
  | OwnerId
  | DbIdentifier;

/**
 * Alphabet used for Base64Url encoding. This is copied from the `nanoid`
 * library to avoid dependency on a specific version of `nanoid`.
 */
const urlAlphabet =
  "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

/**
 * Converts a Base64Url string to a Uint8Array for binary storage. This encoding
 * is more space-efficient than UTF-8 for Base64Url strings.
 */
export const base64Url256ToBytes = (
  string: Base64Url256Variant,
): globalThis.Uint8Array => {
  const totalBits = string.length * 6; // 6 bits per character
  const byteLength = Math.ceil(totalBits / 8);
  const value = new globalThis.Uint8Array(byteLength);

  let bitBuffer = 0;
  let bitsInBuffer = 0;
  let byteIndex = 0;

  for (const char of string) {
    const charValue = urlAlphabet.indexOf(char);
    bitBuffer = (bitBuffer << 6) | charValue;
    bitsInBuffer += 6;
    while (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      value[byteIndex++] = (bitBuffer >> bitsInBuffer) & 0xff;
    }
  }

  if (bitsInBuffer > 0 && byteIndex < byteLength) {
    value[byteIndex] = (bitBuffer << (8 - bitsInBuffer)) & 0xff;
  }

  return value;
};

export const decodeBase64Url256 = (
  buffer: Buffer,
  stringLength: number,
): Base64Url256Variant => {
  const bytes = buffer.shiftN(
    Math.ceil((stringLength * 6) / 8) as NonNegativeInt,
  );

  let bitBuffer = 0;
  let bitsInBuffer = 0;
  let string = "";

  for (const byte of bytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitsInBuffer += 8;
    while (bitsInBuffer >= 6) {
      bitsInBuffer -= 6;
      if (string.length < stringLength) {
        const charValue = (bitBuffer >> bitsInBuffer) & 0x3f;
        if (charValue < 0 || charValue >= urlAlphabet.length) {
          throw new ProtocolDecodeError("invalid charValue");
        }
        string += urlAlphabet[charValue];
      }
    }
  }

  const result = Base64Url256.from(string);
  if (!result.ok) throw new ProtocolDecodeError(result.error.type);

  return result.value;
};

const decodeId = (buffer: Buffer): Id =>
  decodeBase64Url256(buffer, idTypeValueLength) as Id;

/** Not all 16 bytes are valid {@link OwnerId}. */
const decodeOwnerId = (buffer: Buffer): OwnerId => decodeId(buffer) as OwnerId;

/**
 * Evolu uses MessagePack to handle all number variants except for
 * NonNegativeInt. For NonNegativeInt, Evolu provides more efficient encoding.
 */
export const encodeNumber = (buffer: Buffer, number: number): void => {
  buffer.extend(pack(number));
};

export const decodeNumber = (buffer: Buffer): number => {
  let number: unknown;
  let end: unknown;

  unpackMultiple(buffer.unwrap(), (n, _, e) => {
    number = n;
    end = e;
    return false;
  });

  const endResult = NonNegativeInt.fromUnknown(end);
  if (!endResult.ok) throw new ProtocolDecodeError(endResult.error.type);

  const numberResult = Number.fromUnknown(number);
  if (!numberResult.ok) throw new ProtocolDecodeError(numberResult.error.type);

  buffer.shiftN(endResult.value);
  return numberResult.value;
};

export const binaryTimestampToFingerprint = (
  timestamp: BinaryTimestamp,
): Fingerprint => {
  const hash = sha256(timestamp).slice(0, fingerprintSize);
  return hash as Fingerprint;
};

/**
 * Encrypts a {@link DbChange} using the provided owner's encryption key. Returns
 * an encrypted binary representation as {@link EncryptedDbChange}.
 */
export const encryptDbChange =
  (deps: SymmetricCryptoDep) =>
  (change: DbChange, key: EncryptionKey): EncryptedDbChange => {
    const buffer = createBuffer();

    encodeDbChange(buffer, change);
    const plaintext = buffer.unwrap();

    /**
     * TODO: XChaCha20-Poly1305 nonce requires 24 bytes. Since our Timestamp is
     * globally unique, we could use it as the nonce, padded to 24 bytes with 8
     * random bytes. This should be safe, but a cryptography review is
     * recommended.
     */
    const { nonce, ciphertext } = deps.symmetricCrypto.encrypt(plaintext, key);

    buffer.reset();
    buffer.extend(nonce);
    encodeLength(buffer, ciphertext);
    buffer.extend(ciphertext);

    return buffer.unwrap() as EncryptedDbChange;
  };

/**
 * Decrypts an {@link EncryptedDbChange} using the provided owner's encryption
 * key.
 */
export const decryptDbChange =
  (deps: SymmetricCryptoDep) =>
  (
    change: EncryptedDbChange,
    key: EncryptionKey,
  ): Result<DbChange, SymmetricCryptoDecryptError | ProtocolInvalidDataError> =>
    tryDecodeProtocolData<DbChange, SymmetricCryptoDecryptError>(
      change,
      (buffer) => {
        const nonce = buffer.shiftN(deps.symmetricCrypto.nonceLength);

        const ciphertextLength = decodeLength(buffer);
        const ciphertext = buffer.shiftN(ciphertextLength);

        const plaintextBytes = deps.symmetricCrypto.decrypt(
          ciphertext,
          key,
          nonce,
        );
        if (!plaintextBytes.ok) return plaintextBytes;

        // Reuse existing buffer.
        buffer.reset();
        buffer.extend(plaintextBytes.value);

        return ok(decodeDbChange(buffer));
      },
    );

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
  encodeNonNegativeInt(buffer, value.length as NonNegativeInt);
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
  const bytes = buffer.shiftN(8 as NonNegativeInt);
  return bytesToHex(bytes) as NodeId;
};

export const encodeBase64Url256 = (
  buffer: Buffer,
  string: Base64Url256Variant,
): void => {
  encodeLength(buffer, string);
  buffer.extend(base64Url256ToBytes(string));
};

export const decodeBase64Url256WithLength = (buffer: Buffer): Base64Url256 => {
  const length = decodeLength(buffer);
  return decodeBase64Url256(buffer, length) as Base64Url256;
};

export const encodeDbIdentifier = (
  buffer: Buffer,
  dbIdentifier: DbIdentifier,
): void => {
  encodeBase64Url256(buffer, dbIdentifier);
};

export const decodeDbIdentifier = (buffer: Buffer): DbIdentifier => {
  const length = decodeLength(buffer);
  const identifier = decodeBase64Url256(buffer, length);
  const result = DbIdentifier.from(identifier);
  if (!result.ok) throw new ProtocolDecodeError(result.error.type);
  return result.value;
};

export const encodeTableName = (buffer: Buffer, name: TableName): void => {
  encodeDbIdentifier(buffer, name);
};

export const decodeTableName = (buffer: Buffer): TableName =>
  decodeDbIdentifier(buffer) as TableName;

export const encodeColumnName = (buffer: Buffer, name: ColumnName): void => {
  encodeDbIdentifier(buffer, name);
};

export const decodeColumnName = (buffer: Buffer): ColumnName =>
  decodeDbIdentifier(buffer) as ColumnName;

// Small ints are encoded into ProtocolValueType, saving one byte per int.
const isSmallInt: Predicate<number> = (value: number) =>
  value >= 0 && value < 20;

export const ProtocolValueType = {
  // 0-19 small ints

  // SQLite types
  String: 20 as NonNegativeInt,
  Number: 21 as NonNegativeInt,
  Null: 22 as NonNegativeInt,
  Binary: 23 as NonNegativeInt,
  // We can add more types for other DBs or anything else later.

  // Optimized types
  Id: 30 as NonNegativeInt,
  Base64Url256: 31 as NonNegativeInt,
  NonNegativeInt: 32 as NonNegativeInt,
  Json: 33 as NonNegativeInt,

  // new Date().toISOString()   - 24 bytes
  // encoded with fixed length  - 8 bytes
  // encode as NonNegativeInt   - 6 bytes (additional 25% reduction)
  DateIsoWithNonNegativeTime: 34 as NonNegativeInt,
  DateIsoWithNegativeTime: 35 as NonNegativeInt, // 9 bytes

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
      const dateIsoString = DateIsoString.from(value);
      if (dateIsoString.ok) {
        const time = new Date(dateIsoString.value).getTime();
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

      const base64Url256 = Base64Url256.from(value);
      if (base64Url256.ok) {
        if (base64Url256.value.length === idTypeValueLength) {
          encodeNonNegativeInt(buffer, ProtocolValueType.Id);
          buffer.extend(base64Url256ToBytes(base64Url256.value));
          return;
        }
        encodeNonNegativeInt(buffer, ProtocolValueType.Base64Url256);
        encodeBase64Url256(buffer, base64Url256.value);
        return;
      }

      const jsonValue = JsonValueFromString.fromParent(value);
      if (jsonValue.ok) {
        const jsonBytes = pack(jsonValue.value);
        encodeNonNegativeInt(buffer, ProtocolValueType.Json);
        encodeLength(buffer, jsonBytes);
        buffer.extend(jsonBytes);
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

  encodeNonNegativeInt(buffer, ProtocolValueType.Binary);
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
    case ProtocolValueType.Binary: {
      const length = decodeLength(buffer);
      return buffer.shiftN(length);
    }
    case ProtocolValueType.Id: {
      return decodeId(buffer);
    }
    case ProtocolValueType.Base64Url256:
      return decodeBase64Url256WithLength(buffer);
    case ProtocolValueType.NonNegativeInt:
      return decodeNonNegativeInt(buffer);
    case ProtocolValueType.Json: {
      const length = decodeLength(buffer);
      const bytes = buffer.shiftN(length);
      return JSON.stringify(unpack(bytes));
    }
    case ProtocolValueType.DateIsoWithNonNegativeTime:
    case ProtocolValueType.DateIsoWithNegativeTime: {
      const time =
        type === ProtocolValueType.DateIsoWithNonNegativeTime
          ? decodeNonNegativeInt(buffer)
          : decodeNumber(buffer);
      const dateIsoString = DateIsoString.fromParent(
        new Date(time).toISOString(),
      );
      if (!dateIsoString.ok)
        throw new ProtocolDecodeError(dateIsoString.error.type);
      return dateIsoString.value;
    }
    default:
      throw new ProtocolDecodeError("invalid ProtocolValueType");
  }
};

export const encodeDbChange = (buffer: Buffer, change: DbChange): void => {
  encodeTableName(buffer, change.table);
  buffer.extend(idToBinaryId(change.id));

  const entries = objectToEntries(change.values);
  encodeLength(buffer, entries);

  for (const [name, value] of entries) {
    encodeColumnName(buffer, name);
    encodeSqliteValue(buffer, value);
  }
};

export const decodeDbChange = (buffer: Buffer): DbChange => {
  const table = decodeTableName(buffer);

  const id = decodeId(buffer);

  const length = decodeLength(buffer);
  const values = Object.create(null) as Record<ColumnName, SqliteValue>;

  for (let i = 0; i < length; i++) {
    const columnName = decodeColumnName(buffer);
    const dbValue = decodeSqliteValue(buffer);
    values[columnName] = dbValue;
  }

  return { table, id, values };
};
