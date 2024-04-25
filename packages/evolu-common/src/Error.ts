import { TimestampError } from "./Crdt.js";

/** The EvoluError type is used to represent errors that can occur in Evolu. */
export type EvoluError = TimestampError | UnexpectedError;

/**
 * UnexpectedError represents errors that can occur unexpectedly anywhere, even
 * in third-party libraries, because Evolu uses Effect to track all errors.
 */
export interface UnexpectedError {
  readonly _tag: "UnexpectedError";
  readonly error: unknown;
}

export const makeUnexpectedError = (error: unknown): UnexpectedError => ({
  _tag: "UnexpectedError",
  error,
});

/** Error isn't a structured cloneable object. */
export const ensureTransferableError = (error: unknown): unknown => {
  if (error instanceof Error)
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  return error;
};
