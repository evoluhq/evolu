import {
  NanoIdGenerator,
  SqliteFactory,
  SyncFactory,
  SyncService,
  Time,
  createDb,
} from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Bip39Live } from "./PlatformLive.js";
import { expose, wrap } from "./ProxyWorker.js";
import { SqliteFactoryLive } from "./SqliteFactoryLive.js";

const SyncFactoryLive = Layer.succeed(SyncFactory, {
  createSync: Effect.sync(() => {
    return wrap<SyncService>(
      new Worker(new URL("Sync.worker.js", import.meta.url), {
        type: "module",
      }),
    );
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
  SyncFactoryLive,
);

const worker = createDb.pipe(Effect.provide(layer), Effect.runSync);

expose(worker);
