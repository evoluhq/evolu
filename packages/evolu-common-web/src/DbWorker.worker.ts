// import * as BrowserRunner from "@effect/platform-browser/BrowserWorkerRunner";
// import * as Runner from "@effect/platform/WorkerRunner";
// import { ConfigTag, DbWorkerMessage } from "@evolu/common";
// import * as Effect from "effect/Effect";
// import * as Layer from "effect/Layer";

import { DbWorker } from "@evolu/common";
import * as Comlink from "comlink";

// Runner.layerSerialized(DbWorkerMessage, {
//   InitialMessage: (req) => Layer.succeed(ConfigTag, req.config),

//   GetUserById: (_req) => Effect.map(ConfigTag, (config) => config.name),
// }).pipe(Layer.provide(BrowserRunner.layer), Layer.launch, Effect.runFork);

const worker: DbWorker = {
  getUserById: ({ id }) => Promise.resolve(id.toString()),
};

Comlink.expose(worker);
