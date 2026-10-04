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
 * ## Message structure
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
 * Range upper bounds must not decrease. The last range always has
 * {@link InfiniteUpperBound}, which is not encoded. A message with decreasing
 * bounds, or with a hasWriteKey or subscriptionFlag value not listed above, is
 * rejected as {@link ProtocolInvalidDataError}. So is a request with a change
 * shorter than 41 bytes, the smallest {@link EncryptedDbChange}. A client passes
 * such a change to storage, which skips a change it cannot read.
 *
 * ## WriteKey validation
 *
 * The initiator sends a hasWriteKey flag and optionally a WriteKey. The
 * WriteKey is required when sending messages as a secure token proving the
 * initiator can write changes. It's ok to not send a WriteKey if the initiator
 * is only syncing (read-only) and not sending messages. The non-initiator
 * decodes the whole request first and then validates the WriteKey, before
 * storing any messages or reconciling ranges. Only the subscriptionFlag takes
 * effect before that, because subscribing needs no WriteKey: broadcasts carry
 * only encrypted changes. So a request rejected with
 * {@link ProtocolWriteKeyError} still changes its subscription.
 *
 * ## Synchronization
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
 * The **non-initiator answers every request it can decode** to provide sync
 * completion feedback, even with empty messages containing only the header and
 * no error. This allows the initiator to detect when synchronization is
 * complete. A request it cannot decode, or one larger than the relay's
 * `totalMaxSize`, gets no answer and has no effect.
 *
 * Ranges are compared by their {@link Fingerprint}, which anyone who can write
 * for an owner can make collide. Its documentation describes the consequences.
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
 * ## Protocol errors
 *
 * A Response carries a {@link ProtocolErrorCode} in its header. The initiator
 * reports every code except `NoError` as an error with the `OwnerId`:
 *
 * - {@link ProtocolWriteKeyError}: The WriteKey is invalid, or missing from a
 *   request with messages.
 * - {@link ProtocolWriteError}: The relay failed to store the messages or to
 *   validate the WriteKey.
 * - {@link ProtocolQuotaError}: Storage or billing quota exceeded.
 * - {@link ProtocolSyncError}: The relay's storage failed while it reconciled the
 *   ranges.
 *
 * The initiator also reports {@link ProtocolVersionError}, with the `OwnerId`,
 * for a reply of another version, and {@link ProtocolInvalidDataError}, without
 * it, for a message it cannot decode, including one with an unknown code.
 *
 * A relay answers every request it can decode within its `totalMaxSize`. It
 * decodes a whole request before acting on it, so for a malformed one it
 * returns `ProtocolInvalidDataError` without subscribing, storing, or
 * broadcasting anything, and sends no reply. When its storage throws while
 * validating the WriteKey, for example because SQLite cannot store a new
 * owner's key on a full disk, the relay logs the error and answers with
 * `ProtocolWriteError`, like a failed write. Likewise, a client applies nothing
 * from a message it cannot decode.
 *
 * {@link decryptAndDecodeDbChange} returns `ProtocolInvalidDataError`,
 * {@link ProtocolTimestampMismatchError}, or
 * {@link DecryptWithXChaCha20Poly1305Error} for a change it cannot read. These
 * describe a change rather than a protocol message, and client storage skips
 * such a change.
 *
 * ## Message size limit
 *
 * The protocol enforces a strict maximum size for all messages, defined by
 * {@link ProtocolMessageMaxSize}. This ensures every {@link ProtocolMessage} is
 * less than or equal to this limit, enabling stateless transports, simplified
 * relay implementation, and predictable memory usage. When all messages don't
 * fit within the limit, the protocol automatically continues synchronization in
 * subsequent rounds using range-based reconciliation.
 *
 * Each mutation is limited to {@link maxMutationSize}, so every change fits one
 * message of {@link defaultProtocolMessageMaxSize} next to the largest ranges
 * section. Changes saved before that limit existed, and crafted changes a relay
 * stores, can be larger. Sync skips a stored change that cannot fit an empty
 * message after a pending Skip range, which is the message a later round is
 * guaranteed to reach, and reports it as a {@link ProtocolChangeTooLargeError}.
 *
 * ## Why Binary?
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
 * ## Versioning
 *
 * Every message of every protocol version begins with the version and the
 * `OwnerId`, so a peer can route and report a message of any version. Nothing
 * negotiates a version, and no side falls back to the other's.
 *
 * A non-initiator answers a request of another version with only its own
 * version and that `OwnerId`. The initiator reports it as
 * {@link ProtocolVersionError} for that owner, whose `isInitiator` tells which
 * side is older, and stops syncing the owner through that relay. Clients from
 * `@evolu/common` 8.0.0 before 8.11.0 drop that reply and stop syncing the
 * owner through that relay without reporting anything, while 7.x clients report
 * it as a `ProtocolVersionError`. So a relay that moves to another version must
 * keep answering version 1 while such clients remain.
 *
 * ## Credible exit
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
 * - Allow clients to broadcast messages that are not persisted by relays. This
 *   would enable real-time ephemeral data (like cursor positions, typing
 *   indicators) to be forwarded by relays without storage overhead.
 */

import {
  createMutableArray,
  isNonEmptyArray,
  type NonEmptyReadonlyArray,
} from "../Array.ts";
import { assert, assertNonEmptyArray, assertNonNullable } from "../Assert.ts";
import type { Brand } from "../Brand.ts";
import {
  type Buffer,
  BufferError,
  createBuffer,
  createRunLengthEncoder,
  decodeFlags,
  decodeJsonValue,
  decodeLength,
  decodeNonNegativeInt,
  decodeNumber,
  decodeRle,
  decodeString,
  encodeFlags,
  encodeJsonValue,
  encodeLength,
  encodeNonNegativeInt,
  encodeNumber,
  encodeString,
} from "../Bytes.ts";
import type { ConsoleDep } from "../Console.ts";
import {
  createPadmePadding,
  decryptWithXChaCha20Poly1305,
  type DecryptWithXChaCha20Poly1305Error,
  EncryptionKey,
  encryptWithXChaCha20Poly1305,
  type Entropy24,
  type RandomBytesDep,
  type XChaCha20Poly1305Ciphertext,
  xChaCha20Poly1305NonceLength,
} from "../Crypto.ts";
import { eqArrayNumber } from "../Eq.ts";
import { exhaustiveCheck } from "../Function.ts";
import { computeBalancedBuckets } from "../Number.ts";
import { createMutableRecord, objectToEntries } from "../Object.ts";
import { err, ok, type Result } from "../Result.ts";
import type { SqliteValue } from "../Sqlite.ts";
import { AbortError, type Task } from "../Task.ts";
import { Millis } from "../Time.ts";
import {
  assertType,
  Base64Url,
  base64UrlToUint8Array,
  between,
  DateIso,
  type FiniteNumber,
  Id,
  IdBytes,
  idBytesToId,
  idBytesTypeValueLength,
  idToIdBytes,
  Int,
  Json,
  jsonToJsonValue,
  NonNegativeInt,
  onePositiveInt,
  type PositiveInt,
  type Typed,
  uint8ArrayToBase64Url,
  zeroNonNegativeInt,
} from "../Type.ts";
import type { Predicate } from "../Types.ts";
import type { Evolu, maxMutationSize } from "./Evolu.ts";
import {
  type Owner,
  type OwnerError,
  OwnerId,
  OwnerIdBytes,
  ownerIdToOwnerIdBytes,
  OwnerWriteKey,
  ownerWriteKeyLength,
} from "./Owner.ts";
import {
  type BaseRange,
  type CrdtMessage,
  DbChange,
  type EncryptedCrdtMessage,
  type EncryptedDbChange,
  type Fingerprint,
  type FingerprintRange,
  fingerprintSize,
  InfiniteUpperBound,
  type Range,
  RangeType,
  type RangeUpperBound,
  type SkipRange,
  type StorageDep,
  type StorageWriteMessagesError,
  type TimestampsRange,
} from "./Storage.ts";
import {
  Counter,
  eqTimestamp,
  NodeId,
  type NodeIdBytes,
  nodeIdBytesLength,
  nodeIdBytesToNodeId,
  nodeIdToNodeIdBytes,
  orderTimestamp,
  Timestamp,
  type TimestampBytes,
  timestampBytesLength,
  timestampBytesToTimestamp,
  timestampToTimestampBytes,
} from "./Timestamp.ts";

const minProtocolMessageMaxSize = 1_000_000;
const maxProtocolMessageMaxSize = 100_000_000;
const maxProtocolMessageRangesMaxSize = 100_000;

/**
 * Protocol message maximum size, from 1MB to 100MB.
 *
 * A message never exceeds its maximum size, inclusive. Builders measure each
 * write exactly and keep room to close the message (see
 * {@link ProtocolMessageBuffer.tryWrite}), and sync sends what does not fit in
 * later rounds.
 *
 * Clients send at most {@link defaultProtocolMessageMaxSize} and enforce no
 * receive limit. A relay can answer with larger messages, configured with the
 * `totalMaxSize` option of {@link applyProtocolMessageAsRelay}, to reduce
 * roundtrips for large syncs. Clients must not send larger messages, because
 * relays accept at most the default: the Node.js relay closes the connection on
 * a larger one, and relays up to `@evolu/nodejs` 4.0.0 crash on it.
 *
 * The default cannot be smaller either. Deployed clients send messages of that
 * size, a change within {@link maxMutationSize} fits one message next to the
 * largest ranges section, and changes saved before that limit existed, which
 * can be nearly as large as a message, must stay servable.
 */
