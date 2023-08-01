import { Brand, Context, Effect } from "effect";
import { urlAlphabet } from "nanoid";
import { Bip39, Hmac, Mnemonic, Sha512, slip21Derive } from "./Crypto.js";
import { Id } from "./Model.js";

/**
 * `Owner` represents the Evolu database owner. Evolu auto-generates `Owner`
 * on the first run. `Owner` can be reset on the current device and restored
 * on a different one.
 */
export interface Owner {
  /** The `Mnemonic` associated with `Owner`. */
  readonly mnemonic: Mnemonic;
  /** The unique identifier of `Owner` safely derived from its `Mnemonic`. */
  readonly id: OwnerId;
  /* The encryption key used by `Owner` derived from its `Mnemonic`. */
  readonly encryptionKey: Uint8Array;
}

export const Owner = Context.Tag<Owner>("evolu/Owner");

/**
 * The unique identifier of `Owner` safely derived from its `Mnemonic`.
 */
export type OwnerId = Id & Brand.Brand<"Owner">;

const seedToOwnerId = (
  seed: Uint8Array
): Effect.Effect<Hmac | Sha512, never, OwnerId> =>
  slip21Derive(seed, ["Evolu", "Owner Id"]).pipe(
    Effect.map((key) => {
      // convert key to nanoid
      let id = "";
      for (let i = 0; i < 21; i++) {
        id += urlAlphabet[key[i] & 63];
      }
      return id as OwnerId;
    })
  );

const seedToEncryptionKey = (
  seed: Uint8Array
): Effect.Effect<Hmac | Sha512, never, Uint8Array> =>
  slip21Derive(seed, ["Evolu", "Encryption Key"]);

export const makeOwner = (
  mnemonic?: Mnemonic
): Effect.Effect<Bip39 | Hmac | Sha512, never, Owner> =>
  Effect.gen(function* (_) {
    const bip39 = yield* _(Bip39);
    if (mnemonic == null) mnemonic = yield* _(bip39.makeMnemonic);
    const seed = yield* _(bip39.mnemonicToSeed(mnemonic));
    const id = yield* _(seedToOwnerId(seed));
    const encryptionKey = yield* _(seedToEncryptionKey(seed));
    return { mnemonic, id, encryptionKey };
  });
