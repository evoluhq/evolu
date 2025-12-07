import { EvoluDeps } from "@evolu/common/local-first";
import { createEvoluDeps as createWebEvoluDeps } from "@evolu/web";
import { flushSync } from "react-dom";

export * from "@evolu/web";
export * from "./components/index.js";

/** Creates Evolu dependencies for React web with React DOM flush sync support. */
export const createEvoluDeps = (): EvoluDeps => {
  const deps = createWebEvoluDeps();
  return { ...deps, flushSync };
};
