import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { NonEmptyReadonlyArray } from "../Array.js";
import {
  createSlip21,
  EncryptionKey,
  Entropy16,
  Entropy32,
  RandomBytesDep,
} from "../Crypto.js";
import { getOrNull } from "../Result.js";
import {
  brand,
  Id,
  IdBytes,
  idBytesToId,
  idToIdBytes,
  Mnemonic,
  NonNegativeInt,
} from "../Type.js";
import type { EncryptedDbChange, Storage } from "./Storage.js";
import { TimestampBytes } from "./Timestamp.js";

/**
 * {@link Owner} without a {@link OwnerWriteKey}.
 *
 * @see {@link createSharedReadonlyOwner}
 */
export interface ReadonlyOwner {
  readonly id: OwnerId;
  /** TODO: Wrap with `Redacted` in the next major version. */
  readonly encryptionKey: OwnerEncryptionKey;
}

/**
 * The Owner represents ownership of data in Evolu. Every database change is
 * assigned to an owner and encrypted with its {@link OwnerEncryptionKey}. Owners
 * allow partial sync, only the {@link AppOwner} is synced by default.
 *
 * Owners can also provide real data deletion, while individual changes in
 * local-first/distributed systems can only be soft deleted, entire owners can
 * be completely deleted from both relays and devices (except for
 * {@link AppOwner}, which must be preserved for sync coordination).
 *
 * Evolu provides different owner types depending on their use case:
 *
 * - **Coordination**: {@link AppOwner} for sync coordination and long-term
 *   persistence
 * - **Data partitioning**: {@link ShardOwner} for partitioning application data
 * - **Collaboration**: {@link SharedOwner} for collaborative write access
 * - **Data sharing**: {@link SharedReadonlyOwner} for read-only access to shared
 *   data
 *
 * Owners are cryptographically derived from an {@link OwnerSecret} using
 * SLIP-21, ensuring secure and deterministic key generation:
 *
 * - {@link OwnerId}: Globally unique public identifier
 * - {@link OwnerEncryptionKey}: Symmetric encryption key for data protection
 * - {@link OwnerWriteKey}: Authentication token for write operations (rotatable)
 *
 * @see {@link createAppOwner}
 * @see {@link createShardOwner}
 * @see {@link createSharedOwner}
 * @see {@link createSharedReadonlyOwner}
 */
export interface Owner extends ReadonlyOwner {
  /** TODO: Wrap with `Redacted` in the next major version. */
  readonly writeKey: OwnerWriteKey;
}

/** OwnerId is a branded {@link Id} that uniquely identifies an {@link Owner}. */
export const OwnerId = brand("OwnerId", Id);
export type OwnerId = typeof OwnerId.Type;

/** Bytes representation of {@link OwnerId}. */
export const OwnerIdBytes = brand("OwnerIdBytes", IdBytes);
export type OwnerIdBytes = typeof OwnerIdBytes.Type;

/** Converts {@link OwnerId} to {@link OwnerIdBytes}. */
export const ownerIdToOwnerIdBytes = (ownerId: OwnerId): OwnerIdBytes =>
  idToIdBytes(ownerId) as OwnerIdBytes;

/** Converts {@link OwnerIdBytes} to {@link OwnerId}. */
export const ownerIdBytesToOwnerId = (ownerIdBytes: OwnerIdBytes): OwnerId =>
  idBytesToId(ownerIdBytes as IdBytes) as OwnerId;

export const ownerWriteKeyLength = NonNegativeInt.orThrow(16);

/** Symmetric encryption key for {@link Owner} data protection. */
export const OwnerEncryptionKey = brand("OwnerEncryptionKey", EncryptionKey);
export type OwnerEncryptionKey = typeof OwnerEncryptionKey.Type;

/**
 * A secure token for write operations. It's derived from {@link OwnerSecret} by
 * default and can be rotated via {@link createOwnerWriteKey}.
 */
