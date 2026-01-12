import { createLocalAuth, createRandomBytes } from "@evolu/common";
import { createEvoluDeps as createCommonEvoluDeps } from "@evolu/common/local-first";
import type { EvoluDeps, SharedWorkerInput } from "@evolu/common/local-first";
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
  const sharedWorker = createSharedWorker<SharedWorkerInput>(
    new SharedWorker(new URL("SharedWorker.worker.js", import.meta.url), {
      type: "module",
    }),
  );

  return createCommonEvoluDeps({
    createMessageChannel,
    reloadApp,
    sharedWorker,
  });
};
