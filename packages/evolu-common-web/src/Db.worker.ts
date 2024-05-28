import {
  SqliteFactory,
  Sync,
  SyncFactory,
  Time,
  createDb,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { NanoIdGeneratorLive } from "./NanoIdGeneratorLive.js";
import { SyncLockLive } from "./PlatformLive.js";
import { expose, wrap } from "./ProxyWorker.js";
import { SqliteFactoryLive } from "./SqliteFactoryLive.js";

const SyncFactoryLive = Layer.succeed(SyncFactory, {
  createSync: Effect.sync(() =>
    wrap<Sync>(
      new Worker(new URL("Sync.worker.js", import.meta.url), {
        type: "module",
      }),
    ),
  ),
});

createDb.pipe(
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
  Effect.runSync,
  expose,
);
