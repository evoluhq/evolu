import { expect } from "vitest";
import { lazyVoid } from "../src/Function.ts";
import {
  isHermes,
  testGlobalUncaughtErrors as testGlobalUncaughtErrorsBase,
  testGlobalUnhandledRejections as testGlobalUnhandledRejectionsBase,
  type TestGlobalErrors,
} from "../src/Platform.ts";

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
  const globalConsole = globalThis.console;
  const consoleError = globalConsole.error;
  globalConsole.error = lazyVoid;
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

/**
 * Expects a Promise continuation to run after exactly the specified number of
 * microtasks.
 *
 * Application code must not depend on exact microtask counts. Maintainers
 * should review count changes because they indicate that an async pipeline
 * changed.
 */
export const expectContinuationAfterMicrotasks = async (
  promise: Promise<unknown>,
  expectedMicrotaskCount: number,
): Promise<void> => {
  let continuationCalled = false;

  const markContinuationCalled = (): void => {
    continuationCalled = true;
  };

  void promise.then(markContinuationCalled, markContinuationCalled);

  await expectConditionAfterMicrotasks(
    () => continuationCalled,
    expectedMicrotaskCount,
  );
};

/**
 * Expects a condition to become true after exactly the specified number of
 * microtasks.
 *
 * Application code must not depend on exact microtask counts. Maintainers
 * should review count changes because they indicate that an async pipeline
 * changed.
 */
export const expectConditionAfterMicrotasks = async (
  condition: () => boolean,
  expectedMicrotaskCount: number,
): Promise<void> => {
  for (
    let microtaskCount = 0;
    microtaskCount < expectedMicrotaskCount;
    microtaskCount++
  ) {
    expect(
      condition(),
      `Expected condition to be false after ${microtaskCount} microtasks`,
    ).toBe(false);
    await Promise.resolve();
  }

  expect(
    condition(),
    `Expected condition to be true after exactly ${expectedMicrotaskCount} microtasks`,
  ).toBe(true);
};
