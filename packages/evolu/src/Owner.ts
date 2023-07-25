import { Brand, Context } from "effect";
import { Id } from "./Branded.js";
import { Mnemonic } from "./Mnemonic.js";

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

// export const selectOwner: Effect.Effect<Db, never, Owner> =

// pipe(
//   Db,
//   Effect.flatMap((db) =>
//     db.exec(`select "mnemonic", "id", "encryptionKey" from __owner limit 1`)
//   ),
//   Effect.map(([owner]) => owner as unknown as Owner)
// );
