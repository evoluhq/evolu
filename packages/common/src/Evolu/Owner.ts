import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { NonEmptyReadonlyArray } from "../Array.js";
import {
  CreateRandomBytesDep,
  createSlip21,
  createSlip21Id,
  EncryptionKey,
} from "../Crypto.js";
import {
  brand,
  Id,
  length,
  Mnemonic,
  NonNegativeInt,
  Uint8Array,
} from "../Type.js";
import { Transport } from "./Transport.js";

/** 16 bytes of cryptographic entropy used to derive {@link Owner} keys. */
export const OwnerSecret = brand("OwnerSecret", length(16)(Uint8Array));
export type OwnerSecret = typeof OwnerSecret.Type;

/** Creates a randomly generated {@link OwnerSecret}. */
export const createOwnerSecret = (deps: CreateRandomBytesDep): OwnerSecret =>
  deps.createRandomBytes(16) as OwnerSecret;

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
 * By default, all changes are assigned to the {@link AppOwner}, but additional
 * owners can be used for:
 *
 * - **Partial sync**: {@link ShardOwner} for isolating optional or heavy data
 * - **Collaboration**: {@link SharedOwner} for collaborative write access
 * - **Data sharing**: {@link SharedReadonlyOwner} for read-only access to shared
 *   data
 *
 * Owners are cryptographically derived from an {@link OwnerSecret} using SLIP-21
 * key derivation, ensuring secure and deterministic key generation:
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

export const writeKeyLength = 16 as NonNegativeInt;

/**
 * A secure token for write operations. Can be generated via
 * {@link createWriteKey} and is rotatable.
 */
export const WriteKey = brand("WriteKey", length(writeKeyLength)(Uint8Array));
export type WriteKey = typeof WriteKey.Type;

/** Creates a randomly generated {@link WriteKey}. */
export const createWriteKey = (deps: CreateRandomBytesDep): WriteKey =>
  deps.createRandomBytes(16) as unknown as WriteKey;

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
export const createOwner = (secret: OwnerSecret): Owner => ({
  id: createSlip21Id(secret, ["Evolu", "Owner Id"]) as OwnerId,

  encryptionKey: createSlip21(secret, [
    "Evolu",
    "Encryption Key",
  ]) as EncryptionKey,

  writeKey: createSlip21(secret, ["Evolu", "Write Key"]).slice(
    0,
    16,
  ) as WriteKey,
});

/**
 * The owner representing app data. Can be created from a {@link Mnemonic} or
 * from external keys when the mnemonic should not be shared with the Evolu
 * app.
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
 * An {@link Owner} to isolate data that is optional, heavy, or not needed during
 * the initial sync.
 */
export interface ShardOwner extends Owner {
  readonly type: "ShardOwner";
  readonly transports?: ReadonlyArray<Transport>;
}

/** Creates a {@link ShardOwner} from an {@link OwnerSecret}. */
export const createShardOwner = (
  secret: OwnerSecret,
  transports?: ReadonlyArray<Transport>,
): ShardOwner => {
  return {
    type: "ShardOwner",
    ...createOwner(secret),
    ...(transports && { transports }),
  };
};

/**
 * Derives a {@link ShardOwner} from an {@link AppOwner} using the specified path.
 * The advantage of derived ShardOwner is that it can be hardcoded so different
 * devices can use it immediately before they are synced.
 */
export const deriveShardOwner = (
  owner: AppOwner,
  path: NonEmptyReadonlyArray<string>,
  transports?: ReadonlyArray<Transport>,
): ShardOwner => {
  const secret = createSlip21(owner.encryptionKey, path).slice(
    0,
    16,
  ) as OwnerSecret;

  return {
    type: "ShardOwner",
    ...createOwner(secret),
    ...(transports && { transports }),
  };
};

/** An {@link Owner} for collaborative data with write access. */
export interface SharedOwner extends Owner {
  readonly type: "SharedOwner";
  readonly transports?: ReadonlyArray<Transport>;
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
  transports?: ReadonlyArray<Transport>,
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
}

/** Creates a {@link SharedReadonlyOwner} from a {@link SharedOwner}. */
export const createSharedReadonlyOwner = (
  sharedOwner: SharedOwner,
): SharedReadonlyOwner => ({
  type: "SharedReadonlyOwner",
  id: sharedOwner.id,
  encryptionKey: sharedOwner.encryptionKey,
});
