/** Detects if the code is running in React Native environment. */
export const isReactNative =
  typeof navigator !== "undefined" &&
  "product" in navigator &&
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  (navigator as any).product === "ReactNative";

/**
 * Detects if Node.js Buffer is available and should be used.
 *
 * React Native apps often polyfill Node.js APIs like Buffer, but we want to use
 * native methods when available for better performance.
 *
 * Returns false in React Native even if Buffer is polyfilled, as we prefer
 * native methods in that environment.
 *
 * @see https://github.com/craftzdog/react-native-quick-base64#installation
 */
export const hasNodeBuffer =
  !isReactNative && typeof globalThis.Buffer !== "undefined";
