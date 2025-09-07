import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { NonEmptyReadonlyArray } from "../Array.js";
import { Brand } from "../Brand.js";
import {
  createSlip21,
  EncryptionKey,
  Entropy16,
  Entropy32,
  RandomBytesDep,
} from "../Crypto.js";
import {
  BinaryId,
  binaryIdToId,
  brand,
  createIdFromHash,
  Id,
  idToBinaryId,
  Mnemonic,
  NonNegativeInt,
} from "../Type.js";
import { TransportConfig } from "./Config.js";

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
 * The Owner represents ownership of data in Evolu. Every database change is
 * assigned to an owner, enabling sync functionality and access control.
 *
 * Owners enable **partial sync** - applications can choose which owners to
 * sync, allowing selective data synchronization based on specific needs.
 *
 * Owners also provide **real data deletion** - while individual changes in
 * local-first/distributed systems can only be marked as deleted, entire owners
 * can be completely deleted from both relays and devices (except for
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
 * - {@link EncryptionKey}: Symmetric encryption key for data protection
 * - {@link WriteKey}: Authentication token for write operations (rotatable)
 *
 * @see {@link createOwner}
 */
export interface Owner {
  readonly id: OwnerId;
  readonly encryptionKey: EncryptionKey;
  readonly writeKey: WriteKey;
}

/** The unique identifier of an {@link Owner}. */
export const OwnerId = brand("OwnerId", Id);
export type OwnerId = typeof OwnerId.Type;

/** Binary representation of {@link OwnerId}. */
export type BinaryOwnerId = BinaryId & Brand<"BinaryOwnerId">;

export const ownerIdToBinaryOwnerId = (ownerId: OwnerId): BinaryOwnerId =>
  idToBinaryId(ownerId) as BinaryOwnerId;

export const binaryOwnerIdToOwnerId = (binaryOwnerId: BinaryOwnerId): OwnerId =>
  binaryIdToId(binaryOwnerId as BinaryId) as OwnerId;

export const writeKeyLength = 16 as NonNegativeInt;

/**
 * A secure token for write operations. It's derived from {@link OwnerSecret} by
 * default and can be rotated via {@link createWriteKey}.
 */
export const WriteKey = brand("WriteKey", Entropy16);
export type WriteKey = typeof WriteKey.Type;

/** Creates a randomly generated {@link WriteKey}. */
export const createWriteKey = (deps: RandomBytesDep): WriteKey =>
  deps.randomBytes.create(16) as WriteKey;

/**
 * Creates an {@link Owner} from a {@link OwnerSecret} using SLIP-21 key
 * derivation.
 *
 * This is an internal helper function, use:
 *
 * - {@link createAppOwner}
 * - {@link createShardOwner}
 * - {@link createSharedOwner}
 * - {@link createSharedReadonlyOwner}
 */
export const createOwner = (secret: OwnerSecret): Owner => {
  const id = OwnerId.fromOrThrow(
    createIdFromHash(createSlip21(secret, ["Evolu", "Owner Id"])),
  );

  const encryptionKey = EncryptionKey.fromOrThrow(
    createSlip21(secret, ["Evolu", "Encryption Key"]),
  );

  const writeKey = WriteKey.fromOrThrow(
    createSlip21(secret, ["Evolu", "Write Key"]).slice(0, 16),
  );

  return { id, encryptionKey, writeKey };
};

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
 */
export interface AppOwner extends Owner {
  readonly type: "AppOwner";

  /**
   * The mnemonic that was used to derive the AppOwner keys. Optional when the
   * AppOwner is created from external keys to avoid sharing the mnemonic with
   * the Evolu app.
   */
  readonly mnemonic?: Mnemonic | null;
}

/** Creates an {@link AppOwner} from an {@link OwnerSecret}. */
export const createAppOwner = (secret: OwnerSecret): AppOwner => ({
  type: "AppOwner",
  mnemonic: ownerSecretToMnemonic(secret),
  ...createOwner(secret),
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
  readonly transports?: ReadonlyArray<TransportConfig>;
}

/** Creates a {@link ShardOwner} from an {@link OwnerSecret}. */
export const createShardOwner = (
  secret: OwnerSecret,
  transports?: ReadonlyArray<TransportConfig>,
): ShardOwner => {
  return {
    type: "ShardOwner",
    ...createOwner(secret),
    ...(transports && { transports }),
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
  transports?: ReadonlyArray<TransportConfig>,
): ShardOwner => {
  const secret = createSlip21(owner.encryptionKey, path) as OwnerSecret;

  return {
    type: "ShardOwner",
    ...createOwner(secret),
    ...(transports && { transports }),
  };
};

/** An {@link Owner} for collaborative data with write access. */
export interface SharedOwner extends Owner {
  readonly type: "SharedOwner";
  readonly transports?: ReadonlyArray<TransportConfig>;
}

/**
 * Creates a {@link SharedOwner} from an {@link OwnerSecret} for collaborative
 * write access.
 *
 * Use {@link createSharedReadonlyOwner} to create a read-only version for
 * sharing.
 */
export const createSharedOwner = (
  secret: OwnerSecret,
  transports?: ReadonlyArray<TransportConfig>,
): SharedOwner => {
  return {
    type: "SharedOwner",
    ...createOwner(secret),
    ...(transports && { transports }),
  };
};

/**
 * Read-only version of a {@link SharedOwner} for data sharing. Contains only the
 * {@link OwnerId} and {@link EncryptionKey} needed for others to read the shared
 * data without write access.
 */
export interface SharedReadonlyOwner {
  readonly type: "SharedReadonlyOwner";
  readonly id: OwnerId;
  readonly encryptionKey: EncryptionKey;
  readonly transports?: ReadonlyArray<TransportConfig>;
}

/** Creates a {@link SharedReadonlyOwner} from a {@link SharedOwner}. */
export const createSharedReadonlyOwner = (
  sharedOwner: SharedOwner,
): SharedReadonlyOwner => ({
  type: "SharedReadonlyOwner",
  id: sharedOwner.id,
  encryptionKey: sharedOwner.encryptionKey,
  ...(sharedOwner.transports && { transports: sharedOwner.transports }),
});
