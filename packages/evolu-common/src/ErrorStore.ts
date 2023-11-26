import { Effect } from "effect";
import { TimestampError } from "./Crdt.js";
import { Store, makeStore } from "./Store.js";

export type ErrorStore = Store<EvoluError | null>;

export const makeErrorStore = makeStore<EvoluError | null>(null);

/**
 * The EvoluError type is used to represent errors that can occur in Evolu. It
 * is a union type that includes UnexpectedError and TimestampError.
 */
export type EvoluError = UnexpectedError | TimestampError;

/**
 * The UnexpectedError interface is designed to represent errors that can occur
 * unexpectedly anywhere, even in third-party libraries, because Evolu uses
 * Effect to track all errors.
 */
export interface UnexpectedError {
  readonly _tag: "UnexpectedError";
  readonly error: TransferableError;
}

export const makeUnexpectedError = (
  error: unknown,
): Effect.Effect<never, UnexpectedError, never> => {
  const isError = error instanceof Error;

  return Effect.fail({
    _tag: "UnexpectedError",
    error: {
      message: isError ? error.message : String(error),
      stack: isError ? error.stack : undefined,
    },
  });
};

/**
 * We can't use the whole error because of WebWorker postMessage DataCloneError
 * in Safari and Firefox. TODO:
 * https://discord.com/channels/795981131316985866/795983589644304396/1096736473396564079
 */
interface TransferableError {
  readonly message: string;
  readonly stack: string | undefined;
}
