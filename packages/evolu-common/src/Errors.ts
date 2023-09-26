import { Effect } from "effect";
import { TimestampError } from "./Timestamp.js";

export type EvoluError = UnexpectedError | TimestampError;

/**
 * We can't use the whole error because of WebWorker postMessage DataCloneError
 * in Safari and Firefox.
 * https://discord.com/channels/795981131316985866/795983589644304396/1096736473396564079
 */
interface TransferableError {
  readonly message: string;
  readonly stack: string | undefined;
}

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
