---
"@evolu/common": minor
---

Added Schedule module for composable scheduling strategies.

**Schedule** is a composable abstraction for retry, repeat, and rate limiting. Each schedule is a state machine: calling `schedule(deps)` creates a step function, and each `step(input)` returns `Ok([Output, Millis])` or `Err(Done<void>)` to stop.

**Constructors:**

- `forever` — never stops, no delay (base for composition)
- `once` — runs exactly once
- `recurs(n)` — runs n times
- `spaced(duration)` — constant delay
- `exponential(base, factor?)` — exponential backoff
- `linear(base)` — linear backoff
- `fibonacci(initial)` — Fibonacci backoff
- `fixed(interval)` — window-aligned intervals
- `windowed(interval)` — sleeps until next window boundary
- `fromDelay(duration)` — single delay
- `fromDelays(...durations)` — sequence of delays
- `elapsed` — outputs elapsed time
- `during(duration)` — runs for specified duration
- `always(value)` — constant output
- `unfoldSchedule(initial, next)` — state machine

**Combinators:**

- Limiting: `take`, `maxElapsed`, `maxDelay`
- Delay: `jitter`, `delayed`, `addDelay`, `modifyDelay`, `compensate`
- Filtering: `whileScheduleInput`, `untilScheduleInput`, `whileScheduleOutput`, `untilScheduleOutput`, `resetScheduleAfter`
- Transform: `mapSchedule`, `passthrough`, `foldSchedule`, `repetitions`, `delays`
- Collection: `collectAllScheduleOutputs`, `collectScheduleInputs`, `collectWhileScheduleOutput`, `collectUntilScheduleOutput`
- Composition: `sequenceSchedules`, `intersectSchedules`, `unionSchedules`, `whenInput`
- Side effects: `tapScheduleOutput`, `tapScheduleInput`

**Presets:**

- `retryStrategyAws` — exponential backoff (100ms base), max 2 retries, 20s cap, full jitter
