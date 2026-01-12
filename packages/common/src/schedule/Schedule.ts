import { fibonacciAt, FibonacciIndex } from "../Number.js";
import { RandomDep } from "../Random.js";
import { done, err, NextResult, ok } from "../Result.js";
import {
  Duration,
  durationToMillis,
  Millis,
  minMillis,
  TimeDep,
} from "../Time.js";
import { Predicate } from "../Types.js";

/**
 * Composable scheduling strategies for retry, repeat, and rate limiting.
 *
 * A Schedule uses the State pattern: calling `schedule(deps)` creates a step
 * function with internal state captured in closures. Each call to `step(input)`
 * advances that state and returns `Ok([Output, Millis])` or `Err(Done<void>)`
 * to stop. Multiple calls to `schedule(deps)` create independent state
 * instances.
 *
 * ### Example
 *
 * ```ts
 * import {
 *   exponential,
 *   jitter,
 *   maxDelay,
 *   take,
 * } from "@evolu/common/schedule";
 * import { retry } from "@evolu/common";
 *
 * const fetchWithRetry = retry(
 *   {
 *     // A jittered, capped, limited exponential backoff
 *     schedule: jitter(1)(maxDelay("20s")(take(2)(exponential("100ms")))),
 *   },
 *   fetchData,
 * );
 * ```
 *
 * Or use a preset:
 *
 * ```ts
 * import { retryStrategyAws, retry } from "@evolu/common";
 *
 * const fetchWithRetry = retry({ schedule: retryStrategyAws }, fetchData);
 * ```
 *
 * ## Use Cases
 *
 * - **Retry** — backoff strategies for transient failures
 * - **Repeat** — polling intervals, heartbeats
 * - **Rate limiting** — throttling request frequency
 * - **Circuit breaker** — track failure patterns across attempts
 *
 * @experimental
 */
export type Schedule<out Output, in Input = unknown> = (
  deps: ScheduleDeps,
) => (input: Input) => NextResult<readonly [Output, Millis]>;

/**
 * Dependencies provided to a {@link Schedule}.
 *
 * The executor provides these once, and the schedule uses what it needs.
 *
 * @experimental
 */
export type ScheduleDeps = TimeDep & RandomDep;

/**
 * Internal per-step metrics computed from timestamps.
 *
 * The schedule computes this internally from deps.time.now().
 *
 * @experimental
 */
interface ScheduleStepMetrics {
  /** Current attempt number (1-indexed). */
  readonly attempt: number;
  /** Milliseconds elapsed since the schedule started. */
  readonly elapsed: Millis;
  /** Milliseconds since the previous step. On first step, this is 0. */
  readonly elapsedSincePrevious: Millis;
}

/**
 * Creates an internal per-step metrics tracker.
 *
 * Each call updates internal state and returns computed metrics.
 *
 * @experimental
 */
const createScheduleStepMetrics = (
  deps: TimeDep,
): (() => ScheduleStepMetrics) => {
  let attempt = 0;
  let start: Millis | null = null;
  let previous: Millis | null = null;

  return () => {
    const now = deps.time.now();
    attempt++;
    start ??= now;
    const elapsed = (now - start) as Millis;
    const elapsedSincePrevious =
      previous === null ? (0 as Millis) : ((now - previous) as Millis);
    previous = now;
    return { attempt, elapsed, elapsedSincePrevious };
  };
};

/**
 * A schedule that never stops and has no delay.
 *
 * Outputs the attempt count (0, 1, 2, ...). Useful as a base for composition or
 * for immediate retry without backoff.
 *
 * ### Example
 *
 * ```ts
 * // Retry immediately, up to 5 times
 * const immediate = take(5)(forever);
 * ```
 *
 * @category Constructors
 * @experimental
 */
export const forever: Schedule<number> = () => {
  let attempt = 0;
  return () => ok([attempt++, minMillis]);
};

/**
 * A schedule that runs exactly once with no delay.
 *
 * Convenience for `take(1)(forever)`. Useful for one-shot operations.
 *
 * ### Example
 *
 * ```ts
 * // Execute once, no retry
 * const oneShot = once;
 * ```
 *
 * @category Constructors
 * @experimental
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
 * ### Example
 *
 * ```ts
 * // Retry up to 3 times (4 total attempts including initial)
 * const retry = recurs(3);
 * ```
 *
 * @category Constructors
 * @experimental
 */
