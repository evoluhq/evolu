import { DbWorker, DbWorkerOutput, PlatformName } from "@evolu/common";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import * as Layer from "effect/Layer";

export const DbWorkerLive = Layer.effect(
  DbWorker,
  Effect.gen(function* (_) {
    const platformName = yield* _(PlatformName);

    // no-op for SSR
    if (platformName === "server")
      return DbWorker.of({
        postMessage: Function.constVoid,
        onMessage: Function.constVoid,
      });

    const worker = new Worker(new URL("DbWorker.worker.js", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (e: MessageEvent<DbWorkerOutput>): void => {
      dbWorker.onMessage(e.data);
    };

    const dbWorker: DbWorker = {
      postMessage: (input) => {
        worker.postMessage(input);
      },
      onMessage: Function.constVoid,
    };

    return dbWorker;
  }),
);
