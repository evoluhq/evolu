/**
 * React Native global error handling utilities.
 *
 * ErrorUtils is a React Native global that provides error handling
 * capabilities.
 */
interface ErrorUtils {
  getGlobalHandler: () => ((error: unknown, isFatal?: boolean) => void) | null;
  setGlobalHandler: (
    handler: (error: unknown, isFatal?: boolean) => void,
  ) => void;
}

declare global {
  // eslint-disable-next-line no-var
  var ErrorUtils: ErrorUtils | undefined;
}

export {};
