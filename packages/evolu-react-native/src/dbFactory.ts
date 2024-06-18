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

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
export const NanoIdGeneratorLive = createNanoIdGeneratorLive(
  customAlphabet,
  nanoid,
);

export const SyncFactoryLive = Layer.succeed(SyncFactory, {
  createSync: Effect.provide(createSync, SecretBox.Live),
});

export const SqliteFactoryLive = Layer.succeed(SqliteFactory, {
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
