import { constVoid, createLocalAuth, createRandomBytes } from "@evolu/common";
import {
  createEvoluDeps as createCommonEvoluDeps,
  EvoluDeps,
  type SharedWorker,
} from "@evolu/common/local-first";
import { reloadApp } from "../Platform.js";
import { createSharedWorker, type SharedWorkerError } from "../Worker.js";
import { createWebAuthnStore } from "./LocalAuth.js";

// TODO: Redesign.
export const localAuth = createLocalAuth({
  randomBytes: createRandomBytes(),
  secureStorage: createWebAuthnStore({ randomBytes: createRandomBytes() }),
});

/** Creates Evolu dependencies for the web platform. */
export const createEvoluDeps = (options?: {
  readonly onError?: (error: SharedWorkerError) => void;
}): EvoluDeps => {
  const sharedWorker: SharedWorker = createSharedWorker(
    () =>
      new globalThis.SharedWorker(
        new URL("SharedWorker.worker.js", import.meta.url),
        { type: "module" },
      ),
    options?.onError ?? constVoid,
  );

  return createCommonEvoluDeps({ sharedWorker, reloadApp });
};
