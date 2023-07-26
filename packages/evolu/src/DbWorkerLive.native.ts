import { Layer } from "effect";
import { DbWorker } from "./DbWorker.js";

export const DbWorkerLive = Layer.succeed(
  DbWorker,
  DbWorker.of({
    postMessage: (_input) => {
      // // eslint-disable-next-line no-console
      // console.log(input);
    },
    onMessage: () => {},
  })
);
