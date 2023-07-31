import * as Schema from "@effect/schema/Schema";
import type { hmac } from "@noble/hashes/hmac";
import type { sha512 } from "@noble/hashes/sha512";
import { Brand, Context, Effect } from "effect";
import { Mnemonic } from "./Mnemonic.js";

export interface Bip39 {
  readonly makeMnemonic: Effect.Effect<never, never, Mnemonic>;
  readonly mnemonicToSeed: (
    mnemonic: Mnemonic
  ) => Effect.Effect<never, never, Uint8Array>;
}

export const Bip39 = Context.Tag<Bip39>();

export interface Hmac {
  readonly make: Effect.Effect<never, never, typeof hmac>;
}

export const Hmac = Context.Tag<Hmac>();

export interface Sha512 {
  readonly make: Effect.Effect<never, never, typeof sha512>;
}

export const Sha512 = Context.Tag<Sha512>();

/**
 * SLIP-21 implementation
 * https://github.com/satoshilabs/slips/blob/master/slip-0021.md
 */
export const slip21Derive = (
  seed: Uint8Array,
  path: string[]
): Effect.Effect<Hmac | Sha512, never, Uint8Array> =>
  Effect.all([Hmac, Sha512]).pipe(
    Effect.flatMap(([Hmac, Sha512]) =>
      Effect.all([Hmac.make, Sha512.make], {
        concurrency: "unbounded",
      })
    ),
    Effect.map(([hmac, sha512]) => {
      let m = hmac(sha512, "Symmetric key seed", seed);
      for (let i = 0; i < path.length; i++) {
        const p = new TextEncoder().encode(path[i]);
        const e = new Uint8Array(p.byteLength + 1);
        e[0] = 0;
        e.set(p, 1);
        m = hmac(sha512, m.slice(0, 32), e);
      }
      return m.slice(32, 64);
    })
  );

export const NodeId: Schema.BrandSchema<
  string,
  string & Brand.Brand<"NodeId">
> = Schema.string.pipe(Schema.pattern(/^[\w-]{16}$/), Schema.brand("NodeId"));
export type NodeId = Schema.To<typeof NodeId>;

export interface NanoId {
  readonly nanoid: Effect.Effect<never, never, string>;
  readonly nanoidAsNodeId: Effect.Effect<never, never, NodeId>;
}

export const NanoId = Context.Tag<NanoId>();

export const customAlphabetForNodeId = "0123456789abcdef";
