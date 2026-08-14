/**
 * Composable scheduling strategies.
 *
 * @module
 */

import {
  fibonacciAt,
  FibonacciIndex,
  increment,
  max,
  min,
  type Percentage,
  percentageToRatio,
} from "./Number.ts";
import type { RandomDep } from "./Random.ts";
import { done, err, type NextResult, ok } from "./Result.ts";
import type { repeat, RepeatAttempt, retry, RetryAttempt } from "./Task.ts";
import {
  type Duration,
  type DurationLiteral,
  durationToMillis,
  Millis,
  minMillis,
  PositiveMillis,
  saturateMillis,
  type TimeDep,
} from "./Time.ts";
import {
  assertType,
  type Int0To100OrNonNegativeInt,
  NonNaNNumber,
  NonNegativeFiniteNumber,
  type NonNegativeInt,
  PositiveInt,
  type Ratio,
} from "./Type.ts";
import type { Predicate } from "./Types.ts";

/**
 * Composable scheduling strategies for {@link retry}, {@link repeat}, rate
 * limiting, and more.
 *
 * A Schedule uses the State pattern: calling `schedule(deps)` creates a step
 * function with internal state captured in closures. Each call to `step(input)`
 * advances that state and returns `Ok([Output, Millis])` or `Err(Done<void>)`
 * to stop. Multiple calls to `schedule(deps)` create independent state
 * instances.
 *
 * `Err(Done<void>)` is terminal. After a step returns it, every subsequent call
 * to that step must also return `Err(Done<void>)`.
 *
 * With {@link retry} and {@link repeat}, the initial Task execution happens
 * before the first schedule step. Schedule outputs therefore describe
 * recurrences, not the initial execution. Time-based schedules establish their
 * time origin on the first step call, not when `schedule(deps)` creates the
 * step.
 *
 * ### Composing a retry policy
 *
 * ```ts
 * import {
 *   err,
 *   exponential,
 *   jitter,
 *   maxDelay,
 *   ok,
 *   retry,
 *   take,
 *   testCreateRun,
 *   type RandomNumber,
 *   type Task,
 * } from "@evolu/common";
 *
 * let attempts = 0;
 * const fetchData: Task<string, { readonly type: "FetchError" }> = () => {
 *   attempts++;
 *   return attempts < 2 ? err({ type: "FetchError" }) : ok("data");
 * };
 *
 * const fetchWithRetry = retry(
 *   fetchData,
 *   // A jittered, capped, limited exponential backoff.
 *   jitter("100%")(maxDelay("20s")(take(2)(exponential("100ms")))),
 * );
 *
 * await using run = testCreateRun({
 *   random: { next: () => 0 as RandomNumber },
 * });
 * expectOk(await run(fetchWithRetry), "data");
 * ```
 *
 * Or use a preset:
 *
 * ```ts
 * import { ok, retry, retryStrategyAws, type Task } from "@evolu/common";
 *
 * const fetchData: Task<string> = () => ok("data");
 * const fetchWithRetry = retry(fetchData, retryStrategyAws);
 *
 * expect(fetchWithRetry).toBeTypeOf("function");
 * ```
 */
export type Schedule<out Output, in Input = unknown> = (
  deps: ScheduleDeps,
) => (input: Input) => NextResult<readonly [Output, Millis]>;

/**
 * Dependencies provided to a {@link Schedule}.
 *
 * The executor provides these once, and the schedule uses what it needs.
 */
export type ScheduleDeps = TimeDep & RandomDep;

/**
 * Base interface for schedule-based task helpers.
 *
 * Used by {@link RetryAttempt}, {@link RepeatAttempt}, and future schedule-driven
 * helpers.
 *
 * @group Composition
 */
export interface ScheduleStep<Output> {
  /** The current attempt. */
  readonly attempt: PositiveInt;

  /** Output from the {@link Schedule} step. */
  readonly output: Output;

  /** Delay before the scheduled recurrence executes. */
  readonly delay: Millis;
}

/**
 * A schedule that never stops and has no delay.
 *
 * Outputs the attempt count (0, 1, 2, ...). Useful as a base for composition or
 * for immediate retry without backoff.
 *
 * ### Recurring immediately
 *
 * ```ts
 * import { forever, take, testCreateDeps } from "@evolu/common";
 *
 * // Retry immediately, up to 5 times.
 * const immediate = take(5)(forever);
 * const step = immediate(testCreateDeps());
 * expectOk(step(undefined), [0, 0]);
 * ```
 *
 * @group Constructors
 */
export const forever: Schedule<number> = () => {
  let attempt = 0;
  return () => ok([attempt++, minMillis]);
};

/**
 * A schedule that runs exactly once with no delay.
 *
 * Equivalent to `take(1)(forever)`. Useful for one-shot operations.
 *
 * ### Scheduling one recurrence
 *
 * ```ts
 * import { done, once, testCreateDeps } from "@evolu/common";
 *
 * // Produce one scheduled recurrence, then stop.
 * const oneShot = once;
 * const step = oneShot(testCreateDeps());
 * expectOk(step(undefined), [0, 0]);
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Constructors
 */
export const once: Schedule<number> = () => {
  let finished = false;
  return () => {
    if (finished) return err(done());
    finished = true;
    return ok([0, minMillis]);
  };
};

/**
 * A schedule that recurs a fixed number of times.
 *
 * Convenience for `take(n)(forever)`. Outputs the current repetition count (0,
 * 1, 2, ..., n-1).
 *
 * `n` uses {@link Int0To100OrNonNegativeInt}: pass `0` to `100` as a literal, or
 * a validated {@link NonNegativeInt} for larger or dynamic values.
 *
 * ### Limiting recurrence count
 *
 * ```ts
 * import { done, recurs, testCreateDeps } from "@evolu/common";
 *
 * // Retry up to 3 times (4 total attempts including the initial operation).
 * const retry = recurs(3);
 * const step = retry(testCreateDeps());
 * expectOk(step(undefined), [0, 0]);
 * step(undefined);
 * step(undefined);
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Constructors
 */
export const recurs = (n: Int0To100OrNonNegativeInt): Schedule<number> =>
  take(n)(forever);

/**
 * Constant delay schedule.
 *
 * Always waits the same duration after each execution completes. Never stops —
 * combine with {@link take} or {@link maxElapsed} to limit.
 *
 * ### Constant spacing
 *
 * ```ts
 * import { spaced, take, testCreateDeps } from "@evolu/common";
 *
 * // Poll every second, retry three times, or run a long-lived heartbeat.
 * const poll = spaced("1s");
 * const retry = take(3)(spaced("500ms"));
 * const heartbeat = spaced("30s");
 * const deps = testCreateDeps();
 *
 * expectOk(poll(deps)(undefined), [1000, 1000]);
 * expectOk(retry(deps)(undefined), [500, 500]);
 * expectOk(heartbeat(deps)(undefined), [30000, 30000]);
 * ```
 *
 * @group Constructors
 */
export const spaced =
  (duration: Duration): Schedule<Millis> =>
  () => {
    const ms = durationToMillis(duration);
    return () => ok([ms, ms]);
  };