export const recurs = (n: number): Schedule<number> => take(n)(forever);

/**
 * Constant delay schedule.
 *
 * Always waits the same duration after each execution completes. Never stops —
 * combine with {@link take} or {@link maxElapsed} to limit.
 *
 * ### Example
 *
 * ```ts
 * // 1s, 1s, 1s, ... (polling)
 * const poll = spaced("1s");
 *
 * // Retry 3 times with 500ms between each
 * const retry = take(3)(spaced("500ms"));
 *
 * // Heartbeat schedule
 * const heartbeat = spaced("30s");
 * ```
 *
 * @category Constructors
 * @experimental
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
 * Computes delay as `base * factor^(attempt - 1)`:
 *
 * - Attempt 1: `base`
 * - Attempt 2: `base * factor`
 * - Attempt 3: `base * factor²`
 * - ...
 *
 * Never stops — combine with {@link take} or {@link maxElapsed} to limit.
 *
 * ### Example
 *
 * ```ts
 * // 100ms, 200ms, 400ms, 800ms, ...
 * const exp = exponential("100ms");
 *
 * // 100ms, 150ms, 225ms, 338ms, ... (gentler growth)
 * const gentle = exponential("100ms", 1.5);
 * ```
 *
 * @category Constructors
 * @experimental
 */
export const exponential =
  (base: Duration, factor = 2): Schedule<Millis> =>
  () => {
    const baseMs = durationToMillis(base);
    let attempt = 0;
    return () => {
      attempt++;
      const rawDelay = baseMs * Math.pow(factor, attempt - 1);
      const delay = Millis.orThrow(Math.max(0, Math.round(rawDelay)));
      return ok([delay, delay]);
    };
  };

/**
 * Linear backoff schedule.
 *
 * Delay increases linearly: `base * attempt`:
 *
 * - Attempt 1: `base`
 * - Attempt 2: `base * 2`
 * - Attempt 3: `base * 3`
 * - ...
 *
 * Never stops — combine with {@link take} or {@link maxElapsed} to limit.
 *
 * ### Example
 *
 * ```ts
 * // 100ms, 200ms, 300ms, 400ms, ...
 * const lin = linear("100ms");
 * ```
 *
 * @category Constructors
 * @experimental
 */
export const linear =
  (base: Duration): Schedule<Millis> =>
  () => {
    const ms = durationToMillis(base);
    let attempt = 0;
    return () => {
      attempt++;
      const delay = Millis.orThrow(ms * attempt);
      return ok([delay, delay]);
    };
  };

/**
 * Fibonacci backoff schedule.
 *
 * Delays follow the Fibonacci sequence, growing more slowly than exponential:
 *
 * - Attempt 1: `initial`
 * - Attempt 2: `initial`
 * - Attempt 3: `initial * 2`
 * - Attempt 4: `initial * 3`
 * - Attempt 5: `initial * 5`
 * - ...
 *
 * Never stops — combine with {@link take} or {@link maxElapsed} to limit.
 *
 * ### Example
 *
 * ```ts
 * // 100ms, 100ms, 200ms, 300ms, 500ms, 800ms, ...
 * const fib = fibonacci("100ms");
 * ```
 *
 * @category Constructors
 * @experimental
 */
export const fibonacci =
  (initial: Duration): Schedule<Millis> =>
  () => {
    const ms = durationToMillis(initial);
    let index = 1;
    return () => {
      const delay = Millis.orThrow(
        ms * fibonacciAt(FibonacciIndex.orThrow(index)),
      );
      index++;
      return ok([delay, delay]);
    };
  };

