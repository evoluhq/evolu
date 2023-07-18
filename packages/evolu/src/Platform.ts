export type PlatformName = "browser" | "native" | "server";

export const platformName: PlatformName =
  typeof document !== "undefined"
    ? "browser"
    : typeof navigator !== "undefined" && navigator.product === "ReactNative"
    ? "native"
    : "server";
