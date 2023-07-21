import { Effect, Layer } from "effect";
import { DbWorker } from "./DbWorker.js";

export const DbWorkerNative = Layer.succeed(
  DbWorker,
  DbWorker.of({
    post: (_input) => {
      // // eslint-disable-next-line no-console
      // console.log(input);
      return Effect.succeed(undefined);
    },
    onMessage: () => {},
  })
);
