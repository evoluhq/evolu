import * as BrowserWorker from "@effect/platform-browser/BrowserWorker";
import {
  Bip39,
  DbWorkerFactory,
  EvoluFactory,
  EvoluFactoryCommon,
  // FlushSyncDefaultLive,
  InvalidMnemonicError,
  Mnemonic,
  createDbWorker,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Bip39Live } from "./PlatformLive.js";

const DbWorkerFactoryWeb = Layer.succeed(DbWorkerFactory, {
  createDbWorker: Effect.provide(
    createDbWorker,
    BrowserWorker.layer(() => {
      console.log("new W");
      // ok, slava, hura, omg, ok
      // fake api? asi jo, ne? hlidaj to typy?
      //
      return new Worker(new URL("DbWorker.worker.js", import.meta.url), {
        type: "module",
      });
    }),
  ),
});

export const EvoluFactoryWeb = Layer.provide(
  EvoluFactoryCommon,
  DbWorkerFactoryWeb,
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
   *   import * as E from "@evolu/common-web";
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
} = EvoluFactory.pipe(Effect.provide(EvoluFactoryWeb), Effect.runSync);
