/**
 * ## Intro
 *
 * Cryptographic identities that define ownership, encryption, sync, and
 * deletion boundaries for Evolu data.
 *
 * Every database change belongs to an {@link Owner} and is encrypted with its
 * {@link OwnerEncryptionKey}. Owners also make sync selective: only the
 * {@link AppOwner} is synced by default, while other owners can be synced when
 * needed.
 *
 * Individual changes in an append-only local-first history can only be marked
 * as deleted. An entire owner, however, can be removed from devices and relays
 * together with all of its data. The AppOwner must remain because it coordinates
 * the deletion of other owners across devices.
 *
 * Choose an owner by how its data should live and be shared:
 *
 * - {@link AppOwner} coordinates sync and persists for the lifetime of the app
 *   identity.
 * - {@link ShardOwner} partitions application data so it can be synced and
 *   deleted independently.
 * - {@link SharedOwner} grants collaborative read and write access.
 * - {@link SharedReadonlyOwner} grants read-only access to shared data.
 *
 * An {@link OwnerSecret} deterministically derives three independent values
 * using SLIP-21:
 *
 * - {@link OwnerId}: the public identifier.
 * - {@link OwnerEncryptionKey}: the symmetric key that protects the data.
 * - {@link OwnerWriteKey}: the rotatable token that authorizes writes.
 *
 * @module
 */

import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { NonEmptyReadonlyArray } from "../Array.ts";
import type { RandomBytesDep } from "../Crypto.ts";
import {
  createSlip21,
  EncryptionKey,
  Entropy16,
  Entropy32,
  testCreateRandomBytes,
} from "../Crypto.ts";
import { testCreateRandomLib } from "../Random.ts";
import { getOrNull } from "../Result.ts";
import {
  brand,
  Id,
  IdBytes,
  idBytesToId,
  idToIdBytes,
  Mnemonic,
  NonNegativeInt,
  type Typed,
} from "../Type.ts";
import type { EncryptedDbChange, Storage } from "./Storage.ts";
import { TimestampBytes } from "./Timestamp.ts";

/**
 * {@link Owner} without a {@link OwnerWriteKey}.
 *
 * @see {@link createSharedReadonlyOwner}
 * @group Core
 */
export interface ReadonlyOwner {
  readonly id: OwnerId;
  /** TODO: Wrap with `Redacted` in the next major version. */
  readonly encryptionKey: OwnerEncryptionKey;
}

/**
 * An {@link ReadonlyOwner} with an {@link OwnerWriteKey} for authorizing writes.
 *
 * See the {@link @evolu/common!"local-first/Owner" | Owners overview}.
 *
 * @group Core
 */
export interface Owner extends ReadonlyOwner {
  /** TODO: Wrap with `Redacted` in the next major version. */
  readonly writeKey: OwnerWriteKey;
}

/**
 * An {@link ReadonlyOwner} or {@link Owner} with non-empty {@link OwnerTransport}s
 * so it can be synced.
 *
 * @group Transport
 */
export interface SyncOwner {
  readonly owner: ReadonlyOwner | Owner;
  readonly transports: NonEmptyReadonlyArray<OwnerTransport>;
}

/**
 * A branded {@link Id} that uniquely identifies an {@link Owner}.
 *
 * @group Core
 */
export const OwnerId = /*#__PURE__*/ brand("OwnerId", Id);
export type OwnerId = typeof OwnerId.Output;

/**
 * Binary representation of {@link OwnerId}.
 *
 * @group Core
 */
export const OwnerIdBytes = /*#__PURE__*/ brand("OwnerIdBytes", IdBytes);
export type OwnerIdBytes = typeof OwnerIdBytes.Output;

/**
 * Converts {@link OwnerId} to {@link OwnerIdBytes}.
 *
 * @group Core
 */
export const ownerIdToOwnerIdBytes = (ownerId: OwnerId): OwnerIdBytes =>
  idToIdBytes(ownerId) as OwnerIdBytes;

/**
 * Converts {@link OwnerIdBytes} to {@link OwnerId}.
 *
 * @group Core
 */
export const ownerIdBytesToOwnerId = (ownerIdBytes: OwnerIdBytes): OwnerId =>
  idBytesToId(ownerIdBytes) as OwnerId;

/**
 * Length of an {@link OwnerWriteKey} in bytes.
 *
 * @group Core
 */
export const ownerWriteKeyLength = /*#__PURE__*/ NonNegativeInt.orThrow(16);

/**
 * Symmetric encryption key for {@link Owner} data protection.
 *
 * @group Core
 */
export const OwnerEncryptionKey = /*#__PURE__*/ brand(
  "OwnerEncryptionKey",
  EncryptionKey,
);
export type OwnerEncryptionKey = typeof OwnerEncryptionKey.Output;

