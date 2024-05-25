import {
  DbFactory,
  EvoluFactory,
  SecretBox,
  Sqlite,
  SqliteFactory,
  SyncFactory,
  Time,
  createDb,
  createNanoIdGeneratorLive,
  createSync,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
// @ts-expect-error https://github.com/ai/nanoid/issues/468
import { customAlphabet, nanoid } from "nanoid/index.browser.js";
import { AppStateLive, SyncLockLive } from "./PlatformLive.js";
import { SqliteLive } from "./SqliteLive.js";

export * from "@evolu/common/public";

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
const NanoIdGeneratorLive = createNanoIdGeneratorLive(customAlphabet, nanoid);

const SyncFactoryLive = Layer.succeed(SyncFactory, {
  createSync: Effect.provide(createSync, SecretBox.Live),
});

const SqliteFactoryLive = Layer.succeed(SqliteFactory, {
  createSqlite: Sqlite.pipe(Effect.provide(SqliteLive)),
});

export const EvoluFactoryReactNative = Layer.provide(
  EvoluFactory.Common,
  Layer.mergeAll(
    Layer.succeed(DbFactory, {
      createDb: createDb.pipe(
        Effect.provide(
          Layer.mergeAll(
            SqliteFactory.Common.pipe(
              Layer.provide(SqliteFactoryLive),
              Layer.provide(NanoIdGeneratorLive),
            ),
            NanoIdGeneratorLive,
            Time.Live,
            SyncFactoryLive,
            SyncLockLive,
          ),
        ),
      ),
    }),
    NanoIdGeneratorLive,
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
   *   type TodoId = typeof TodoId.Type;
   *
   *   const TodoTable = E.table({
   *     id: TodoId,
   *     title: E.NonEmptyString1000,
   *   });
   *   type TodoTable = typeof TodoTable.Type;
   *
   *   const Database = E.database({
   *     todo: TodoTable,
   *
   *     // Prefix `_` makes the table local-only (it will not sync)
   *     _todo: TodoTable,
   *   });
   *   type Database = typeof Database.Type;
   *
   *   const evolu = E.createEvolu(Database);
   */
  createEvolu,
} = EvoluFactory.pipe(Effect.provide(EvoluFactoryReactNative), Effect.runSync);

export * from "@evolu/common-react";