/**
 * Exponential backoff schedule.
 *
 * Computes delay as `base * factor^(step - 1)`:
 *
 * - Step 1: `base`
 * - Step 2: `base * factor`
 * - Step 3: `base * factor²`
 * - ...
 *
 * Never stops — combine with {@link take} or {@link maxElapsed} to limit.
 *
 * ### Exponential growth factors
 *
 * ```ts
 * import { exponential, testCreateDeps } from "@evolu/common";
 *
 * // Standard doubling and gentler 1.5× growth.
 * const standard = exponential("100ms");
 * const gentle = exponential("100ms", 1.5);
 * const standardStep = standard(testCreateDeps());
 * const gentleStep = gentle(testCreateDeps());
 * expectOk(standardStep(undefined), [100, 100]);
 * expectOk(standardStep(undefined), [200, 200]);
 * expectOk(gentleStep(undefined), [100, 100]);
 * expectOk(gentleStep(undefined), [150, 150]);
 * ```
 *
 * @group Constructors
 */
export const exponential = (base: Duration, factor = 2): Schedule<Millis> => {
  assertType(NonNegativeFiniteNumber, factor);

  return () => {
    const baseMs = durationToMillis(base);
    let attempt = 0;
    return () => {
      attempt++;
      const rawDelay =
        baseMs === 0 ? minMillis : baseMs * Math.pow(factor, attempt - 1);
      const delay = saturateComputedMillis(rawDelay);
      return ok([delay, delay]);
    };
  };
};

const saturateComputedMillis = (value: number): Millis => {
  assertType(NonNaNNumber, value);
  return saturateMillis(value);
};

/**
 * Linear backoff schedule.
 *
 * Delay increases linearly: `base * step`:
 *
 * - Step 1: `base`
 * - Step 2: `base * 2`
 * - Step 3: `base * 3`
 * - ...
 *
 * Never stops — combine with {@link take} or {@link maxElapsed} to limit.
 *
 * ### Linear growth
 *
 * ```ts
 * import { linear, testCreateDeps } from "@evolu/common";
 *
 * // 100ms, 200ms, 300ms, 400ms, ...
 * const step = linear("100ms")(testCreateDeps());
 * expectOk(step(undefined), [100, 100]);
 * expectOk(step(undefined), [200, 200]);
 * ```
 *
 * @group Constructors
 */
export const linear =
  (base: Duration): Schedule<Millis> =>
  () => {
    const ms = durationToMillis(base);
    let attempt = 0;
    return () => {
      attempt++;
      const delay = saturateComputedMillis(ms * attempt);
      return ok([delay, delay]);
    };
  };

/**
 * Fibonacci backoff schedule.
 *
 * Delays follow the Fibonacci sequence, growing more slowly than exponential:
 *
 * - Step 1: `initial`
 * - Step 2: `initial`
 * - Step 3: `initial * 2`
 * - Step 4: `initial * 3`
 * - Step 5: `initial * 5`
 * - ...
 *
 * Never stops — combine with {@link take} or {@link maxElapsed} to limit.
 *
 * ### Fibonacci growth
 *
 * ```ts
 * import { fibonacci, testCreateDeps } from "@evolu/common";
 *
 * // 100ms, 100ms, 200ms, 300ms, 500ms, ...
 * const step = fibonacci("100ms")(testCreateDeps());
 * expectOk(step(undefined), [100, 100]);
 * expectOk(step(undefined), [100, 100]);
 * expectOk(step(undefined), [200, 200]);
 * ```
 *
 * @group Constructors
 */
export const fibonacci =
  (initial: Duration): Schedule<Millis> =>
  () => {
    const ms = durationToMillis(initial);
    let index = FibonacciIndex.orThrow(1);
    return () => {
      const delay = saturateComputedMillis(ms * fibonacciAt(index));
      index = FibonacciIndex.orNull(increment(index)) ?? index;
      return ok([delay, delay]);
    };
  };

/**
 * Fixed interval schedule aligned to time windows.
 *
 * Recurs on a fixed interval, outputting the repetition count (0, 1, 2, ...).
 * Unlike {@link spaced}, which waits a duration _after_ each execution, `fixed`
 * maintains a consistent cadence from the first schedule step.
 *
 * If execution falls behind by one or more intervals, missed recurrences happen
 * immediately until the schedule catches up to the original cadence. Use
 * {@link windowed} to skip missed recurrences instead.
 *
 * ### Maintaining a fixed cadence
 *
 * ```ts
 * import { fixed, take, testCreateDeps } from "@evolu/common";
 *
 * // A bounded health check and an unbounded cron-like cadence.
 * const healthCheck = take(10)(fixed("5s"));
 * const cronLike = fixed("1m");
 *
 * const healthDeps = testCreateDeps();
 * const healthStep = healthCheck(healthDeps);
 * expectOk(healthStep(undefined), [0, 5000]);
 * healthDeps.time.advance("3s");
 * expectOk(healthStep(undefined), [1, 2000]);
 * expectOk(cronLike(testCreateDeps())(undefined), [0, 60000]);
 * ```
 *
 * @group Constructors
 */
export const fixed =
  (interval: Duration): Schedule<number> =>
  (deps) => {
    const intervalMs = durationToMillis(interval);
    const metrics = createScheduleStepMetrics(deps);
    let count = 0;
    return () => {
      const { elapsed } = metrics();
      // Which window should we be in based on count?
      const expectedWindowEnd = (count + 1) * intervalMs;
      const runningBehind = intervalMs > 0 && elapsed >= expectedWindowEnd;
      // Time until next window boundary
      const remainder = intervalMs === 0 ? 0 : elapsed % intervalMs;
      const boundary = intervalMs - remainder;
      const delay = runningBehind ? 0 : boundary;
      return ok([count++, saturateComputedMillis(delay)]);
    };
  };

/**
 * Internal per-step metrics computed from timestamps.
 *
 * The schedule computes this internally from deps.time.now().
 */
interface ScheduleStepMetrics {
  /** Milliseconds elapsed since the first step. */
  readonly elapsed: Millis;
  /** Milliseconds since the previous step. On first step, this is 0. */
  readonly elapsedSincePrevious: Millis;
}

/**
 * Creates an internal per-step metrics tracker.
 *
 * Each call updates internal state and returns computed metrics.
 */
const createScheduleStepMetrics = (
  deps: TimeDep,
): (() => ScheduleStepMetrics) => {
  let start: Millis | null = null;
  let previous: Millis | null = null;

  return () => {
    const now = deps.time.now();
    start ??= now;
    const elapsed = saturateComputedMillis(now - start);
    const elapsedSincePrevious =
      previous === null ? minMillis : saturateComputedMillis(now - previous);
    previous = now;
    return { elapsed, elapsedSincePrevious };
  };
};

/**
 * Divides the timeline into fixed windows and sleeps until the next boundary.
 *
 * Similar to {@link fixed}, but skips missed recurrences and always sleeps until
 * the next window boundary. Outputs the repetition count.
 *
 * Useful for aligning executions to regular intervals from the first step.
 *
 * ### Aligning to time windows
 *
 * ```ts
 * import { testCreateDeps, windowed } from "@evolu/common";
 *
 * const stepAfter = (elapsed: "3s" | "7s") => {
 *   const deps = testCreateDeps();
 *   const step = windowed("5s")(deps);
 *   step(undefined);
 *   deps.time.advance(elapsed);
 *   return step(undefined);
 * };
 *
 * // At 3s the next boundary is 2s away; at 7s it is 3s away.
 * expectOk(stepAfter("3s"), [1, 2000]);
 * expectOk(stepAfter("7s"), [1, 3000]);
 * ```
 *
 * @group Constructors
 */
