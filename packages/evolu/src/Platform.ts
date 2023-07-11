export const platformName: "browser" | "native" | "server" =
  typeof document !== "undefined"
    ? "browser"
    : typeof navigator !== "undefined" && navigator.product === "ReactNative"
    ? "native"
    : "server";

const isChromeWithOpfs = (): boolean =>
  navigator.userAgentData != null &&
  navigator.userAgentData.brands.find(
    ({ brand, version }) =>
      // Chrome or Chromium
      brand.includes("Chrom") && Number(version) >= 109
  ) != null;

const isFirefoxWithOpfs = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.indexOf("firefox") === -1) return false;
  const matches = userAgent.match(/firefox\/([0-9]+\.*[0-9]*)/);
  if (matches == null) return false;
  return Number(matches[1]) >= 111;
};

export const isBrowserWithOpfs =
  platformName === "browser" && (isChromeWithOpfs() || isFirefoxWithOpfs());
