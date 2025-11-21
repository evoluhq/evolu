import { EvoluDeps } from "@evolu/common/local-first";
import { evoluWebDeps, localAuth } from "@evolu/web";
import { flushSync } from "react-dom";

export * from "./components/EvoluIdenticon.js";
export { localAuth };

export const evoluReactWebDeps: EvoluDeps = {
  ...evoluWebDeps,
  flushSync,
};
