import {
  Bip39,
  DbFactory,
  EvoluFactory,
  InvalidMnemonicError,
  Mnemonic,
  NanoIdGenerator,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AppStateLive, Bip39Live } from "./PlatformLive.js";

export * from "@evolu/common/public";

/** Parse a string to {@link Mnemonic}. */
export const parseMnemonic: (
  mnemonic: string,
) => Effect.Effect<Mnemonic, InvalidMnemonicError> = Bip39.pipe(
  Effect.provide(Bip39Live),
  Effect.runSync,
).parse;

export const EvoluFactoryReactNative = Layer.provide(
  EvoluFactory.Common,
  Layer.mergeAll(
    Layer.succeed(DbFactory, {
      createDb: Effect.sync(() => {
        throw "";
      }),
    }),
    NanoIdGenerator.Live,
    AppStateLive,
  ),
);

// JSDoc doesn't support destructured parameters, so we must copy-paste
// createEvolu docs from `evolu-common/src/Evolu.ts`.
// https://github.com/microsoft/TypeScript/issues/11859
export const {
  /**
   * Create Evolu from the database schema.
   *
   * Tables with a name prefixed with `_` are local-only, which means they are
   * never synced. It's useful for device-specific or temporal data.
   *
   * @example
   *   import * as S from "@effect/schema/Schema";
   *   import * as E from "@evolu/react-native";
   *
   *   const TodoId = E.id("Todo");
   *   type TodoId = S.Schema.Type<typeof TodoId>;
   *
   *   const TodoTable = E.table({
   *     id: TodoId,
   *     title: E.NonEmptyString1000,
   *   });
   *   type TodoTable = S.Schema.Type<typeof TodoTable>;
   *
   *   const Database = E.database({
   *     todo: TodoTable,
   *
   *     // Prefix `_` makes the table local-only (it will not sync)
   *     _todo: TodoTable,
   *   });
   *   type Database = S.Schema.Type<typeof Database>;
   *
   *   const evolu = E.createEvolu(Database);
   */
  createEvolu,
} = EvoluFactory.pipe(Effect.provide(EvoluFactoryReactNative), Effect.runSync);

export * from "@evolu/common-react";
