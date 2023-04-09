import { IO } from "fp-ts/lib/IO.js";

export const isServer = typeof window === "undefined" || "Deno" in window;

export const isChromeWithOpfs: IO<boolean> = () =>
  navigator.userAgentData != null &&
  navigator.userAgentData.brands.find(
    ({ brand, version }) =>
      // Chrome or Chromium
      brand.includes("Chrom") && Number(version) >= 109
  ) != null;
