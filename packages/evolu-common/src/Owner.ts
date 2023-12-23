import * as Brand from "effect/Brand";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { urlAlphabet } from "nanoid";
import { Bip39, Mnemonic, slip21Derive } from "./Crypto.js";
import { Id } from "./Model.js";

/**
 * The Owner represents the Evolu database owner, a user. Instead of traditional
 * email with a password, the Owner uses a mnemonic, also known as a "seed
 * phrase," which is a set of 12 words in a specific order chosen from a
 * predefined list.
 *
 * The purpose of the BIP39 mnemonic is to provide a human-readable way of
 * storing a private key.
 *
 * Mnemonic is generated safely in the user's device and must not be shared with
 * anyone.
 */
export interface Owner {
  /** The {@link Mnemonic} associated with {@link Owner}. */
  readonly mnemonic: Mnemonic;

  /** The unique identifier safely derived from {@link Mnemonic}. */
  readonly id: OwnerId;

  /** The encryption key safely derived from {@link Mnemonic}. */
  readonly encryptionKey: Uint8Array;
}

export const Owner = Context.Tag<Owner>();

/**
 * The unique identifier of {@link Owner} safely derived from its
 * {@link Mnemonic}.
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
