import * as Effect from "effect/Effect";
import { expose } from "./ProxyWorker.js";
import { createSync } from "@evolu/common";

const worker = createSync.pipe(
  // Effect.provide(layer),
  Effect.runSync,
);

expose(worker);
