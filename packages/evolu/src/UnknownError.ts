import { UnknownError } from "./Types.js";

const errorToTransferableError = (error: unknown): UnknownError["error"] => {
  const isError = error instanceof Error;
  return {
    message: isError ? error.message : String(error),
    stack: isError ? error.stack : undefined,
  };
};

export const unknownError = (error: unknown): UnknownError => ({
  _tag: "UnknownError",
  error: errorToTransferableError(error),
});
