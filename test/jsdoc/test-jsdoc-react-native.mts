/// <reference lib="dom" />

// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers -- Includes global declarations during type-checking without emitting a runtime import.
import type {} from "../../packages/react-native/src/ErrorUtils.d.ts";

import type { createEvoluDeps as createNativeEvoluDeps } from "../../packages/react-native/src/createEvoluDeps.ts";
import { createDocsEvoluDeps } from "./test-jsdoc-evolu-deps.mts";

export { lockManager } from "../../packages/react-native/src/LockManager.ts";
export { createRun } from "../../packages/react-native/src/Task.ts";
// The main entry's names as types, so a @ts-expect-error for a name the main
// entry no longer exports, such as the changeset's for EvoluIdenticon, fails
// once it exports that name again. The local value exports shadow these.
export type * from "../../packages/react-native/src/index.ts";

/**
 * Node.js cannot load Evolu's native module, so examples use in-memory SQLite,
 * through a function of `@evolu/react-native`'s `createEvoluDeps`'s type.
 */
export const createEvoluDeps: typeof createNativeEvoluDeps =
  createDocsEvoluDeps;
