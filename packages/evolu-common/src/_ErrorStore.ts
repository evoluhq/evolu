import { TimestampError } from "./Crdt.js";
import { makeStore } from "./Store.js";

export const makeErrorStore = makeStore<EvoluError | null>(null);

/** The EvoluError type is used to represent errors that can occur in Evolu. */
export type EvoluError = TimestampError | UnexpectedError;

/**
 * The UnexpectedError represents errors that can occur anywhere, even in
 * third-party libraries, because Evolu uses Effect to track all errors.
 */
export interface UnexpectedError {
  readonly _tag: "UnexpectedError";
  readonly error: unknown;
}
