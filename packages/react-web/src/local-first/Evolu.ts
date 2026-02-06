import type { EvoluDeps } from "@evolu/common/local-first";
import { createEvoluDeps as createWebEvoluDeps } from "@evolu/web";
import { flushSync } from "react-dom";

/** Creates Evolu dependencies for web with React DOM flush sync. */
export const createEvoluDeps = (): EvoluDeps => {
  const deps = createWebEvoluDeps();
  return { ...deps, flushSync };
};
