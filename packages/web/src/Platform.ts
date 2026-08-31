import { PositiveInt, type ReloadApp } from "@evolu/common";

/** Returns true when the browser runs on an Apple platform. */
export const isApplePlatform = (): boolean => {
  const platform = navigator.userAgentData?.platform ?? navigator.platform;

  return /^(?:Mac|iPhone|iPad|iPod)/iu.test(platform);
};

/** Returns the amount of logical processors available to the browser. */
export const availableParallelism = (): PositiveInt =>
  PositiveInt.orThrow(navigator.hardwareConcurrency);

export const reloadApp: ReloadApp = (url) => {
  if (typeof document === "undefined") {
    return;
  }

  location.replace(url ?? "/");
};