export const OwnerWriteKey = brand("OwnerWriteKey", Entropy16);
export type OwnerWriteKey = typeof OwnerWriteKey.Type;

/**
 * Creates a new random {@link OwnerWriteKey} for rotation.
 *
 * The initial OwnerWriteKey is deterministically derived from
 * {@link OwnerSecret}. Use `createOwnerWriteKey` to rotate (replace) the write
 * key without changing the owner identity.
 */
export const createOwnerWriteKey = (deps: RandomBytesDep): OwnerWriteKey =>
  deps.randomBytes.create(16) as OwnerWriteKey;

/**
 * 32 bytes of cryptographic entropy used to derive {@link Owner} keys.
 *
 * Can be created using {@link createOwnerSecret} or converted from a
 * {@link Mnemonic} using {@link mnemonicToOwnerSecret}.
 */
export const OwnerSecret = brand("OwnerSecret", Entropy32);
export type OwnerSecret = typeof OwnerSecret.Type;

/** Creates a {@link OwnerSecret}. */
export const createOwnerSecret = (deps: RandomBytesDep): OwnerSecret =>
  deps.randomBytes.create(32) as OwnerSecret;

/** Converts an {@link OwnerSecret} to a {@link Mnemonic}. */
export const ownerSecretToMnemonic = (secret: OwnerSecret): Mnemonic =>
  bip39.entropyToMnemonic(secret, wordlist) as Mnemonic;

/** Converts a {@link Mnemonic} to an {@link OwnerSecret}. */
export const mnemonicToOwnerSecret = (mnemonic: Mnemonic): OwnerSecret =>
  bip39.mnemonicToEntropy(mnemonic, wordlist) as OwnerSecret;

/**
 * Creates an {@link Owner} from a {@link OwnerSecret} using SLIP-21 key
 * derivation.
 */
const createOwner = (secret: OwnerSecret): Owner => ({
  id: ownerIdBytesToOwnerId(
    OwnerIdBytes.orThrow(
      createSlip21(secret, ["Evolu", "OwnerIdBytes"]).slice(0, 16),
    ),
  ),

  encryptionKey: OwnerEncryptionKey.orThrow(
    createSlip21(secret, ["Evolu", "OwnerEncryptionKey"]),
  ),

  writeKey: OwnerWriteKey.orThrow(
    createSlip21(secret, ["Evolu", "OwnerWriteKey"]).slice(0, 16),
  ),
});

/**
 * The AppOwner represents the application owner. It's created using a
 * cryptographically secure random generator or derived from an external source,
 * e.g., mnemonic stored securely in a hardware device.
 *
 * While it's possible to store all application data in AppOwner, the better
 * approach is to use it only for sync coordination. Storing all app data in
 * AppOwner means that data will be stored/synced forever. And that's a problem
 * if we want to provide real data deletion or in-app data migration without
 * data duplication. In local-first apps/distributed systems, we can't delete
 * individual changes, we only mark them as deleted, otherwise sync could not
 * work.
 *
 * If we really want to delete data or at least avoid syncing it, we must store
 * it using a different owner than AppOwner, e.g. {@link ShardOwner} or
 * {@link SharedOwner}, and delete that owner. The AppOwner itself must be
 * preserved because it coordinates deletion information across devices. Other
 * devices need to sync the information that an owner was deleted so they can
 * delete their local data as well.
 *
 * ## Privacy Considerations
 *
 * AppOwner must never be shared with anyone, except for its {@link OwnerId},
 * which can be used for authorization with
 * {@link createOwnerWebSocketTransport}. It's safe because OwnerId is
 * pseudonymous (it can't be assigned to a specific person).
 *
 * For data sharing scenarios, use {@link SharedOwner} and
 * {@link SharedReadonlyOwner} instead, which are designed specifically for
 * collaborative access.
 */
export interface AppOwner extends Owner {
  readonly type: "AppOwner";

  /**
   * The mnemonic that was used to derive the AppOwner keys. Optional when the
   * AppOwner is created from external keys to avoid sharing the mnemonic with
   * the Evolu app.
   *
   * TODO: Wrap with `Redacted` in the next major version.
   */
  readonly mnemonic?: Mnemonic | null;
}

