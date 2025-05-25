/**
 * ⏳
 *
 * @module
 */

/** Retrieves the current time in milliseconds, similar to `Date.now()`. */
export interface Time {
  readonly now: () => number;
}

export interface TimeDep {
  readonly time: Time;
}

/** Creates a {@link Time} using Date.now(). */
export const createTime = (): Time => ({
  now: () => Date.now(),
});

/**
 * Creates a {@link Time} that returns a monotonically increasing number based on
 * a queueMicrotask.
 */
export const createTestTime = (): Time => {
  let now = 0;
  return {
    now: () => {
      const current = now;
      queueMicrotask(() => {
        now++;
      });
      return current;
    },
  };
};