export const windowed =
  (interval: Duration): Schedule<number> =>
  (deps) => {
    const intervalMs = durationToMillis(interval);
    const metrics = createScheduleStepMetrics(deps);
    let count = 0;
    return () => {
      const { elapsed } = metrics();
      const remainder = intervalMs === 0 ? 0 : elapsed % intervalMs;
      const delay = intervalMs === 0 ? 0 : intervalMs - remainder;
      return ok([count++, saturateComputedMillis(delay)]);
    };
  };

/**
 * A schedule that runs once with a single delay.
 *
 * Convenience for `take(1)(spaced(delay))`. Useful for simple one-shot delays.
 *
 * ### Scheduling one delayed recurrence
 *
 * ```ts
 * import { done, fromDelay, testCreateDeps } from "@evolu/common";
 *
 * // Wait one second, then stop.
 * const step = fromDelay("1s")(testCreateDeps());
 * expectOk(step(undefined), [1000, 1000]);
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Constructors
 */
export const fromDelay = (delay: Duration): Schedule<Millis> =>
  take(1)(spaced(delay));

/**
 * A schedule that runs through a sequence of delays.
 *
 * Convenience for sequencing single-delay schedules. Useful for predefined
 * retry patterns. With no delays, returns a schedule that stops immediately.
 *
 * ### Sequencing custom delays
 *
 * ```ts
 * import { done, fromDelays, testCreateDeps } from "@evolu/common";
 *
 * // A custom retry sequence: 100ms, 500ms, then 2s.
 * const custom = fromDelays("100ms", "500ms", "2s");
 * const step = custom(testCreateDeps());
 * expectOk(step(undefined), [100, 100]);
 * expectOk(step(undefined), [500, 500]);
 * expectOk(step(undefined), [2000, 2000]);
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Constructors
 */
export const fromDelays = (
  ...delays: ReadonlyArray<Duration>
): Schedule<Millis> => sequenceSchedules(...delays.map((d) => fromDelay(d)));

/**
 * A schedule that outputs the total elapsed time since its first step.
 *
 * Never stops — combine with {@link take} or {@link maxElapsed} to limit. Useful
 * for tracking how long a retry sequence has been running.
 *
 * ### Tracking elapsed time
 *
 * ```ts
 * import {
 *   done,
 *   elapsed,
 *   exponential,
 *   intersectSchedules,
 *   testCreateDeps,
 *   whileScheduleOutput,
 *   type Millis,
 * } from "@evolu/common";
 *
 * // Track elapsed time alongside each backoff step.
 * const withTiming = intersectSchedules(exponential("100ms"), elapsed);
 * expectOk(withTiming(testCreateDeps())(undefined), [[100, 0], 100]);
 *
 * // Or stop a schedule after 30 seconds of elapsed time.
 * const timeLimited = whileScheduleOutput((ms: Millis) => ms < 30000)(
 *   elapsed,
 * );
 * const deps = testCreateDeps();
 * const step = timeLimited(deps);
 * step(undefined);
 * deps.time.advance("30s");
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Constructors
 */
export const elapsed: Schedule<Millis> = (deps) => {
  const metrics = createScheduleStepMetrics(deps);
  return () => ok([metrics().elapsed, minMillis]);
};

/**
 * A schedule that runs for a specified duration then stops.
 *
 * Outputs the elapsed time. Useful for time-boxed operations or combining with
 * other schedules to create time-limited variants.
 *
 * ### Time-boxing a schedule
 *
 * ```ts
 * import {
 *   done,
 *   during,
 *   exponential,
 *   intersectSchedules,
 *   testCreateDeps,
 * } from "@evolu/common";
 *
 * // Run for at most 30 seconds.
 * const timeLimited = during("30s");
 * const deps = testCreateDeps();
 * const step = timeLimited(deps);
 * expectOk(step(undefined), [0, 0]);
 * deps.time.advance("30.1s");
 * expectErr(step(undefined), done());
 *
 * // Combine elapsed time with backoff for a time-boxed retry.
 * const timedRetry = intersectSchedules(
 *   exponential("100ms"),
 *   during("10s"),
 * );
 * expectOk(timedRetry(testCreateDeps())(undefined), [[100, 0], 100]);
 * ```
 *
 * @group Constructors
 */
export const during = (duration: Duration): Schedule<Millis> =>
  whileScheduleOutput((ms: Millis) => ms <= durationToMillis(duration))(
    elapsed,
  );

/**
 * A schedule that always outputs a constant value.
 *
 * Never stops — combine with {@link take} or {@link maxElapsed} to limit.
 *
 * ### Adding constant output
 *
 * ```ts
 * import {
 *   always,
 *   exponential,
 *   intersectSchedules,
 *   testCreateDeps,
 * } from "@evolu/common";
 *
 * // Always emit the same label.
 * const labeled = always("retry");
 * expectOk(labeled(testCreateDeps())(undefined), ["retry", 0]);
 *
 * // Add a label while preserving exponential timing.
 * const withLabel = intersectSchedules(
 *   exponential("100ms"),
 *   always("backoff"),
 * );
 * expectOk(withLabel(testCreateDeps())(undefined), [
 *   [100, "backoff"],
 *   100,
 * ]);
 * ```
 *
 * @group Constructors
 */
export const always = <A>(value: A): Schedule<A> =>
  mapSchedule(() => value)(forever);

/**
 * Creates a schedule by unfolding a state.
 *
 * Each step outputs the current state and computes the next state using the
 * provided function. Never stops — combine with {@link take} or
 * {@link maxElapsed} to limit.
 *
 * ### Unfolding state
 *
 * ```ts
 * import { testCreateDeps, unfoldSchedule } from "@evolu/common";
 *
 * // Unfold counters, custom backoff values, or state machines.
 * const counter = unfoldSchedule(0, (n) => n + 1);
 * const customBackoff = unfoldSchedule(100, (delay) =>
 *   Math.round(delay * 1.5),
 * );
 *
 * type Phase = "init" | "warmup" | "active";
 * const phases = unfoldSchedule<Phase>("init", (phase) => {
 *   switch (phase) {
 *     case "init":
 *       return "warmup";
 *     case "warmup":
 *       return "active";
 *     case "active":
 *       return "active";
 *   }
 * });
 *
 * const counterStep = counter(testCreateDeps());
 * const backoffStep = customBackoff(testCreateDeps());
 * const phaseStep = phases(testCreateDeps());
 * expectOk(counterStep(undefined), [0, 0]);
 * expectOk(counterStep(undefined), [1, 0]);
 * backoffStep(undefined);
 * phaseStep(undefined);
 * expectOk(backoffStep(undefined), [150, 0]);
 * expectOk(phaseStep(undefined), ["warmup", 0]);
 * ```
 *
 * @group Constructors
 */
export const unfoldSchedule =
  <State>(initial: State, next: (state: State) => State): Schedule<State> =>
  () => {
    let state = initial;
    return () => {
      const current = state;
      state = next(state);
      return ok([current, minMillis]);
    };
  };

/**
 * Limits a schedule to a maximum number of steps.
 *
 * After `n` steps, returns `Err(Done<void>)` (stop).
 *
 * `n` uses {@link Int0To100OrNonNegativeInt}: pass `0` to `100` as a literal, or
 * a validated {@link NonNegativeInt} for larger or dynamic values.
 *
 * ### Limiting a schedule
 *
 * ```ts
 * import { done, exponential, take, testCreateDeps } from "@evolu/common";
 *
 * // Three exponential retries, then Done.
 * const step = take(3)(exponential("100ms"))(testCreateDeps());
 * step(undefined);
 * step(undefined);
 * step(undefined);
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Limiting
 */