export interface AppOwnerDep {
  readonly appOwner: AppOwner;
}

/** Creates an {@link AppOwner} from an {@link OwnerSecret}. */
export const createAppOwner = (secret: OwnerSecret): AppOwner => ({
  ...createOwner(secret),
  type: "AppOwner",
  mnemonic: ownerSecretToMnemonic(secret),
});

/**
 * An {@link Owner} for sharding data.
 *
 * ShardOwners are the recommended storage location for most application data
 * because they can be completely deleted (both on relays and devices) and
 * conditionally synced.
 *
 * Can be created from {@link OwnerSecret} via {@link createShardOwner} or
 * deterministically derived from {@link AppOwner} using
 * {@link deriveShardOwner}.
 */
export interface ShardOwner extends Owner {
  readonly type: "ShardOwner";
}

/** Creates a {@link ShardOwner} from an {@link OwnerSecret}. */
export const createShardOwner = (secret: OwnerSecret): ShardOwner => {
  return {
    ...createOwner(secret),
    type: "ShardOwner",
  };
};

/**
 * Derives a {@link ShardOwner} from an {@link AppOwner} using the specified path.
 *
 * **Advantages of derived owners:**
 *
 * - **Deterministic**: Same path always produces the same ShardOwner across all
 *   devices
 * - **Immediate availability**: Can be hardcoded and used before sync occurs
 * - **Consistent setup**: All devices start with identical data structure
 * - **Lifecycle management**: Can implement epoch patterns for clean data
 *   deletion and recreation
 *
 * **Common patterns:**
 *
 * - Use paths like `["shard", 1]` for versioned data lifecycle
 * - Use paths like `["project", "MyApp", 1]` for named partitions with versions
 * - Each device can derive the same owners and set up initial structure
 */
export const deriveShardOwner = (
  owner: AppOwner,
  path: NonEmptyReadonlyArray<string | number>,
): ShardOwner => {
  const secret = createSlip21(owner.encryptionKey, path) as OwnerSecret;

  return {
    ...createOwner(secret),
    type: "ShardOwner",
  };
};

/** An {@link Owner} for collaborative data with write access. */
export interface SharedOwner extends Owner {
  readonly type: "SharedOwner";
}

/**
 * Creates a {@link SharedOwner} from an {@link OwnerSecret} for collaborative
 * write access.
 *
 * Use {@link createSharedReadonlyOwner} to create a read-only version for
 * sharing.
 */
export const createSharedOwner = (secret: OwnerSecret): SharedOwner => ({
  ...createOwner(secret),
  type: "SharedOwner",
});

/**
 * Read-only version of a {@link SharedOwner} for data sharing. Contains only the
 * {@link OwnerId} and {@link EncryptionKey} needed for others to read the shared
 * data without write access.
 */
export interface SharedReadonlyOwner extends ReadonlyOwner {
  readonly type: "SharedReadonlyOwner";
}

/** Creates a {@link SharedReadonlyOwner} from a {@link SharedOwner}. */
export const createSharedReadonlyOwner = (
  sharedOwner: SharedOwner,
): SharedReadonlyOwner => ({
  type: "SharedReadonlyOwner",
  id: sharedOwner.id,
  encryptionKey: sharedOwner.encryptionKey,
});

/**
 * Transport configuration for connecting to relays.
 *
 * Currently only WebSocket, in the future Bluetooth, LocalNetwork, etc.
 */
export type OwnerTransport = OwnerWebSocketTransport;

