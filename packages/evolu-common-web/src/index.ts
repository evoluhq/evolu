import {
  Bip39,
  EvoluCommonLive,
  FlushSyncDefaultLive,
  InvalidMnemonicError,
  makeCreateEvolu,
  Mnemonic,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DbWorkerLive } from "./DbWorkerLive.js";
import { AppStateLive, Bip39Live, PlatformNameLive } from "./PlatformLive.js";

export const EvoluWebLive = EvoluCommonLive.pipe(
  Layer.provide(Layer.merge(DbWorkerLive, AppStateLive)),
  Layer.provide(PlatformNameLive),
);

/**
 * Parse a string to {@link Mnemonic}.
 *
 * This function is async because Bip39 is imported dynamically.
 */
export const parseMnemonic: (
  mnemonic: string,
) => Effect.Effect<Mnemonic, InvalidMnemonicError> = Bip39.pipe(
  Effect.provide(Bip39Live),
  Effect.runSync,
).parse;


/**
 * Create Evolu Instance.
 *
 * Tables with a name prefixed with `_` are local-only, which means they are
 * never synced. It's useful for device-specific or temporal data.
 *
 * @example
 *   import * as S from "@effect/schema/Schema";
 *   import { NonEmptyString1000, id } from "@evolu/common";
 *   import { createEvolu } from "@evolu/common-web";
 *
 *   const TodoId = id("Todo");
 *   type TodoId = S.Schema.To<typeof TodoId>;
 *
 *   const TodoTable = table({
 *     id: TodoId,
 *     title: NonEmptyString1000,
 *   });
 *   type TodoTable = S.Schema.To<typeof TodoTable>;
 *
 *   const Database = database({
 *     // _todo is local-only table
 *     _todo: TodoTable,
 *     todo: TodoTable,
 *   });
 *   type Database = S.Schema.To<typeof Database>;
 *
 *   const evolu = createEvolu(Database);
 */
export const createEvolu = makeCreateEvolu(
  EvoluWebLive.pipe(Layer.provide(FlushSyncDefaultLive)),
);
