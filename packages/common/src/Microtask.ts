/**
 * Microtask queue utilities.
 *
 * @module
 */

import { appendToArray, type NonEmptyReadonlyArray } from "./Array.js";

/**
 * Batches values and flushes them in a single microtask.
 *
 * Calls to {@link MicrotaskBatch.push} within the same tick are coalesced into
 * one flush.
 */
export interface MicrotaskBatch<T> extends Disposable {
  /** Enqueues one item and schedules a microtask flush if needed. */
  readonly push: (item: T) => void;

  /** Flushes queued items immediately. */
  readonly flushNow: () => void;
}

/** Creates {@link MicrotaskBatch}. */
export const createMicrotaskBatch = <T>(
  onFlush: (items: NonEmptyReadonlyArray<T>) => void,
): MicrotaskBatch<T> => {
  let queue: NonEmptyReadonlyArray<T> | null = null;
  let disposed = false;

  const flushNow = () => {
    if (disposed || queue == null) return;
    const queuedItems = queue;
    queue = null;
    onFlush(queuedItems);
  };

  return {
    push: (item) => {
      if (disposed) return;

      if (queue == null) {
        queue = [item];
        queueMicrotask(flushNow);
        return;
      }

      queue = appendToArray(queue, item);
    },

    flushNow,

    [Symbol.dispose]: () => {
      if (disposed) return;
      disposed = true;
      queue = null;
    },
  };
};
