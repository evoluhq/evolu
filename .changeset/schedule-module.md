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
- `succeed(value)` — constant output
- `unfold(initial, next)` — state machine

**Combinators:**

- Limiting: `take`, `maxElapsed`, `maxDelay`
- Delay: `jitter`, `delayed`, `addDelay`, `modifyDelay`, `compensateExecution`
- Filtering: `whileInput`, `untilInput`, `whileOutput`, `untilOutput`, `resetAfter`
- Transform: `map`, `passthrough`, `fold`, `repetitions`, `delays`
- Collection: `collectAllOutputs`, `collectInputs`, `collectWhile`, `collectUntil`
- Composition: `sequence`, `intersect`, `union`, `whenInput`
- Side effects: `tapOutput`, `tapInput`

**Presets:**

- `retryStrategyAws` — exponential backoff (100ms base), max 2 retries, 20s cap, full jitter
- `retryStrategyAwsThrottled` — same but with 1s base for rate limiting

All APIs are marked `@experimental`.
