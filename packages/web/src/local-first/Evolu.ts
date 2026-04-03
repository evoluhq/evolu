import type { ConsoleDep } from "@evolu/common";
import type {
  CreateDbWorker,
  DbWorkerInit,
  EvoluDeps,
  SharedWorkerInput,
} from "@evolu/common/local-first";
import { createEvoluDeps as createCommonEvoluDeps } from "@evolu/common/local-first";
import { reloadApp } from "../Platform.js";
import {
  createMessageChannel,
  createSharedWorker,
  createWorker,
} from "../Worker.js";

// // TODO: Redesign.
// // eslint-disable-next-line evolu/require-pure-annotation
// export const localAuth = createLocalAuth({
//   randomBytes: createRandomBytes(),
//   secureStorage: createWebAuthnStore({ randomBytes: createRandomBytes() }),
// });

/** Creates Evolu dependencies for the web platform. */
export const createEvoluDeps = (deps: Partial<ConsoleDep> = {}): EvoluDeps => {
  const createDbWorker: CreateDbWorker = () =>
    createWorker<DbWorkerInit, never>(
      new Worker(new URL("Db.worker.js", import.meta.url), {
        type: "module",
      }),
    );

  const sharedWorker = createSharedWorker<SharedWorkerInput>(
    new SharedWorker(new URL("Shared.worker.js", import.meta.url), {
      type: "module",
    }),
  );

  return createCommonEvoluDeps({
    ...deps,
    createDbWorker,
    createMessageChannel,
    reloadApp,
    sharedWorker,
  });
};
