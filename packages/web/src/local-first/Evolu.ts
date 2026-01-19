import { createLocalAuth, createRandomBytes } from "@evolu/common";
import type { EvoluDeps, EvoluWorkerInput } from "@evolu/common/local-first";
import { createEvoluDeps as createCommonEvoluDeps } from "@evolu/common/local-first";
import { reloadApp } from "../Platform.js";
import { createMessageChannel, createSharedWorker } from "../Worker.js";
import { createWebAuthnStore } from "./LocalAuth.js";

// TODO: Redesign.
export const localAuth = createLocalAuth({
  randomBytes: createRandomBytes(),
  secureStorage: createWebAuthnStore({ randomBytes: createRandomBytes() }),
});

/** Creates Evolu dependencies for the web platform. */
export const createEvoluDeps = (): EvoluDeps => {
  const evoluWorker = createSharedWorker<EvoluWorkerInput>(
    new SharedWorker(new URL("Worker.worker.js", import.meta.url), {
      type: "module",
    }),
  );

  return createCommonEvoluDeps({
    createMessageChannel,
    reloadApp,
    evoluWorker,
  });
};
