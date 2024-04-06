import { NanoIdGenerator, SqliteFactory, createDbWorker } from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Bip39Live } from "./PlatformLive.js";
import { expose } from "./ProxyWorker.js";
import { SqliteFactoryWeb } from "./SqliteLive.js";

const layer = Layer.mergeAll(
  Bip39Live,
  SqliteFactory.Common.pipe(
    Layer.provide(SqliteFactoryWeb),
    Layer.provide(NanoIdGenerator.Live),
  ),
  NanoIdGenerator.Live,
);

const worker = createDbWorker.pipe(Effect.provide(layer), Effect.runSync);

expose(worker);