export const ProtocolMessageMaxSize = /*#__PURE__*/ between(
  minProtocolMessageMaxSize,
  maxProtocolMessageMaxSize,
)(Int);

export type ProtocolMessageMaxSize = typeof ProtocolMessageMaxSize.Output;

/**
 * Default {@link ProtocolMessageMaxSize} (1MB).
 *
 * The standard size used across Evolu implementations. Clients send at most
 * this size, and relays accept it. Relays with more resources can answer with
 * larger messages to reduce roundtrips.
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
 * clients and relays. A received message whose ranges section exceeds twice the
 * upper bound is rejected as {@link ProtocolInvalidDataError}.
 */
export const ProtocolMessageRangesMaxSize = /*#__PURE__*/ between(
  3_000,
  maxProtocolMessageRangesMaxSize,
)(Int);
export type ProtocolMessageRangesMaxSize =
  typeof ProtocolMessageRangesMaxSize.Output;

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
export const protocolVersion = onePositiveInt;

export const MessageType = {
  /** Request message from initiator (client) to non-initiator (relay). */
  Request: 0,
  /** Response message from non-initiator (relay) to initiator (client). */
  Response: 1,
  /** Broadcast message from non-initiator (relay) to subscribed clients. */
  Broadcast: 2,
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/**
 * The routing prefix of a {@link ProtocolMessage}.
 *
 * The version and the {@link OwnerId} begin every message of every protocol
 * version. The message type follows them only in messages of this peer's
 * version; the layout after the prefix is unknown for any other version.
 */
export interface ProtocolHeader extends Typed<"ProtocolHeader"> {
  readonly version: NonNegativeInt;
  readonly ownerId: OwnerId;
  /** Absent when `version` differs from {@link protocolVersion}. */
  readonly messageType?: MessageType;
}

/**
 * Parses the {@link ProtocolHeader} a transport needs to route a message.
 *
 * Parsing succeeds for versions this peer cannot process, because a
 * non-initiator answers a version mismatch with only its version and the owner
 * ID. Rejecting that reply here would drop it before
 * {@link applyProtocolMessageAsClient} can report {@link ProtocolVersionError}.
 */
export const parseProtocolHeader = (
  inputMessage: Uint8Array,
): Result<ProtocolHeader, ProtocolInvalidDataError> => {
  try {
    return ok(parseProtocolHeaderFromBuffer(createBuffer(inputMessage)));
  } catch (error) {
    return err<ProtocolInvalidDataError>({
      type: "ProtocolInvalidDataError",
      data: inputMessage,
      error,
    });
  }
};

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

/**
 * The error code in the header of a Response.
 *
 * A client reports a code it does not know as {@link ProtocolInvalidDataError},
 * which carries no `OwnerId`, and that relay's round for the owner ends. Every
 * released client does this, so a relay can add a code under the same
 * {@link protocolVersion} only where that outcome is acceptable.
 */
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

export type ProtocolErrorCode =
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
export interface ProtocolVersionError
  extends OwnerError, Typed<"ProtocolVersionError"> {
  readonly version: NonNegativeInt;
  /** Indicates which side is obsolete and should update. */
  readonly isInitiator: boolean;
}

/**
 * Error for a malformed {@link ProtocolMessage} or {@link EncryptedDbChange},
 * with its bytes as `data` and the decoding error as `error`.
 *
 * A protocol message is decoded whole before any of it is applied, so a
 * malformed one has no effect, and a relay does not reply to it. A message of a
 * type its receiver does not accept, such as a Request sent to a client, is
 * malformed too. A throw while applying a decoded message is a defect, not this
 * error.
 */
export interface ProtocolInvalidDataError extends Typed<"ProtocolInvalidDataError"> {
  readonly data: Uint8Array;
  readonly error: unknown;
}

/** Error when a {@link OwnerWriteKey} is invalid, missing, or fails validation. */
export interface ProtocolWriteKeyError
  extends OwnerError, Typed<"ProtocolWriteKeyError"> {}

/**
 * Error indicating a serious relay-side write failure. Sync state shows it as
 * the failure of that relay's route; apps show a generic sync error for the
 * owner's `Error` status.
 */
export interface ProtocolWriteError
  extends OwnerError, Typed<"ProtocolWriteError"> {}

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
 * plan. Quota monitoring and management is the relay provider's responsibility.
 * After additional quota is available, call {@link Evolu.requestSync} with the
 * affected owner's ID to retry locally stored changes.
 */
export interface ProtocolQuotaError
  extends OwnerError, Typed<"ProtocolQuotaError"> {}

/**
 * Error indicating a serious relay-side synchronization failure. Sync state
 * shows it as the failure of that relay's route; apps show a generic sync error
 * for the owner's `Error` status.
 */
export interface ProtocolSyncError
  extends OwnerError, Typed<"ProtocolSyncError"> {}

/**
 * Error when embedded timestamp doesn't match expected timestamp in
 * EncryptedDbChange. Indicates potential tampering or corruption of CRDT
 * messages.
 */
export interface ProtocolTimestampMismatchError extends Typed<"ProtocolTimestampMismatchError"> {
  readonly expected: Timestamp;
  readonly timestamp: Timestamp;
}

/**
 * Error for a stored change that sync skipped because it cannot fit an empty
 * {@link ProtocolMessage} after a pending Skip range, which is the message a
 * later round is guaranteed to reach.
 *
 * Every change within {@link maxMutationSize} fits. Larger ones are changes
 * saved before that limit existed and crafted changes a relay stores. A change
 * up to 22 bytes too large for that message can still fit one without a pending
 * skip, so sync may send it, sometimes after reporting it, but usually reports
 * it in every sync like a larger one. With
 * {@link defaultProtocolMessageMaxSize}, PADMÉ padding leaves no honest change
 * size in that 22-byte window.
 *
 * An answer to a Timestamps range neither sends nor lists a skipped change, so
 * range fingerprints keep disagreeing about it. A request or a split still
 * lists its timestamp, so a peer that lacks it may ask for it once per sync and
 * gets an answer without it. Every sync narrows the fingerprints to it, skips
 * it again, and ends.
 */
export interface ProtocolChangeTooLargeError extends Typed<"ProtocolChangeTooLargeError"> {
  readonly timestamp: Timestamp;
  /** The length of the encrypted change in bytes. */
  readonly size: PositiveInt;
}

/**
 * Creates a {@link ProtocolMessage} from CRDT messages.
 *
 * The message holds the leading CRDT messages that fit `maxSize`, by default
 * {@link defaultProtocolMessageMaxSize}, measured exactly. When one does not
 * fit, it and the rest are left out, and the message ends with a range that
 * makes the non-initiator answer with ranges. Sync then sends them in later
 * rounds, even over unidirectional and stateless transports, because every
 * change within {@link maxMutationSize} fits an empty message.
 */
export const createProtocolMessageFromCrdtMessages =
  (deps: RandomBytesDep) =>
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

    for (const message of messages) {
      const change = encodeAndEncryptDbChange(deps)(
        message,
        owner.encryptionKey,
      );
      const encryptedCrdtMessage = { timestamp: message.timestamp, change };
      if (
        !buffer.tryWrite(() => {
          buffer.addMessage(encryptedCrdtMessage);
        })
      ) {
        /**
         * DEV: If not all messages fit due to size limits, we trigger a sync
         * continuation by appending a Range with a random fingerprint. This
         * ensures the receiver always responds with ranges, prompting another
         * sync round.
         *
         * The ideal approach would be to send three ranges (skip, fingerprint,
         * skip) where the fingerprint of unsent messages would act as narrow
         * sync probe. I think we can send `zeroFingerprint` which can be
         * interpreted as an indication that the other side should reply with
         * {@link TimestampsRange}, so no need to restart syncing.
         *
         * For now, using a random fingerprint avoids extra complexity and is
         * good enough for this case.
         */
        const randomFingerprint = deps.randomBytes.create(
          fingerprintSize,
        ) as unknown as Fingerprint;

        // Every kept trial reserved space for this closing range.
        buffer.addRange({
          type: RangeType.Fingerprint,
          upperBound: InfiniteUpperBound,
          fingerprint: randomFingerprint,
        });
        break;
      }
    }

    return buffer.unwrap();
  };

/**
 * Creates size-limited broadcast {@link ProtocolMessage}s containing every
 * supplied {@link CrdtMessage}.
 *
 * Broadcasts contain no synchronization ranges or write key. Unlike
 * {@link createProtocolMessageFromCrdtMessages}, this function splits all
 * messages into complete frames rather than relying on later synchronization
 * rounds to deliver messages that do not fit. Each individual message must fit
 * the configured size limit.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertSame,
 *   createId,
 *   getOrThrow,
 *   testCreateDeps,
 * } from "@evolu/common";
 * import {
 *   createProtocolBroadcastMessagesFromCrdtMessages,
 *   MessageType,
 *   parseProtocolHeader,
 *   testAppOwner,
 *   testCreateCrdtMessage,
 * } from "@evolu/common/local-first";
 *
 * const deps = testCreateDeps();
 * const broadcasts = createProtocolBroadcastMessagesFromCrdtMessages(deps)(
 *   testAppOwner,
 *   [testCreateCrdtMessage(createId(deps), 1, "Ada")],
 * );
 * assertSame(broadcasts.length, 1);
 * assertSame(
 *   getOrThrow(parseProtocolHeader(broadcasts[0])).messageType,
 *   MessageType.Broadcast,
 * );
 * ```
 */