/**
 * Fixed interval schedule aligned to time windows.
 *
 * Recurs on a fixed interval, outputting the repetition count (0, 1, 2, ...).
 * Unlike {@link spaced}, which waits a duration _after_ each execution, `fixed`
 * maintains a consistent cadence from when the schedule started.
 *
 * If execution takes longer than the interval, the next execution happens
 * immediately but subsequent runs still align to the original window
 * boundaries. This prevents "pile-up" while maintaining predictable timing.
 *
 * ### Example
 *
 * ```ts
 * // Health check every 5 seconds, aligned to windows
 * const healthCheck = take(10)(fixed("5s"));
 *
 * // Cron-like behavior: run at consistent intervals
 * const cronLike = fixed("1m");
 * ```
 *
 * @category Constructors
 * @experimental
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
      return ok([count++, delay as Millis]);
    };
  };

/**
 * Divides the timeline into fixed windows and sleeps until the next boundary.
 *
 * Similar to {@link fixed}, but always sleeps until the next window boundary
 * regardless of when the last execution started. Outputs the repetition count.
 *
 * Useful for aligning executions to regular intervals from the start time.
 *
 * ### Example
 *
 * ```ts
 * // Execute at regular 5-second boundaries from start
 * const aligned = windowed("5s");
 * // If elapsed is 3s, waits 2s. If elapsed is 7s, waits 3s.
 * ```
 *
 * @category Constructors
 * @experimental
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
      return ok([count++, delay as Millis]);
    };
  };

/**
 * A schedule that runs once with a single delay.
 *
 * Convenience for `take(1)(spaced(delay))`. Useful for simple one-shot delays.
 *
 * ### Example
 *
 * ```ts
 * // Wait 1 second then stop
 * const oneShot = fromDelay("1s");
 * ```
 *
 * @category Constructors
 * @experimental
 */
export const fromDelay = (delay: Duration): Schedule<Millis> =>
  take(1)(spaced(delay));

/**
 * A schedule that runs through a sequence of delays.
 *
 * Convenience for sequencing single-delay schedules. Useful for predefined
 * retry patterns.
 *
 * ### Example
 *
 * ```ts
 * // Custom retry sequence: 100ms, 500ms, 2s
 * const custom = fromDelays("100ms", "500ms", "2s");
 * ```
 *
 * @category Constructors
 * @experimental
 */
export const fromDelays = (
  ...delays: ReadonlyArray<Duration>
): Schedule<Millis> => sequence(...delays.map((d) => fromDelay(d)));

/**
 * A schedule that outputs the total elapsed time since the schedule started.
 *
 * Never stops — combine with {@link take} or {@link maxElapsed} to limit. Useful
 * for tracking how long a retry sequence has been running.
 *
 * ### Example
 *
 * ```ts
 * // Track elapsed time alongside retries
 * const withTiming = intersect(exponential("100ms"), elapsed);
 * // Outputs: [[100, 0], [200, ~100], [400, ~300], ...]
 *
 * // Stop after 30 seconds of elapsed time
 * const timeLimited = whileOutput((ms: Millis) => ms < 30000)(elapsed);
 * ```
 *
 * @category Constructors
 * @experimental
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
 * ### Example
 *
 * ```ts
 * // Run for at most 30 seconds
 * const timeLimited = during("30s");
 *
 * // Combine with exponential for time-boxed retry
 * const timedRetry = intersect(exponential("100ms"), during("10s"));
 * ```
 *
 * @category Constructors
 * @experimental
 */
export const during = (duration: Duration): Schedule<Millis> =>
  whileOutput((ms: Millis) => ms <= durationToMillis(duration))(elapsed);

/**
 * A schedule that always outputs a constant value.
 *
 * Never stops — combine with {@link take} or {@link maxElapsed} to limit.
 *
 * ### Example
 *
 * ```ts
 * // Always output "retry"
 * const labeled = succeed("retry");
 *
 * // Combine with timing
 * const withLabel = intersect(exponential("100ms"), succeed("backoff"));
 * ```
 *
 * @category Constructors
 * @experimental
 */
export const succeed = <A>(value: A): Schedule<A> => map(() => value)(forever);

/**
 * Creates a schedule by unfolding a state.
 *
 * Each step outputs the current state and computes the next state using the
 * provided function. Never stops — combine with {@link take} or
 * {@link maxElapsed} to limit.
 *
 * ### Example
 *
 * ```ts
 * // Counter: 0, 1, 2, 3, ...
 * const counter = unfold(0, (n) => n + 1);
 *
 * // Custom backoff: 100, 150, 225, 338, ... (×1.5 each time)
 * const customBackoff = unfold(100, (delay) => Math.round(delay * 1.5));
 *
 * // State machine
 * type Phase = "init" | "warmup" | "active";
 * const phases = unfold<Phase>("init", (phase) => {
 *   switch (phase) {
 *     case "init":
 *       return "warmup";
 *     case "warmup":
 *       return "active";
 *     case "active":
 *       return "active";
 *   }
 * });
 * ```
 *
 * @category Constructors
 * @experimental
 */