export const take =
  (n: Int0To100OrNonNegativeInt) =>
  <Output, Input>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    let attempt = 0;
    return (input) => {
      attempt++;
      if (attempt > n) return err(done());
      return step(input);
    };
  };

/**
 * Limits schedule execution to a maximum elapsed time since its first step.
 *
 * After `duration` has elapsed since the first step, returns `Err(Done<void>)`.
 *
 * ### Limiting elapsed time
 *
 * ```ts
 * import {
 *   done,
 *   exponential,
 *   maxElapsed,
 *   testCreateDeps,
 * } from "@evolu/common";
 *
 * // Retry for at most 30 seconds.
 * const deps = testCreateDeps();
 * const step = maxElapsed("30s")(exponential("1s"))(deps);
 * expectOk(step(undefined), [1000, 1000]);
 * deps.time.advance("30s");
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Limiting
 */
export const maxElapsed = (duration: Duration) => {
  const maxMs = durationToMillis(duration);
  return <Output, Input>(
      schedule: Schedule<Output, Input>,
    ): Schedule<Output, Input> =>
    (deps) => {
      const step = schedule(deps);
      const metrics = createScheduleStepMetrics(deps);
      let stopped = false;
      return (input) => {
        if (stopped) return err(done());
        const { elapsed } = metrics();
        if (elapsed >= maxMs) {
          stopped = true;
          return err(done());
        }
        return step(input);
      };
    };
};

/**
 * Caps the delay to a maximum value.
 *
 * If the schedule returns a delay greater than `max`, returns `max` instead.
 *
 * ### Capping delays
 *
 * ```ts
 * import { exponential, maxDelay, testCreateDeps } from "@evolu/common";
 *
 * // Exponential delays grow 1s, 2s, 4s, 8s, then stay capped at 10s.
 * const step = maxDelay("10s")(exponential("1s"))(testCreateDeps());
 * step(undefined);
 * step(undefined);
 * step(undefined);
 * step(undefined);
 * expectOk(step(undefined), [16000, 10000]);
 * ```
 *
 * @group Limiting
 */
export const maxDelay = (max: Duration) => {
  const maxMs = durationToMillis(max);
  return <Output, Input>(
      schedule: Schedule<Output, Input>,
    ): Schedule<Output, Input> =>
    (deps) => {
      const step = schedule(deps);
      return (input) => {
        const result = step(input);
        if (!result.ok) return result;
        const [output, delay] = result.value;
        return ok([output, min(delay, maxMs)]);
      };
    };
};

/**
 * Randomizes delays by up to a percentage.
 *
 * Jitter helps prevent "thundering herd" when many clients retry simultaneously
 * after a service recovers. By default, the original delay is the upper bound:
 *
 * - `"0%"` — no jitter (original delay)
 * - `"50%"` — equal jitter, shortens the delay by up to 50%
 * - `"100%"` — full jitter, shortens the delay by up to 100%
 *
 * Pass `"around"` to preserve the average delay for periodic work:
 *
 * - `"0%"` — no jitter (original delay)
 * - `"50%"` — varies by up to 50% below or above the original delay
 * - `"100%"` — varies by up to 100% below or above the original delay
 *
 * ### Jittering below or around a delay
 *
 * ```ts
 * import {
 *   exponential,
 *   jitter,
 *   spaced,
 *   testCreateDeps,
 *   type RandomNumber,
 * } from "@evolu/common";
 *
 * const deps = {
 *   ...testCreateDeps(),
 *   random: { next: () => 0.5 as RandomNumber },
 * };
 *
 * // Shorten retry delays by at most 25%.
 * const conservative = jitter("25%")(exponential("1s"));
 * // Poll around a 30s target cadence, from 27s to 33s.
 * const polling = jitter("10%", "around")(spaced("30s"));
 *
 * expectOk(conservative(deps)(undefined), [1000, 875]);
 * expectOk(polling(deps)(undefined), [30000, 30000]);
 * ```
 *
 * @group Delay
 */
export const jitter = (
  percentage: Percentage = "50%",
  mode: "below" | "around" = "below",
): (<Output, Input>(
  schedule: Schedule<Output, Input>,
) => Schedule<Output, Input>) => {
  const ratio = percentageToRatio(percentage);
  return createJitter(ratio, mode === "around" ? 1 + ratio : 1);
};

const createJitter =
  (factor: Ratio, maxMultiplier: number) =>
  <Output, Input>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    return (input) => {
      const result = step(input);
      if (!result.ok) return result;
      const [output, delay] = result.value;
      const minMultiplier = 1 - factor;
      const jittered =
        delay *
        (minMultiplier + deps.random.next() * (maxMultiplier - minMultiplier));
      return ok([output, saturateComputedMillis(jittered)]);
    };
  };

/**
 * Replaces the schedule's first delay.
 *
 * The first successful step uses `initialDelay` instead of the delay produced
 * by the schedule. Subsequent steps use the schedule's delays unchanged.
 *
 * ### Replacing the first delay
 *
 * ```ts
 * import { delayed, exponential, testCreateDeps } from "@evolu/common";
 *
 * const step = delayed("1s")(exponential("100ms"))(testCreateDeps());
 * // Only the first delay is replaced; later exponential delays are unchanged.
 * expectOk(step(undefined), [100, 1000]);
 * expectOk(step(undefined), [200, 200]);
 * ```
 *
 * @group Delay
 */
export const delayed = (initialDelay: Duration) => {
  const initialMs = durationToMillis(initialDelay);
  return <Output, Input>(
      schedule: Schedule<Output, Input>,
    ): Schedule<Output, Input> =>
    (deps) => {
      const step = schedule(deps);
      let first = true;
      return (input) => {
        const result = step(input);
        if (!result.ok) return result;
        if (first) {
          first = false;
          return ok([result.value[0], initialMs]);
        }
        return result;
      };
    };
};

/**
 * Adds a fixed delay to the schedule's existing delay.
 *
 * ### Adding to every delay
 *
 * ```ts
 * import { addDelay, exponential, testCreateDeps } from "@evolu/common";
 *
 * // Add 500ms to every exponential delay.
 * const step = addDelay("500ms")(exponential("100ms"))(testCreateDeps());
 * expectOk(step(undefined), [100, 600]);
 * ```
 *
 * @group Delay
 */
export const addDelay = (
  extra: Duration,
): (<Output, Input>(
  schedule: Schedule<Output, Input>,
) => Schedule<Output, Input>) => {
  const extraMs = durationToMillis(extra);
  return modifyDelay((d) => d + extraMs);
};

/**
 * Transforms the delay of a schedule.
 *
 * More flexible than {@link maxDelay} — can implement any delay transformation.
 *
 * ### Transforming delays
 *
 * ```ts
 * import { exponential, modifyDelay, testCreateDeps } from "@evolu/common";
 *
 * // Arbitrary transformations can double or cap delays.
 * const slower = modifyDelay((delay) => delay * 2)(exponential("100ms"));
 * // Equivalent to maxDelay("10s") for this schedule.
 * const capped = modifyDelay((delay) => Math.min(delay, 10000))(
 *   exponential("20s"),
 * );
 * const deps = testCreateDeps();
 *
 * expectOk(slower(deps)(undefined), [100, 200]);
 * expectOk(capped(deps)(undefined), [20000, 10000]);
 * ```
 *
 * @group Delay
 */
