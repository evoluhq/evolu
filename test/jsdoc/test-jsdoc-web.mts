/// <reference lib="webworker" />
/// <reference types="user-agent-data-types" />

import type { createEvoluDeps as createWebEvoluDeps } from "../../packages/web/src/local-first/index.ts";
import { createDocsEvoluDeps } from "./test-jsdoc-evolu-deps.mts";

export * from "../../packages/web/src/Platform.ts";
export * from "../../packages/web/src/Sqlite.ts";
export * from "../../packages/web/src/Task.ts";
export * from "../../packages/web/src/Worker.ts";
export * from "../../packages/web/src/local-first/index.ts";

/** Node.js has no web workers, so examples run Evolu in-process. */
export const createEvoluDeps: typeof createWebEvoluDeps = (deps) =>
  createDocsEvoluDeps(deps);