/**
 * A token that authorizes write operations for an {@link Owner}.
 *
 * The initial key is derived from {@link OwnerSecret}. Replace it with a random
 * key from {@link createOwnerWriteKey} to rotate write access without changing
 * the owner identity or encryption key.
 *
 * @group Core
 */
export const OwnerWriteKey = /*#__PURE__*/ brand("OwnerWriteKey", Entropy16);
export type OwnerWriteKey = typeof OwnerWriteKey.Output;

/**
 * Creates a random {@link OwnerWriteKey} for rotating write access.
 *
 * @group Core
 */
export const createOwnerWriteKey = (deps: RandomBytesDep): OwnerWriteKey =>
  deps.randomBytes.create(16) as OwnerWriteKey;

/**
 * 32 bytes of cryptographic entropy used to derive {@link Owner} keys.
 *
 * Can be created using {@link createOwnerSecret} or converted from a
 * {@link Mnemonic} using {@link mnemonicToOwnerSecret}.
 *
 * @group Core
 */
export const OwnerSecret = /*#__PURE__*/ brand("OwnerSecret", Entropy32);
export type OwnerSecret = typeof OwnerSecret.Output;

/**
 * Creates a cryptographically random {@link OwnerSecret}.
 *
 * @group Core
 */
export const createOwnerSecret = (deps: RandomBytesDep): OwnerSecret =>
  deps.randomBytes.create(32) as OwnerSecret;

/**
 * Deterministic {@link OwnerSecret} for tests.
 *
 * @group Testing
 */
export const testOwnerSecret = /*#__PURE__*/ createOwnerSecret({
  randomBytes: /*#__PURE__*/ testCreateRandomBytes({
    randomLib: /*#__PURE__*/ testCreateRandomLib(),
  }),
});

/**
 * Converts an {@link OwnerSecret} to a {@link Mnemonic}.
 *
 * @group Core
 */
export const ownerSecretToMnemonic = (secret: OwnerSecret): Mnemonic =>
  bip39.entropyToMnemonic(secret, wordlist) as Mnemonic;

/**
 * Converts a {@link Mnemonic} to an {@link OwnerSecret}.
 *
 * @group Core
 */
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
 * AppOwner must never be shared with anyone.
 *
 * AppOwner's {@link OwnerId} is used for authorization with
 * {@link createOwnerWebSocketTransport}. Share it only with trusted relay
 * parties that must verify access, and do not share it with anyone else.
 *
 * For data sharing scenarios, use {@link SharedOwner} and
 * {@link SharedReadonlyOwner} to make intent explicit and distinguish
 * collaborative usage from {@link AppOwner} coordination.
 *
 * @group Variants
 */
export interface AppOwner extends Owner, Typed<"AppOwner"> {
  /**
   * The mnemonic that was used to derive the AppOwner keys. Optional when the
   * AppOwner is created from external keys to avoid sharing the mnemonic with
   * the Evolu app.
   *
   * TODO: Wrap with `Redacted` in the next major version.
   */
  readonly mnemonic: Mnemonic;
}

/**
 * Creates an {@link AppOwner} from an {@link OwnerSecret}.
 *
 * @group Variants
 */
export const createAppOwner = (secret: OwnerSecret): AppOwner => ({
  ...createOwner(secret),
  type: "AppOwner",
  mnemonic: ownerSecretToMnemonic(secret),
});

/**
 * Deterministic {@link AppOwner} for tests.
 *
 * @group Testing
 */
export const testAppOwner = /*#__PURE__*/ createAppOwner(testOwnerSecret);

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
 *
 * @group Variants
 */
export interface ShardOwner extends Owner, Typed<"ShardOwner"> {}

/**
 * Creates a {@link ShardOwner} from an {@link OwnerSecret}.
 *
 * @group Variants
 */
export const createShardOwner = (secret: OwnerSecret): ShardOwner => ({
  ...createOwner(secret),
  type: "ShardOwner",
});

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
 *
 * @group Variants
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

/**
 * An {@link Owner} for collaborative data with write access.
 *
 * @group Variants
 */
export interface SharedOwner extends Owner, Typed<"SharedOwner"> {}

/**
 * Creates a {@link SharedOwner} from an {@link OwnerSecret} for collaborative
 * write access.
 *
 * Use {@link createSharedReadonlyOwner} to create a read-only version for
 * sharing.
 *
 * @group Variants
 */
export const createSharedOwner = (secret: OwnerSecret): SharedOwner => ({
  ...createOwner(secret),
  type: "SharedOwner",
});

/**
 * Read-only version of a {@link SharedOwner} for data sharing. Contains only the
 * {@link OwnerId} and {@link EncryptionKey} needed for others to read the shared
 * data without write access.
 *
 * @group Variants
 */
export interface SharedReadonlyOwner
  extends ReadonlyOwner, Typed<"SharedReadonlyOwner"> {}

