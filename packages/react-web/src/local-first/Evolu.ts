import type { ConsoleDep } from "@evolu/common";
import type { EvoluDeps } from "@evolu/common/local-first";
import { createEvoluDeps as createWebEvoluDeps } from "@evolu/web";
import { flushSync } from "react-dom";

/** Creates shared Evolu dependencies for React on web with React DOM flush sync. */
export const createEvoluDeps = (deps: Partial<ConsoleDep> = {}): EvoluDeps => ({
  ...createWebEvoluDeps(deps),
  flushSync,
});