/**
 * WebSocket transport configuration.
 *
 * ## Authentication via URL
 *
 * The {@link OwnerId} is passed as a URL query parameter. While this approach is
 * generally discouraged for authentication tokens (they get logged), it's safe
 * here because OwnerId is pseudonymous and used only for access verification -
 * it provides no ability to read encrypted data or write changes.
 *
 * See: [HTTP headers in Websockets client
 * API](https://stackoverflow.com/questions/4361173/http-headers-in-websockets-client-api/74564827#74564827)
 *
 * ## Error Handling
 *
 * When a relay rejects a connection (invalid OwnerId, unauthorized owner, or
 * server error), the browser WebSocket API does not expose the specific HTTP
 * status code or reason - it only reports a generic connection failure. The
 * client automatically retries with exponential backoff and jitter, eventually
 * succeeding once the configuration or server issue is resolved.
 *
 * Legitimate clients will be properly configured with valid credentials, so
 * automatic retry is OK.
 *
 * @see {@link createOwnerWebSocketTransport}
 * @see {@link parseOwnerIdFromOwnerWebSocketTransportUrl}
 */
export interface OwnerWebSocketTransport {
  readonly type: "WebSocket";
  readonly url: string;
}

/**
 * Creates an {@link OwnerWebSocketTransport} for the given relay URL and
 * {@link OwnerId}.
 *
 * The URL must be a WebSocket base URL without query parameters or fragments
 * (e.g., `wss://relay.evolu.dev`, not `wss://relay.evolu.dev?foo=bar`). The
 * function appends the `ownerId` as a query parameter.
 *
 * ### Example
 *
 * ```ts
 * // Create transport "wss://relay.evolu.dev?ownerId=..."
 * const transport = createOwnerWebSocketTransport({
 *   url: "wss://relay.evolu.dev",
 *   ownerId: owner.id,
 * });
 *
 * // Use with createEvolu
 * const evolu = createEvolu(deps)(Schema, {
 *   transports: [transport],
 * });
 * ```
 */
export const createOwnerWebSocketTransport = (config: {
  readonly url: string;
  readonly ownerId: OwnerId;
}): OwnerWebSocketTransport => ({
  type: "WebSocket",
  url: `${config.url}?ownerId=${config.ownerId}`,
});

/**
 * Extracts {@link OwnerId} from an {@link OwnerWebSocketTransport} URL query
 * string.
 *
 * Parses the query string `?ownerId=...` and validates that the extracted value
 * is a valid {@link OwnerId}.
 *
 * ### Example
 *
 * ```ts
 * parseOwnerIdFromOwnerWebSocketTransportUrl(
 *   "/sync?ownerId=_12345678abcdefgh",
 * );
 * // Returns: OwnerId or null
 * ```
 */
export const parseOwnerIdFromOwnerWebSocketTransportUrl = (
  url: string,
): OwnerId | null => getOrNull(OwnerId.fromUnknown(url.split("=")[1]));

/** Common interface implemented by all owner domain errors. */
export interface OwnerError {
  readonly ownerId: OwnerId;
}

/**
 * Usage data for an {@link OwnerId}.
 *
 * Tracks storage usage to enforce quotas if needed, and some other stuff.
 *
 * TODO:
 *
 * - Add transferredBytes for billing and monitoring network usage.
 */
export interface OwnerUsage {
  /** The {@link Owner} this usage data belongs to. */
  readonly ownerId: OwnerIdBytes;

  /**
   * Total logical data bytes stored.
   *
   * Measures the size of {@link EncryptedDbChange}s only, excluding
   * {@link Storage} implementation overhead (with SqliteStorage: indexes,
   * skiplist columns, etc.). This provides:
   *
   * - **Predictable measurement** - same data = same byte count across all
   *   instances
   * - **Quota enforcement** - consistent billing/limits independent of storage
   *   implementation
   * - **Overhead tracking** - actual Storage size can be compared against this to
   *   monitor efficiency
   */
  readonly storedBytes: NonNegativeInt;

  /** Tracks the earliest timestamp for timestamp insertion strategies. */
  readonly firstTimestamp: TimestampBytes | null;

  /**
   * Tracks the latest timestamp for timestamp insertion strategies.
   *
   * Free relays can use it to identify inactive accounts for cleanup.
   */
  readonly lastTimestamp: TimestampBytes | null;
}
