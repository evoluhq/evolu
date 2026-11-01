/**
 * Cryptographic identities that define ownership, encryption, sync, and
 * deletion boundaries for Evolu data.
 *
 * Every database change belongs to an {@link Owner} and is encrypted with its
 * {@link OwnerEncryptionKey}. Owners also make sync selective: only the
 * {@link AppOwner} is synced by default, while other owners can be synced when
 * needed.
 *
 * Individual changes in an append-only local-first history can only be marked
 * as deleted. Owners are meant to be the unit of real deletion: an entire owner
 * removed from devices and relays together with all of its data, while the
 * AppOwner remains to coordinate the deletion of other owners across devices.
 * Evolu doesn't implement owner deletion yet.
 *
 * Choose an owner by how its data should live and be shared:
 *
 * - {@link AppOwner} coordinates sync and persists for the lifetime of the app
 *   identity.
 * - {@link ShardOwner} partitions application data so it can be synced
 *   independently and, once Evolu implements owner deletion, deleted
 *   independently.
 * - {@link SharedOwner} grants collaborative read and write access.
 * - {@link SharedReadonlyOwner} grants read-only access to shared data.
 *
 * An {@link OwnerSecret} deterministically derives three independent values
 * using SLIP-21:
 *
 * - {@link OwnerId}: the identifier relays use to find the owner's data.
 * - {@link OwnerEncryptionKey}: the symmetric key that protects the data.
 * - {@link OwnerWriteKey}: the token that authorizes writes.
 *
 * Only holders of the encryption key can create an owner's changes. Each change
 * is encrypted and authenticated together with its timestamp, so a relay, or
 * anyone who can write to a relay for the owner, can store bytes for the owner
 * but cannot forge or move a change. A client stores only the changes it can
 * decrypt, verify, and decode, and syncs only what it stored. It skips any
 * other change, which sync state shows on the route of the relay that holds it,
 * and the relay offers it again on each sync until the client stores a valid
 * change with that timestamp.
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
  Entropy20,
  Entropy24,
  Entropy28,
  Entropy32,
  testCreateRandomBytes,
} from "../Crypto.ts";
import { testCreateRandomLib } from "../Random.ts";
import { err, getOrNull, ok, type Result } from "../Result.ts";
import {
  brand,
  Id,
  IdBytes,
  idBytesToId,
  idToIdBytes,
  Mnemonic,
  NonNegativeInt,
  String,
  transform,
  type Typed,
  type TypeError,
  union,
} from "../Type.ts";
import type { PositiveMillis } from "../Time.ts";
import { WebSocketUrl, WebSocketUrlFromString } from "../WebSocket.ts";
import type { EncryptedDbChange, Storage } from "./Storage.ts";

/**
 * {@link Owner} without a {@link OwnerWriteKey}.
 *
 * @group Core
 * @see {@link createSharedReadonlyOwner}
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
 * The initial key is derived from {@link OwnerSecret}. Relays keep the write key
 * of the first write they accept for an owner and reject any other, so a write
 * key can't be rotated yet: an owner with a key from {@link createOwnerWriteKey}
 * can't write to or sync with relays that already store its previous key.
 *
 * @group Core
 */
export const OwnerWriteKey = /*#__PURE__*/ brand("OwnerWriteKey", Entropy16);
export type OwnerWriteKey = typeof OwnerWriteKey.Output;

/**
 * Creates a random {@link OwnerWriteKey}. A relay that already stores another
 * write key for the owner rejects it, as {@link OwnerWriteKey} describes.
 *
 * @group Core
 */
export const createOwnerWriteKey = (deps: RandomBytesDep): OwnerWriteKey =>
  deps.randomBytes.create(16) as OwnerWriteKey;

/**
 * BIP-39 entropy used to derive {@link Owner} keys.
 *
 * A {@link Mnemonic} represents an OwnerSecret, so each valid mnemonic converts
 * to exactly one secret with {@link mnemonicToOwnerSecret} and back with
 * {@link ownerSecretToMnemonic}. A 24-word mnemonic holds 32 bytes, a 12-word
 * mnemonic holds 16 bytes, and 15, 18, and 21 words hold 20, 24, and 28 bytes.
 *
 * {@link createOwnerSecret} generates 32 random bytes, which keep the owner
 * post-quantum safe. The {@link OwnerId} is derived from the secret, and every
 * relay the owner uses knows it, so anyone who has it, such as a relay that
 * stores the owner's encrypted data, can test guesses of the secret offline,
 * and a quantum computer needs only about the square root of the guesses. 32
 * random bytes leave about 128 bits of security, while 16 bytes leave about 64.
 * A secret derived from a smaller root, such as a 20-word SLIP-39 share, is no
 * stronger than that root, whatever its length. Shorter secrets are accepted
 * for owners created outside Evolu, typically from 12-word mnemonics.
 *
 * @group Core
 */
export const OwnerSecret = /*#__PURE__*/ brand(
  "OwnerSecret",
  /*#__PURE__*/ union(Entropy16, Entropy20, Entropy24, Entropy28, Entropy32),
);
export type OwnerSecret = typeof OwnerSecret.Output;

