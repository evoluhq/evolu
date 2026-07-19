import { PositiveInt, type ReloadApp } from "@evolu/common";

/** Returns the amount of logical processors available to the browser. */
export const availableParallelism = (): PositiveInt =>
  PositiveInt.orThrow(globalThis.navigator.hardwareConcurrency);

export const reloadApp: ReloadApp = (url) => {
  if (typeof document === "undefined") {
    return;
  }

  location.replace(url ?? "/");
};
