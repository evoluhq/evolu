import { exhaustiveCheck, type ConsoleDep } from "@evolu/common";
import type {
  SharedWorker as CommonSharedWorker,
  CreateDbWorker,
  DbWorkerInit,
  EvoluDeps,
  SharedWorkerInput,
  SharedWorkerOutput,
} from "@evolu/common/local-first";
import { createEvoluDeps as createCommonEvoluDeps } from "@evolu/common/local-first";
import { reloadApp } from "../Platform.ts";
import {
  createBroadcastChannel,
  createMessageChannel,
  createSharedWorker,
  createWorker,
  installOneTabSharedWorkerPolyfill,
} from "../Worker.ts";

// // TODO: Redesign.
// // eslint-disable-next-line evolu/require-pure-annotation
// export const localAuth = createLocalAuth({
//   randomBytes: createRandomBytes(),
//   secureStorage: createWebAuthnStore({ randomBytes: createRandomBytes() }),
// });

export interface SharedWorkerUnsupported {
  readonly type: "SharedWorkerUnsupported";
}

export interface SharedWorkerUnsupportedDep {
  readonly onSharedWorkerUnsupported: () => void;
}

/** Creates Evolu dependencies for the web platform. */
export const createEvoluDeps = (
  deps: Partial<ConsoleDep> & Partial<SharedWorkerUnsupportedDep> = {},
): EvoluDeps => {
  installOneTabSharedWorkerPolyfill();

  const createDbWorker: CreateDbWorker = () =>
    createWorker<DbWorkerInit, never>(
      new Worker(new URL("Db.worker.js", import.meta.url), {
        type: "module",
      }),
    );

  const webSharedWorker = createSharedWorker<
    SharedWorkerInput,
    SharedWorkerOutput
  >(
    new SharedWorker(new URL("Shared.worker.js", import.meta.url), {
      type: "module",
    }),
  );
  let onSharedWorkerMessage: ((message: SharedWorkerOutput) => void) | null =
    null;
  const sharedWorker: CommonSharedWorker = {
    ...webSharedWorker,
    port: {
      ...webSharedWorker.port,
      get onMessage() {
        return onSharedWorkerMessage;
      },
      set onMessage(fn) {
        onSharedWorkerMessage = fn;
        webSharedWorker.port.onMessage = fn
          ? (message: SharedWorkerOutput | SharedWorkerUnsupported) => {
              switch (message.type) {
                case "DbWorkerInit": {
                  fn(message);
                  break;
                }

                case "SharedWorkerUnsupported": {
                  if (deps.onSharedWorkerUnsupported) {
                    deps.onSharedWorkerUnsupported();
                  } else {
                    globalThis.alert(
                      "This browser supports Evolu in one tab only. Close this tab and use the already open tab.",
                    );
                  }
                  break;
                }

                default:
                  exhaustiveCheck(message);
              }
            }
          : null;
      },
    },
  };

  return createCommonEvoluDeps({
    ...deps,
    createDbWorker,
    createBroadcastChannel,
    createMessageChannel,
    lockManager: globalThis.navigator.locks,
    reloadApp,
    sharedWorker,
  });
};