/**
 * Creates a cryptographically random 32-byte {@link OwnerSecret}.
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
 * Converts a {@link Mnemonic} to the {@link OwnerSecret} it represents.
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
    createSlip21(secret, ["Evolu", "OwnerIdBytes"]).slice(
      0,
      16,
    ) as OwnerIdBytes,
  ),

  encryptionKey: createSlip21(secret, [
    "Evolu",
    "OwnerEncryptionKey",
  ]) as OwnerEncryptionKey,

  writeKey: createSlip21(secret, ["Evolu", "OwnerWriteKey"]).slice(
    0,
    16,
  ) as OwnerWriteKey,
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
 * {@link SharedOwner}, and delete that owner, which Evolu doesn't implement yet.
 * The AppOwner itself must be preserved because it coordinates deletion
 * information across devices. Other devices need to sync the information that
 * an owner was deleted so they can delete their local data as well.
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
 * because they can be conditionally synced and, once Evolu implements owner
 * deletion, completely deleted on relays and devices.
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

// Why WebSocket and not WebTransport: see
// docs/adr/sync-uses-websocket-not-webtransport.md.
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
 * ## OwnerId in the URL
 *
 * The {@link OwnerId} is passed as a URL query parameter, because browsers can't
 * set custom headers on a WebSocket handshake. URLs often get logged, and
 * whoever reads an OwnerId there can't decrypt changes but can download the
 * owner's encrypted changes and timestamps from the relay and subscribe to new
 * ones, as
 * [Privacy](https://www.evolu.dev/docs/privacy#relay-blindness-by-design)
 * describes. On a relay that hasn't stored the owner's write key yet, they can
 * also store their own and so lock the owner out of writing there.
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
 * ## Heartbeats
 *
 * The WebSocket API answers a relay's pings without telling JavaScript, in
 * browsers, React Native and Node alike, so a client cannot see whether an idle
 * connection still works. A relay therefore sends an empty text frame as the
 * first frame of every connection, and then at least every
 * {@link relayHeartbeatInterval} while nothing else is queued for the connection
 * and none of its requests is being served. Protocol messages are binary, so
 * text frames are reserved for heartbeats: a relay that sends one on a
 * connection promises them on that connection, and clients ignore their
 * content. Clients before `@evolu/common` 8.26.0 drop them unread.
 *
 * The client replaces a connection that has carried no frame for much longer
 * than the interval, so a relay sends no unsolicited frame larger than 1 MB,
 * and a proxy in front of it must allow more than one interval of idle time. A
 * relay that sends no heartbeats still works, but a client notices its silent
 * connections only through unanswered requests and system sleep.
 *
 * @group Transport
 * @see {@link createOwnerWebSocketTransport}
 * @see {@link parseOwnerIdFromOwnerWebSocketTransportUrl}
 */
export interface OwnerWebSocketTransport extends Typed<"WebSocket"> {
  readonly url: WebSocketUrl;
}

/**
 * The longest a relay waits between heartbeats on an idle connection, as
 * {@link OwnerWebSocketTransport} describes: thirty seconds.
 *
 * @group Transport
 */
export const relayHeartbeatInterval = 30_000 as PositiveMillis;

/**
 * Error returned when a {@link WebSocketUrl} is not a {@link RelayUrl}.
 *
 * @group Transport
 */
export interface RelayUrlError extends TypeError<"RelayUrl"> {
  readonly value: string;
}

/**
 * {@link WebSocketUrl} of a relay, which has no query, such as
 * `wss://free.evoluhq.com/`.
 *
 * {@link createOwnerWebSocketTransport} adds the {@link OwnerId} as the query. A
 * relay that admits a connection by a credential beyond the OwnerId, such as a
 * token that a reverse proxy checks, takes it in the path. Like WebSocketUrl,
 * RelayUrl does not normalize; use {@link RelayUrlFromString} to convert other
 * spellings, such as user input.
 *
 * ### Example
 *
 * ```ts
 * import { assertErr, assertOk, RelayUrl } from "@evolu/common";
 *
 * assertOk(
 *   RelayUrl.fromUnknown("wss://free.evoluhq.com/"),
 *   "wss://free.evoluhq.com/",
 * );
 *
 * assertErr(RelayUrl.fromUnknown("wss://free.evoluhq.com/?token=1"), {
 *   type: "RelayUrl",
 *   value: "wss://free.evoluhq.com/?token=1",
 * });
 * ```
 *
 * @group Transport
 */
export const RelayUrl = /*#__PURE__*/ brand(
  "RelayUrl",
  WebSocketUrl,
  (value: string) =>
    // Only a query adds "?" to a serialized URL without a fragment.
    value.includes("?")
      ? err<RelayUrlError>({ type: "RelayUrl", value })
      : ok(),
  (error) =>
    `The value ${JSON.stringify(error.value)} is not a relay URL, which has no query.`,
);
export type RelayUrl = typeof RelayUrl.Output;

