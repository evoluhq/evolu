/**
 * String utilities for safe value conversion.
 *
 * @module
 */

export const safelyStringifyUnknownValue = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  try {
    return JSON.stringify(value);
  } catch {
    return globalThis.String(value);
  }
};
