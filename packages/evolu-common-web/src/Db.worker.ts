import {
  NanoIdGenerator,
  SqliteFactory,
  SyncWorkerFactory,
  SyncWorkerService,
  Time,
  createDb,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Bip39Live } from "./PlatformLive.js";
import { expose, wrap } from "./ProxyWorker.js";
import { SqliteFactoryLive } from "./SqliteFactoryLive.js";

const SyncWorkerFactoryLive = Layer.succeed(SyncWorkerFactory, {
  createSyncWorker: Effect.sync(() => {
    const worker = new Worker(
      new URL("SyncWorker.worker.js", import.meta.url),
      { type: "module" },
    );
    return wrap<SyncWorkerService>(worker);
  }),
});

const layer = Layer.mergeAll(
  Bip39Live,
  SqliteFactory.Common.pipe(
    Layer.provide(SqliteFactoryLive),
    Layer.provide(NanoIdGenerator.Live),
  ),
  NanoIdGenerator.Live,
  Time.Live,
  SyncWorkerFactoryLive,
);

const worker = createDb.pipe(Effect.provide(layer), Effect.runSync);

expose(worker);