/**
 * Creates a {@link SharedReadonlyOwner} from a {@link SharedOwner}.
 *
 * @group Variants
 */
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
 *
 * @group Transport
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
 * @group Transport
 */
export interface OwnerWebSocketTransport extends Typed<"WebSocket"> {
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
 * import {
 *   AppName,
 *   createAppOwner,
 *   createEvolu,
 *   createOwnerWebSocketTransport,
 *   createOwnerSecret,
 *   createRandomBytes,
 *   id,
 * } from "@evolu/common";
 *
 * // Create once, persist the mnemonic securely, and restore it on later runs.
 * const appOwner = createAppOwner(
 *   createOwnerSecret({ randomBytes: createRandomBytes() }),
 * );
 * const transport = createOwnerWebSocketTransport({
 *   url: "wss://relay.evolu.dev",
 *   ownerId: appOwner.id,
 * });
 * const createTodoEvolu = createEvolu(
 *   { todo: { id: id("Todo") } },
 *   {
 *     appName: AppName.orThrow("OwnerTransportExample"),
 *     appOwner,
 *     transports: [transport],
 *   },
 * );
 *
 * expect(createTodoEvolu).toBeTypeOf("function");
 * expect(transport).toEqual({
 *   type: "WebSocket",
 *   url: `wss://relay.evolu.dev?ownerId=${appOwner.id}`,
 * });
 * ```
 *
 * @group Transport
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
 * import {
 *   createAppOwner,
 *   createOwnerSecret,
 *   createRandomBytes,
 *   parseOwnerIdFromOwnerWebSocketTransportUrl,
 * } from "@evolu/common";
 *
 * // Create once, persist the mnemonic securely, and restore it on later runs.
 * const appOwner = createAppOwner(
 *   createOwnerSecret({ randomBytes: createRandomBytes() }),
 * );
 * const url = `/sync?ownerId=${appOwner.id}`;
 *
 * expect(parseOwnerIdFromOwnerWebSocketTransportUrl(url)).toBe(
 *   appOwner.id,
 * );
 * expect(
 *   parseOwnerIdFromOwnerWebSocketTransportUrl("/sync?ownerId=invalid"),
 * ).toBeNull();
 * ```
 *
 * @group Transport
 */
export const parseOwnerIdFromOwnerWebSocketTransportUrl = (
  url: string,
): OwnerId | null => getOrNull(OwnerId.fromUnknown(url.split("=")[1]));

/**
 * Common interface implemented by all owner domain errors.
 *
 * @group Core
 */
export interface OwnerError {
  readonly ownerId: OwnerId;
}

/**
 * Storage usage and timestamp bounds for an {@link Owner}.
 *
 * Storage and relay implementations use this metadata for quota enforcement and
 * timestamp insertion strategies.
 *
 * @group Core
 */
export interface OwnerUsage {
  /** Binary identifier of the {@link Owner} this usage belongs to. */
  readonly ownerId: OwnerIdBytes;

  /**
   * Total logical data bytes stored.
   *
   * Measures only {@link EncryptedDbChange} data and excludes {@link Storage}
   * implementation overhead such as indexes and skip-list columns. This makes
   * the measurement consistent across storage implementations and suitable for:
   *
   * - **Predictable measurement** - same data = same byte count across all
   *   instances
   * - **Quota enforcement** - limits independent of storage implementation
   * - **Overhead tracking** - comparison with actual storage size
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

/**
 * An {@link AppOwner} for encrypting device-only data.
 *
 * Device-only data belongs to the current device rather than to the synced app
 * identity. A common example is the last used {@link AppOwner}, which can be
 * stored so users do not need to enter the mnemonic every time they reopen the
 * app.
 *
 * This data must be encrypted because other OS processes may be able to read
 * unencrypted app-controlled storage such as `localStorage`, `IndexedDB`, or
 * similar stores.
 *
 * DeviceAppOwner is backed by a platform-specific secure primitive such as Expo
 * SecureStore, Electron safeStorage, or WebAuthn PRF.
 *
 * Use DeviceAppOwner with a local-only Evolu instance. Local-only means an
 * Evolu instance with empty transports (`transports: []`) so it does not sync
 * its AppOwner, and local-only (prefixed with "_") tables.
 *
 * A local-only Evolu instance is better than plain platform storage because
 * device-only data gets schema, reactivity, and the same cross-platform
 * behavior as the rest of Evolu.
 *
 * The local-only Evolu instance can still use other owners for sync via
 * `useOwner`. Use it for data that belongs to the current device rather than
 * the user app Evolu instance (news delivery etc.).
 *
 * DeviceAppOwner Evolu instance is secure only when its data stays on the
 * device.
 *
 * @group Variants
 */
export interface DeviceAppOwner extends AppOwner {
  readonly source: "ExpoSecureStore" | "WebAuthnPrf" | "ElectronSafeStorage";
}
