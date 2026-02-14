import type { ConsoleDep } from "@evolu/common";
import type { EvoluDeps, SharedWorkerInput } from "@evolu/common/local-first";
import { createEvoluDeps as createCommonEvoluDeps } from "@evolu/common/local-first";
import { reloadApp } from "../Platform.js";
import { createMessageChannel, createSharedWorker } from "../Worker.js";

// // TODO: Redesign.
// // eslint-disable-next-line evolu/require-pure-annotation
// export const localAuth = createLocalAuth({
//   randomBytes: createRandomBytes(),
//   secureStorage: createWebAuthnStore({ randomBytes: createRandomBytes() }),
// });

/** Creates Evolu dependencies for the web platform. */
export const createEvoluDeps = (deps: Partial<ConsoleDep> = {}): EvoluDeps => {
  const sharedWorker = createSharedWorker<SharedWorkerInput>(
    new SharedWorker(new URL("Worker.worker.js", import.meta.url), {
      type: "module",
    }),
  );

  return createCommonEvoluDeps({
    ...deps,
    createMessageChannel,
    reloadApp,
    sharedWorker,
  });
};
