/**
 * We can't use the whole error because of WebWorker postMessage
 * DataCloneError in Safari and Firefox.
 */
interface TransferableError {
  // https://discord.com/channels/795981131316985866/795983589644304396/1096736473396564079
  readonly message: string;
  readonly stack: string | undefined;
}

const errorToTransferableError = (error: unknown): TransferableError => {
  const isError = error instanceof Error;
  return {
    message: isError ? error.message : String(error),
    stack: isError ? error.stack : undefined,
  };
};

/**
 * A kitchen sink error for errors we don't expect to happen.
 */
export interface UnknownError {
  readonly _tag: "UnknownError";
  readonly error: TransferableError;
}

export const unknownError = (error: unknown): UnknownError => ({
  _tag: "UnknownError",
  error: errorToTransferableError(error),
});
