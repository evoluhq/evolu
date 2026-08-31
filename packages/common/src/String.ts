/**
 * String utilities.
 *
 * @module
 */

/**
 * Escapes regular-expression syntax so a string can be used as a literal
 * pattern.
 */
export const escapeRegExp = (value: string): string =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** Converts an unknown value to a compact, human-readable diagnostic string. */
export const safelyStringifyUnknownValue = (value: unknown): string => {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || typeof value !== "object") return String(value);

  try {
    // `JSON.stringify` can return `undefined` when `toJSON` does.
    const stringifiedValue: unknown = JSON.stringify(value);
    if (typeof stringifiedValue === "string") return stringifiedValue;
  } catch {
    // Fall through to a simpler representation.
  }

  try {
    // oxlint-disable-next-line typescript/no-base-to-string -- This is the intentional last-resort representation.
    return String(value);
  } catch {
    return "[Unserializable value]";
  }
};
