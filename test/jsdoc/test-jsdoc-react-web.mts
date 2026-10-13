import type { createEvoluDeps as createReactWebEvoluDeps } from "../../packages/react-web/src/local-first/Evolu.ts";
import { flushSync } from "react-dom";
import { createDocsEvoluDeps } from "./test-jsdoc-evolu-deps.mts";

/** Node.js has no web workers, so examples run Evolu in-process. */
export const createEvoluDeps: typeof createReactWebEvoluDeps = (deps) => ({
  ...createDocsEvoluDeps(deps),
  flushSync: (callback) => {
    flushSync(callback);
  },
});
