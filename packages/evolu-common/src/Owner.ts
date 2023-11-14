import { Brand, Context, Effect } from "effect";
import { urlAlphabet } from "nanoid";
import { Bip39, Mnemonic, slip21Derive } from "./Crypto.js";
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

export const Owner = Context.Tag<Owner>();
/**
 * The unique identifier of `Owner` safely derived from its `Mnemonic`.
 */

export type OwnerId = Id & Brand.Brand<"Owner">;

export const makeOwner = (
  mnemonic?: Mnemonic,
): Effect.Effect<Bip39, never, Owner> =>
  Effect.gen(function* (_) {
    const bip39 = yield* _(Bip39);

    if (mnemonic == null) mnemonic = yield* _(bip39.make);

    const seed = yield* _(bip39.toSeed(mnemonic));

    const id = yield* _(
      slip21Derive(seed, ["Evolu", "Owner Id"]).pipe(
        Effect.map((key) => {
          // convert key to nanoid
          let id = "";
          for (let i = 0; i < 21; i++) {
            id += urlAlphabet[key[i] & 63];
          }
          return id as OwnerId;
        }),
      ),
    );

    const encryptionKey = yield* _(
      slip21Derive(seed, ["Evolu", "Encryption Key"]),
    );

    return { mnemonic, id, encryptionKey };
  });
