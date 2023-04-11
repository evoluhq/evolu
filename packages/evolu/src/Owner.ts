import * as Brand from "@effect/data/Brand";
import * as Either from "@effect/data/Either";
import * as Effect from "@effect/io/Effect";
import { urlAlphabet } from "nanoid";
import * as Mnemonic from "./Mnemonic.js";
import * as Model from "./Model.js";
import { pipe } from "@effect/data/Function";

/**
 * The current user's {@link Model.Id} safely derived from its {@link Mnemonic}.
 */
export type Id = Model.Id & Brand.Brand<"Owner">;

/**
 * `Owner` represents the Evolu database owner. Evolu auto-generates `Owner`
 * on the first run. `Owner` can be reset on the current device and restored
 * on a different one.
 */
export interface Owner {
  /** The `Mnemonic` associated with `Owner`. */
  readonly mnemonic: Mnemonic.Mnemonic;
  /** The unique identifier of `Owner` derived from its `Mnemonic`. */
  readonly id: Id;
  /* The encryption key used by `Owner` derived from its `Mnemonic`. */
  readonly encryptionKey: Uint8Array;
}

export const createOwner = (
  mnemonic?: Mnemonic.Mnemonic
): Effect.Effect<never, never, Owner> =>
  pipe(
    Effect.allPar(
      mnemonic ? Effect.succeed(mnemonic) : Mnemonic.generate(),
      Effect.promise(() => import("@scure/bip39")),
      Effect.promise(() => import("@noble/hashes/hmac")),
      Effect.promise(() => import("@noble/hashes/sha512"))
    ),
    Effect.flatMap(
      ([mnemonic, { mnemonicToSeedSync }, { hmac }, { sha512 }]) => {
        // SLIP-21 implementation
        // https://github.com/satoshilabs/slips/blob/master/slip-0021.md
        const slip21Derive = (seed: Uint8Array, path: string[]): Uint8Array => {
          let m = hmac(sha512, "Symmetric key seed", seed);
          for (let i = 0; i < path.length; i++) {
            const p = new TextEncoder().encode(path[i]);
            const e = new Uint8Array(p.byteLength + 1);
            e[0] = 0;
            e.set(p, 1);
            m = hmac(sha512, m.slice(0, 32), e);
          }
          return m.slice(32, 64);
        };

        const seedToId = (seed: Uint8Array): Id => {
          const key = slip21Derive(seed, ["Evolu", "Owner Id"]);
          // convert key to nanoid
          let id = "";
          for (let i = 0; i < 21; i++) {
            id += urlAlphabet[key[i] & 63];
          }
          return id as Id;
        };

        const seedToEncryptionKey = (seed: Uint8Array): Uint8Array =>
          slip21Derive(seed, ["Evolu", "Encryption Key"]);

        // always use empty passphrase
        const seed = mnemonicToSeedSync(mnemonic, "");

        const id = seedToId(seed);
        const encryptionKey = seedToEncryptionKey(seed);

        const owner: Owner = { mnemonic, id, encryptionKey };
        return Effect.succeed(owner);
      }
    )
  );

export interface RestoreOwnerError {
  readonly _tag: "RestoreOwner";
}

export interface Actions {
  /**
   * Use `reset` to delete all local data from the current device.
   * After the deletion, Evolu reloads all browser tabs that use Evolu.
   */
  readonly reset: () => void;

  /**
   * Use `restore` to restore `Owner` with synced data on a different device.
   */
  readonly restore: (
    mnemonic: string
  ) => Promise<Either.Either<RestoreOwnerError, void>>;
}
