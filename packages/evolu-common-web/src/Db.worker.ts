import {
  NanoIdGenerator,
  SqliteFactory,
  Sync,
  SyncFactory,
  Time,
  createDb,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Bip39Live, SyncLockLive } from "./PlatformLive.js";
import { expose, wrap } from "./ProxyWorker.js";
import { SqliteFactoryLive } from "./SqliteFactoryLive.js";

const SyncFactoryLive = Layer.succeed(SyncFactory, {
  createSync: Effect.sync(() => {
    return wrap<Sync>(
      new Worker(new URL("Sync.worker.js", import.meta.url), {
        type: "module",
      }),
    );
  }),
});

createDb.pipe(
  Effect.provide(
    Layer.mergeAll(
      Bip39Live,
      SqliteFactory.Common.pipe(
        Layer.provide(SqliteFactoryLive),
        Layer.provide(NanoIdGenerator.Live),
      ),
      NanoIdGenerator.Live,
      Time.Live,
      SyncFactoryLive,
      SyncLockLive,
    ),
  ),
  Effect.runSync,
  expose,
);
