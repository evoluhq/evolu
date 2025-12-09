/**
 * A wrapper for unknown errors caught at runtime.
 *
 * When catching errors from unsafe code (third-party libraries, worker
 * boundaries, etc.), we wrap them in `UnknownError` so they can be used in
 * union types and distinguished from other error types.
 *
 * The `error` property contains error details (including `message`, `stack`,
 * and `cause` if available), a string, or a fallback value.
 *
 * Use {@link createUnknownError} to create instances.
 */
export interface UnknownError {
  readonly type: "UnknownError";
  readonly error: unknown;
}

/** Creates an {@link UnknownError} from an unknown error. */
export const createUnknownError = (error: unknown): UnknownError => {
  const convertError = (err: Error): Record<string, unknown> => {
    const result: Record<string, unknown> = Object.getOwnPropertyNames(
      err,
    ).reduce<Record<string, unknown>>((acc, key) => {
      const value = (err as never)[key] as unknown;
      if (key === "cause" && value instanceof Error) {
        // Recursively process the `cause` property
        acc[key] = convertError(value);
      } else if (typeof value !== "function") {
        acc[key] = value;
      }
      return acc;
    }, {});
    return result;
  };

  if (error instanceof Error) {
    return {
      type: "UnknownError",
      error: convertError(error),
    };
  }

  try {
    // Clone other values that are structured-clonable
    return {
      type: "UnknownError",
      error: structuredClone(error),
    };
  } catch {
    // Fallback for non-clonable values
    try {
      return {
        type: "UnknownError",
        error: String(error),
      };
    } catch {
      // Final fallback if even `String(error)` fails
      return {
        type: "UnknownError",
        error: "[Unserializable Object]",
      };
    }
  }
};