export const unfold = <State>(
  initial: State,
  next: (state: State) => State,
): Schedule<State> => {
  return () => {
    let state = initial;
    return () => {
      const current = state;
      state = next(state);
      return ok([current, minMillis]);
    };
  };
};

/**
 * Limits a schedule to a maximum number of attempts.
 *
 * After `n` attempts, returns `Err(Done<void>)` (stop).
 *
 * ### Example
 *
 * ```ts
 * // Exponential backoff, max 3 retries
 * const limited = take(3)(exponential("100ms"));
 * // Attempt 1: 100ms, Attempt 2: 200ms, Attempt 3: 400ms, Attempt 4: Err(Done<void>)
 * ```
 *
 * @category Limiting
 * @experimental
 */
export const take =
  (n: number) =>
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
 * Limits schedule execution to a maximum elapsed time.
 *
 * After `duration` has elapsed since the schedule started, returns
 * `Err(Done<void>)`.
 *
 * ### Example
 *
 * ```ts
 * // Retry for at most 30 seconds
 * const timeLimited = maxElapsed("30s")(exponential("1s"));
 * ```
 *
 * @category Limiting
 * @experimental
 */
export const maxElapsed = (duration: Duration) => {
  const maxMs = durationToMillis(duration);
  return <Output, Input>(
      schedule: Schedule<Output, Input>,
    ): Schedule<Output, Input> =>
    (deps) => {
      const step = schedule(deps);
      const metrics = createScheduleStepMetrics(deps);
      return (input) => {
        const { elapsed } = metrics();
        return elapsed >= maxMs ? err(done()) : step(input);
      };
    };
};

/**
 * Caps the delay to a maximum value.
 *
 * If the schedule returns a delay greater than `max`, returns `max` instead.
 *
 * ### Example
 *
 * ```ts
 * // Exponential capped at 10 seconds
 * const capped = maxDelay("10s")(exponential("1s"));
 * // 1s, 2s, 4s, 8s, 10s, 10s, 10s, ...
 * ```
 *
 * @category Limiting
 * @experimental
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
        return ok([output, Millis.orThrow(Math.min(delay, maxMs))]);
      };
    };
};

/**
 * Adds randomized jitter to delays.
 *
 * Jitter helps prevent "thundering herd" when many clients retry simultaneously
 * after a service recovers. The delay is randomized within a range:
 *
 * - `factor = 0` — no jitter (original delay)
 * - `factor = 0.5` — delay varies ±50% (e.g., 1s becomes 500ms-1500ms)
 * - `factor = 1` — full jitter, delay varies 0-200% (e.g., 1s becomes 0-2s)
 *
 * ### Example
 *
 * ```ts
 * // AWS-style full jitter
 * const awsStyle = jitter(1)(exponential("1s"));
 *
 * // Conservative jitter (±25%)
 * const conservative = jitter(0.25)(exponential("1s"));
 * ```
 *
 * @category Delay
 * @experimental
 */
export const jitter =
  (factor = 0.5) =>
  <Output, Input>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    return (input) => {
      const result = step(input);
      if (!result.ok) return result;
      const [output, delay] = result.value;
      const jittered = delay * (1 - factor + deps.random.next() * 2 * factor);
      return ok([output, Millis.orThrow(Math.max(0, Math.round(jittered)))]);
    };
  };

/**
 * Adds an initial delay before the first attempt.
 *
 * Subsequent attempts use the schedule's normal delays.
 *
 * ### Example
 *
 * ```ts
 * // Wait 1s before first attempt, then exponential backoff
 * const withWarmup = delayed("1s")(exponential("100ms"));
 * ```
 *
 * @category Delay
 * @experimental
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
 * ### Example
 *
 * ```ts
 * // Add 500ms to each delay
 * const slower = addDelay("500ms")(exponential("100ms"));
 * // Delays: 600ms, 700ms, 900ms, 1300ms, ...
 * ```
 *
 * @category Delay
 * @experimental
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
 * ### Example
 *
 * ```ts
 * // Double all delays
 * const slower = modifyDelay((d) => d * 2)(exponential("100ms"));
 *
 * // Cap at 10s (equivalent to maxDelay)
 * const capped = modifyDelay((d) => Math.min(d, 10000))(exponential("1s"));
 * ```
 *
 * @category Delay
 * @experimental
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
      return ok([output, Millis.orThrow(Math.max(0, Math.round(f(delay))))]);
    };
  };

/**
 * Adjusts delay by subtracting execution time.
 *
 * A simple combinator that subtracts the previous execution time from the
 * schedule's delay. If execution took longer than the delay, returns 0.
 *
 * For window-aligned scheduling, use {@link fixed} instead.
 *
 * ### Example
 *
 * ```ts
 * // Poll every 5s, accounting for execution time
 * const polling = compensateExecution(spaced("5s"));
 * // If poll takes 1s → wait 4s. If poll takes 6s → wait 0s.
 * ```
 *
 * @category Delay
 * @experimental
 */
