import { constVoid } from "../../../packages/common/src/Function.ts";
import {
  isHermes,
  testGlobalUncaughtErrors as testGlobalUncaughtErrorsBase,
  testGlobalUnhandledRejections as testGlobalUnhandledRejectionsBase,
  type TestGlobalErrors,
} from "../../../packages/common/src/Platform.ts";

// Vitest browser logs expected global error events through console.error even
// when a test installs a listener and asserts the event. Silence that echo while
// these helpers are active so expected global-error tests keep CLI output clean.

export const testGlobalUncaughtErrors = (): TestGlobalErrors =>
  withDisabledConsoleError(testGlobalUncaughtErrorsBase);

export const testGlobalUnhandledRejections = (): TestGlobalErrors =>
  withDisabledConsoleError(testGlobalUnhandledRejectionsBase);

const withDisabledConsoleError = (
  createGlobalErrors: () => TestGlobalErrors,
): TestGlobalErrors => {
  if (isHermes) return createGlobalErrors();

  using disposableStack = new DisposableStack();
  // oxlint-disable-next-line evolu/no-unnecessary-global-this -- Temporarily replace the global object console method that Vitest calls.
  const globalConsole = globalThis.console;
  const consoleError = globalConsole.error;
  globalConsole.error = constVoid;
  disposableStack.defer(() => {
    globalConsole.error = consoleError;
  });
  const globalErrors = disposableStack.use(createGlobalErrors());
  const disposables = disposableStack.move();

  return {
    errors: globalErrors.errors,
    next: globalErrors.next,
    settle: globalErrors.settle,
    [Symbol.dispose]: () => {
      disposables.dispose();
    },
  };
};