export const modifyDelay =
  (f: (delay: Millis) => number) =>
  <Output, Input>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    return (input) => {
      const result = step(input);
      if (!result.ok) return result;
      const [output, delay] = result.value;
      return ok([output, saturateComputedMillis(f(delay))]);
    };
  };

/**
 * Adjusts delay by subtracting time elapsed beyond the previously returned
 * delay.
 *
 * In a normal executor loop, this corresponds to the previous execution time.
 * If the runtime wakes later than requested, the extra lag is also compensated.
 * If execution and lag took longer than the delay, returns 0.
 *
 * When composing with delay-shaping combinators such as {@link maxDelay}, put
 * `compensate` near the outside of the stack so it observes the final returned
 * delay.
 *
 * For window-aligned scheduling, use {@link fixed} instead.
 *
 * ### Compensating for execution time
 *
 * ```ts
 * import { compensate, spaced, testCreateDeps } from "@evolu/common";
 *
 * const fastDeps = testCreateDeps();
 * const fastStep = compensate(spaced("5s"))(fastDeps);
 * expectOk(fastStep(undefined), [5000, 5000]);
 * // Five seconds waiting plus one second working leaves four seconds.
 * fastDeps.time.advance("6s");
 * expectOk(fastStep(undefined), [5000, 4000]);
 *
 * const slowDeps = testCreateDeps();
 * const slowStep = compensate(spaced("5s"))(slowDeps);
 * expectOk(slowStep(undefined), [5000, 5000]);
 * // Five seconds waiting plus six seconds working leaves no delay.
 * slowDeps.time.advance("11s");
 * expectOk(slowStep(undefined), [5000, 0]);
 * ```
 *
 * @group Delay
 */
export const compensate =
  <Output, Input>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    const metrics = createScheduleStepMetrics(deps);
    let previousReturnedDelay = minMillis;
    return (input) => {
      const { elapsedSincePrevious } = metrics();
      const result = step(input);
      if (!result.ok) return result;
      const [output, delay] = result.value;
      const executionTime = saturateComputedMillis(
        elapsedSincePrevious - previousReturnedDelay,
      );
      const compensatedDelay = saturateComputedMillis(delay - executionTime);
      previousReturnedDelay = compensatedDelay;
      return ok([output, compensatedDelay]);
    };
  };

/**
 * Continues while the input satisfies a predicate.
 *
 * Stops (returns `Err(Done<void>)`) when {@link Predicate} returns `false`.
 * Useful for input-aware retry strategies, e.g., only retry certain error
 * types.
 *
 * ### Continuing by input
 *
 * ```ts
 * import {
 *   done,
 *   exponential,
 *   testCreateDeps,
 *   whileScheduleInput,
 *   type Typed,
 * } from "@evolu/common";
 *
 * interface MyError extends Typed<"Transient" | "Fatal"> {}
 *
 * // Retry only transient errors.
 * const retryTransient = whileScheduleInput(
 *   (error: MyError) => error.type === "Transient",
 * )(exponential("100ms"));
 * const step = retryTransient(testCreateDeps());
 * expectOk(step({ type: "Transient" }), [100, 100]);
 * expectErr(step({ type: "Fatal" }), done());
 * ```
 *
 * @group Filtering
 */
export const whileScheduleInput =
  <Input>(predicate: Predicate<Input>) =>
  <Output>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    let stopped = false;
    return (input) => {
      if (stopped) return err(done());
      if (!predicate(input)) {
        stopped = true;
        return err(done());
      }
      return step(input);
    };
  };

/**
 * Continues until the input satisfies a predicate.
 *
 * Stops (returns `Err(Done<void>)`) when {@link Predicate} returns `true`.
 * Useful for stopping retry on specific error conditions.
 *
 * ### Stopping by input
 *
 * ```ts
 * import {
 *   done,
 *   exponential,
 *   testCreateDeps,
 *   untilScheduleInput,
 *   type Typed,
 * } from "@evolu/common";
 *
 * interface MyError extends Typed<"Transient" | "Fatal"> {}
 *
 * // Stop retrying when an error is fatal.
 * const stopOnFatal = untilScheduleInput(
 *   (error: MyError) => error.type === "Fatal",
 * )(exponential("100ms"));
 * const step = stopOnFatal(testCreateDeps());
 * expectOk(step({ type: "Transient" }), [100, 100]);
 * expectErr(step({ type: "Fatal" }), done());
 * ```
 *
 * @group Filtering
 */
export const untilScheduleInput =
  <Input>(predicate: Predicate<Input>) =>
  <Output>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    let stopped = false;
    return (input) => {
      if (stopped) return err(done());
      if (predicate(input)) {
        stopped = true;
        return err(done());
      }
      return step(input);
    };
  };

/**
 * Continues while the output satisfies a predicate.
 *
 * Stops (returns `Err(Done<void>)`) when {@link Predicate} returns `false`.
 *
 * ### Continuing by output
 *
 * ```ts
 * import {
 *   done,
 *   exponential,
 *   testCreateDeps,
 *   whileScheduleOutput,
 *   type Millis,
 * } from "@evolu/common";
 *
 * // Continue while the exponential delay is below five seconds.
 * const capped = whileScheduleOutput((delay: Millis) => delay < 5000)(
 *   exponential("1s"),
 * );
 * const step = capped(testCreateDeps());
 * step(undefined);
 * step(undefined);
 * step(undefined);
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Filtering
 */
export const whileScheduleOutput =
  <Output>(predicate: Predicate<Output>) =>
  <Input>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    let stopped = false;
    return (input) => {
      if (stopped) return err(done());
      const result = step(input);
      if (!result.ok) return result;
      if (!predicate(result.value[0])) {
        stopped = true;
        return err(done());
      }
      return result;
    };
  };

/**
 * Continues until the output satisfies a predicate.
 *
 * Stops (returns `Err(Done<void>)`) when {@link Predicate} returns `true`.
 *
 * ### Stopping by output
 *
 * ```ts
 * import {
 *   done,
 *   exponential,
 *   testCreateDeps,
 *   untilScheduleOutput,
 *   type Millis,
 * } from "@evolu/common";
 *
 * // Stop once the exponential delay reaches at least one second.
 * const limited = untilScheduleOutput((delay: Millis) => delay >= 1000)(
 *   exponential("100ms"),
 * );
 * const step = limited(testCreateDeps());
 * step(undefined);
 * step(undefined);
 * step(undefined);
 * step(undefined);
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Filtering
 */
export const untilScheduleOutput =
  <Output>(predicate: Predicate<Output>) =>
  <Input>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    let stopped = false;
    return (input) => {
      if (stopped) return err(done());
      const result = step(input);
      if (!result.ok) return result;
      if (predicate(result.value[0])) {
        stopped = true;
        return err(done());
      }
      return result;
    };
  };

/**
 * Resets a running schedule after a period of inactivity.
 *
 * Before each step, if the time since the previous step is at least `duration`,
 * replaces the wrapped schedule with fresh state. Once the wrapped schedule
 * returns `Done`, termination is final.
 *
 * ### Resetting after inactivity
 *
 * ```ts
 * import {
 *   exponential,
 *   resetScheduleAfter,
 *   testCreateDeps,
 * } from "@evolu/common";
 *
 * const backoff = resetScheduleAfter("1m")(exponential("1s"));
 * const deps = testCreateDeps();
 * const step = backoff(deps);
 * expectOk(step(undefined), [1000, 1000]);
 * deps.time.advance("1m");
 * expectOk(step(undefined), [1000, 1000]);
 * ```
 *
 * @group State
 */
