import { Task, toTask, TaskContext } from "./Task.js";
import { Result } from "./Result.js";

export interface Scheduler {
  /**
   * Schedule a task to run after all interactions (animations, gestures,
   * navigation) have completed.
   *
   * This provides a platform-independent way to defer heavy work:
   *
   * - React Native: Uses InteractionManager.runAfterInteractions
   * - Web: Uses Scheduler API when available, otherwise setTimeout fallback
   * - Other platforms: Uses setTimeout fallback
   */
  readonly runAfterInteractions: <T, E>(task: Task<T, E>) => Task<T, E>;
}

export interface SchedulerDep {
  readonly scheduler: Scheduler;
}

/**
 * Creates a basic Scheduler implementation using setTimeout.
 *
 * This is a safe fallback for any platform that doesn't have more sophisticated
 * scheduling APIs available. It's also useful for tests.
 *
 * ### Example
 *
 * ```ts
 * const scheduler = createBasicScheduler();
 * ```
 */
export const createBasicScheduler = (): Scheduler => ({
  runAfterInteractions: <T, E>(task: Task<T, E>) =>
    toTask(async (context?: TaskContext) => {
      return new Promise<Result<T, E>>((resolve) => {
        setTimeout(() => {
          void task(context).then(resolve);
        }, 0);
      });
    }),
});