export const createProtocolBroadcastMessagesFromCrdtMessages =
  (deps: RandomBytesDep) =>
  (
    owner: Owner,
    messages: NonEmptyReadonlyArray<CrdtMessage>,
    maxSize: ProtocolMessageMaxSize = defaultProtocolMessageMaxSize,
  ): NonEmptyReadonlyArray<ProtocolMessage> => {
    const broadcasts: Array<ProtocolMessage> = [];
    let buffer = createProtocolMessageBuffer(owner.id, {
      messageType: MessageType.Broadcast,
      totalMaxSize: maxSize,
    });
    for (const message of messages) {
      const encryptedMessage = {
        timestamp: message.timestamp,
        change: encodeAndEncryptDbChange(deps)(message, owner.encryptionKey),
      };

      const frame = buffer;
      if (
        frame.tryWrite(() => {
          frame.addMessage(encryptedMessage);
        })
      ) {
        continue;
      }

      buffer = createProtocolMessageBuffer(owner.id, {
        messageType: MessageType.Broadcast,
        totalMaxSize: maxSize,
      });
      // Outside a trial, it asserts that the message fits an empty frame.
      buffer.addMessage(encryptedMessage);
      broadcasts.push(frame.unwrap());
    }

    broadcasts.push(buffer.unwrap());
    assertNonEmptyArray(broadcasts);
    return broadcasts;
  };

