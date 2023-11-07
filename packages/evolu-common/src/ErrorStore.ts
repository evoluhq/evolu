import { Context, Effect, Function, Layer } from "effect";
import { TimestampError } from "./Crdt.js";
import { Store, makeStore2 } from "./Store.js";

export type ErrorStore = Store<ErrorStoreValue>;

type ErrorStoreValue = EvoluError | null;

export const ErrorStore = Context.Tag<ErrorStore>("evolu/ErrorStore");

export type EvoluError = UnexpectedError | TimestampError;

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
 * in Safari and Firefox.
 * https://discord.com/channels/795981131316985866/795983589644304396/1096736473396564079
 */
interface TransferableError {
  readonly message: string;
  readonly stack: string | undefined;
}

export const ErrorStoreLive = Layer.effect(
  ErrorStore,
  makeStore2<ErrorStoreValue>(Function.constNull),
);
