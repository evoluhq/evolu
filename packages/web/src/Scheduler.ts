import { Result, Scheduler, Task, TaskContext, toTask } from "@evolu/common";

/**
 * Creates a Scheduler implementation for web browsers.
 *
 * Uses the Scheduler API when available (Chrome, Firefox), otherwise falls back
 * to setTimeout. Safari doesn't support Scheduler API yet.
 *
 * ### Example
 *
 * ```ts
 * const scheduler = createWebScheduler();
 * ```
 */
export const createWebScheduler = (): Scheduler => ({
  runAfterInteractions: <T, E>(task: Task<T, E>) =>
    toTask(async (context?: TaskContext) => {
      // Check if Scheduler API is available
      const global = globalThis as unknown as {
        scheduler?: {
          postTask?: (
            task: () => void,
            options?: { priority?: string },
          ) => void;
        };
      };

      if (typeof globalThis !== "undefined" && global.scheduler?.postTask) {
        // Use Scheduler API with 'background' priority to run after interactions
        return new Promise<Result<T, E>>((resolve) => {
          global.scheduler!.postTask!(
            () => {
              void task(context).then(resolve);
            },
            { priority: "background" },
          );
        });
      } else {
        // Fallback to setTimeout for Safari and older browsers
        return new Promise<Result<T, E>>((resolve) => {
          setTimeout(() => {
            void task(context).then(resolve);
          }, 0);
        });
      }
    }),
});