export const resetScheduleAfter = (
  duration: DurationLiteral | PositiveMillis,
) => {
  const resetMs = durationToMillis(duration);
  return <Output, Input>(
      schedule: Schedule<Output, Input>,
    ): Schedule<Output, Input> =>
    (deps) => {
      let step = schedule(deps);
      const metrics = createScheduleStepMetrics(deps);
      let stopped = false;
      return (input) => {
        if (stopped) return err(done());
        const { elapsedSincePrevious } = metrics();
        if (elapsedSincePrevious >= resetMs) {
          step = schedule(deps);
        }
        const result = step(input);
        if (!result.ok) stopped = true;
        return result;
      };
    };
};

/**
 * Transforms the output of a schedule.
 *
 * The delay (second tuple element) remains unchanged.
 *
 * ### Mapping schedule output
 *
 * ```ts
 * import {
 *   exponential,
 *   mapSchedule,
 *   testCreateDeps,
 *   type Millis,
 * } from "@evolu/common";
 *
 * const schedule = mapSchedule((delay: Millis) => ({
 *   delay,
 *   doubled: delay * 2,
 * }))(exponential("100ms"));
 * const step = schedule(testCreateDeps());
 * expectOk(step(undefined), [{ delay: 100, doubled: 200 }, 100]);
 * ```
 *
 * @group Transform
 */
export const mapSchedule =
  <A, B>(f: (a: A) => B) =>
  <Input>(schedule: Schedule<A, Input>): Schedule<B, Input> =>
  (deps) => {
    const step = schedule(deps);
    return (input) => {
      const result = step(input);
      if (!result.ok) return result;
      const [output, delay] = result.value;
      return ok([f(output), delay]);
    };
  };

/**
 * Creates a schedule that outputs its input, or wraps an existing schedule to
 * output input instead of the original output.
 *
 * When called with no arguments, creates a schedule that outputs its input
 * directly (the "identity" schedule). When called with a schedule, wraps it to
 * preserve timing behavior but replace output with input.
 *
 * ### Passing through input
 *
 * ```ts
 * import { exponential, passthrough, testCreateDeps } from "@evolu/common";
 *
 * interface MyError {
 *   readonly message: string;
 * }
 *
 * // Constructor form emits input immediately; combinator form keeps timing.
 * const identity = passthrough<MyError>();
 * const withInput = passthrough(exponential("100ms"));
 * const error = { message: "Unavailable" };
 * const deps = testCreateDeps();
 *
 * expectOk(identity(deps)(error), [error, 0]);
 * expectOk(withInput(deps)(error), [error, 100]);
 * ```
 *
 * @group Constructors
 */
export function passthrough<A>(): Schedule<A, A>;
/** @group Transform */
export function passthrough<Output, Input>(
  schedule: Schedule<Output, Input>,
): Schedule<Input, Input>;
export function passthrough<Output, Input>(
  schedule?: Schedule<Output, Input>,
): Schedule<Input, Input> {
  if (schedule === undefined) {
    return () => (input) => ok([input, minMillis]);
  }
  return (deps) => {
    const step = schedule(deps);
    return (input) => {
      const result = step(input);
      if (!result.ok) return result;
      return ok([input, result.value[1]]);
    };
  };
}

/**
 * Folds over the outputs of a schedule, accumulating state.
 *
 * Each step outputs the accumulated value. Useful for tracking totals,
 * collecting outputs, or building up metadata across attempts.
 *
 * ### Folding schedule output
 *
 * ```ts
 * import {
 *   exponential,
 *   foldSchedule,
 *   minMillis,
 *   spaced,
 *   take,
 *   testCreateDeps,
 *   type Millis,
 * } from "@evolu/common";
 *
 * // Accumulate totals, complete output histories, or structured metadata.
 * const withTotal = foldSchedule(
 *   0,
 *   (total: number, delay: Millis) => total + delay,
 * )(exponential("100ms"));
 * const collected = foldSchedule<ReadonlyArray<Millis>, Millis>(
 *   [],
 *   (outputs, delay) => [...outputs, delay],
 * )(take(3)(spaced("1s")));
 * const counted = foldSchedule(
 *   { attempts: 0, lastDelay: minMillis },
 *   (state, delay: Millis) => ({
 *     attempts: state.attempts + 1,
 *     lastDelay: delay,
 *   }),
 * )(exponential("100ms"));
 *
 * const deps = testCreateDeps();
 * const totalStep = withTotal(deps);
 * totalStep(undefined);
 * expectOk(totalStep(undefined), [300, 200]);
 * expectOk(collected(deps)(undefined), [[1000], 1000]);
 * expectOk(counted(deps)(undefined), [
 *   { attempts: 1, lastDelay: 100 },
 *   100,
 * ]);
 * ```
 *
 * @group Transform
 */
export const foldSchedule =
  <Z, Output>(initial: Z, f: (acc: Z, output: Output) => Z) =>
  <Input>(schedule: Schedule<Output, Input>): Schedule<Z, Input> =>
  (deps) => {
    const step = schedule(deps);
    let acc = initial;
    return (input) => {
      const result = step(input);
      if (!result.ok) return result;
      const [output, delay] = result.value;
      acc = f(acc, output);
      return ok([acc, delay]);
    };
  };

/**
 * Wraps a schedule to output the number of repetitions instead of original
 * output.
 *
 * Outputs 0, 1, 2, ... while preserving the underlying schedule's timing and
 * termination behavior.
 *
 * ### Counting repetitions
 *
 * ```ts
 * import { exponential, repetitions, testCreateDeps } from "@evolu/common";
 *
 * // Count retries while preserving exponential timing.
 * const step = repetitions(exponential("100ms"))(testCreateDeps());
 * expectOk(step(undefined), [0, 100]);
 * expectOk(step(undefined), [1, 200]);
 * ```
 *
 * @group Transform
 */
export const repetitions = <Output, Input>(
  schedule: Schedule<Output, Input>,
): Schedule<number, Input> => foldSchedule(-1, (n) => n + 1)(schedule);

/**
 * Outputs the delay between recurrences.
 *
 * Wraps a schedule to output its delay (in milliseconds) instead of the
 * original output. Useful for monitoring or logging delay patterns.
 *
 * ### Exposing and observing delays
 *
 * ```ts
 * import {
 *   delays,
 *   exponential,
 *   tapScheduleOutput,
 *   testCreateDeps,
 *   type Millis,
 * } from "@evolu/common";
 *
 * // Expose delays for monitoring, or observe them without changing output.
 * const monitorDelays = delays(exponential("100ms"));
 * const observed: Array<Millis> = [];
 * const logged = tapScheduleOutput((delay: Millis) => {
 *   observed.push(delay);
 * })(delays(exponential("100ms")));
 * const deps = testCreateDeps();
 *
 * expectOk(monitorDelays(deps)(undefined), [100, 100]);
 * expectOk(logged(deps)(undefined), [100, 100]);
 * expect(observed).toEqual([100]);
 * ```
 *
 * @group Transform
 */
export const delays =
  <Output, Input>(schedule: Schedule<Output, Input>): Schedule<Millis, Input> =>
  (deps) => {
    const step = schedule(deps);
    return (input) => {
      const result = step(input);
      if (!result.ok) return result;
      const [, delay] = result.value;
      return ok([delay, delay]);
    };
  };

