import { Context, Layer } from "effect";
import { Store, makeStore } from "./Store.js";

export type EvoluError = UnexpectedError;

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

export const makeUnexpectedError = (error: unknown): UnexpectedError => {
  const isError = error instanceof Error;

  return {
    _tag: "UnexpectedError",
    error: {
      message: isError ? error.message : String(error),
      stack: isError ? error.stack : undefined,
    },
  };
};

export type ErrorStore = Store<EvoluError | null>;

export const ErrorStore = Context.Tag<ErrorStore>("evolu/ErrorStore");

export const ErrorStoreLive = Layer.succeed(
  ErrorStore,
  makeStore<EvoluError | null>(null)
);