/** Creates a {@link ProtocolMessage} for sync. */
export const createProtocolMessageForSync =
  (deps: StorageDep) =>
  (ownerId: OwnerId, subscriptionFlag?: SubscriptionFlag): ProtocolMessage => {
    const buffer = createProtocolMessageBuffer(ownerId, {
      messageType: MessageType.Request,
      subscriptionFlag: subscriptionFlag ?? SubscriptionFlags.None,
    });
    const ownerIdBytes = ownerIdToOwnerIdBytes(ownerId);

    const size = deps.storage.getSize(ownerIdBytes);

    const ranges = readSplitRanges(deps)(
      ownerIdBytes,
      zeroNonNegativeInt,
      size,
      InfiniteUpperBound,
    );
    for (const range of ranges) buffer.addRange(range);

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
 *
 * A frame never exceeds `totalMaxSize`. Make ordinary writes inside `tryWrite`,
 * which keeps them only if the frame can still be closed. A write outside a
 * trial is a closing write: `addMessage` and `addRange` assert that the frame
 * fits `totalMaxSize`.
 *
 * The builder references each change, which `unwrap` copies into the frame it
 * returns, so a change must not be modified while the builder is in use.
 * `unwrap` leaves the builder unchanged, so it can be called again.
 */
export interface ProtocolMessageBuffer {
  readonly addMessage: (message: EncryptedCrdtMessage) => void;

  readonly addRange: (
    range: SkipRange | FingerprintRange | TimestampsRangeWithTimestampsBuffer,
  ) => void;

  /**
   * Runs `write` and keeps what it wrote only if the frame can still be closed,
   * returning whether it was kept.
   *
   * The frame can be closed when its exact size plus the bytes needed to append
   * one Fingerprint range with {@link InfiniteUpperBound} plus `reserve` is at
   * most `totalMaxSize`, and its ranges section plus the same bytes is at most
   * `rangesMaxSize`. Nothing is needed to close a broadcast, which holds no
   * ranges, or a frame whose last range has InfiniteUpperBound. Use `reserve`
   * for bytes the caller adds later, such as a range it is still collecting.
   *
   * When the frame cannot be closed, or `write` throws, everything `write`
   * wrote is undone, so the frame is as if `write` never ran. Inside `write`,
   * `addMessage` and `addRange` do not assert the size limit.
   */
  readonly tryWrite: (write: () => void, reserve?: NonNegativeInt) => boolean;

  readonly unwrap: () => ProtocolMessage;

  /** Returns the exact encoded size of the frame. */
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
      dbChangeLengths: createBuffer(),
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

  // Changes are referenced, not copied, so a trial undoes messages by
  // shortening this array, and unwrap copies each change once.
  const dbChanges: Array<EncryptedDbChange> = [];
  let dbChangesLength = 0;
  let isLastRangeInfinite = false;
  let isInTrial = false;

  // Writes outside a trial assert this, so an overflow fails where it happens.
  // A frame must never exceed totalMaxSize: relays at @evolu/nodejs 4.0.0 or
  // older crash on a frame one byte larger than their 1,000,000-byte limit.
  const isWithinSizeLimits = () => getFrameSize() <= totalMaxSize;

  // Lengths after a header that is never empty.
  const getFrameSize = () =>
    (buffers.header.getLength() +
      buffers.messages.timestamps.getLength() +
      buffers.messages.dbChangeLengths.getLength() +
      dbChangesLength +
      getRangesSize()) as PositiveInt;

  // Without ranges, the ranges section is omitted, including its count.
  const getRangesSize = () =>
    buffers.ranges.timestamps.getCount() > 0
      ? buffers.ranges.timestamps.getLength() +
        buffers.ranges.types.getLength() +
        buffers.ranges.payloads.getLength()
      : 0;

  // A trial makes the write, measures the exact frame, and undoes the write in
  // constant time when the frame no longer fits, so it needs no worst-case
  // margins and costs about as much as the write itself.
  return {
    addMessage: (message) => {
      buffers.messages.timestamps.add(message.timestamp);
      encodeLength(buffers.messages.dbChangeLengths, message.change);
      dbChanges.push(message.change);
      dbChangesLength += message.change.length;
      assert(isInTrial || isWithinSizeLimits(), "the message is too big");
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

      encodeNonNegativeInt(buffers.ranges.types, range.type as NonNegativeInt);

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

      assert(
        isInTrial || isWithinSizeLimits(),
        `the range ${range.type} is too big`,
      );
    },

    tryWrite: (write, reserve = zeroNonNegativeInt) => {
      const restoreMessageTimestamps = buffers.messages.timestamps.checkpoint();
      const dbChangeLengthsLength =
        buffers.messages.dbChangeLengths.getLength();
      const dbChangesCount = dbChanges.length;
      const checkpointDbChangesLength = dbChangesLength;
      const restoreRangeTimestamps = buffers.ranges.timestamps.checkpoint();
      const typesLength = buffers.ranges.types.getLength();
      const payloadsLength = buffers.ranges.payloads.getLength();
      const wasLastRangeInfinite = isLastRangeInfinite;
      const wasInTrial = isInTrial;

      let isKept = false;
      isInTrial = true;
      try {
        write();
        // Fingerprint(InfiniteUpperBound) encodes no upper bound, only its
        // type (1 byte) and fingerprint (12 bytes). The ranges count varint
        // gains a byte when the new count is a power of 128. That includes
        // 128^0 = 1, since the first range adds the count itself. So closing
        // takes 13 or 14 bytes, and nothing for a Broadcast or a closed frame.
        let newCount = buffers.ranges.timestamps.getCount() + 1;
        while (newCount % 128 === 0) newCount /= 128;
        const closingReserve =
          options.messageType === MessageType.Broadcast || isLastRangeInfinite
            ? 0
            : 1 + fingerprintSize + (newCount === 1 ? 1 : 0);
        const reserves = closingReserve + reserve;
        isKept =
          getFrameSize() + reserves <= totalMaxSize &&
          getRangesSize() + reserves <= rangesMaxSize;
      } finally {
        isInTrial = wasInTrial;
        if (!isKept) {
          restoreMessageTimestamps();
          buffers.messages.dbChangeLengths.truncate(dbChangeLengthsLength);
          dbChanges.length = dbChangesCount;
          dbChangesLength = checkpointDbChangesLength;
          restoreRangeTimestamps();
          buffers.ranges.types.truncate(typesLength);
          buffers.ranges.payloads.truncate(payloadsLength);
          isLastRangeInfinite = wasLastRangeInfinite;
        }
      }
      return isKept;
    },

    unwrap: () => {
      if (buffers.ranges.timestamps.getCount() > 0) {
        assert(
          isLastRangeInfinite,
          "The last range's upperBound must be InfiniteUpperBound",
        );
      }

      const frame = new Uint8Array(getFrameSize());
      frame.set(buffers.header.unwrap());
      let offset: number = buffers.header.getLength();

      // Written to a new buffer, so the builder is unchanged and unwrap can be
      // called again.
      const messageTimestamps = createBuffer();
      buffers.messages.timestamps.append(messageTimestamps);
      frame.set(messageTimestamps.unwrap(), offset);
      offset += messageTimestamps.getLength();

      // Each change follows its length, whose last varint byte is below 128.
      const lengths = buffers.messages.dbChangeLengths.unwrap();
      let lengthsOffset = 0;
      for (const change of dbChanges) {
        do {
          frame[offset++] = lengths[lengthsOffset];
        } while (lengths[lengthsOffset++] >= 128);
        frame.set(change, offset);
        offset += change.length;
      }

      if (buffers.ranges.timestamps.getCount() > 0) {
        const ranges = createBuffer();
        buffers.ranges.timestamps.append(ranges);
        ranges.extend(buffers.ranges.types.unwrap());
        ranges.extend(buffers.ranges.payloads.unwrap());
        frame.set(ranges.unwrap(), offset);
        offset += ranges.getLength();
      }

      // An overcounted size would end the frame with zero bytes peers accept.
      assert(offset === frame.length, "the frame size is exact");

      return frame as ProtocolMessage;
    },

    getSize: getFrameSize,
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

  /**
   * Returns a function that restores the buffer, in constant time, to the state
   * it had when this was called, discarding every timestamp added since.
   *
   * A restore function can be called repeatedly. It is valid until the buffer
   * is restored to an earlier checkpoint.
   */
  readonly checkpoint: () => () => void;
}

export const createTimestampsBuffer = (): TimestampsBuffer => {
  let count = zeroNonNegativeInt;
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
    buffer.extend(nodeIdToNodeIdBytes(value));
  });

  return {
    add: (timestamp) => {
      const delta = timestamp.millis - previousMillis;
      assertType(NonNegativeInt, delta);

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

    checkpoint: () => {
      const checkpointCount = count;
      const millisLength = millisBuffer.getLength();
      const checkpointPreviousMillis = previousMillis;
      const restoreCounters = counterEncoder.checkpoint();
      const restoreNodeIds = nodeIdEncoder.checkpoint();

      return () => {
        count = checkpointCount;
        syncCount();
        millisBuffer.truncate(millisLength);
        previousMillis = checkpointPreviousMillis;
        restoreCounters();
        restoreNodeIds();
      };
    },
  };
};

export interface ApplyProtocolMessageAsClientOptions {
  readonly writeKey?: OwnerWriteKey;

  readonly rangesMaxSize?: ProtocolMessageRangesMaxSize;

  /**
   * Called for each stored change that sync skipped as a
   * {@link ProtocolChangeTooLargeError}. Without it, the error is logged with
   * `console.warn`. It must not throw, because a throw is a defect that aborts
   * the Run.
   */
  readonly onChangeTooLarge?: (error: ProtocolChangeTooLargeError) => void;

  /** For tests only. */
  readonly version?: NonNegativeInt;
}

/**
 * Result of {@link applyProtocolMessageAsClient}: a continuation for the
 * non-initiator.
 */
export interface ApplyProtocolMessageAsClientResponse extends Typed<"Response"> {
  readonly message: ProtocolMessage;
  /** The uploaded messages, if any, for delivery to other local databases. */
  readonly broadcast?: ProtocolMessage;
}

/**
 * Result of {@link applyProtocolMessageAsClient}: the response needed nothing
 * more, because its ranges all matched or it carried none.
 */
export interface ApplyProtocolMessageAsClientConverged extends Typed<"Converged"> {}

/**
 * Result of {@link applyProtocolMessageAsClient}: a Broadcast message whose
 * messages were written.
 */
export interface ApplyProtocolMessageAsClientBroadcast extends Typed<"Broadcast"> {}

/**
 * Result of {@link applyProtocolMessageAsClient}: the messages were written, but
 * without a write key no ranges are reconciled.
 */
export interface ApplyProtocolMessageAsClientReadonly extends Typed<"Readonly"> {}

/**
 * Result of {@link applyProtocolMessageAsClient}: the protocol logged an
 * exception thrown by calling the storage's `writeMessages` (`Write`) or a
 * failed range reconciliation (`Sync`) to the console. An exception while the
 * returned Task runs is a defect that aborts the Run instead. A rejected or
 * failed write, which the built-in storages return when SQLite fails it, gives
 * the original {@link StorageWriteMessagesError} through {@link Result}.
 * Reconciliation can fail after messages have been committed; that failure does
 * not roll back the write.
 */
export interface ApplyProtocolMessageAsClientFailed extends Typed<"Failed"> {
  readonly cause: "Write" | "Sync";
}

export type ApplyProtocolMessageAsClientResult =
  | ApplyProtocolMessageAsClientResponse
  | ApplyProtocolMessageAsClientConverged
  | ApplyProtocolMessageAsClientBroadcast
  | ApplyProtocolMessageAsClientReadonly
  | ApplyProtocolMessageAsClientFailed;

export const applyProtocolMessageAsClient =
  (
    inputMessage: Uint8Array,
    options: ApplyProtocolMessageAsClientOptions = {},
  ): Task<
    ApplyProtocolMessageAsClientResult,
    ProtocolError | StorageWriteMessagesError,
    StorageDep
  > =>
  async (run) => {
    const { storage } = run.deps;
    const version = options.version ?? protocolVersion;
    const decoded = decodeProtocolMessage(inputMessage, version);
    if (!decoded.ok) return decoded;
    const message = decoded.value;

    if (message.type === "OtherVersion") {
      return err<ProtocolVersionError>({
        type: "ProtocolVersionError",
        version: message.version,
        isInitiator: version < message.version,
        ownerId: message.ownerId,
      });
    }

    if (message.type === "Request") {
      return err<ProtocolInvalidDataError>({
        type: "ProtocolInvalidDataError",
        data: inputMessage,
        error: new ProtocolDecodeError("Expected a Response or a Broadcast"),
      });
    }

    const { ownerId } = message;

    if (message.type === "ErrorResponse") {
      switch (message.errorCode) {
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
      }
    }

    const { messages } = message;
    const ownerIdBytes = ownerIdToOwnerIdBytes(ownerId);

    if (isNonEmptyArray(messages)) {
      try {
        const result = await run(storage.writeMessages(ownerIdBytes, messages));
        if (!result.ok) return result;
      } catch (error) {
        if (AbortError.is(error)) throw error;
        run.deps.console.error(error);
        return ok({ type: "Failed", cause: "Write" });
      }
    }

    if (message.type === "Broadcast") {
      return ok({ type: "Broadcast" });
    }

    // Now: No writeKey, no sync.
    // TODO: Allow to sync SharedReadonlyOwner
    // Without local changes, writeKey will not be required.
    // With local changes, writeKey will be required and if not provided,
    // the sync will stop.
    const writeKey = options.writeKey;
    if (writeKey == null) {
      return ok({ type: "Readonly" });
    }

    const { ranges } = message;

    if (!isNonEmptyArray(ranges)) {
      return ok({ type: "Converged" });
    }

    const createOutput = () =>
      createProtocolMessageBuffer(ownerId, {
        messageType: MessageType.Request,
        writeKey,
        rangesMaxSize: options.rangesMaxSize,
      });
    const output = createOutput();

    let broadcast: ProtocolMessageBuffer | undefined;
    const result = sync(run.deps)(ranges, output, ownerIdBytes, {
      createEmptyOutput: createOutput,
      onChangeTooLarge: options.onChangeTooLarge ?? run.deps.console.warn,
      onMessage: (message) => {
        broadcast ??= createProtocolMessageBuffer(ownerId, {
          messageType: MessageType.Broadcast,
        });
        // The request holds the same messages after a larger header.
        broadcast.addMessage(message);
      },
    });

    // A failure was logged by sync.
    if (!result.ok) return ok({ type: "Failed", cause: "Sync" });
    if (!result.value) return ok({ type: "Converged" });

    return ok({
      type: "Response",
      message: output.unwrap(),
      ...(broadcast && { broadcast: broadcast.unwrap() }),
    });
  };

/**
 * Options for {@link applyProtocolMessageAsRelay}. The callbacks must not throw,
 * because a throw is a defect that aborts the Run.
 */
export interface ApplyProtocolMessageAsRelayOptions {
  /** To subscribe an owner for broadcasting. */
  readonly subscribe?: (ownerId: OwnerId) => void;

  /** To unsubscribe an owner from broadcasting. */
  readonly unsubscribe?: (ownerId: OwnerId) => void;

  /** To broadcast a protocol message to all subscribers. */
  readonly broadcast?: (ownerId: OwnerId, message: ProtocolMessage) => void;

  /**
   * The maximum size of the relay's responses and broadcasts, and of the
   * requests it accepts. A larger request is a
   * {@link ProtocolInvalidDataError}.
   */
  readonly totalMaxSize?: ProtocolMessageMaxSize;

  readonly rangesMaxSize?: ProtocolMessageRangesMaxSize;
}

/**
 * Result type for {@link applyProtocolMessageAsRelay}.
 *
 * Unlike {@link ApplyProtocolMessageAsClientResult}, a relay answers every
 * request it can decode within its `totalMaxSize` to provide sync completion
 * feedback. This ensures the initiator can reliably detect when synchronization
 * is complete, even when there's nothing to sync. A storage that throws while
 * validating the write key is answered with a `WriteError` code, like a failed
 * write. For a larger request or one it cannot decode,
 * {@link applyProtocolMessageAsRelay} returns {@link ProtocolInvalidDataError}
 * before subscribing, storing, or broadcasting anything, and the relay sends
 * nothing. Clients may choose not to respond in certain cases (like when they
 * receive broadcast messages or when they lack a write key for syncing).
 */
export interface ApplyProtocolMessageAsRelayResult extends Typed<"Response"> {
  readonly message: ProtocolMessage;
}

export const applyProtocolMessageAsRelay =
  (
    inputMessage: Uint8Array,
    options: ApplyProtocolMessageAsRelayOptions = {},
    /** For tests only. */
    version: NonNegativeInt = protocolVersion,
  ): Task<
    ApplyProtocolMessageAsRelayResult,
    ProtocolInvalidDataError,
    StorageDep
  > =>
  async (run) => {
    const { storage } = run.deps;

    // The relay broadcasts a request's messages in a frame of totalMaxSize.
    // That frame omits the request's write key, subscription flag, and ranges,
    // so it holds the messages of any request up to that size.
    if (
      inputMessage.length >
      (options.totalMaxSize ?? defaultProtocolMessageMaxSize)
    )
      return err<ProtocolInvalidDataError>({
        type: "ProtocolInvalidDataError",
        data: inputMessage,
        error: new ProtocolDecodeError("Request is too large"),
      });

    const decoded = decodeProtocolMessage(inputMessage, version);
    if (!decoded.ok) return decoded;
    const request = decoded.value;

    if (request.type === "OtherVersion") {
      // Non-initiator responds with its version and ownerId.
      const output = createBuffer();
      encodeNonNegativeInt(output, version);
      output.extend(ownerIdToOwnerIdBytes(request.ownerId));
      return ok({
        type: "Response",
        message: output.unwrap() as ProtocolMessage,
      });
    }

    if (request.type !== "Request") {
      return err<ProtocolInvalidDataError>({
        type: "ProtocolInvalidDataError",
        data: inputMessage,
        error: new ProtocolDecodeError("Expected a Request"),
      });
    }

    const { ownerId, writeKey, messages, ranges } = request;
    const ownerIdBytes = ownerIdToOwnerIdBytes(ownerId);

    const createErrorResponse = (
      errorCode: ProtocolErrorCode,
    ): ApplyProtocolMessageAsRelayResult => ({
      type: "Response",
      message: createProtocolMessageBuffer(ownerId, {
        messageType: MessageType.Response,
        errorCode,
      }).unwrap(),
    });

    switch (request.subscriptionFlag) {
      case SubscriptionFlags.Subscribe:
        options.subscribe?.(ownerId);
        break;
      case SubscriptionFlags.Unsubscribe:
        options.unsubscribe?.(ownerId);
        break;
      case SubscriptionFlags.None:
        break;
      default:
        exhaustiveCheck(request.subscriptionFlag);
    }

    if (writeKey) {
      let isValid: boolean;
      try {
        isValid = storage.validateWriteKey(ownerIdBytes, writeKey);
      } catch (error) {
        // A relay storage stores the write key of a new owner, which SQLite
        // can fail, for example on a full disk. A boolean has no room for the
        // error, so it is answered like a failed write.
        run.deps.console.error(error);
        return ok(createErrorResponse(ProtocolErrorCode.WriteError));
      }
      if (!isValid) {
        return ok(createErrorResponse(ProtocolErrorCode.WriteKeyError));
      }
    }

    if (isNonEmptyArray(messages)) {
      if (!writeKey) {
        return ok(createErrorResponse(ProtocolErrorCode.WriteKeyError));
      }

      try {
        const result = await run(storage.writeMessages(ownerIdBytes, messages));

        if (!result.ok) {
          // A storage returns a failed write without reporting it.
          if (result.error.type === "UnknownError")
            run.deps.console.error(result.error);
          return ok(
            createErrorResponse(
              result.error.type === "StorageQuotaError"
                ? ProtocolErrorCode.QuotaError
                : ProtocolErrorCode.WriteError,
            ),
          );
        }
      } catch (error) {
        if (AbortError.is(error)) throw error;
        run.deps.console.error(error);
        return ok(createErrorResponse(ProtocolErrorCode.WriteError));
      }

      /**
       * Broadcast messages to all subscribed owners for real-time
       * synchronization between clients.
       *
       * Messages are only broadcasted after successful write to ensure devices
       * that can still sync aren't affected by quota errors, and to prevent
       * using a half-working relay service (broadcasting without persistence).
       *
       * When a relay's database is deleted or clients migrate to a new relay
       * (without data migration), clients will sync their data to the relay,
       * and the relay will broadcast those messages to other connected clients.
       * Those clients may receive messages they already have, but this is safe
       * because Evolu sync is idempotent. As the relay becomes more
       * synchronized with clients over time, fewer duplicate messages will be
       * broadcasted.
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

    const createOutput = () =>
      createProtocolMessageBuffer(ownerId, {
        messageType: MessageType.Response,
        errorCode: ProtocolErrorCode.NoError,
        totalMaxSize: options.totalMaxSize,
        rangesMaxSize: options.rangesMaxSize,
      });
    const output = createOutput();

    // A relay answers every request it decodes, even with nothing to sync, so
    // the initiator knows the sync is complete.
    if (!isNonEmptyArray(ranges)) {
      return ok({ type: "Response", message: output.unwrap() });
    }

    const result = sync(run.deps)(ranges, output, ownerIdBytes, {
      createEmptyOutput: createOutput,
      onChangeTooLarge: run.deps.console.warn,
    });

    // A relay answers every request it decodes, a failed reconciliation with
    // its error code.
    return ok(
      result.ok
        ? { type: "Response", message: output.unwrap() }
        : createErrorResponse(result.error),
    );
  };

/**
 * Decodes a whole {@link ProtocolMessage}, so a malformed one is rejected before
 * anything it carries is applied.
 *
 * Applying a message turns only a throw from here into
 * {@link ProtocolInvalidDataError}. A throw after decoding is a defect.
 */
const decodeProtocolMessage = (
  inputMessage: Uint8Array,
  version: NonNegativeInt,
): Result<DecodedProtocolMessage, ProtocolInvalidDataError> => {
  try {
    const input = createBuffer(inputMessage);
    const [messageVersion, ownerId] = decodeVersionAndOwner(input);

    if (messageVersion !== version)
      return ok({ type: "OtherVersion", version: messageVersion, ownerId });

    switch (decodeMessageType(input)) {
      case MessageType.Request: {
        const hasWriteKey = input.shift();
        if (hasWriteKey > 1)
          throw new ProtocolDecodeError(`Invalid hasWriteKey: ${hasWriteKey}`);
        const writeKey =
          hasWriteKey === 1
            ? (input.shiftN(ownerWriteKeyLength) as OwnerWriteKey)
            : null;

        const subscriptionFlag: number = input.shift();
        switch (subscriptionFlag) {
          case SubscriptionFlags.None:
          case SubscriptionFlags.Subscribe:
          case SubscriptionFlags.Unsubscribe:
            break;
          default:
            throw new ProtocolDecodeError(
              `Invalid SubscriptionFlag: ${subscriptionFlag}`,
            );
        }

        const messages = decodeMessages(input);

        // Only a relay accepts a Request, so only the relay checks this.
        // Deployed relays already store shorter changes, and a client skips a
        // change it cannot read, whereas a check in decodeMessages would make
        // it reject every response holding one.
        for (const { change } of messages)
          if (change.length < minEncryptedDbChangeLength)
            throw new ProtocolDecodeError("EncryptedDbChange is too short");

        const ranges = decodeRanges(input);

        return ok({
          type: "Request",
          ownerId,
          writeKey,
          subscriptionFlag,
          messages,
          ranges,
        });
      }

      case MessageType.Response: {
        const errorCode: number = input.shift();
        switch (errorCode) {
          case ProtocolErrorCode.NoError: {
            const messages = decodeMessages(input);
            const ranges = decodeRanges(input);
            return ok({ type: "Response", ownerId, messages, ranges });
          }
          case ProtocolErrorCode.WriteKeyError:
          case ProtocolErrorCode.WriteError:
          case ProtocolErrorCode.QuotaError:
          case ProtocolErrorCode.SyncError:
            return ok({ type: "ErrorResponse", ownerId, errorCode });
          default:
            throw new ProtocolDecodeError(
              `Invalid ProtocolErrorCode: ${errorCode}`,
            );
        }
      }

      case MessageType.Broadcast:
        return ok({
          type: "Broadcast",
          ownerId,
          messages: decodeMessages(input),
        });
    }
  } catch (error) {
    return err<ProtocolInvalidDataError>({
      type: "ProtocolInvalidDataError",
      data: inputMessage,
      error,
    });
  }
};

type DecodedProtocolMessage =
  | DecodedOtherVersionMessage
  | DecodedRequest
  | DecodedErrorResponse
  | DecodedResponse
  | DecodedBroadcast;

/** A message of another version, whose layout after the owner is unknown. */
interface DecodedOtherVersionMessage extends Typed<"OtherVersion"> {
  readonly version: NonNegativeInt;
  readonly ownerId: OwnerId;
}

interface DecodedRequest extends Typed<"Request"> {
  readonly ownerId: OwnerId;
  readonly writeKey: OwnerWriteKey | null;
  readonly subscriptionFlag: SubscriptionFlag;
  readonly messages: ReadonlyArray<EncryptedCrdtMessage>;
  readonly ranges: ReadonlyArray<Range>;
}

/** A Response with an error code, after which nothing is decoded. */
interface DecodedErrorResponse extends Typed<"ErrorResponse"> {
  readonly ownerId: OwnerId;
  readonly errorCode: Exclude<
    ProtocolErrorCode,
    typeof ProtocolErrorCode.NoError
  >;
}

interface DecodedResponse extends Typed<"Response"> {
  readonly ownerId: OwnerId;
  readonly messages: ReadonlyArray<EncryptedCrdtMessage>;
  readonly ranges: ReadonlyArray<Range>;
}

interface DecodedBroadcast extends Typed<"Broadcast"> {
  readonly ownerId: OwnerId;
  readonly messages: ReadonlyArray<EncryptedCrdtMessage>;
}

const decodeVersionAndOwner = (input: Buffer): [NonNegativeInt, OwnerId] => {
  // This structure must never change across protocol versions. The version
  // and owner ID must always be the first two fields in every protocol message
  // to route and report a version mismatch before any other processing occurs.
  const version = decodeNonNegativeInt(input);
  const ownerId = decodeId(input) as OwnerId;
  return [version, ownerId];
};

const parseProtocolHeaderFromBuffer = (input: Buffer): ProtocolHeader => {
  const [version, ownerId] = decodeVersionAndOwner(input);

  if (version !== protocolVersion) {
    return { type: "ProtocolHeader", version, ownerId };
  }

  const messageType = decodeMessageType(input);
  return { type: "ProtocolHeader", version, ownerId, messageType };
};

const decodeMessageType = (input: Buffer): MessageType => {
  const messageType: number = input.shift();
  switch (messageType) {
    case MessageType.Request:
    case MessageType.Response:
    case MessageType.Broadcast:
      return messageType;
    default:
      throw new ProtocolDecodeError("Invalid MessageType");
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
  }
}

const decodeMessages = (
  buffer: Buffer,
): ReadonlyArray<EncryptedCrdtMessage> => {
  const timestamps = decodeTimestamps(buffer);

  const messages = createMutableArray<EncryptedCrdtMessage>(timestamps.length);
  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const changeLength = decodeLength(buffer);
    const change = buffer.shiftN(changeLength) as EncryptedDbChange;
    messages[i] = { timestamp, change };
  }

  return messages;
};

// The smallest envelope encodeAndEncryptDbChange can produce: the nonce, a
// 1-byte ciphertext length, and the 16-byte Poly1305 tag. Every v1 client sends
// at least 77 bytes. The relay quota counts change bytes, so a relay storing
// shorter changes, zero-length ones above all, would store rows the quota does
// not count.
const minEncryptedDbChangeLength = xChaCha20Poly1305NonceLength + 1 + 16;

/**
 * Answers the ranges into `output`, returning whether it has anything to send.
 *
 * Every write except a closing one is a trial (see
 * {@link ProtocolMessageBuffer.tryWrite}), so the frame always has room to close
 * with one Fingerprint range with {@link InfiniteUpperBound}. When a write does
 * not fit, that range closes the frame. Its fingerprint covers everything from
 * the last upper bound the frame states, which every v1 peer assumes, and the
 * peer reconciles it in the next round.
 *
 * A stored change that cannot fit an empty frame with this header, with only
 * its own timestamp listed after a pending skip, is skipped, and
 * `onChangeTooLarge` reports it as a {@link ProtocolChangeTooLargeError}. A
 * later round is guaranteed to reach exactly that frame, so a change that fits
 * it is sent eventually.
 *
 * An answer to a Timestamps range neither sends nor lists a skipped change, but
 * a request or a split lists its timestamp, so a peer that lacks it may ask for
 * it once per sync and gets an answer without it. Fingerprints keep disagreeing
 * about it, so every sync narrows them to it, skips it again, and ends.
 *
 * A throw from storage, or from a split's checks of what storage returned, is
 * logged and returns `SyncError`, except an AbortError from a split's reads,
 * which is rethrown. Any other throw, such as from writing the frame,
 * `onChangeTooLarge`, or `onMessage`, is a defect.
 */
const sync =
  (deps: StorageDep & ConsoleDep) =>
  (
    ranges: NonEmptyReadonlyArray<Range>,
    output: ProtocolMessageBuffer,
    ownerIdBytes: OwnerIdBytes,
    {
      createEmptyOutput,
      onChangeTooLarge,
      onMessage,
    }: {
      /** Creates an empty frame with the header of `output`. */
      createEmptyOutput: () => ProtocolMessageBuffer;
      onChangeTooLarge: (error: ProtocolChangeTooLargeError) => void;
      /** Called with each message `output` keeps. */
      onMessage?: (message: EncryptedCrdtMessage) => void;
    },
  ): Result<boolean, typeof ProtocolErrorCode.SyncError> => {
    const outputInitialSize = output.getSize();
    let storageSize: NonNegativeInt;
    try {
      storageSize = deps.storage.getSize(ownerIdBytes);
    } catch (error) {
      deps.console.error(error);
      return err(ProtocolErrorCode.SyncError);
    }

    let prevUpperBound: RangeUpperBound | null = null;
    let prevIndex = zeroNonNegativeInt;
    // The index of the last upper bound the frame states, 0 before any.
    let statedIndex = zeroNonNegativeInt;

    // Consecutive skipped ranges become one Skip range, written only before
    // the next non-skip range.
    let skip = false;
    let nonSkipRangeAdded = false;

    const skipRange = (
      range: SkipRange | FingerprintRange | TimestampsRange,
    ) => {
      // The last range, if any non skip was added, must have InfiniteUpperBound.
      if (nonSkipRangeAdded && range.upperBound === InfiniteUpperBound) {
        // A closing write. Like the closing Fingerprint range, it encodes no
        // upper bound, and its type takes 1 byte of the 13 that every kept
        // trial reserved beyond the ranges count.
        output.addRange({
          type: RangeType.Skip,
          upperBound: InfiniteUpperBound,
        });
      } else {
        skip = true;
      }
    };

    /**
     * Tries to write a non-skip range ending at the index `upper` after the
     * pending skip, if any.
     */
    const tryWriteRange = (
      upper: NonNegativeInt,
      write: () => void,
    ): boolean => {
      const isKept = output.tryWrite(() => {
        if (skip) {
          assertNonNullable(prevUpperBound, "prevUpperBound is null");
          output.addRange({
            type: RangeType.Skip,
            upperBound: prevUpperBound,
          });
        }
        write();
      });
      if (isKept) {
        skip = false;
        nonSkipRangeAdded = true;
        statedIndex = upper;
      }
      return isKept;
    };

    /**
     * Closes the frame with a Fingerprint range with InfiniteUpperBound over
     * the items from the last upper bound the frame states. A frame that cannot
     * fit a range closes without writing the pending Skip range, because only
     * this range has room reserved, so it covers the skipped items too.
     */
    const closeWithFingerprint = (): Result<
      true,
      typeof ProtocolErrorCode.SyncError
    > => {
      let fingerprint: Fingerprint;
      try {
        fingerprint = deps.storage.fingerprint(
          ownerIdBytes,
          statedIndex,
          storageSize,
        );
      } catch (error) {
        deps.console.error(error);
        return err(ProtocolErrorCode.SyncError);
      }
      // A closing write. Every kept trial reserved room for it.
      output.addRange({
        type: RangeType.Fingerprint,
        upperBound: InfiniteUpperBound,
        fingerprint,
      });
      return ok(true);
    };

    for (const range of ranges) {
      const currentUpperBound = range.upperBound;

      const lower = prevIndex;
      let upper: NonNegativeInt;
      try {
        upper = deps.storage.findLowerBound(
          ownerIdBytes,
          prevIndex,
          storageSize,
          currentUpperBound,
        );
      } catch (error) {
        deps.console.error(error);
        return err(ProtocolErrorCode.SyncError);
      }

      switch (range.type) {
        case RangeType.Skip: {
          skipRange(range);
          break;
        }

        case RangeType.Fingerprint: {
          let ourFingerprint: Fingerprint;
          try {
            ourFingerprint = deps.storage.fingerprint(
              ownerIdBytes,
              lower,
              upper,
            );
          } catch (error) {
            deps.console.error(error);
            return err(ProtocolErrorCode.SyncError);
          }

          if (eqArrayNumber(range.fingerprint, ourFingerprint)) {
            skipRange(range);
            break;
          }

          let splitRanges: ReadonlyArray<
            FingerprintRange | TimestampsRangeWithTimestampsBuffer
          >;
          try {
            splitRanges = readSplitRanges(deps)(
              ownerIdBytes,
              lower,
              upper,
              currentUpperBound,
            );
          } catch (error) {
            if (AbortError.is(error)) throw error;
            deps.console.error(error);
            return err(ProtocolErrorCode.SyncError);
          }
          const isSplit = tryWriteRange(upper, () => {
            for (const splitRange of splitRanges) output.addRange(splitRange);
          });
          if (!isSplit) return closeWithFingerprint();
          break;
        }

        case RangeType.Timestamps: {
          let endBound = currentUpperBound;

          const timestampsWeNeed = new Map(
            range.timestamps.map((t) => [t.join(), true]),
          );
          const ourTimestamps = createTimestampsBuffer();

          let exceeded = false as boolean;
          let iterateFailed = false as boolean;
          // A pending skip stays pending until the range is written.
          const isSkipPending = skip;
          // Only a throw from the storage itself is a storage failure. A throw
          // from the callback, such as from onChangeTooLarge or onMessage, is
          // a defect, rethrown after iterating.
          let callbackError = null as { readonly error: unknown } | null;

          try {
            deps.storage.iterate(
              ownerIdBytes,
              lower,
              upper,
              (timestamp, index) => {
                try {
                  const timestampString = timestamp.join();
                  const timestampBinary = timestampBytesToTimestamp(timestamp);

                  let message: EncryptedCrdtMessage | null = null;

                  if (timestampsWeNeed.has(timestampString)) {
                    timestampsWeNeed.delete(timestampString);
                  } else {
                    try {
                      message = {
                        timestamp: timestampBinary,
                        change: deps.storage.readDbChange(
                          ownerIdBytes,
                          timestamp,
                        ),
                      };
                    } catch (error) {
                      deps.console.error(error);
                      iterateFailed = true;
                      return false;
                    }
                  }

                  // One trial per timestamp: its entry in ourTimestamps and its
                  // message if the peer lacks it, keeping room to write
                  // ourTimestamps as a range after the pending skip.
                  const restoreOurTimestamps = ourTimestamps.checkpoint();
                  ourTimestamps.add(timestampBinary);
                  if (
                    output.tryWrite(
                      () => {
                        if (message) output.addMessage(message);
                      },
                      getTimestampsRangeReserve(ourTimestamps, isSkipPending),
                    )
                  ) {
                    if (message) onMessage?.(message);
                    return true;
                  }
                  restoreOurTimestamps();

                  if (message) {
                    // Whether an empty frame can hold the message in the trial
                    // a Timestamps range makes for it, with only its own
                    // timestamp listed and a skip pending. A later round is
                    // guaranteed to reach exactly that frame, so a message that
                    // fits is sent eventually. A trial without a pending skip
                    // reserves 22 bytes less, so a message up to 22 bytes too
                    // large for this check may still be sent in such a frame.
                    const emptyOutput = createEmptyOutput();
                    const emptyOutputTimestamps = createTimestampsBuffer();
                    emptyOutputTimestamps.add(message.timestamp);
                    const fitsEmptyOutput = emptyOutput.tryWrite(
                      () => {
                        emptyOutput.addMessage(message);
                      },
                      getTimestampsRangeReserve(emptyOutputTimestamps, true),
                    );
                    if (!fitsEmptyOutput) {
                      onChangeTooLarge({
                        type: "ProtocolChangeTooLargeError",
                        timestamp: timestampBinary,
                        size: message.change.length as PositiveInt,
                      });
                      return true;
                    }
                  }

                  exceeded = true;
                  endBound = timestamp;
                  upper = index;
                  return false;
                } catch (error) {
                  callbackError = { error };
                  return false;
                }
              },
            );
          } catch (error) {
            deps.console.error(error);
            iterateFailed = true;
          }

          if (callbackError) throw callbackError.error;

          if (iterateFailed) {
            return err(ProtocolErrorCode.SyncError);
          }

          // When any timestamp was kept, its trial reserved room for this
          // write. Otherwise the range may not fit, and the frame closes
          // without it.
          const tryWriteTimestampsRange = () =>
            tryWriteRange(upper, () => {
              output.addRange({
                type: RangeType.Timestamps,
                upperBound: endBound,
                timestamps: ourTimestamps,
              });
            });

          if (exceeded) {
            tryWriteTimestampsRange();
            return closeWithFingerprint();
          }

          // If we need something, we have to respond with our timestamps.
          if (timestampsWeNeed.size > 0) {
            if (!tryWriteTimestampsRange()) return closeWithFingerprint();
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

// The most a range adds to a frame beyond its payload. Its upper bound adds at
// most 20 bytes to the ranges' timestamps: a millis delta varint of up to 7
// bytes, as maxMillis has 48 bits; up to 4 for the counter, as a new run is a
// varint of up to 3 bytes, Counter being at most 65,535, and a 1-byte run
// length, while extending a run adds at most 1 byte; and up to 9 for the
// NodeId, as a new run is 8 bytes and a 1-byte run length. Its type takes 1
// byte, and the ranges count gains at most 1 byte.
const maxRangeOverhead = 22;

/**
 * Returns the bytes a frame must keep to write `timestamps` as a Timestamps
 * range, after a Skip range when one is pending. A Skip range has no payload,
 * and the length of `timestamps` is exact.
 */
const getTimestampsRangeReserve = (
  timestamps: TimestampsBuffer,
  isSkipPending: boolean,
): NonNegativeInt =>
  (timestamps.getLength() +
    maxRangeOverhead +
    (isSkipPending ? maxRangeOverhead : 0)) as NonNegativeInt;

/**
 * Reads the ranges that split the items from `lower` to `upper`: one Timestamps
 * range listing them when they are too few for buckets, otherwise Fingerprint
 * ranges over the buckets. It only reads storage, so a throw is a storage
 * failure.
 */
const readSplitRanges =
  (deps: StorageDep) =>
  (
    ownerId: OwnerIdBytes,
    lower: NonNegativeInt,
    upper: NonNegativeInt,
    upperBound: RangeUpperBound,
  ): ReadonlyArray<FingerprintRange | TimestampsRangeWithTimestampsBuffer> => {
    const itemCount = NonNegativeInt.orThrow(upper - lower);
    const buckets = computeBalancedBuckets(itemCount);

    if (!buckets.ok) {
      const range: TimestampsRangeWithTimestampsBuffer = {
        type: RangeType.Timestamps,
        upperBound,
        timestamps: createTimestampsBuffer(),
      };

      deps.storage.iterate(ownerId, lower, upper, (timestamp) => {
        range.timestamps.add(timestampBytesToTimestamp(timestamp));
        return true;
      });

      return [range];
    }

    // Check Storage.ts `fingerprint` and `fingerprintRanges` docs.
    const fingerprintRangesBuckets =
      lower === 0
        ? buckets.value
        : [lower, ...buckets.value.map((b) => (b + lower) as NonNegativeInt)];

    const fingerprintRanges = deps.storage.fingerprintRanges(
      ownerId,
      fingerprintRangesBuckets,
      upperBound,
    );

    return lower > 0 ? fingerprintRanges.slice(1) : fingerprintRanges;
  };

// Twice the largest rangesMaxSize rather than the receiver's own, because
// deployed senders exceed theirs. Up to @evolu/common 8.17, sync answered each
// Timestamps range that listed timestamps it lacked, while it held none in that
// range, with an empty Timestamps range, without checking the size. Such an
// echo reuses the peer's bounds with a 1-byte payload, so the echoes take less
// than the peer's ranges that list timestamps, which the peer's size checks
// kept within its rangesMaxSize. An empty list asks for nothing, so an echo is
// never echoed again.
const maxRangesSectionSize = 2 * maxProtocolMessageRangesMaxSize;

const decodeRanges = (buffer: Buffer): ReadonlyArray<Range> => {
  // The ranges section ends the frame, so it is checked before any allocation.
  if (buffer.getLength() > maxRangesSectionSize)
    throw new ProtocolDecodeError(
      `Ranges section exceeds ${maxRangesSectionSize} bytes`,
    );

  if (buffer.getLength() === 0) return [];

  const rangesCount = decodeNonNegativeInt(buffer);
  if (rangesCount === 0) return [];

  const timestampsCount = (rangesCount - 1) as NonNegativeInt;
  const timestamps = decodeTimestamps(buffer, timestampsCount);

  // Storage resolves each bound from the owner's first timestamp, so a lower
  // bound would move back over ranges already answered. Equal bounds are
  // valid: sync ends a range at the change that did not fit, which can be
  // where the previous range ended. Timestamps listed in a range are not
  // checked, because peers before @evolu/common 8.11 list some outside it.
  for (let i = 1; i < timestamps.length; i++)
    if (orderTimestamp(timestamps[i - 1], timestamps[i]) > 0)
      throw new ProtocolDecodeError(
        "Range upper bounds must be non-decreasing",
      );

  const rangeTypes = createMutableArray<RangeType>(rangesCount);

  for (let i = 0; i < rangesCount; i++) {
    const rangeType = decodeNonNegativeInt(buffer);
    switch (rangeType) {
      case RangeType.Fingerprint:
      case RangeType.Skip:
      case RangeType.Timestamps:
        rangeTypes[i] = rangeType as RangeType;
        break;
      default:
        throw new ProtocolDecodeError(`Invalid RangeType: ${rangeType}`);
    }
  }

  const ranges = createMutableArray<Range>(rangesCount);

  for (let i = 0; i < rangesCount; i++) {
    const upperBound =
      i < timestampsCount
        ? timestampToTimestampBytes(timestamps[i])
        : InfiniteUpperBound;

    const rangeType = rangeTypes[i];

    switch (rangeType) {
      case RangeType.Skip:
        ranges[i] = { type: RangeType.Skip, upperBound };
        break;

      case RangeType.Fingerprint: {
        const fingerprint = buffer.shiftN(fingerprintSize) as Fingerprint;
        ranges[i] = {
          type: RangeType.Fingerprint,
          upperBound,
          fingerprint,
        };
        break;
      }

      case RangeType.Timestamps: {
        const timestamps = decodeTimestamps(buffer).map(
          timestampToTimestampBytes,
        );
        ranges[i] = {
          type: RangeType.Timestamps,
          upperBound,
          timestamps,
        };
        break;
      }
    }
  }

  return ranges;
};

const decodeTimestamps = (
  buffer: Buffer,
  length?: NonNegativeInt,
): ReadonlyArray<Timestamp> => {
  length ??= decodeNonNegativeInt(buffer);
  // Every timestamp takes at least its 1-byte millis delta.
  if (length > buffer.getLength())
    throw new ProtocolDecodeError("Invalid timestamps count");

  let previousMillis = 0 as Millis;

  const millises = createMutableArray<Millis>(length);
  for (let i = 0; i < length; i++) {
    const deltaMillis = decodeNonNegativeInt(buffer);
    const millis = Millis.fromUnknown(previousMillis + deltaMillis);
    if (!millis.ok) throw new ProtocolDecodeError(millis.error.type);
    millises[i] = millis.value;
    previousMillis = millis.value;
  }

  const counters = decodeRle(buffer, length, (): Counter => {
    const counter = Counter.fromUnknown(decodeNonNegativeInt(buffer));
    if (!counter.ok) throw new ProtocolDecodeError(counter.error.type);
    return counter.value;
  });

  const nodeIds = decodeRle(buffer, length, (): NodeId =>
    nodeIdBytesToNodeId(buffer.shiftN(nodeIdBytesLength) as NodeIdBytes),
  );

  const timestamps = createMutableArray<Timestamp>(length);
  for (let i = 0; i < length; i++) {
    timestamps[i] = {
      millis: millises[i],
      counter: counters[i],
      nodeId: nodeIds[i],
    };
  }

  return timestamps;
};

const decodeId = (buffer: Buffer): Id => {
  const bytes = buffer.shiftN(idBytesTypeValueLength);
  return idBytesToId(bytes as IdBytes);
};

/**
 * The format version that starts every {@link EncryptedDbChange} plaintext.
 *
 * It is independent of {@link protocolVersion}, so a new protocol version that
 * keeps this layout does not make decoders reject changes. 6.0.1-preview.35
 * wrote 0 with this layout, so decoding accepts every version up to this one.
 *
 * Decoders in `@evolu/common` 8.17 and earlier ignore the version. A future
 * layout must still make them fail, for example with a value they cannot
 * decode, rather than let them decode wrong values.
 */
const encryptedDbChangeVersion = onePositiveInt;

/**
 * Encodes and encrypts a {@link DbChange} using the provided owner's encryption
 * key. Returns an encrypted binary representation as {@link EncryptedDbChange}.
 *
 * The plaintext starts with the format version of the change, which is
 * independent of {@link protocolVersion}, and the timestamp, which proves that
 * the change belongs to the timestamp it is sent with.
 * {@link decryptAndDecodeDbChange} rejects a newer format version and accepts
 * older ones.
 */
export const encodeAndEncryptDbChange =
  (deps: RandomBytesDep) =>
  (message: CrdtMessage, key: EncryptionKey): EncryptedDbChange => {
    const buffer = createBuffer();

    encodeDbChange(buffer, message);

    // Add PADMÉ padding (ignored during decoding)
    buffer.extend(createPadmePadding(buffer.getLength()));

    const [ciphertext, nonce] = encryptWithXChaCha20Poly1305(deps)(
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
 * Encodes a {@link CrdtMessage} as {@link encodeAndEncryptDbChange} does before
 * padding and encryption.
 *
 * {@link Evolu.getMutationSize} measures mutations with this encoding, so
 * {@link maxMutationSize} limits exactly what is encoded, and every change
 * within it fits one protocol message.
 */
export const encodeDbChange = (buffer: Buffer, message: CrdtMessage): void => {
  encodeNonNegativeInt(buffer, encryptedDbChangeVersion);

  // Encode the timestamp to prevent tampering (e.g., a malicious relay
  // assigning this EncryptedDbChange to a different EncryptedCrdtMessage)
  buffer.extend(timestampToTimestampBytes(message.timestamp));

  encodeFlags(buffer, [
    message.change.isInsert,
    // Encode nullable boolean as two flags: presence + value.
    message.change.isDelete != null,
    message.change.isDelete ?? false,
  ]);

  encodeString(buffer, message.change.table);
  buffer.extend(idToIdBytes(message.change.id));

  const entries = objectToEntries(message.change.values);

  encodeLength(buffer, entries);
  for (const [column, value] of entries) {
    encodeString(buffer, column);
    // DbChange validated every value as a SqliteValue; only its Partial record
    // type admits undefined.
    encodeSqliteValue(buffer, value as SqliteValue);
  }
};

/**
 * Decrypts and decodes an {@link EncryptedCrdtMessage} using the provided
 * owner's encryption key. Verifies that the embedded timestamp matches the
 * expected timestamp to ensure message integrity.
 *
 * A change with a newer format version than {@link encodeAndEncryptDbChange}
 * writes is a {@link ProtocolInvalidDataError}.
 */
export const decryptAndDecodeDbChange = (
  message: EncryptedCrdtMessage,
  key: EncryptionKey,
): Result<
  DbChange,
  | DecryptWithXChaCha20Poly1305Error
  | ProtocolInvalidDataError
  | ProtocolTimestampMismatchError
> => {
  try {
    const buffer = createBuffer(message.change);

    const nonce = buffer.shiftN(xChaCha20Poly1305NonceLength as NonNegativeInt);
    const ciphertext = buffer.shiftN(decodeLength(buffer));

    const plaintextBytes = decryptWithXChaCha20Poly1305(
      ciphertext as XChaCha20Poly1305Ciphertext,
      nonce as Entropy24,
      key,
    );
    if (!plaintextBytes.ok) return plaintextBytes;

    buffer.reset();
    buffer.extend(plaintextBytes.value);

    if (decodeNonNegativeInt(buffer) > encryptedDbChangeVersion)
      throw new ProtocolDecodeError("Unsupported EncryptedDbChange version");

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

    const flags = decodeFlags(buffer, 3 as PositiveInt);
    const table = decodeString(buffer);
    const id = decodeId(buffer);

    const length = decodeLength(buffer);
    const values = createMutableRecord<string, SqliteValue>();

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

// Small ints are encoded into ProtocolValueType, saving one byte per int.
export const ProtocolValueType = {
  // 0-19 small ints

  // SQLite types
  String: /*#__PURE__*/ NonNegativeInt.orThrow(20),
  Number: /*#__PURE__*/ NonNegativeInt.orThrow(21),
  Null: /*#__PURE__*/ NonNegativeInt.orThrow(22),
  Bytes: /*#__PURE__*/ NonNegativeInt.orThrow(23),
  // We can add more types for other DBs or anything else later.

  // Optimized types
  NonNegativeInt: /*#__PURE__*/ NonNegativeInt.orThrow(30),

  // String optimizations
  // 1 byte vs 2 bytes (50% reduction)
  EmptyString: /*#__PURE__*/ NonNegativeInt.orThrow(31),
  Base64Url: /*#__PURE__*/ NonNegativeInt.orThrow(32),
  Id: /*#__PURE__*/ NonNegativeInt.orThrow(33),
  Json: /*#__PURE__*/ NonNegativeInt.orThrow(34),

  // new Date().toISOString()   - 24 bytes
  // encoded with fixed length  - 8 bytes
  // encode as NonNegativeInt   - 6 bytes (additional 25% reduction)
  DateIsoWithNonNegativeTime: /*#__PURE__*/ NonNegativeInt.orThrow(35),
  // 9 bytes
  DateIsoWithNegativeTime: /*#__PURE__*/ NonNegativeInt.orThrow(36),

  // TODO: Operations (from 40)
  // Increment, Decrement, Patch, whatever.
} as const;

export const encodeSqliteValue = (buffer: Buffer, value: SqliteValue): void => {
  if (value === null) {
    encodeNonNegativeInt(buffer, ProtocolValueType.Null);
    return;
  }

  // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- The remaining SqliteValue is Uint8Array and is encoded after the switch.
  switch (typeof value) {
    case "string": {
      if (value === "") {
        encodeNonNegativeInt(buffer, ProtocolValueType.EmptyString);
        return;
      }

      const dateIso = DateIso.from.parent(value);
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
          encodeNumber(buffer, time as FiniteNumber);
        }
        return;
      }

      const id = Id.from.parent(value);
      if (id.ok) {
        encodeNonNegativeInt(buffer, ProtocolValueType.Id);
        buffer.extend(idToIdBytes(id.value));
        return;
      }

      const json = Json.from.parent(value);
      if (json.ok) {
        const jsonValue = jsonToJsonValue(json.value);
        const jsonBuffer = createBuffer();
        try {
          // Encoding first rejects nesting deeper than decoding allows, before
          // the recursive JSON.stringify below could overflow the stack. Such
          // a value is encoded as a plain string.
          encodeJsonValue(jsonBuffer, jsonValue);
          // Only encode as Json if it survives JSON.parse/JSON.stringify
          // round-trip. Some valid JSON strings like "-0E0" get normalized to
          // "0" during parsing, which would cause data corruption if we don't
          // verify round-trip safety.
          if (JSON.stringify(jsonValue) === value) {
            const jsonBytes = jsonBuffer.unwrap();
            encodeNonNegativeInt(buffer, ProtocolValueType.Json);
            encodeLength(buffer, jsonBytes);
            buffer.extend(jsonBytes);
            return;
          }
        } catch (error) {
          if (!(error instanceof BufferError)) throw error;
        }
      }

      const base64Url = Base64Url.from.parent(value);
      if (base64Url.ok) {
        encodeNonNegativeInt(buffer, ProtocolValueType.Base64Url);
        const bytes = base64UrlToUint8Array(base64Url.value);
        encodeLength(buffer, bytes);
        buffer.extend(bytes);
        return;
      }

      // encodeString replaces a lone surrogate with U+FFFD, so the bytes are
      // always valid UTF-8. Encoding WTF-8 instead would make peers disagree:
      // deployed decoders read a lone surrogate in WTF-8 as three U+FFFD,
      // while a decoder that kept it would read the surrogate.
      encodeNonNegativeInt(buffer, ProtocolValueType.String);
      encodeString(buffer, value);
      return;
    }

    case "number": {
      // Negative zero is a non-negative integer in JavaScript, but integer
      // encoding would lose its observable sign.
      if (!Object.is(value, -0) && NonNegativeInt.is(value)) {
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
      const jsonValueBuffer = createBuffer(buffer.shiftN(length));
      const value = decodeJsonValue(jsonValueBuffer);
      if (jsonValueBuffer.getLength() !== 0) {
        throw new ProtocolDecodeError("Invalid JSON MessagePack length");
      }
      return JSON.stringify(value);
    }

    case ProtocolValueType.DateIsoWithNonNegativeTime:
    case ProtocolValueType.DateIsoWithNegativeTime: {
      const time =
        type === ProtocolValueType.DateIsoWithNonNegativeTime
          ? decodeNonNegativeInt(buffer)
          : decodeNumber(buffer);
      const dateIso = DateIso.from.parent(new Date(time).toISOString());
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

const isSmallInt: Predicate<number> = (value: number) =>
  value >= 0 && value < 20;