export const compensateExecution =
  <Output, Input>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    const metrics = createScheduleStepMetrics(deps);
    return (input) => {
      const { elapsedSincePrevious } = metrics();
      const result = step(input);
      if (!result.ok) return result;
      const [output, delay] = result.value;
      const adjusted = Math.max(0, delay - elapsedSincePrevious);
      return ok([output, adjusted as Millis]);
    };
  };

/**
 * Continues while the input satisfies a predicate.
 *
 * Stops (returns `Err(Done<void>)`) when {@link Predicate} returns `false`.
 * Useful for input-aware retry strategies, e.g., only retry certain error
 * types.
 *
 * ### Example
 *
 * ```ts
 * interface MyError {
 *   readonly type: "Transient" | "Fatal";
 * }
 *
 * // Only retry transient errors
 * const retryTransient = whileInput(
 *   (error: MyError) => error.type === "Transient",
 * )(exponential("100ms"));
 * ```
 *
 * @category Filtering
 * @experimental
 */
export const whileInput =
  <Input>(predicate: Predicate<Input>) =>
  <Output>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    return (input) => {
      if (!predicate(input)) return err(done());
      return step(input);
    };
  };

/**
 * Continues until the input satisfies a predicate.
 *
 * Stops (returns `Err(Done<void>)`) when {@link Predicate} returns `true`.
 * Useful for stopping retry on specific error conditions.
 *
 * ### Example
 *
 * ```ts
 * interface MyError {
 *   readonly type: "Transient" | "Fatal";
 * }
 *
 * // Stop retrying on fatal errors
 * const stopOnFatal = untilInput(
 *   (error: MyError) => error.type === "Fatal",
 * )(exponential("100ms"));
 * ```
 *
 * @category Filtering
 * @experimental
 */
export const untilInput =
  <Input>(predicate: Predicate<Input>) =>
  <Output>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    return (input) => {
      if (predicate(input)) return err(done());
      return step(input);
    };
  };

/**
 * Continues while the output satisfies a predicate.
 *
 * Stops (returns `Err(Done<void>)`) when {@link Predicate} returns `false`.
 *
 * ### Example
 *
 * ```ts
 * // Continue while delay is under 5 seconds
 * const capped = whileOutput((delay: Millis) => delay < 5000)(
 *   exponential("1s"),
 * );
 * ```
 *
 * @category Filtering
 * @experimental
 */
export const whileOutput =
  <Output>(predicate: Predicate<Output>) =>
  <Input>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    return (input) => {
      const result = step(input);
      if (!result.ok) return result;
      if (!predicate(result.value[0])) return err(done());
      return result;
    };
  };

/**
 * Continues until the output satisfies a predicate.
 *
 * Stops (returns `Err(Done<void>)`) when {@link Predicate} returns `true`.
 *
 * ### Example
 *
 * ```ts
 * // Stop when delay reaches 1 second
 * const limited = untilOutput((delay: Millis) => delay >= 1000)(
 *   exponential("100ms"),
 * );
 * ```
 *
 * @category Filtering
 * @experimental
 */
