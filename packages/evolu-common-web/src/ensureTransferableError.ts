/** Error can't be passed to DOM postMessage. */
export const ensureTransferableError = (error: unknown): unknown => {
  if (error instanceof Error)
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  return error;
};
