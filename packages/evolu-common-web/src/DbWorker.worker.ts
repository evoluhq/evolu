import { NanoIdGeneratorLive, createDbWorker } from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { expose } from "./ProxyWorker.js";
import { SqliteFactoryWeb } from "./SqliteLive.js";

const worker = createDbWorker.pipe(
  Effect.provide(SqliteFactoryWeb.pipe(Layer.provide(NanoIdGeneratorLive))),
  Effect.runSync,
);

expose(worker);
