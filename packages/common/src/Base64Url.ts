// Import specific polyfill functions instead of using auto-polyfill
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */
const fromBase64Implementation = require("es-arraybuffer-base64/Uint8Array.fromBase64");
const toBase64Implementation = require("es-arraybuffer-base64/Uint8Array.prototype.toBase64");

/**
 * Base64Url options configured for deterministic validation across all
 * platforms.
 */
const base64UrlOptions = {
  alphabet: "base64url" as const,
  omitPadding: true,
} as const;

/**
 * Node.js Buffer-based utilities for better performance when available. These
 * maintain the same behavior as the polyfill but with better performance.
 */
const hasNodeBuffer = typeof globalThis.Buffer !== "undefined";

/**
 * Decodes a Base64Url string to bytes using consistent validation. Uses Node.js
 * Buffer for better performance when available, otherwise uses native
 * implementation or falls back to polyfill.
 */
export const fromBase64Url = (str: string): Uint8Array => {
  // Use Node.js Buffer for better performance when available
  if (hasNodeBuffer) {
    const nodeBuffer = globalThis.Buffer.from(str, "base64url");
    return new globalThis.Uint8Array(nodeBuffer);
  }

  // Check if native implementation is available
  const nativeFromBase64 = (globalThis.Uint8Array as any)?.fromBase64;
  if (typeof nativeFromBase64 === "function") {
    return nativeFromBase64(str, base64UrlOptions);
  } else {
    // Use polyfill implementation
    return fromBase64Implementation(str, base64UrlOptions) as Uint8Array;
  }
};

/**
 * Encodes bytes to a Base64Url string using consistent validation. Uses Node.js
 * Buffer for better performance when available, otherwise uses native
 * implementation or falls back to polyfill.
 */
export const toBase64Url = (bytes: Uint8Array): string => {
  // Use Node.js Buffer for better performance when available
  if (hasNodeBuffer) {
    return globalThis.Buffer.from(bytes).toString("base64url");
  }

  // Check if native implementation is available
  const nativeToBase64 = (bytes as any).toBase64;
  if (typeof nativeToBase64 === "function") {
    return nativeToBase64.call(bytes, base64UrlOptions);
  } else {
    // Use polyfill implementation
    return toBase64Implementation(bytes, base64UrlOptions) as string;
  }
};
