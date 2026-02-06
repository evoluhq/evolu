import type { EvoluDeps } from "@evolu/common/local-first";
import { createEvoluDeps as createCommonEvoluDeps } from "@evolu/common/local-first";
import { reloadApp } from "../Platform.js";

// // TODO: Redesign.
// // eslint-disable-next-line evolu/require-pure-annotation
// export const localAuth = createLocalAuth({
//   randomBytes: createRandomBytes(),
//   secureStorage: createWebAuthnStore({ randomBytes: createRandomBytes() }),
// });

/** Creates Evolu dependencies for the web platform. */
export const createEvoluDeps = (): EvoluDeps =>
  createCommonEvoluDeps({ reloadApp });
// const evoluWorker = createSharedWorker<EvoluWorkerInput>(
//   new SharedWorker(new URL("Worker.worker.js", import.meta.url), {
//     type: "module",
//   }),
// );

// return createCommonEvoluDeps({
//   createMessageChannel,
//   reloadApp,
//   evoluWorker,
// });
