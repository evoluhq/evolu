import {
  Bip39,
  EvoluCommonLive,
  InvalidMnemonicError,
  Mnemonic,
  makeCreateEvolu,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DbWorkerLive } from "./DbWorkerLive.js";
import {
  AppStateLive,
  Bip39Live,
  FlushSyncLive,
  PlatformNameLive,
} from "./PlatformLive.js";

/**
 * Create Evolu for the web.
 *
 * Tables with a name prefixed with `_` are local-only, which means they are
 * never synced. It's useful for device-specific or temporal data.
 *
 * @example
 *   import * as S from "@effect/schema/Schema";
 *   import { NonEmptyString1000, createEvolu, id } from "@evolu/react";
 *
 *   const TodoId = id("Todo");
 *   type TodoId = S.Schema.To<typeof TodoId>;
 *
 *   const TodoTable = S.struct({
 *     id: TodoId,
 *     title: NonEmptyString1000,
 *   });
 *   type TodoTable = S.Schema.To<typeof TodoTable>;
 *
 *   const Database = S.struct({
 *     // _todo is local-only table
 *     _todo: TodoTable,
 *     todo: TodoTable,
 *   });
 *   type Database = S.Schema.To<typeof Database>;
 *
 *   const evolu = createEvolu(Database);
 */
export const createEvolu = makeCreateEvolu(
  EvoluCommonLive.pipe(
    Layer.provide(Layer.merge(DbWorkerLive, AppStateLive)),
    Layer.provide(Layer.merge(PlatformNameLive, FlushSyncLive)),
  ),
);

/**
 * Parse a string to {@link Mnemonic}.
 *
 * This function is async because Bip39 is imported dynamically.
 */
export const parseMnemonic: (
  mnemonic: string,
) => Effect.Effect<never, InvalidMnemonicError, Mnemonic> = Bip39.pipe(
  Effect.provide(Bip39Live),
  Effect.runSync,
).parse;
