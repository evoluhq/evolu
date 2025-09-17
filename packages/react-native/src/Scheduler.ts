import { Result, Scheduler, Task, TaskContext, toTask } from "@evolu/common";
import { InteractionManager } from "react-native";

/**
 * Creates a Scheduler implementation for React Native using InteractionManager.
 *
 * ### Example
 *
 * ```ts
 * const scheduler = createReactNativeScheduler();
 * ```
 */
export const createReactNativeScheduler = (): Scheduler => ({
  runAfterInteractions: <T, E>(task: Task<T, E>) =>
    toTask(
      async (context?: TaskContext) =>
        new Promise<Result<T, E>>((resolve) => {
          InteractionManager.runAfterInteractions(() => {
            void task(context).then(resolve);
          });
        }),
    ),
});