/**
 * Collects all outputs into an array.
 *
 * Each step outputs a new snapshot containing all outputs so far. Because all
 * outputs are retained and copied on each step, use this combinator with finite
 * schedules.
 *
 * ### Collecting outputs
 *
 * ```ts
 * import {
 *   collectAllScheduleOutputs,
 *   spaced,
 *   take,
 *   testCreateDeps,
 * } from "@evolu/common";
 *
 * // Retain every delay produced by the finite schedule.
 * const collected = collectAllScheduleOutputs(take(3)(spaced("100ms")));
 * const step = collected(testCreateDeps());
 * step(undefined);
 * expectOk(step(undefined), [[100, 100], 100]);
 * ```
 *
 * @group Collection
 */
export const collectAllScheduleOutputs = <Output, Input>(
  schedule: Schedule<Output, Input>,
): Schedule<ReadonlyArray<Output>, Input> =>
  foldSchedule<ReadonlyArray<Output>, Output>([], (acc, out) => [...acc, out])(
    schedule,
  );

/**
 * Collects all inputs into an array.
 *
 * Each step outputs an array containing all inputs received so far. Mirror of
 * {@link collectAllScheduleOutputs} but for inputs.
 *
 * ### Collecting inputs
 *
 * ```ts
 * import {
 *   collectScheduleInputs,
 *   exponential,
 *   take,
 *   testCreateDeps,
 *   type Millis,
 *   type Schedule,
 * } from "@evolu/common";
 *
 * const retries: Schedule<Millis, string> = take(3)(exponential("100ms"));
 * // Keep every error received during retry.
 * const errorHistory = collectScheduleInputs(retries);
 * const step = errorHistory(testCreateDeps());
 * step("network");
 * expectOk(step("timeout"), [["network", "timeout"], 200]);
 * ```
 *
 * @group Collection
 */
export const collectScheduleInputs = <Output, Input>(
  schedule: Schedule<Output, Input>,
): Schedule<ReadonlyArray<Input>, Input> =>
  collectAllScheduleOutputs(passthrough(schedule));

/**
 * Collects outputs while a predicate is true.
 *
 * More flexible than {@link collectAllScheduleOutputs} — stops collecting when
 * the predicate returns false.
 *
 * ### Collecting while output matches
 *
 * ```ts
 * import {
 *   collectWhileScheduleOutput,
 *   done,
 *   exponential,
 *   testCreateDeps,
 *   type Millis,
 * } from "@evolu/common";
 *
 * // Collect delays only while they remain below one second.
 * const smallDelays = collectWhileScheduleOutput(
 *   (delay: Millis) => delay < 1000,
 * )(exponential("100ms"));
 * const step = smallDelays(testCreateDeps());
 * step(undefined);
 * step(undefined);
 * step(undefined);
 * expectOk(step(undefined), [[100, 200, 400, 800], 800]);
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Collection
 */
export const collectWhileScheduleOutput =
  <Output>(predicate: Predicate<Output>) =>
  <Input>(
    schedule: Schedule<Output, Input>,
  ): Schedule<ReadonlyArray<Output>, Input> =>
    collectAllScheduleOutputs(whileScheduleOutput(predicate)(schedule));

/**
 * Collects outputs until a predicate becomes true.
 *
 * Mirror of {@link collectWhileScheduleOutput} — stops collecting when the
 * predicate returns true.
 *
 * ### Collecting until output matches
 *
 * ```ts
 * import {
 *   collectUntilScheduleOutput,
 *   done,
 *   exponential,
 *   testCreateDeps,
 *   type Millis,
 * } from "@evolu/common";
 *
 * // Collect delays until the next delay reaches at least one second.
 * const untilLarge = collectUntilScheduleOutput(
 *   (delay: Millis) => delay >= 1000,
 * )(exponential("100ms"));
 * const step = untilLarge(testCreateDeps());
 * step(undefined);
 * step(undefined);
 * step(undefined);
 * expectOk(step(undefined), [[100, 200, 400, 800], 800]);
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Collection
 */
export const collectUntilScheduleOutput =
  <Output>(predicate: Predicate<Output>) =>
  <Input>(
    schedule: Schedule<Output, Input>,
  ): Schedule<ReadonlyArray<Output>, Input> =>
    collectAllScheduleOutputs(untilScheduleOutput(predicate)(schedule));

/**
 * Sequences schedules: runs each until it stops, then continues with the next.
 *
 * Useful for adaptive strategies that start aggressive and become more
 * conservative over time.
 *
 * ### Sequencing strategies
 *
 * ```ts
 * import {
 *   exponential,
 *   fixed,
 *   sequenceSchedules,
 *   take,
 *   testCreateDeps,
 * } from "@evolu/common";
 *
 * // Fast retries first, then slower retries, then a steady fallback.
 * const step = sequenceSchedules(
 *   take(3)(exponential("100ms")),
 *   take(5)(fixed("500ms")),
 *   fixed("1s"),
 * )(testCreateDeps());
 * step(undefined);
 * step(undefined);
 * step(undefined);
 * expectOk(step(undefined), [0, 500]);
 * ```
 *
 * @group Composition
 */
export const sequenceSchedules =
  <Output, Input>(
    ...schedules: ReadonlyArray<Schedule<Output, Input>>
  ): Schedule<Output, Input> =>
  (deps) => {
    let index = 0;
    type Step =
      ((input: Input) => NextResult<readonly [Output, Millis]>) | null;
    let currentStep: Step = schedules.length > 0 ? schedules[0](deps) : null;
    return (input) => {
      while (currentStep !== null) {
        const result = currentStep(input);
        if (result.ok) return result;

        // Current exhausted, try next.
        index++;
        currentStep = index < schedules.length ? schedules[index](deps) : null;
      }
      return err(done());
    };
  };

/**
 * Combines two schedules with AND semantics.
 *
 * Continues only while both schedules want to continue. Uses the maximum delay.
 *
 * ### Combining constraints with AND
 *
 * ```ts
 * import {
 *   done,
 *   exponential,
 *   forever,
 *   intersectSchedules,
 *   maxElapsed,
 *   take,
 *   testCreateDeps,
 * } from "@evolu/common";
 *
 * // Retry at most 5 times and only within 30 seconds.
 * const deps = testCreateDeps();
 * const step = intersectSchedules(
 *   take(5)(exponential("1s")),
 *   maxElapsed("30s")(forever),
 * )(deps);
 * expectOk(step(undefined), [[1000, 0], 1000]);
 * deps.time.advance("30s");
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Composition
 */
export const intersectSchedules =
  <OutputA, OutputB, Input>(
    a: Schedule<OutputA, Input>,
    b: Schedule<OutputB, Input>,
  ): Schedule<[OutputA, OutputB], Input> =>
  (deps) => {
    const stepA = a(deps);
    const stepB = b(deps);
    let stopped = false;
    return (input) => {
      if (stopped) return err(done());
      const resultA = stepA(input);
      const resultB = stepB(input);
      if (!resultA.ok || !resultB.ok) {
        stopped = true;
        return err(done());
      }
      const [outputA, delayA] = resultA.value;
      const [outputB, delayB] = resultB.value;
      return ok([[outputA, outputB], max(delayA, delayB)]);
    };
  };

