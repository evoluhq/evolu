/**
 * A serializable representation of an error for safe transfer between execution
 * contexts, such as Web Workers and the main thread.
 *
 * Use this type for unknown (unexpected) errors that need to be transferred
 * across boundaries where native Error objects cannot be sent directly. Not
 * intended for regular (expected) errors.
 *
 * The `error` property contains a plain object with error details, a string, or
 * a fallback value if serialization fails to preserve as much debugging
 * information as possible.
 */
export interface TransferableError {
  readonly type: "TransferableError";
  readonly error: unknown;
}

/** Creates a {@link TransferableError} from an unknown error. */
export const createTransferableError = (error: unknown): TransferableError => {
  const convertError = (err: Error): Record<string, unknown> => {
    const transferableError: Record<string, unknown> =
      Object.getOwnPropertyNames(err).reduce<Record<string, unknown>>(
        (acc, key) => {
          const value = (err as never)[key] as unknown;
          if (key === "cause" && value instanceof Error) {
            // Recursively process the `cause` property
            acc[key] = convertError(value);
          } else if (typeof value !== "function") {
            acc[key] = value;
          }
          return acc;
        },
        {},
      );
    return transferableError;
  };

  if (error instanceof Error) {
    return {
      type: "TransferableError",
      error: convertError(error),
    };
  }

  try {
    // Clone other values that are transferable
    return {
      type: "TransferableError",
      error: structuredClone(error),
    };
  } catch {
    // Fallback for non-transferable or problematic values
    try {
      return {
        type: "TransferableError",
        error: String(error), // Attempt to convert to a string
      };
    } catch {
      // Final fallback if even `String(error)` fails
      return {
        type: "TransferableError",
        error: "[Unserializable Object]",
      };
    }
  }
};