export const untilOutput =
  <Output>(predicate: Predicate<Output>) =>
  <Input>(schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
  (deps) => {
    const step = schedule(deps);
    return (input) => {
      const result = step(input);
      if (!result.ok) return result;
      if (predicate(result.value[0])) return err(done());
      return result;
    };
  };

/**
 * Resets the schedule after a period of inactivity.
 *
 * If `elapsedSincePrevious` is greater than or equal to `duration`, creates a
 * fresh state. Useful for circuit breakers that should "forget" failures after
 * idle time.
 *
 * ### Example
 *
 * ```ts
 * // Reset retry count after 1 minute of success
 * const circuitBreaker = resetAfter("1m")(take(5)(exponential("1s")));
 * ```
 *
 * @category State
 * @experimental
 */
export const resetAfter = (duration: Duration) => {
  const resetMs = durationToMillis(duration);
  return <Output, Input>(
      schedule: Schedule<Output, Input>,
    ): Schedule<Output, Input> =>
    (deps) => {
      let step = schedule(deps);
      const metrics = createScheduleStepMetrics(deps);
      return (input) => {
        const { elapsedSincePrevious } = metrics();
        if (elapsedSincePrevious >= resetMs) {
          step = schedule(deps);
        }
        return step(input);
      };
    };
};

/**
 * Transforms the output of a schedule.
 *
 * The delay (second tuple element) remains unchanged.
 *
 * ### Example
 *
 * ```ts
 * import { exponential, map } from "@evolu/common/schedule";
 *
 * const schedule = map((delay) => ({
 *   delay,
 *   doubled: delay * 2,
 * }))(exponential("100ms"));
 * ```
 *
 * @category Transform
 * @experimental
 */
export const map =
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
 * ### Example
 *
 * ```ts
 * import { exponential, passthrough } from "@evolu/common/schedule";
 *
 * interface MyError {
 *   readonly message: string;
 * }
 *
 * // Constructor: output equals input
 * const identity = passthrough<MyError>();
 *
 * // Combinator: preserve timing, replace output
 * const withInput = passthrough(exponential("100ms"));
 * ```
 *
 * @category Constructors
 * @experimental
 */
export function passthrough<A>(): Schedule<A, A>;
/**
 * @category Transform
 * @experimental
 */
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
 * ### Example
 *
 * ```ts
 * // Track total delay spent
 * const withTotal = fold(
 *   0,
 *   (total: number, delay: Millis) => total + delay,
 * )(exponential("100ms"));
 * // Outputs: 100, 300, 700, 1500, ... (cumulative)
 *
 * // Collect all outputs
 * const collected = fold([] as Millis[], (acc, delay: Millis) => [
 *   ...acc,
 *   delay,
 * ])(take(3)(spaced("1s")));
 * // Outputs: [1000], [1000, 1000], [1000, 1000, 1000]
 *
 * // Count attempts with custom output
 * const counted = fold(
 *   { attempts: 0, lastDelay: 0 as Millis },
 *   (acc, delay: Millis) => ({
 *     attempts: acc.attempts + 1,
 *     lastDelay: delay,
 *   }),
 * )(exponential("100ms"));
 * ```
 *
 * @category Transform
 * @experimental
 */
export const fold =
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
 * ### Example
 *
 * ```ts
 * // Track how many retries occurred
 * const counted = repetitions(exponential("100ms"));
 * // Outputs: 0, 1, 2, ... with exponential delays
 * ```
 *
 * @category Transform
 * @experimental
 */
export const repetitions = <Output, Input>(
  schedule: Schedule<Output, Input>,
): Schedule<number, Input> => fold(-1, (n) => n + 1)(schedule);

/**
 * Outputs the delay between recurrences.
 *
 * Wraps a schedule to output its delay (in milliseconds) instead of the
 * original output. Useful for monitoring or logging delay patterns.
 *
 * ### Example
 *
 * ```ts
 * // Monitor exponential delays
 * const monitorDelays = delays(exponential("100ms"));
 * // Outputs: 100, 200, 400, 800, ... (the delays themselves)
 *
 * // Log delays for debugging
 * const logged = tapOutput(console.log)(delays(exponential("100ms")));
 * ```
 *
 * @category Transform
 * @experimental
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
 * Each step outputs an array containing all outputs so far.
 *
 * ### Example
 *
 * ```ts
 * // Collect all delays
 * const collected = collectAllOutputs(take(3)(spaced("100ms")));
 * // Outputs: [100], [100, 100], [100, 100, 100]
 * ```
 *
 * @category Collection
 * @experimental
 */
export const collectAllOutputs = <Output, Input>(
  schedule: Schedule<Output, Input>,
): Schedule<ReadonlyArray<Output>, Input> =>
  fold<ReadonlyArray<Output>, Output>([], (acc, out) => [...acc, out])(
    schedule,
  );

/**
 * Collects all inputs into an array.
 *
 * Each step outputs an array containing all inputs received so far. Mirror of
 * {@link collectAllOutputs} but for inputs.
 *
 * ### Example
 *
 * ```ts
 * // Collect all errors during retry
 * const errorHistory = collectInputs(take(3)(exponential("100ms")));
 * // After 3 retries, outputs array of all error inputs
 * ```
 *
 * @category Collection
 * @experimental
 */
export const collectInputs = <Output, Input>(
  schedule: Schedule<Output, Input>,
): Schedule<ReadonlyArray<Input>, Input> =>
  collectAllOutputs(passthrough(schedule));

/**
 * Collects outputs while a predicate is true.
 *
 * More flexible than {@link collectAllOutputs} — stops collecting when the
 * predicate returns false.
 *
 * ### Example
 *
 * ```ts
 * // Collect delays while under 1 second
 * const smallDelays = collectWhile((delay: Millis) => delay < 1000)(
 *   exponential("100ms"),
 * );
 * // Outputs: [100], [100, 200], [100, 200, 400], [100, 200, 400, 800], stops
 * ```
 *
 * @category Collection
 * @experimental
 */
export const collectWhile =
  <Output>(predicate: Predicate<Output>) =>
  <Input>(
    schedule: Schedule<Output, Input>,
  ): Schedule<ReadonlyArray<Output>, Input> =>
    collectAllOutputs(whileOutput(predicate)(schedule));

/**
 * Collects outputs until a predicate becomes true.
 *
 * Mirror of {@link collectWhile} — stops collecting when the predicate returns
 * true (inclusive of the matching output).
 *
 * ### Example
 *
 * ```ts
 * // Collect delays until reaching 1 second
 * const untilLarge = collectUntil((delay: Millis) => delay >= 1000)(
 *   exponential("100ms"),
 * );
 * // Outputs: [100], [100, 200], [100, 200, 400], [100, 200, 400, 800], stops
 * ```
 *
 * @category Collection
 * @experimental
 */
export const collectUntil =
  <Output>(predicate: Predicate<Output>) =>
  <Input>(
    schedule: Schedule<Output, Input>,
  ): Schedule<ReadonlyArray<Output>, Input> =>
    collectAllOutputs(untilOutput(predicate)(schedule));

/**
 * Sequences schedules: runs each until it stops, then continues with the next.
 *
 * Useful for adaptive strategies that start aggressive and become more
 * conservative over time.
 *
 * ### Example
 *
 * ```ts
 * // Fast retries first, then slower, then final fallback
 * const adaptive = sequence(
 *   take(3)(exponential("100ms")),
 *   take(5)(fixed("500ms")),
 *   fixed("1s"),
 * );
 * // Runs: 100ms, 200ms, 400ms, then 500ms×5, then 1s forever
 * ```
 *
 * @category Composition
 * @experimental
 */
export const sequence = <Output, Input>(
  ...schedules: ReadonlyArray<Schedule<Output, Input>>
): Schedule<Output, Input> => {
  return (deps) => {
    let index = 0;
    type Step =
      | ((input: Input) => NextResult<readonly [Output, Millis]>)
      | null;
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
};

/**
 * Combines two schedules with AND semantics.
 *
 * Continues only while both schedules want to continue. Uses the maximum delay.
 *
 * ### Example
 *
 * ```ts
 * // Retry up to 5 times AND within 30 seconds (both conditions must be met)
 * const both = intersect(
 *   take(5)(exponential("1s")),
 *   maxElapsed("30s")(forever),
 * );
 * ```
 *
 * @category Composition
 * @experimental
 */
export const intersect =
  <OutputA, OutputB, Input>(
    a: Schedule<OutputA, Input>,
    b: Schedule<OutputB, Input>,
  ): Schedule<[OutputA, OutputB], Input> =>
  (deps) => {
    const stepA = a(deps);
    const stepB = b(deps);
    return (input) => {
      const resultA = stepA(input);
      const resultB = stepB(input);
      if (!resultA.ok || !resultB.ok) return err(done());
      const [outputA, delayA] = resultA.value;
      const [outputB, delayB] = resultB.value;
      return ok([[outputA, outputB], Millis.orThrow(Math.max(delayA, delayB))]);
    };
  };

/**
 * Combines two schedules with OR semantics.
 *
 * Continues while either schedule wants to continue. Uses the minimum delay.
 *
 * ### Example
 *
 * ```ts
 * // Retry up to 5 times OR up to 30 seconds, whichever is longer
 * const either = union(
 *   take(5)(exponential("1s")),
 *   maxElapsed("30s")(forever),
 * );
 * ```
 *
 * @category Composition
 * @experimental
 */
export const union =
  <OutputA, OutputB, Input>(
    a: Schedule<OutputA, Input>,
    b: Schedule<OutputB, Input>,
  ): Schedule<OutputA | OutputB, Input> =>
  (deps) => {
    const stepA = a(deps);
    const stepB = b(deps);
    return (input) => {
      const resultA = stepA(input);
      const resultB = stepB(input);

      if (!resultA.ok && !resultB.ok) return err(done());
      if (!resultA.ok) return resultB;
      if (!resultB.ok) return resultA;

      const [outputA, delayA] = resultA.value;
      const [outputB, delayB] = resultB.value;
      // Use minimum delay, output from the one with smaller delay
      const minDelay = Math.min(delayA, delayB) as Millis;
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
 * ### Example
 *
 * ```ts
 * interface MyError {
 *   readonly type: "Throttled" | "NetworkError";
 * }
 *
 * const awsWithThrottling = whenInput<MyError, Millis>(
 *   (error) => error.type === "Throttled",
 *   exponential("1s"), // throttled: 1s base
 * )(exponential("100ms")); // normal: 100ms base
 * ```
 *
 * @category Composition
 * @experimental
 */
export const whenInput = <Input, Output>(
  predicate: Predicate<Input>,
  altSchedule: Schedule<Output, Input>,
) => {
  return (schedule: Schedule<Output, Input>): Schedule<Output, Input> =>
    (deps) => {
      const normalStep = schedule(deps);
      const altStep = altSchedule(deps);
      return (input) => {
        if (predicate(input)) return altStep(input);
        return normalStep(input);
      };
    };
};

/**
 * Executes a side effect for every output without altering the schedule.
 *
 * Useful for logging, monitoring, or debugging without changing schedule
 * behavior.
 *
 * ### Example
 *
 * ```ts
 * // Log each delay for debugging
 * const logged = tapOutput((delay: Millis) => {
 *   console.log(`Next delay: ${delay}ms`);
 * })(exponential("100ms"));
 *
 * // Track metrics
 * const recorded: Array<Millis> = [];
 * const tracked = tapOutput((delay: Millis) => {
 *   recorded.push(delay);
 * })(retryStrategyAws);
 * ```
 *
 * @category Side Effects
 * @experimental
 */
export const tapOutput =
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
 * ### Example
 *
 * ```ts
 * interface MyError {
 *   readonly type: string;
 * }
 *
 * const retrySchedule: Schedule<Millis, MyError> = exponential("100ms");
 *
 * // Log each error during retry
 * const logged = tapInput((error: MyError) => {
 *   console.log(`Retrying after error: ${error.type}`);
 * })(retrySchedule);
 *
 * // Track retry reasons
 * const reasons: Array<string> = [];
 * const tracked = tapInput((error: MyError) => {
 *   reasons.push(error.type);
 * })(retrySchedule);
 * ```
 *
 * @category Side Effects
 * @experimental
 */
export const tapInput =
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
 * AWS Standard Retry Strategy.
 *
 * Exponential backoff (100ms base), max 2 retries (3 total attempts), 20s cap,
 * full jitter.
 *
 * @category Retry Strategies
 * @experimental
 * @see https://github.com/aws/aws-sdk-java-v2/blob/master/core/retries/src/main/java/software/amazon/awssdk/retries/StandardRetryStrategy.java
 * @see https://github.com/aws/aws-sdk-java-v2/blob/master/core/retries/src/main/java/software/amazon/awssdk/retries/DefaultRetryStrategy.java
 */
export const retryStrategyAws: Schedule<Millis> = jitter(1)(
  maxDelay("20s")(take(2)(exponential("100ms"))),
);

/**
 * AWS Throttled Retry Strategy.
 *
 * Like {@link retryStrategyAws} but with 1s base delay for rate limiting errors.
 * Use with {@link whenInput} to select based on error type.
 *
 * @category Retry Strategies
 * @experimental
 * @see https://github.com/aws/aws-sdk-java-v2/blob/master/core/retries/src/main/java/software/amazon/awssdk/retries/DefaultRetryStrategy.java
 */
export const retryStrategyAwsThrottled: Schedule<Millis> = jitter(1)(
  maxDelay("20s")(take(2)(exponential("1s"))),
);
