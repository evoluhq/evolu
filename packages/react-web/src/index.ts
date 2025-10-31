import { EvoluDeps } from "@evolu/common/evolu";
import { evoluWebDeps, localAuth } from "@evolu/web";
import { flushSync } from "react-dom";

export * from "./EvoluAvatar.js";
export { localAuth };

export const evoluReactWebDeps: EvoluDeps = {
  ...evoluWebDeps,
  flushSync,
};
