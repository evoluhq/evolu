import "@effect/schema/Schema";
import { Layer } from "effect";
import { DbWorker } from "./DbWorker.js";
import { makeEvoluCreate } from "./index.common.js";
export * from "./exports.js";

const DbWorkerLive = Layer.succeed(
  DbWorker,
  DbWorker.of({
    postMessage: (_input) => {
      // // eslint-disable-next-line no-console
      // console.log(input);
    },
    onMessage: () => {},
  })
);

export const create = makeEvoluCreate(DbWorkerLive);
