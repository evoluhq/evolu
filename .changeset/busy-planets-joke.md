---
"@evolu/common": patch
---

Add Task, async helpers, and concurrency primitives

- `Task<T, E>` - Lazy, cancellable Promise that returns typed Result instead of throwing
- `toTask()` - Convert async functions to Tasks with AbortSignal support
- `wait()` - Delay execution with Duration strings (e.g., "5m", "2h 30m")
- `timeout()` - Add timeout behavior to any Task
- `retry()` - Retry failed operations with exponential backoff and jitter
- `createSemaphore()` - Limit concurrent operations to a specified count
- `createMutex()` - Ensure mutual exclusion (one operation at a time)

**Duration Support:**

- Type-safe duration strings with compile-time validation
- Support for milliseconds, seconds, minutes, hours, and days
- Logical combinations like "1h 30m" or "2s 500ms"

Tasks provide precise type safety for cancellation - AbortError is only included in the error union when an AbortSignal is actually provided. All operations are designed to work together seamlessly for complex async workflows.

## Examples

### toTask

```ts
// Convert an async function to a Task<Result<T, E>> with AbortSignal support
const fetchTask = (url: string) =>
  toTask((context) =>
    tryAsync(
      () => fetch(url, { signal: context?.signal ?? null })
      (error) => ({ type: "FetchError", error }),
    ),
  );

const result = await fetchTask("/api")(/* optional: { signal } */);
```

### wait

```ts
// Delay for a duration string or NonNegativeInt milliseconds
await wait("50ms")();
```

### timeout

```ts
const slow = toTask(async () => ok("done"));
const withTimeout = timeout("200ms", slow);
const r = await withTimeout(); // Result<string, TimeoutError>
```

### retry

```ts
interface FetchError {
  readonly type: "FetchError";
  readonly error: unknown;
}
const task = fetchTask("/api");
const withRetry = retry({ retries: PositiveInt.orThrow(3) }, task);
const r = await withRetry(); // Result<Response, FetchError | RetryError<FetchError>>
```

### createSemaphore

```ts
const semaphore = createSemaphore(3);
const run = (i: number) =>
  semaphore.withPermit(() => wait("50ms")().then(() => i));
const results = await Promise.all([1, 2, 3, 4, 5].map(run)); // [1,2,3,4,5]
```

### createMutex

```ts
const mutex = createMutex();
const seq = (i: number) =>
  mutex.withLock(async () => {
    await wait("10ms")();
    return i;
  });
const results = await Promise.all([1, 2, 3].map(seq)); // executes one at a time
```