/**
 * Combines two schedules with OR semantics.
 *
 * Continues while either schedule wants to continue. Uses the minimum delay.
 *
 * ### Combining constraints with OR
 *
 * ```ts
 * import {
 *   done,
 *   spaced,
 *   take,
 *   testCreateDeps,
 *   unionSchedules,
 * } from "@evolu/common";
 *
 * // The second policy keeps the union alive after the first one stops.
 * const either = unionSchedules(
 *   take(1)(spaced("100ms")),
 *   take(2)(spaced("200ms")),
 * );
 * const step = either(testCreateDeps());
 * expectOk(step(undefined), [100, 100]);
 * expectOk(step(undefined), [200, 200]);
 * expectErr(step(undefined), done());
 * ```
 *
 * @group Composition
 */
export const unionSchedules =
  <OutputA, OutputB, Input>(
    a: Schedule<OutputA, Input>,
    b: Schedule<OutputB, Input>,
  ): Schedule<OutputA | OutputB, Input> =>
  (deps) => {
    let stepA:
      ((input: Input) => NextResult<readonly [OutputA, Millis]>) | null =
      a(deps);
    let stepB:
      ((input: Input) => NextResult<readonly [OutputB, Millis]>) | null =
      b(deps);
    return (input) => {
      if (stepA === null && stepB === null) return err(done());

      const resultA = stepA?.(input) ?? null;
      const resultB = stepB?.(input) ?? null;

      if (resultA !== null && !resultA.ok) stepA = null;
      if (resultB !== null && !resultB.ok) stepB = null;

      if (!resultA?.ok) return resultB?.ok ? resultB : err(done());
      if (!resultB?.ok) return resultA;

      const [outputA, delayA] = resultA.value;
      const [outputB, delayB] = resultB.value;
      // Use minimum delay, output from the one with smaller delay
      const minDelay = min(delayA, delayB);
      return delayA <= delayB
        ? ok([outputA, minDelay])
        : ok([outputB, minDelay]);
    };
  };

/**
 * Selects between two schedules based on input.
 *
 * If {@link Predicate} returns `true`, uses `altSchedule`; otherwise uses the
 * base schedule. Useful for implementing error-aware backoff where certain
 * errors (e.g., throttling) use different delays.
 *
 * Each branch has independent state. Place combinators such as {@link take}
 * outside `whenInput` when their state must be shared across both branches.
 *
 * ### Selecting a schedule by input
 *
 * ```ts
 * import {
 *   done,
 *   exponential,
 *   take,
 *   testCreateDeps,
 *   whenInput,
 *   type Millis,
 *   type Typed,
 * } from "@evolu/common";
 *
 * interface MyError extends Typed<"Throttled" | "NetworkError"> {}
 *
 * // The outer take shares one retry limit across both error branches.
 * const awsWithThrottling = take(3)(
 *   whenInput<MyError, Millis>(
 *     (error) => error.type === "Throttled",
 *     exponential("1s"),
 *   )(exponential("100ms")),
 * );
 * const step = awsWithThrottling(testCreateDeps());
 * expectOk(step({ type: "Throttled" }), [1000, 1000]);
 * expectOk(step({ type: "NetworkError" }), [100, 100]);
 * expectOk(step({ type: "Throttled" }), [2000, 2000]);
 * expectErr(step({ type: "NetworkError" }), done());
 * ```
 *
 * @group Composition
 */
export const whenInput =
  <Input, Output>(
    predicate: Predicate<Input>,
    altSchedule: Schedule<Output, Input>,
  ) =>
  (schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const normalStep = schedule(deps);
    const altStep = altSchedule(deps);
    let stopped = false;
    return (input) => {
      if (stopped) return err(done());
      const result = predicate(input) ? altStep(input) : normalStep(input);
      if (!result.ok) stopped = true;
      return result;
    };
  };

/**
 * Executes a side effect for every output without altering the schedule.
 *
 * Useful for logging, monitoring, or debugging without changing schedule
 * behavior.
 *
 * ### Observing schedule output
 *
 * ```ts
 * import {
 *   exponential,
 *   retryStrategyAws,
 *   tapScheduleOutput,
 *   testCreateDeps,
 *   type Millis,
 * } from "@evolu/common";
 *
 * // Log each delay for debugging.
 * const messages: Array<string> = [];
 * const logged = tapScheduleOutput((delay: Millis) => {
 *   messages.push(`Next delay: ${delay}ms`);
 * })(exponential("100ms"));
 *
 * // Track the preset's pre-jitter delay candidates without changing it.
 * const recordedCandidates: Array<Millis> = [];
 * const tracked = tapScheduleOutput((candidate: Millis) => {
 *   recordedCandidates.push(candidate);
 * })(retryStrategyAws);
 * const deps = testCreateDeps();
 * logged(deps)(undefined);
 * tracked(deps)(undefined);
 *
 * expect(messages).toEqual(["Next delay: 100ms"]);
 * expect(recordedCandidates).toEqual([50]);
 * ```
 *
 * @group Side effects
 */
export const tapScheduleOutput =
  <Output>(f: (output: Output) => void) =>
  <Input>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    return (input) => {
      const result = step(input);
      if (!result.ok) return result;
      f(result.value[0]);
      return result;
    };
  };

/**
 * Executes a side effect for every input without altering the schedule.
 *
 * Useful for logging errors during retry or monitoring what values are being
 * processed.
 *
 * ### Observing schedule input
 *
 * ```ts
 * import {
 *   exponential,
 *   tapScheduleInput,
 *   testCreateDeps,
 *   type Millis,
 *   type Schedule,
 *   type Typed,
 * } from "@evolu/common";
 *
 * interface MyError extends Typed<"NetworkError" | "Timeout"> {}
 * const retrySchedule: Schedule<Millis, MyError> = exponential("100ms");
 * // Log errors for debugging.
 * const messages: Array<string> = [];
 * const logged = tapScheduleInput((error: MyError) => {
 *   messages.push(`Retrying after error: ${error.type}`);
 * })(retrySchedule);
 *
 * // Or retain just the retry reasons for metrics.
 * const reasons: Array<string> = [];
 * const tracked = tapScheduleInput((error: MyError) => {
 *   reasons.push(error.type);
 * })(retrySchedule);
 * const deps = testCreateDeps();
 * const error: MyError = { type: "NetworkError" };
 * logged(deps)(error);
 * tracked(deps)(error);
 *
 * expect(messages).toEqual(["Retrying after error: NetworkError"]);
 * expect(reasons).toEqual(["NetworkError"]);
 * ```
 *
 * @group Side effects
 */
export const tapScheduleInput =
  <Input>(f: (input: Input) => void) =>
  <Output>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    return (input) => {
      f(input);
      return step(input);
    };
  };

/**
 * AWS SDK for Java 2.1 ordinary-failure retry timing.
 *
 * Exponential backoff (50ms base), max 2 retries (3 total attempts), 20s cap,
 * full jitter.
 *
 * This schedule does not model throttling-specific timing, token accounting, or
 * circuit breaking.
 *
 * @group Retry Strategies
 * @see https://github.com/aws/aws-sdk-java-v2/blob/b69b75f07b6ebd93fd44b032d49b76a3b71fbb90/core/retries/src/main/java/software/amazon/awssdk/retries/DefaultRetryStrategy.java
 */
export const retryStrategyAws: Schedule<Millis> = /*#__PURE__*/ jitter("100%")(
  /*#__PURE__*/ maxDelay("20s")(
    /*#__PURE__*/ take(2)(/*#__PURE__*/ exponential("50ms")),
  ),
);
