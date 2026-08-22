/**
 * React Native global error handling utilities.
 *
 * ErrorUtils is a React Native global that provides error handling
 * capabilities.
 */
interface ErrorUtils {
  getGlobalHandler: () => ((error: unknown, isFatal?: boolean) => void) | null;
  reportError: (error: unknown) => void;
  setGlobalHandler: (
    handler: (error: unknown, isFatal?: boolean) => void,
  ) => void;
}

declare global {
  // var is required for a global declaration that matches the runtime binding.
  var ErrorUtils: ErrorUtils | undefined;
}

// oxlint-disable-next-line unicorn/require-module-specifiers -- Marks this declaration file as a module so declare global is valid.
export {};
