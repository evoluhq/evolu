import type { ConsoleDep } from "../../packages/common/src/index.ts";
import type { EvoluDeps } from "../../packages/common/src/local-first/index.ts";
import { createDocsEvoluDeps } from "./test-jsdoc-evolu-deps.mts";

/**
 * Node.js cannot load Expo's native SQLite, so examples use Node's. The
 * signature is the one of `@evolu/react-native/expo-sqlite`, declared here
 * because importing its types would bring Expo's global types along.
 */
export const createEvoluDeps = (deps: Partial<ConsoleDep> = {}): EvoluDeps =>
  createDocsEvoluDeps(deps);
