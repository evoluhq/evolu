import { PositiveInt, type ReloadApp } from "@evolu/common";

/** Returns true when the browser runs on an Apple platform. */
export const isApplePlatform = (): boolean => {
  const platform =
    globalThis.navigator.userAgentData?.platform ??
    globalThis.navigator.platform;

  return /^(?:Mac|iPhone|iPad|iPod)/iu.test(platform);
};

/** Returns the amount of logical processors available to the browser. */
export const availableParallelism = (): PositiveInt =>
  PositiveInt.orThrow(globalThis.navigator.hardwareConcurrency);

export const reloadApp: ReloadApp = (url) => {
  if (typeof document === "undefined") {
    return;
  }

  location.replace(url ?? "/");
};