/**
 * Error returned when {@link RelayUrlFromString} cannot parse a string as a
 * {@link RelayUrl}.
 *
 * @group Transport
 */
export interface RelayUrlFromStringError extends TypeError<"RelayUrlFromString"> {
  readonly value: string;
}

/**
 * Transforms a relay URL into its canonical {@link RelayUrl}.
 *
 * Accepts what {@link WebSocketUrlFromString} accepts when the result has no
 * query. Encoding returns the canonical spelling, not the original one.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   assertErr,
 *   assertOk,
 *   RelayUrlFromString,
 * } from "@evolu/common";
 *
 * assertOk(
 *   RelayUrlFromString.fromUnknown("wss://free.evoluhq.com"),
 *   "wss://free.evoluhq.com/",
 * );
 *
 * const invalid = RelayUrlFromString.fromUnknown("free.evoluhq.com");
 * assertErr(invalid, {
 *   type: "RelayUrlFromString",
 *   value: "free.evoluhq.com",
 * });
 * assertEqual(
 *   RelayUrlFromString.formatError(invalid.error),
 *   'The value "free.evoluhq.com" is not a valid relay URL.',
 * );
 * ```
 *
 * @group Transport
 */
export const RelayUrlFromString = /*#__PURE__*/ transform(
  "RelayUrlFromString",
  String,
  RelayUrl,
  {
    from: (value: string): Result<string, RelayUrlFromStringError> => {
      const url = WebSocketUrlFromString.fromUnknown(value);
      return url.ok && !url.value.includes("?")
        ? ok(url.value)
        : err({ type: "RelayUrlFromString", value });
    },
    to: (value: RelayUrl) => value,
  },
  (error) =>
    `The value ${JSON.stringify(error.value)} is not a valid relay URL.`,
);

/**
 * Creates an {@link OwnerWebSocketTransport} for the given {@link RelayUrl} and
 * {@link OwnerId}, which it adds as the `ownerId` query parameter.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   createEvolu,
 *   createOwnerWebSocketTransport,
 *   RelayUrl,
 *   testAppName,
 *   testAppOwner,
 *   testEvoluSchema,
 * } from "@evolu/common";
 *
 * const transport = createOwnerWebSocketTransport({
 *   url: RelayUrl.orThrow("wss://relay.evolu.dev/"),
 *   ownerId: testAppOwner.id,
 * });
 * const _createTodoEvolu = createEvolu(testEvoluSchema, {
 *   appName: testAppName,
 *   appOwner: testAppOwner,
 *   transports: [transport],
 * });
 *
 * assertEqual(transport, {
 *   type: "WebSocket",
 *   url: `wss://relay.evolu.dev/?ownerId=${testAppOwner.id}`,
 * });
 * ```
 *
 * @group Transport
 */
export const createOwnerWebSocketTransport = (config: {
  readonly url: RelayUrl;
  readonly ownerId: OwnerId;
}): OwnerWebSocketTransport => ({
  type: "WebSocket",
  // A RelayUrl has no query or fragment, and an OwnerId has only characters
  // that a query keeps, so the URL stays canonical.
  url: `${config.url}?ownerId=${config.ownerId}` as WebSocketUrl,
});

/**
 * Extracts {@link OwnerId} from the URL of an {@link OwnerWebSocketTransport} or
 * the request target of its handshake.
 *
 * Returns the `ownerId` query parameter if the query has exactly one and it is
 * a valid {@link OwnerId}, and `null` otherwise. Other query parameters are
 * ignored.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   assertEqual,
 *   parseOwnerIdFromOwnerWebSocketTransportUrl,
 *   testAppOwner,
 * } from "@evolu/common";
 *
 * assertEqual(
 *   parseOwnerIdFromOwnerWebSocketTransportUrl(
 *     `/sync?ownerId=${testAppOwner.id}`,
 *   ),
 *   testAppOwner.id,
 * );
 * assertEqual(
 *   parseOwnerIdFromOwnerWebSocketTransportUrl("/sync?ownerId=invalid"),
 *   null,
 * );
 * ```
 *
 * @group Transport
 */
export const parseOwnerIdFromOwnerWebSocketTransportUrl = (
  url: string,
): OwnerId | null => {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return null;
  const ownerIds = new URLSearchParams(url.slice(queryStart + 1)).getAll(
    "ownerId",
  );
  return ownerIds.length === 1
    ? getOrNull(OwnerId.fromUnknown(ownerIds[0]))
    : null;
};

/**
 * Common interface implemented by all owner domain errors.
 *
 * @group Core
 */
export interface OwnerError {
  readonly ownerId: OwnerId;
}

/**
 * Storage usage of an {@link Owner}.
 *
 * Storage and relay implementations use this metadata for quota enforcement.
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
   * the measurement consistent across storage implementations and suitable
   * for:
   *
   * - **Predictable measurement** - same data = same byte count across all
   *   instances
   * - **Quota enforcement** - limits independent of storage implementation
   * - **Overhead tracking** - comparison with actual storage size
   */
  readonly storedBytes: NonNegativeInt;
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
