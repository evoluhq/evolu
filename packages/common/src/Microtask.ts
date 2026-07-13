/**
 * Microtask queue utilities.
 *
 * @module
 */

import { appendToArray, type NonEmptyReadonlyArray } from "./Array.js";
import { disposable } from "./Function.js";

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
  using disposer = new DisposableStack();
  let queue: NonEmptyReadonlyArray<T> | null = null;

  disposer.defer(() => {
    queue = null;
  });

  const flushQueuedItems = () => {
    if (queue == null) return;
    const queuedItems = queue;
    queue = null;
    onFlush(queuedItems);
  };

  return disposable<MicrotaskBatch<T>>(
    {
      push: (item) => {
        if (queue == null) {
          queue = [item];
          queueMicrotask(flushQueuedItems);
          return;
        }

        queue = appendToArray(queue, item);
      },

      flushNow: () => {
        flushQueuedItems();
      },
    },
    disposer,
  );
};
