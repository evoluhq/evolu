import { EvoluDeps } from "@evolu/common/local-first";
import { evoluWebDeps } from "@evolu/web";
import { flushSync } from "react-dom";

export * from "@evolu/web";
export * from "./components/index.js";

export const evoluReactWebDeps: EvoluDeps = {
  ...evoluWebDeps,
  flushSync,
};
