import { EvoluDeps } from "@evolu/common/evolu";
import { evoluWebDeps } from "@evolu/web";
import { flushSync } from "react-dom";

export * from "./EvoluAvatar.js";

export const evoluReactWebDeps: EvoluDeps = {
  ...evoluWebDeps,
  flushSync,
};
