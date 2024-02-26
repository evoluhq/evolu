import {
  Bip39,
  DbWorkerLive,
  EvoluCommonLive,
  FetchLive,
  FlushSyncDefaultLive,
  InvalidMnemonicError,
  Mnemonic,
  NanoIdLive,
  SecretBoxLive,
  SyncWorkerLive,
  makeCreateEvolu,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  AppStateLive,
  Bip39Live,
  PlatformNameLive,
  SyncLockLive,
} from "./PlatformLive.js";
import { SqliteLive } from "./SqliteLive.js";

export * from "@evolu/common/public";

/** Parse a string to {@link Mnemonic}. */
export const parseMnemonic: (
  mnemonic: string,
) => Effect.Effect<Mnemonic, InvalidMnemonicError> = Bip39.pipe(
  Effect.provide(Bip39Live),
  Effect.runSync,
).parse;

/**
 * Create Evolu for React Native.
 *
 * Tables with a name prefixed with `_` are local-only, which means they are
 * never synced. It's useful for device-specific or temporal data.
 *
 * @example
 *   import * as S from "@effect/schema/Schema";
 *   import {
 *     NonEmptyString1000,
 *     createEvolu,
 *     id,
 *   } from "@evolu/react-native";
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
 *     todo: TodoTable,
 *   });
 *   type Database = S.Schema.To<typeof Database>;
 *
 *   const evolu = createEvolu(Database);
 */
export const createEvolu = makeCreateEvolu(
  EvoluCommonLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        FlushSyncDefaultLive,
        AppStateLive,
        DbWorkerLive,
        PlatformNameLive,
      ),
    ),
    Layer.provide(
      Layer.mergeAll(Bip39Live, NanoIdLive, SqliteLive, SyncWorkerLive),
    ),
    Layer.provide(Layer.mergeAll(SecretBoxLive, SyncLockLive, FetchLive)),
  ),
);

export * from "@evolu/common-react";
