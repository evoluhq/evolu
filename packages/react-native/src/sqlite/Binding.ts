/**
 * The version of `@evolu/common`'s {@link NativeSqlite} binding that the JSI
 * adapter in `cpp/` implements on React Native, as the N-API mirror of
 * `@evolu/sqlite-core`'s `node/binding.c` does in Node.js.
 * `test/bindingConformance.ts` pins that both behave alike.
 *
 * @module
 */
// Types only, since @evolu/common's main entry reads randomness at import,
// which the loader must not do before the polyfills install it.
import type { NativeSqlite } from "@evolu/common";

/** The {@link NativeSqlite.abiVersion} the loader checks. */
export const nativeSqliteAbiVersion = 1;
