# @evolu/common

## 8.0.0-next.2

### Patch Changes

- b096543: Added test coverage proving that `createSlip21` normalizes numeric path elements to strings.

## 8.0.0-next.1

### Major Changes

- 45e62ac: Updated the time testing API and added deterministic test ids.

  **Breaking changes:**
  - Changed `testCreateTime({ autoIncrement })` to accept `"microtask" | "sync"` instead of `boolean`

  **Added:**
  - Added `testCreateId()` for deterministic branded and unbranded ids in tests

### Minor Changes

- a883a8c: Added signal-aware relay authorization and exposed the actual bound port from Node.js relays.

  Added WebSocket test helpers for native client setup and raw upgrade requests.

  Made relay storage count duplicate timestamped messages only once when computing owner usage.

- 0af46e1: Added Map and WeakMap upsert helpers and binary-type improvements to `@evolu/common`.
  - Added `LookupMap.getOrInsert` and `LookupMap.getOrInsertComputed` for lookup-key-aware insert-or-read operations that preserve the first logical key representative.
  - Added the `ArrayBuffer` base `Type` and formatter support.
  - Installed `Map` and `WeakMap` collection upsert polyfills in `installPolyfills()` for runtimes that do not provide them yet.
  - Normalized `WebSocket.send` binary payload handling so `Uint8Array` views backed by `ArrayBuffer` stay zero-copy while `SharedArrayBuffer`-backed views are cloned into a sendable `Uint8Array`.

## 8.0.0-next.0

### Major Changes

- 98a4b6c: Refactored the Array module with breaking changes, better naming, and new helpers.

  ### Breaking Changes

  **Removed `isNonEmptyReadonlyArray`** — use `isNonEmptyArray` instead. The function now handles both mutable and readonly arrays via overloads:

  ```ts
  // Before
  if (isNonEmptyReadonlyArray(readonlyArr)) { ... }
  if (isNonEmptyArray(mutableArr)) { ... }

  // After — one function for both
  if (isNonEmptyArray(readonlyArr)) { ... }
  if (isNonEmptyArray(mutableArr)) { ... }
  ```

  **Renamed mutation functions** for consistency with the `...Array` suffix pattern:
  - `shiftArray` → `shiftFromArray`
  - `popArray` → `popFromArray`

  ### New Constants
  - **`emptyArray`** — use as a default or initial value to avoid allocating new empty arrays

  ### New Functions
  - **`arrayFrom`** — creates a readonly array from an iterable or by generating elements with a length and mapper
  - **`arrayFromAsync`** — creates a readonly array from an async iterable (or iterable of promises) and awaits all values
  - **`flatMapArray`** — maps each element to an array and flattens the result, preserving non-empty type when applicable
  - **`concatArrays`** — concatenates two arrays, returning non-empty when at least one input is non-empty
  - **`sortArray`** — returns a new sorted array (wraps `toSorted`), preserving non-empty type
  - **`reverseArray`** — returns a new reversed array (wraps `toReversed`), preserving non-empty type
  - **`spliceArray`** — returns a new array with elements removed/replaced (wraps `toSpliced`)
  - **`zipArray`** — combines multiple arrays into an array of tuples, preserving non-empty type

  ### Migration

  ```ts
  // isNonEmptyReadonlyArray → isNonEmptyArray
  -import { isNonEmptyReadonlyArray } from "@evolu/common";
  +import { isNonEmptyArray } from "@evolu/common";

  // shiftArray → shiftFromArray
  -import { shiftArray } from "@evolu/common";
  +import { shiftFromArray } from "@evolu/common";

  // popArray → popFromArray
  -import { popArray } from "@evolu/common";
  +import { popFromArray } from "@evolu/common";
  ```

- 97f5314: Redesigned Console with structured logging and pluggable outputs

  **Breaking changes:**
  - Replaced `enabled` property with `ConsoleLevel` filtering (trace < debug < log < info < warn < error < silent)
  - Removed `enableLogging` config option - use `level` instead
  - Removed `createConsoleWithTime` - use `createConsoleFormatter` with `format` option
  - Removed `assert` method
  - Changed `TestConsole.getLogsSnapshot()` to `getEntriesSnapshot()` returning `ConsoleEntry` objects
  - Changed `TestConsole.clearLogs()` to `clearEntries()`

  **New features:**
  - Structured `ConsoleEntry` objects with method, path, and args
  - Pluggable `ConsoleOutput` interface for custom destinations (file, network, array)
  - `Console.child(name)` creates derived consoles with path prefixes
  - `children: ReadonlySet<Console>` tracks child consoles for batch operations
  - `name` property identifies consoles
  - `getLevel()`, `setLevel(level | null)`, `hasOwnLevel()` for runtime level control
  - `createConsoleFormatter` for timestamps (relative, absolute, iso) and path prefixes
  - `createNativeConsoleOutput` and `createConsoleArrayOutput` built-in outputs
  - Static level inheritance - children inherit parent's level at creation, then are independent
  - `createConsoleStoreOutput` — a `ConsoleOutput` that stores the latest entry in a `ReadonlyStore` for observing log entries (e.g., forwarding from workers to main thread)
  - `createMultiOutput` — fans out entries to multiple outputs (e.g., native console + store)
  - Simplified `testCreateConsole` to delegate to `createConsole` internally

- 5275b07: Replaced `evolu.createQuery` with standalone `createQueryBuilder` function

  Queries are now created using a standalone `createQueryBuilder` function instead of `evolu.createQuery` method. This enables query creation without an Evolu instance, improving code organization and enabling schema-first development.

  ```ts
  // Before
  const todosQuery = evolu.createQuery((db) =>
    db.selectFrom("todo").selectAll(),
  );

  // After
  const createQuery = createQueryBuilder(Schema);
  const todosQuery = createQuery((db) => db.selectFrom("todo").selectAll());
  ```

- cd6b74d: Removed the root `kysely` namespace export and exposed Evolu's SQLite JSON helpers as explicit named exports.

  Use `evoluJsonArrayFrom`, `evoluJsonObjectFrom`, `evoluJsonBuildObject`, `kyselySql`, and `KyselyNotNull` from `@evolu/common` instead of `kysely.jsonArrayFrom`, `kysely.jsonObjectFrom`, `kysely.jsonBuildObject`, `kysely.sql`, and `kysely.NotNull`.

  ```ts
  // Before
  import { kysely } from "@evolu/common";

  kysely.jsonArrayFrom(...)
  type Name = kysely.NotNull;

  // After
  import {
    evoluJsonArrayFrom,
    evoluJsonBuildObject,
    evoluJsonObjectFrom,
    kyselySql,
    type KyselyNotNull,
  } from "@evolu/common";

  evoluJsonArrayFrom(...)
  type Name = KyselyNotNull;
  ```

- 5a4d172: Updated minimum Node.js version from 22 to 24 (current LTS)
- 87780a3: Renamed `LazyValue<T>` to `Lazy<T>`, renamed `const*` lazy helpers to `lazy*`, and added the `lazy` factory
- 0528425: - Merged `@evolu/common/local-first/Platform.ts` into `@evolu/common/Platform.ts`
  - Made `@evolu/react-web` re-export everything from `@evolu/web`, allowing React users to install only `@evolu/react-web`
- 7fe328d: Changed `ok()` to return `Result<T, never>` and `err()` to return `Result<never, E>` for correct type inference.
- 2abf93d: Refactored SQLite integration to use Task and throw-first semantics
  - Changed `createSqlite` to `Task<Sqlite, never, CreateSqliteDriverDep>`
  - Changed `CreateSqliteDriver` to `Task<SqliteDriver>`
  - Removed `SqliteError` from SQLite driver/task APIs
  - Changed `Sqlite.exec` to return `SqliteExecResult` directly (no `Result<..., SqliteError>`)
  - Changed `Sqlite.transaction` to support callbacks returning either `Result<T, E>` or `void` (no `SqliteError` in the error channel)
  - Changed `Sqlite.export` to return `Uint8Array` directly (no `Result<..., SqliteError>`)
  - Simplified `SqliteDriver.exec` by removing the `isMutation` parameter, so the driver determines read vs write internally
  - Replaced `options.memory` and `options.encryptionKey` with a discriminated `options.mode` field (`"memory"` | `"encrypted"`)
  - Updated Expo and op-sqlite drivers to match the new API
  - Added SQLite schema metadata primitives (`SqliteSchema`, `SqliteIndex`, `eqSqliteIndex`, `getSqliteSchema`, `getSqliteSnapshot`)
  - Added `testSetupSqlite` helper for SQLite tests

  Why `SqliteError` was removed:
  - In Evolu, SQLite runs in-process. Failures are infrastructure-level and unrecoverable at the call site.
  - Wrapping these failures as `Result` values did not create meaningful recovery paths; callers still had to fail.
  - The correct behavior is to let such failures throw and surface them through platform `createRun` global handlers (web, nodejs, react-native), which report uncaught errors via Evolu `console.error`.
  - Evolu also propagates `console.error` entries through its messaging layer into the shared `evoluError` global store, so app-level error subscriptions still receive these failures.

  Boundary handling:
  - At protocol boundaries (for example Protocol ↔ Storage), error handling remains explicit.
  - Since storage implementations may throw, boundary code uses `try/catch`, logs with `console.error(error)`, and returns protocol-level outcomes.
  - Protocol handles all thrown errors as boundary concerns, without coupling to SQLite-specific error types.

- d30b95a: Refactored Time module for type safety, consistency, and better abstractions.

  **Type safety:**
  - Changed `Time.now()` return type from `number` to `Millis`
  - Added `Millis` branded type with efficient 6-byte serialization (max value: year 10889)
  - Added `minMillis` and `maxMillis` constants
  - `now()` now throw on invalid values for consistent error handling

  **Timer abstraction:**
  - Added `Time.setTimeout` and `Time.clearTimeout` for platform-agnostic timers
  - Added `TimeoutId` opaque type for timeout handles
  - Added `TestTime` interface with `advance()` for controllable time in tests
  - Added `testCreateTime` with `startAt` and `autoIncrement` options
  - Added `setTimeout(duration)` helper that returns a Promise

  **Duration literals:**
  - Renamed `DurationString` to `DurationLiteral`
  - Each duration has exactly one canonical form (e.g., "1000ms" must be written as "1s")
  - Added decimal support: "1.5s" (1500ms), "1.5h" (90 minutes)
  - Added weeks ("1w" to "51w") and years ("1y" to "99y")
  - Removed combination syntax ("1h 30m") in favor of decimals ("1.5h")
  - Months not supported (variable length)

  **UI responsiveness constants:**
  - `ms60fps` (16ms frame budget at 60fps)
  - `ms120fps` (8ms frame budget at 120fps)
  - `msLongTask` (50ms long task threshold for use with `yieldNow`)

  **Formatting utilities:**
  - Added `formatMillisAsDuration(millis)` - formats as human-readable duration (`1.234s`, `1m30.000s`, `1h30m45.000s`)
  - Added `formatMillisAsClockTime(millis)` - formats as clock time (`HH:MM:SS.mmm`)
  - Added `/*#__PURE__*/` annotation to `Millis` for better tree-shaking

- 953c1fb: Replaced interface-based symmetric encryption with direct function-based API

  ### Breaking Changes

  **Removed:**
  - `SymmetricCrypto` interface
  - `SymmetricCryptoDep` interface
  - `createSymmetricCrypto()` factory function
  - `SymmetricCryptoDecryptError` error type

  **Added:**
  - `encryptWithXChaCha20Poly1305()` - Direct encryption function with explicit algorithm name
  - `decryptWithXChaCha20Poly1305()` - Direct decryption function
  - `XChaCha20Poly1305Ciphertext` - Branded type for ciphertext
  - `Entropy24` - Branded type for 24-byte nonces
  - `DecryptWithXChaCha20Poly1305Error` - Algorithm-specific error type
  - `xChaCha20Poly1305NonceLength` - Constant for nonce length (24)

  ### Migration Guide

  **Before:**

  ```ts
  const symmetricCrypto = createSymmetricCrypto({ randomBytes });
  const { nonce, ciphertext } = symmetricCrypto.encrypt(plaintext, key);
  const result = symmetricCrypto.decrypt(ciphertext, key, nonce);
  ```

  **After:**

  ```ts
  const [ciphertext, nonce] = encryptWithXChaCha20Poly1305({ randomBytes })(
    plaintext,
    key,
  );
  const result = decryptWithXChaCha20Poly1305(ciphertext, nonce, key);
  ```

  **Error handling:**

  ```ts
  // Before
  if (!result.ok && result.error.type === "SymmetricCryptoDecryptError") { ... }

  // After
  if (!result.ok && result.error.type === "DecryptWithXChaCha20Poly1305Error") { ... }
  ```

  **Dependency injection:**

  ```ts
  // Before
  interface Deps extends SymmetricCryptoDep { ... }

  // After - only encrypt needs RandomBytesDep
  interface Deps extends RandomBytesDep { ... }
  ```

  ### Rationale

  This change improves API extensibility by using explicit function names instead of a generic interface. Adding new encryption algorithms (e.g., `encryptWithAES256GCM`) is now straightforward without breaking existing code.

- 9ba5442: Renamed `TransferableError` to `UnknownError` to better reflect its purpose as a wrapper for unknown errors caught at runtime, not just errors that need to be transferred between contexts
- c24ec2f: **Breaking:** Standard Schema validation now returns JSON-serialized errors instead of formatted messages

  Users who need human-readable messages should deserialize the error and format it using appropriate `TypeErrorFormatter`s:

  ```ts
  const result = MyType["~standard"].validate(input);
  if (!result.ok) {
    for (const issue of result.issues) {
      const error = JSON.parse(issue.message);
      const message = formatTypeError(error);
      // use message...
    }
  }
  ```

  This gives consumers full control over error formatting while keeping the Standard Schema integration simple.

- 4be336d: Refactored worker abstraction to support all platforms uniformly:
  - Added platform-agnostic worker interfaces: `Worker<Input, Output>`, `SharedWorker<Input, Output>`, `MessagePort<Input, Output>`, `MessageChannel<Input, Output>`
  - Added worker-side interfaces: `WorkerSelf<Input, Output>` and `SharedWorkerSelf<Input, Output>` for typed worker `self` wrappers
  - Changed `onMessage` from a method to a property for consistency with Web APIs
  - Made all worker and message port interfaces `Disposable` for proper resource cleanup
  - Added default generic parameters (`Output = never`) for simpler one-way communication patterns
  - Added complete web platform implementations: `createWorker`, `createSharedWorker`, `createMessageChannel`, `createWorkerSelf`, `createSharedWorkerSelf`, `createMessagePort`
  - Added React Native polyfills for Workers and MessageChannel

### Minor Changes

- 6fc3bba: Added `todo` function, a development placeholder that always throws

  Use to sketch function bodies before implementing them. TypeScript infers the return type from context, so surrounding code still type-checks. Use an explicit generic when there is no return type annotation.

  ```ts
  // Type inferred from return type annotation
  const fetchUser = (id: UserId): Result<User, FetchError> => todo();

  expectTypeOf(fetchUser).returns.toEqualTypeOf<Result<User, FetchError>>();

  // Explicit generic when no return type
  const getConfig = () => todo<Config>();

  expectTypeOf(getConfig).returns.toEqualTypeOf<Config>();
  ```

- 2f39c8e: Added new types and utilities to Types.ts:
  - `Awaitable<T>` - type for values that can be sync or async
  - `isPromiseLike` - type guard to check if a value is a PromiseLike
  - `Digit`, `Digit1To9`, `Digit1To6`, `Digit1To23`, `Digit1To51`, `Digit1To99`, `Digit1To59` - template literal types for numeric validation
  - `UnionToIntersection<U>` - converts a union to an intersection

  `Awaitable<T>` represents values that can be either synchronous or asynchronous (`T | PromiseLike<T>`). This type is useful for functions that may complete synchronously or asynchronously depending on runtime conditions.

  `isPromiseLike()` is a type guard to check if an Awaitable value is async, allowing conditional await only when necessary.

- ce83b24: Added `assertType` helper for asserting values against Evolu Types.

  Uses the Type name as the default error message to keep assertion failures readable.

  ```ts
  const length = buffer.getLength();
  assertType(NonNegativeInt, length, "buffer length should be non-negative");
  ```

- f0bbebb: Added `createObjectURL` helper for safe, disposable `URL.createObjectURL` usage using JS Resource management so the URL is disposed automatically when the scope ends.

  Example:

  ```ts
  const handleDownloadDatabaseClick = () => {
    void evolu.exportDatabase().then((data) => {
      using objectUrl = createObjectURL(
        new Blob([data], { type: "application/x-sqlite3" }),
      );

      const link = document.createElement("a");
      link.href = objectUrl.url;
      link.download = `${evolu.name}.sqlite3`;
      link.click();
    });
  };
  ```

- 332dfca: Added pull-based protocol types for modeling three-outcome operations

  New types and utilities for iterators and streams where completion is a normal outcome, not an error:
  - `Done<D>` - Signal type for normal completion with optional summary value
  - `done(value)` - Factory function to create Done instances
  - `NextResult<A, E, D>` - Result that can complete with value, error, or done
  - `nextResult(ok, err, done)` - Factory for creating NextResult Type instances
  - `UnknownNextResult` - Type instance for runtime `.is()` checks
  - `InferDone<R>` - Extracts the done value type from a NextResult
  - `NextTask<T, E, D>` - Task that can complete with value, error, or done
  - `InferTaskDone<T>` - Extracts the done value type from a NextTask

  The naming follows the existing pattern: `Result` → `NextResult`, `Task` → `NextTask`.

- 7da2364: Added Option module for distinguishing absence from nullable values.

  Use Option when the value itself can be `null` or `undefined`. For APIs where `null` means "not found", just use `T | null` directly.

  **Types:**
  - `Option<T>` — `Some<T> | None`
  - `Some<T>` — present value
  - `None` — absent value
  - `InferOption<O>` — extracts value type from Option or Some

  **Functions:**
  - `some(value)` — creates a Some
  - `none` — shared None instance
  - `isSome(option)` — type guard for Some
  - `isNone(option)` — type guard for None
  - `fromNullable(value)` — converts nullable to Option

- 6f1d6ea: Added `RandomNumber` branded type for type-safe random values
  - `RandomNumber` — branded `number` type for values in [0, 1) range
  - `Random.next()` now returns `RandomNumber` instead of `number`
  - Prevents accidentally passing arbitrary numbers where random values are expected

- 5f97e83: Added Result composition helpers for arrays and structs.
  - **`allResult`** — extracts all values from an array/struct of Results, returning the first error if any fails
  - **`mapResult`** — maps items to Results and extracts all values, returning the first error if any fails
  - **`anyResult`** — returns the first successful Result, or the last error if all fail

  ```ts
  // Extract values from array of Results
  const results = [ok(1), ok(2), ok(3)];
  const all = allResult(results); // ok([1, 2, 3])

  // Map items to Results
  const users = mapResult(userIds, fetchUser);
  // Result<ReadonlyArray<User>, FetchError>

  // First success wins
  const result = anyResult([err("a"), ok(42), err("b")]); // ok(42)

  // Struct support
  const struct = allResult({ a: ok(1), b: ok("two") });
  // ok({ a: 1, b: "two" })
  ```

- 3ba2a92: Added Schedule module for composable scheduling strategies.

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

- 5720b0b: Added Set module with type-safe helpers for immutable set operations.

  **Types:**
  - `NonEmptyReadonlySet<T>` — branded type for sets with at least one element (no mutable variant because `clear()`/`delete()` would break the guarantee)

  **Constants:**
  - `emptySet` — singleton empty set to avoid allocations

  **Type guards:**
  - `isNonEmptySet` — narrows to branded `NonEmptyReadonlySet`

  **Transformations:**
  - `addToSet` — returns branded non-empty set with item added
  - `deleteFromSet` — returns new set with item removed
  - `mapSet` — maps over set, preserves non-empty type
  - `filterSet` — filters set with predicate or refinement

  **Accessors:**
  - `firstInSet` — returns first element by insertion order (requires branded type)

- e948269: Added optional equality function to `Ref` and `ReadonlyStore` interface. `Ref.set` and `Ref.modify` now return `boolean` indicating whether state was updated. `Store` now uses `Ref` internally for state management.
- d1f817f: Added Resource management polyfills

  Provides `Symbol.dispose`, `Symbol.asyncDispose`, `DisposableStack`, and `AsyncDisposableStack` for environments without native support (e.g., Safari). This enables the `using` and `await using` declarations for automatic resource cleanup.

  Polyfills are installed automatically when importing `@evolu/common`.

  See `Result.test.ts` for usage patterns combining `Result` with `using`, `DisposableStack`, and `AsyncDisposableStack`.

- b956a5f: Added a new `StructuralMap` module for `Map`-like storage keyed by structural values instead of object identity.

  `StructuralMap` was added for cases where callers already had immutable keys such as JSON-like values, `undefined`, or `Uint8Array` and wanted to look up shared state, cached values, or in-flight work without maintaining a separate canonical string id. Structurally equal arrays, objects, and byte arrays addressed the same entry even when they were different JavaScript instances.

  `StructuralMap` worked by deriving a canonical structural id for each key and storing entries in a native `Map` keyed by that id. Repeated lookups of the same object, array, or `Uint8Array` instance reused cached ids through a `WeakMap`.

  ### Example

  ```ts
  import { createStructuralMap } from "@evolu/common";

  const map = createStructuralMap<
    { readonly id: string; readonly filter: readonly [string, string] },
    string
  >();

  map.set({ id: "items", filter: ["owner", "active"] }, "cached");

  map.get({ id: "items", filter: ["owner", "active"] });
  // => "cached"
  ```

- ece429b: Added Test module for deterministic testing with proper isolation.

  **New exports:**
  - `testCreateDeps()` - Creates fresh test deps per call for test isolation
  - `testCreateRun()` - Test Run with deterministic deps for reproducible fiber IDs, timestamps, and other generated values
  - `TestDeps` type extending `RunDeps` with `TestConsoleDep` (for test assertions) and `RandomLibDep` (for seeded randomness)Ø

  **Pattern:**

  ```ts
  test("my test", () => {
    const deps = testCreateDeps();
    const id = createId(deps);
    // Each test gets fresh, isolated deps
  });

  test("with custom seed", () => {
    const deps = testCreateDeps({ seed: "my-test" });
    // Reproducible randomness
  });
  ```

- 3b74e48: Added `result` Type factory and `typed` overload for props-less discriminants

  **Result Type factory:**
  - `result(okType, errType)` — creates a Type for validating serialized Results from storage, APIs, or message passing
  - `UnknownResult` — validates `Result<unknown, unknown>` for runtime `.is()` checks

  **typed overload:**
  - `typed(tag)` now accepts just a tag without props for simple discriminants like `typed("Pending")`
  - Added `TypedType<Tag, Props?>` helper type for the return type of `typed`

- 9373afa: Added `Typed` interface and `typed` factory for discriminated unions

  Discriminated unions model mutually exclusive states where each variant is a distinct type. This makes illegal states unrepresentable — invalid combinations cannot exist.

  ```ts
  // Type-only usage for static discrimination
  interface Pending extends Typed<"Pending"> {
    readonly createdAt: DateIso;
  }
  interface Shipped extends Typed<"Shipped"> {
    readonly trackingNumber: TrackingNumber;
  }
  type OrderState = Pending | Shipped;

  // Runtime validation with typed() factory
  const Pending = typed("Pending", { createdAt: DateIso });
  const Shipped = typed("Shipped", { trackingNumber: TrackingNumber });
  ```

### Patch Changes

- bfaa2ca: Added Listeners module for publish-subscribe notifications

  ### Example

  ```ts
  // Without payload (default)
  const listeners = createListeners();
  listeners.subscribe(() => console.log("notified"));
  listeners.notify();

  // With typed payload
  const listeners = createListeners<{ id: string }>();
  listeners.subscribe((event) => console.log(event.id));
  listeners.notify({ id: "123" });
  ```

## 7.4.1

### Patch Changes

- e1ed69a: Removed unnecessary assertions and simplified row validation in client storage row processing logic.

## 7.4.0

### Minor Changes

- 1479665: Added Redacted type for safely wrapping sensitive values
  - `Redacted<A>` wrapper prevents accidental exposure via logging, serialization, or inspection
  - `createRedacted(value)` creates a wrapper that returns `<redacted>` for toString/toJSON/inspect
  - `revealRedacted(redacted)` explicitly retrieves the hidden value
  - `isRedacted(value)` type guard for runtime checking
  - `createEqRedacted(eq)` creates equality for redacted values
  - Implements `Disposable` for automatic cleanup via `using` syntax
  - Type-level distinction via branded inner types (e.g., `Redacted<ApiKey>` ≠ `Redacted<DbPassword>`)

## 7.3.0

### Minor Changes

- d957af4: Added `getProperty` helper function

  Safely gets a property from a record, returning `undefined` if the key doesn't exist. TypeScript's `Record<K, V>` type assumes all keys exist, but at runtime accessing a non-existent key returns `undefined`. This helper provides proper typing for that case without needing a type assertion.

  ```ts
  const users: Record<string, User> = { alice: { name: "Alice" } };
  const user = getProperty(users, "bob"); // User | undefined
  ```

- a21a9fa: Added `set` Type factory

  The `set` factory creates a Type for validating `Set` instances with typed elements. It validates that the input is a `Set` and that all elements conform to the specified element type.

  ```ts
  const NumberSet = set(Number);

  const result1 = NumberSet.from(new Set([1, 2, 3])); // ok(Set { 1, 2, 3 })
  const result2 = NumberSet.from(new Set(["a", "b"])); // err(...)
  ```

- 604940a: Added `readonly` helper function

  The `readonly` function casts arrays, sets, records, and maps to their readonly counterparts with zero runtime cost. It preserves `NonEmptyArray` as `NonEmptyReadonlyArray` and provides proper type inference for all supported collection types.

### Patch Changes

- a04e86e: Update Result documentation with block scope pattern for multiple void operations

  ```ts
  // Before - inventing names to avoid name clash
  const baseTables = createBaseSqliteStorageTables(deps);
  if (!baseTables.ok) return baseTables;

  const relayTables = createRelayStorageTables(deps);
  if (!relayTables.ok) return relayTables;

  // After - block scopes avoid name clash
  {
    const result = createBaseSqliteStorageTables(deps);
    if (!result.ok) return result;
  }
  {
    const result = createRelayStorageTables(deps);
    if (!result.ok) return result;
  }
  ```

- 5f5a867: Fix forward compatibility by quarantining messages with unknown schema

  Messages with unknown tables or columns are now stored in `evolu_message_quarantine` table instead of being discarded. This fixes an issue where apps had to be updated to receive messages from newer versions. The quarantine table is queryable via `createQuery` and quarantined messages are automatically applied when the schema is updated.

## 7.2.3

### Patch Changes

- adfd6af: Add a typed helper `createRecord` for safely creating prototype-less
  `Record<K, V>` instances (via `Object.create(null)`). This prevents
  prototype pollution and accidental key collisions for object keys that come
  from external sources, like database column names.
- 7e7a191: Fix handling of empty-update mutations and readDbChange

  This patch fixes a bug where a mutation that contains only an `id` (no values) could result in an empty set of `evolu_history` rows for the corresponding timestamp. That caused `readDbChange` to fail when trying to build a CRDT change for syncing. The fix ensures `evolu_history` includes system columns so the storage and sync code always have at least one column to work with.

  Manually tested and snapshots updated.

  Manual verification steps: call `update("todo", { id })` and then invoke
  `readDbChange` via the sync with an empty relay.

## 7.2.2

### Patch Changes

- 37e653c: Improve Owner API documentation and consistency
  - Add `ReadonlyOwner` interface for owners without write keys
  - Export `UnuseOwner` type for better API clarity
  - Improve JSDoc comments across Owner types and related interfaces
  - Rename `BaseOwnerError` to `OwnerError` for consistency
  - Remove `createOwner` from public exports (use specific owner creation functions)
  - Remove transport properties from owner types (now passed via `useOwner`)
  - Add documentation for `OwnerWriteKey` rotation
  - Improve `useOwner` documentation in React and Vue hooks

- de00f0c: Prevent redundant WebSocket close calls

  Added a check to ensure socket.close() is only called if the WebSocket is not already closing or closed, preventing unnecessary operations and potential errors.

## 7.2.1

### Patch Changes

- 84f1663: Rename `Evolu` directory to `local-first`

  Reorganize internal directory structure to better reflect the local-first architecture. The `Evolu` directory in `src` is now named `local-first` across all packages.

  It's not breaking change unless `@evolu/common/evolu` was used (now its `@evolu/common/local-first`). The JSDoc called is "internal" so not considered as public API change.

## 7.2.0

### Minor Changes

- 0830d8b: Add `popArray` function for removing and returning the last element from a non-empty mutable array.

  This complements the existing `shiftArray` function by providing symmetric mutable operations for both ends of arrays. The function ensures type safety by only accepting mutable non-empty arrays and guaranteeing a return value.

## 7.1.0

### Minor Changes

- be0ad00: Added `partitionArray` function and refinement support to `filterArray`.
  - New `partitionArray` function partitions arrays returning a tuple of matched/unmatched with type narrowing support
  - Enhanced `filterArray` with refinement overloads for type-safe filtering (e.g., `PositiveInt.is`)
  - Added `PredicateWithIndex` and `RefinementWithIndex` types for index-aware predicates and type guards
  - Improved documentation and cleaned up module headers

## 7.0.0

### Major Changes

- 36af10c: Improved Array helpers

  Evolu Array helpers for type-safe immutable operations have been improved. See [Array](https://www.evolu.dev/docs/api-reference/common/Array) docs.

- 6452d57: Non-initiator always responds in sync protocol for completion feedback

  The non-initiator (relay) now always responds to sync requests, even when there's no data to send, by returning an empty message (19 bytes). This enables sync completion detection for initiators (clients).

- eec5d8e: Add Task, async helpers, and concurrency primitives
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

- dd3c865: - Added expo-secure-store backend for LocalAuth
  - Added LocalAuth to Expo example app
  - Added native EvoluAvatar to react-native package
  - Added experimental jsdoc note to LocalAuth
  - Moved LocalAuth out of expo deps to it's own export
- 8f0c0d3: Refined system (formerly "default") createdAt column handling

  ### Summary
  - `createdAt` is now derived exclusively from the CRDT `Timestamp`. It is injected automatically only on first insert. You can no longer provide `createdAt` in `upsert` mutation – doing so was an anti‑pattern and is now validated against.
  - Introduced `isInsert` flag to `DbChange` to distinguish initial row creation from subsequent updates; this drives automatic `createdAt` population.
  - Added `ValidDbChangeValues` type to reject system columns (`createdAt`, `updatedAt`, `id`) while allowing `isDeleted`.
  - Clock storage changed from sortable string (`TimestampString`) to compact binary (`blob`) representation for space efficiency and fewer conversions.
  - Removed `timestampToTimestampString` / `timestampStringToTimestamp`; added `timestampToDateIso` for converting CRDT timestamps to ISO dates.
  - Schema validation wording updated: "default column" -> "system column" for clarity.
  - Internal protocol encoding updated (tests reflect new binary clock and flag ordering); snapshots adjusted accordingly.

  ### Notes
  - This change reduces payload size (e.g. from 113 to 97).

- eec5d8e: Replace Mnemonic with OwnerSecret

  OwnerSecret is the fundamental cryptographic primitive from which all owner keys are derived via SLIP-21. Mnemonic is just a representation of this underlying entropy. This change makes the type system more accurate and the cryptographic relationships clearer.

- 6759c31: Rename `ManyToManyMap` to `Relation`.
  - `ManyToManyMap<K, V>` → `Relation<A, B>`
  - `createManyToManyMap` → `createRelation`
  - `getValues` / `getKeys` → `getB` / `getA`
  - `hasPair` / `hasKey` / `hasValue` → `has` / `hasA` / `hasB`
  - `deleteKey` / `deleteValue` → `deleteA` / `deleteB`
  - `keyCount` / `valueCount` / `pairCount` → `aCount` / `bCount` / `size`

- eec5d8e: Replace NanoID with Evolu Id

  Evolu now uses its own ID format instead of NanoID:
  - **Evolu Id**: 16 random bytes from a cryptographically secure random generator, encoded as 22-character Base64Url string (128 bits of entropy)
  - **Breaking change**: ID format changes from 21 to 22 characters
  - **Why**: Provides standard binary serialization (16 bytes), more entropy than NanoID, and native Base64Url encoding support across platforms

- f4a8866: Add owner usage tracking and storage improvements

  ### Breaking Changes
  - Renamed `TransportConfig` to `OwnerTransport` and `WebSocketTransportConfig` to `OwnerWebSocketTransport` for clearer naming
  - Renamed `SqliteStorageBase` to `BaseSqliteStorage` and `createSqliteStorageBase` to `createBaseSqliteStorage`
  - Extracted storage table creation into separate functions: `createBaseSqliteStorageTables` and `createRelayStorageTables` to support serverless deployments where table setup must be separate from storage operations
  - Removed `assertNoErrorInCatch` - it was unnecessary

  ### Features
  - **Owner usage tracking** (in progress): Added `evolu_usage` table and `OwnerUsage` interface to track data consumption metrics per owner (stored bytes, received bytes, sent bytes, first/last timestamps). Table structure is in place but not yet fully implemented
  - **Timestamp privacy documentation**: Added privacy considerations explaining that timestamps are metadata visible to relays, with guidance on implementing local write queues for maximum privacy
  - **React Native polyfills**: Added polyfills for `AbortSignal.any()` and `AbortSignal.timeout()` to support Task cancellation on React Native platforms that don't yet implement these APIs

  ### Performance
  - **isSqlMutation optimization**: Added LRU cache (10,000 entries) to `isSqlMutation` function, restoring Timestamp insert benchmark from 34k back to 57k inserts/sec.

- eec5d8e: Replace `subscribeAppOwner` and `getAppOwner` with `appOwner` promise

  The app owner is now accessed via a promise (`evolu.appOwner`) instead of subscription-based methods. This simplifies the API and aligns with modern async patterns.

  **Breaking changes:**
  - Removed `evolu.subscribeAppOwner()` and `evolu.getAppOwner()`
  - Removed `useAppOwner()` hook from `@evolu/react`
  - Added `evolu.appOwner` promise that resolves to `AppOwner`
  - Updated `appOwnerState()` in `@evolu/svelte` to return promise-based state

  **Migration:**

  ```ts
  // Before
  const unsubscribe = evolu.subscribeAppOwner(() => {
    const owner = evolu.getAppOwner();
  });

  // After
  const owner = await evolu.appOwner;
  ```

  For React, use the `use` hook:

  ```ts
  // Before
  import { useAppOwner } from "@evolu/react";
  const appOwner = useAppOwner();

  // After
  import { use } from "react";
  const evolu = useEvolu();
  const appOwner = use(evolu.appOwner);
  ```

- 0911302: Enhance message integrity by embedding timestamps in encrypted data

  This security enhancement prevents tampering with message timestamps by cryptographically binding them to the encrypted change data, ensuring message integrity and preventing replay attacks with modified timestamps.

- 0777577: Add `ownerId` system column and strict app tables without rowid
  - Add `ownerId` as a system column to all application tables and include it in the primary key.
  - Create app tables as strict, without rowid, and using `any` affinity for user columns to preserve data exactly as stored.
  - Make soft deletes explicit in the sync protocol so `isDeleted` changes are propagated and replayed consistently across devices.

- eec5d8e: # Transport-Based Configuration System

  **BREAKING CHANGE**: Replaced `syncUrl` with flexible `transport` property supporting single transport or array of transports for multiple sync endpoints.

  ## What Changed
  - **Removed** `syncUrl` property from Evolu config
  - **Added** `transport` property accepting a single `Transport` object or array of `Transport` objects
  - **Added** `Transport` type union with initial WebSocket support
  - **Updated** sync system to support Nostr-style relay pools with simultaneous connections
  - **Updated** all examples and documentation to use new transport configuration

  ## Migration Guide

  **Before:**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    syncUrl: "wss://relay.example.com",
  });
  ```

  **After (single transport):**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    transport: { type: "WebSocket", url: "wss://relay.example.com" },
  });
  ```

  **After (multiple transports):**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    transport: [
      { type: "WebSocket", url: "wss://relay1.example.com" },
      { type: "WebSocket", url: "wss://relay2.example.com" },
    ],
  });
  ```

  ## Benefits
  - **Single or multiple relay support**: Use one transport for simplicity or multiple for redundancy
  - **Intuitive API**: Singular property name that accepts both single item and array
  - **Future extensibility**: Ready for upcoming transport types (FetchRelay, Bluetooth, LocalNetwork)
  - **Nostr-style resilience**: Messages broadcast to all connected relays simultaneously when using arrays
  - **Type safety**: Full TypeScript support for transport configurations

  ## Future Transport Types

  The new system is designed to support upcoming transport types:
  - `FetchRelay`: HTTP-based polling for environments without WebSocket support
  - `Bluetooth`: P2P sync for offline collaboration
  - `LocalNetwork`: LAN/mesh sync for local networks

  ## Technical Details
  - Single transports are automatically normalized to arrays internally
  - CRDT messages are sent to all connected transports simultaneously
  - Duplicate message handling relies on CRDT idempotency (no deduplication needed)
  - WebSocket connections auto-reconnect independently
  - Backwards compatibility removed (preview version breaking change)

  This change provides an intuitive API that scales from simple single-transport setups to complex multi-transport configurations, positioning Evolu for a more resilient, multi-transport future.

- de37bd1: Add `ownerId` to all protocol errors (except ProtocolInvalidDataError) and update version negotiation to always include ownerId.
  - Improved protocol documentation for versioning and error handling.
  - Improved E2E tests for protocol version negotiation.
  - Ensured all protocol errors (except for malformed data) are associated with the correct owner.

- 3daa221: Add protocol versioning to EncryptedDbChange

  Protocol version is now encoded as the first field in EncryptedDbChange binary format.

- 05fe5d5: Renaming
  - `CallbackRegistry` → `Callbacks`
  - `createCallbackRegistry` → `createCallbacks`
  - `RefCountedResourceManager` → `Resources`
  - `createRefCountedResourceManager` → `createResources`
  - `ResourceManagerConfig` → `ResourcesConfig`

- 4a82c06: Improve getOrThrow: throw a standard Error with `cause` instead of stringifying the error.
  - Before: `new Error(`Result error: ${JSON.stringify(err)}`)`
  - After: `new Error("getOrThrow failed", { cause: err })`

  Why:
  - Preserve structured business errors for machine parsing via `error.cause`.
  - Avoid brittle stringified error messages and preserve a proper stack trace.

### Minor Changes

- 2f87ac8: Improve Array module docs and refactor helpers.

  **Improvements:**
  - Reorganize Array module documentation with clearer structure, code examples, and categories (Types, Guards, Operations, Transformations, Accessors, Mutations)
  - Swap parameter order in `appendToArray` and `prependToArray` to follow data-first pattern (array parameter first)
  - Add `@category` JSDoc tags to all exported items for better TypeDoc organization
  - Add `### Example` sections to all functions with practical usage demonstrations
  - Update `dedupeArray` to use function overloads (similar to `mapArray`) for better type preservation with non-empty arrays

- 6195115: Relay access control and quota management

  **Access Control**
  - Added `isOwnerAllowed` callback to control which owners can connect to the relay
  - Allows synchronous or asynchronous authorization checks before accepting WebSocket connections
  - Replaces the previous `authenticateOwner` configuration option

  **Quota Management**
  - Added `isOwnerWithinQuota` callback for checking storage limits before accepting writes
  - Relays can now enforce per-owner storage quotas
  - New `ProtocolQuotaError` for quota violations
  - When quota is exceeded, only the affected device stops syncing - other devices continue normally
  - Usage is measured per owner as logical data size, excluding storage implementation overhead

  Check the Relay example in `/apps/relay`.

- 47386b8: Add booleanToSqliteBoolean and sqliteBooleanToBoolean helpers
- 202eaa3: Evolu Relay storage made stateless

  Timestamp insertion strategy state moved from in-memory Map to evolu_usage table. This makes Evolu Relay fully stateless and suitable for serverless environments like AWS Lambda and Cloudflare Workers with Durable Objects.

  The evolu_usage table must be read and written on every message write anyway (for quota checks), so it's natural to use it also for tracking timestamp bounds.

  Evolu Relay is designed to work everywhere SQLite works, and with little effort, also with any other SQL database.

- 13b688f: Add MaybeAsync type and isAsync type guard

  `MaybeAsync<T>` represents values that can be either synchronous or asynchronous (`T | PromiseLike<T>`). This pattern provides performance benefits by avoiding microtask overhead for synchronous operations while maintaining composability.

  `isAsync()` is a type guard to check if a MaybeAsync value is async, allowing conditional await only when necessary.

- a1dfb7a: Add `dedupeArray` helper for immutable array deduplication. The function removes duplicate items from an array, optionally using a key extractor function. Returns a readonly array and does not mutate the input.

  ```ts
  dedupeArray([1, 2, 1, 3, 2]); // [1, 2, 3]

  dedupeArray([{ id: 1 }, { id: 2 }, { id: 1 }], (x) => x.id); // [{ id: 1 }, { id: 2 }]
  ```

- 45c8ca9: Add in-memory database support for testing and temporary data

  This change introduces a new `inMemory` configuration option that allows creating SQLite databases in memory instead of persistent storage. In-memory databases exist only in RAM and are completely destroyed when the process ends, making them ideal for:
  - Testing scenarios where data persistence isn't needed
  - Temporary data processing
  - Forensically safe handling of sensitive data

  **Usage:**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    inMemory: true, // Creates database in memory instead of file
  });
  ```

- 4a960c7: Add optional `createIdAsUuidv7` helper for timestamp‑embedded IDs (UUID v7 layout) while keeping `createId` as the privacy‑preserving default.

  Simplified Id documentation to clearly present the three creation paths:
  - `createId` (random, recommended)
  - `createIdFromString` (deterministic mapping via SHA‑256 first 16 bytes)
  - `createIdAsUuidv7` (timestamp bits for index locality; leaks creation time)

- 6279aea: Add external ID support with `createIdFromString` function
  - Add `createIdFromString` function that converts external string identifiers to valid Evolu IDs using SHA-256
  - Add optional branding support to both `createId` and `createIdFromString` functions
  - Update FAQ documentation with external ID integration examples

- 02e8aa0: Evolu identicons

  Added `createIdenticon` function for generating visually distinct SVG identicons from Evolu `Id` (including branded IDs like `OwnerId`, etc.). For user avatars, visual identity markers, and differentiating entities in UI without storing images.

  ### Features
  - **Multiple styles**: Choose from 4 styles:
    - `"github"` (default): 5×5 grid with horizontal mirroring, inspired by GitHub avatars
    - `"quadrant"`: 2×2 color block grid with direct RGB mapping
    - `"gradient"`: Diagonal stripe pattern with smooth color gradients
    - `"sutnar"`: Ladislav Sutnar-inspired compositional design with adaptive colors
  - **SVG output**: Returns SVG string that can be used directly

  ### Example

  ```ts
  import { createIdenticon } from "@evolu/common";

  // Basic usage with default GitHub style
  const svg = createIdenticon(userId);

  const quadrant = createIdenticon(ownerId, "quadrant");
  const gradient = createIdenticon(postId, "gradient");
  const sutnar = createIdenticon(teamId, "sutnar");
  ```

- f5e4232: Added deleteOwner(ownerId) method to the Storage interface and implementations, enabling complete removal of all data for a given owner, including timestamps, messages, and write keys.
- 31d0d21: Add Cache module with generic cache interface and LRU cache implementation
  - New `Cache<K, V>` interface with `has`, `get`, `set`, `delete` methods
  - New `createLruCache` factory function for creating LRU caches with configurable capacity
  - Keys are compared by reference (standard Map semantics)
  - LRU cache automatically evicts least recently used entries when capacity is reached
  - Both `get` and `set` operations update access order
  - Exposes readonly `map` property for iteration and inspection

  Example:

  ```ts
  const cache = createLruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3); // Evicts "a"
  cache.has("a"); // false
  ```

- 29886ff: Add Standard Schema V1 support

  [Evolu Type](http://localhost:3000/docs/api-reference/common/Type) now supports [Standard Schema](https://standardschema.dev/) V1, enabling interoperability with 40+ validation-compatible tools and frameworks.

  ```ts
  const User = object({
    name: NonEmptyTrimmedString100,
    age: Number,
  });

  const result = User["~standard"].validate({
    name: "Alice",
    age: "not a number",
  });
  // {
  //   issues: [
  //     {
  //       message: 'A value "not a number" is not a number.',
  //       path: ["age"],
  //     },
  //   ],
  // }
  ```

  All error messages have been standardized for consistency.

- 1d8c439: Add `orNull` method to Evolu Type

  Returns the validated value or `null` on failure. Useful when the error is not important and you just want the value or nothing.

  ```ts
  const age = PositiveInt.orNull(userInput) ?? 0;
  ```

- eed43d5: Add `firstInArray` and `lastInArray` helpers

  New helpers for safely accessing the first and last elements of non-empty arrays. Both functions work with `NonEmptyReadonlyArray` to guarantee type-safe access without runtime checks.

## 6.0.1-preview.35

### Patch Changes

- 47386b8: Add booleanToSqliteBoolean and sqliteBooleanToBoolean helpers
- 4a960c7: Add optional `createIdAsUuidv7` helper for timestamp‑embedded IDs (UUID v7 layout) while keeping `createId` as the privacy‑preserving default.

  Simplified Id documentation to clearly present the three creation paths:
  - `createId` (random, recommended)
  - `createIdFromString` (deterministic mapping via SHA‑256 first 16 bytes)
  - `createIdAsUuidv7` (timestamp bits for index locality; leaks creation time)

- 0777577: Add ownerId system column and strict app tables
  - Add `ownerId` as a system column to all application tables and include it in the primary key.
  - Create app tables as strict, without rowid, and using `any` affinity for user columns to preserve data exactly as stored.
  - Make soft deletes explicit in the sync protocol so `isDeleted` changes are propagated and replayed consistently across devices.

## 6.0.1-preview.34

### Patch Changes

- 8f0c0d3: Refined system (formerly "default") createdAt column handling

  ### Summary
  - `createdAt` is now derived exclusively from the CRDT `Timestamp`. It is injected automatically only on first insert. You can no longer provide `createdAt` in `upsert` mutation – doing so was an anti‑pattern and is now validated against.
  - Introduced `isInsert` flag to `DbChange` to distinguish initial row creation from subsequent updates; this drives automatic `createdAt` population.
  - Added `ValidDbChangeValues` type to reject system columns (`createdAt`, `updatedAt`, `id`) while allowing `isDeleted`.
  - Clock storage changed from sortable string (`TimestampString`) to compact binary (`blob`) representation for space efficiency and fewer conversions.
  - Removed `timestampToTimestampString` / `timestampStringToTimestamp`; added `timestampToDateIso` for converting CRDT timestamps to ISO dates.
  - Schema validation wording updated: "default column" -> "system column" for clarity.
  - Internal protocol encoding updated (tests reflect new binary clock and flag ordering); snapshots adjusted accordingly.

  ### Notes
  - This change reduces payload size (e.g. from 113 to 97).

## 6.0.1-preview.33

### Patch Changes

- 2f87ac8: Improve Array module docs and refactor helpers.

  **Improvements:**
  - Reorganize Array module documentation with clearer structure, code examples, and categories (Types, Guards, Operations, Transformations, Accessors, Mutations)
  - Swap parameter order in `appendToArray` and `prependToArray` to follow data-first pattern (array parameter first)
  - Add `@category` JSDoc tags to all exported items for better TypeDoc organization
  - Add `### Example` sections to all functions with practical usage demonstrations
  - Update `dedupeArray` to use function overloads (similar to `mapArray`) for better type preservation with non-empty arrays

## 6.0.1-preview.32

### Patch Changes

- a1dfb7a: Add `dedupeArray` helper for immutable array deduplication. The function removes duplicate items from an array, optionally using a key extractor function. Returns a readonly array and does not mutate the input.

  ```ts
  dedupeArray([1, 2, 1, 3, 2]); // [1, 2, 3]

  dedupeArray([{ id: 1 }, { id: 2 }, { id: 1 }], (x) => x.id); // [{ id: 1 }, { id: 2 }]
  ```

## 6.0.1-preview.31

### Patch Changes

- 202eaa3: Evolu Relay storage made stateless

  Timestamp insertion strategy state moved from in-memory Map to evolu_usage table. This makes Evolu Relay fully stateless and suitable for serverless environments like AWS Lambda and Cloudflare Workers with Durable Objects.

  The evolu_usage table must be read and written on every message write anyway (for quota checks), so it's natural to use it also for tracking timestamp bounds.

  Evolu Relay is designed to work everywhere SQLite works, and with little effort, also with any other SQL database. The core logic is implemented in the language which is very fast and where data is, which is why it's not Rust but SQL 🤓

- eed43d5: Add firstInArray and lastInArray helpers

  New helpers for safely accessing the first and last elements of non-empty arrays. Both functions work with `NonEmptyReadonlyArray` to guarantee type-safe access without runtime checks.

## 6.0.1-preview.30

### Patch Changes

- e2547d2: isOwnerWithinQuota is required, improve docs
- 05fe5d5: Renaming
  - `CallbackRegistry` → `Callbacks`
  - `createCallbackRegistry` → `createCallbacks`
  - `RefCountedResourceManager` → `Resources`
  - `createRefCountedResourceManager` → `createResources`
  - `ResourceManagerConfig` → `ResourcesConfig`

## 6.0.1-preview.29

### Patch Changes

- 36af10c: Improved Array helpers

  Evolu Array helpers for type-safe immutable operations have been improved. See [Array](https://www.evolu.dev/docs/api-reference/common/Array) docs.

- 91c132c: Multiton → Instances

  Multiton has been renamed to Instances with improved API and documentation.
  - `createMultiton` → `createInstances`
  - `disposeInstance` → `delete`
  - Enhanced error handling with AggregateError for multiple disposal failures
  - Clearer documentation focusing on practical use cases (mutexes, hot reloading)

- 6195115: Relay access control and quota management

  **Access Control**
  - Added `isOwnerAllowed` callback to control which owners can connect to the relay
  - Allows synchronous or asynchronous authorization checks before accepting WebSocket connections
  - Replaces the previous `authenticateOwner` configuration option

  **Quota Management**
  - Added `isOwnerWithinQuota` callback for checking storage limits before accepting writes
  - Relays can now enforce per-owner storage quotas
  - New `ProtocolQuotaError` for quota violations
  - When quota is exceeded, only the affected device stops syncing - other devices continue normally
  - Usage is measured per owner as logical data size, excluding storage implementation overhead

  Check the Relay example in `/apps/relay`.

- 13b688f: Add MaybeAsync type and isAsync type guard

  `MaybeAsync<T>` represents values that can be either synchronous or asynchronous (`T | PromiseLike<T>`). This pattern provides performance benefits by avoiding microtask overhead for synchronous operations while maintaining composability.

  `isAsync()` is a type guard to check if a MaybeAsync value is async, allowing conditional await only when necessary.

## 6.0.1-preview.28

### Patch Changes

- 7216d47: Add Multiton

  Multiton manages multiple named instances using a key-based registry with structured disposal. It's used internally for Evolu instance caching to support hot reloading and prevent database corruption from multiple connections.

  See the Multiton documentation for usage patterns and caveats.

## 6.0.1-preview.27

### Patch Changes

- a957aa0: Refactor React Native package structure and remove react-native-quick-base64 dependency

  **Breaking Changes:**
  - Package exports reorganized: use `/expo-sqlite`, `/expo-op-sqlite`, or `/bare-op-sqlite` instead of `/expo-sqlite` and `/op-sqlite`
  - Updated quickstart documentation to reflect new import paths

  **@evolu/react-native:**
  - Reorganized package structure with exports in dedicated `/exports` directory
  - Move SQLite driver implementations into `/sqlite-drivers` directory
  - Created shared dependency initialization in `shared.ts`
  - Removed `react-native-quick-base64` dependency (no longer needed)
  - Added `createExpoDeps.ts` for Expo-specific configuration including SecureStore integration
  - Updated `package.json` exports to include three entry points:
    - `/expo-sqlite` - for Expo projects using expo-sqlite
    - `/expo-op-sqlite` - for Expo projects using @op-engineering/op-sqlite
    - `/bare-op-sqlite` - for bare React Native projects using @op-engineering/op-sqlite
  - Reorganized imports following project guidelines (named imports, top-down organization)

  **@evolu/common:**
  - Added `Platform.ts` module with platform detection utilities
  - Refactored `LocalAuth.ts` constants to follow naming conventions:
    - `AUTH_NAMESPACE` → `localAuth_Namespace`
    - `AUTH_DEFAULT_OPTIONS` → `localAuthDefaultOptions`
    - `AUTH_METAKEY_LAST_OWNER` → `localAuthMetakeyLastOwner` (private)
    - `AUTH_METAKEY_OWNER_NAMES` → `localAuthMetakeyOwnerNames` (private)

  **Documentation:**
  - Updated quickstart guide to remove `react-native-quick-base64` from installation instructions
  - Simplified Expo setup warnings and instructions
  - Updated React Native import example to use `/bare-op-sqlite` path

## 6.0.1-preview.26

### Patch Changes

- f4a8866: Add owner usage tracking and storage improvements

  ### Breaking Changes
  - Renamed `TransportConfig` to `OwnerTransport` and `WebSocketTransportConfig` to `OwnerWebSocketTransport` for clearer naming
  - Renamed `SqliteStorageBase` to `BaseSqliteStorage` and `createSqliteStorageBase` to `createBaseSqliteStorage`
  - Extracted storage table creation into separate functions: `createBaseSqliteStorageTables` and `createRelayStorageTables` to support serverless deployments where table setup must be separate from storage operations
  - Removed `assertNoErrorInCatch` - it was unnecessary

  ### Features
  - **Owner usage tracking** (in progress): Added `evolu_usage` table and `OwnerUsage` interface to track data consumption metrics per owner (stored bytes, received bytes, sent bytes, first/last timestamps). Table structure is in place but not yet fully implemented
  - **Timestamp privacy documentation**: Added privacy considerations explaining that timestamps are metadata visible to relays, with guidance on implementing local write queues for maximum privacy
  - **React Native polyfills**: Added polyfills for `AbortSignal.any()` and `AbortSignal.timeout()` to support Task cancellation on React Native platforms that don't yet implement these APIs

  ### Performance
  - **isSqlMutation optimization**: Added LRU cache (10,000 entries) to `isSqlMutation` function, restoring Timestamp insert benchmark from 34k back to 57k inserts/sec.

- 02e8aa0: Evolu identicons

  Added `createIdenticon` function for generating visually distinct SVG identicons from Evolu `Id` (including branded IDs like `OwnerId`, etc.). For user avatars, visual identity markers, and differentiating entities in UI without storing images.

  ### Features
  - **Multiple styles**: Choose from 4 styles:
    - `"github"` (default): 5×5 grid with horizontal mirroring, inspired by GitHub avatars
    - `"quadrant"`: 2×2 color block grid with direct RGB mapping
    - `"gradient"`: Diagonal stripe pattern with smooth color gradients
    - `"sutnar"`: Ladislav Sutnar-inspired compositional design with adaptive colors
  - **SVG output**: Returns SVG string that can be used directly

  ### Example

  ```ts
  import { createIdenticon } from "@evolu/common";

  // Basic usage with default GitHub style
  const svg = createIdenticon(userId);

  const quadrant = createIdenticon(ownerId, "quadrant");
  const gradient = createIdenticon(postId, "gradient");
  const sutnar = createIdenticon(teamId, "sutnar");
  ```

- 31d0d21: Add Cache module with generic cache interface and LRU cache implementation
  - New `Cache<K, V>` interface with `has`, `get`, `set`, `delete` methods
  - New `createLruCache` factory function for creating LRU caches with configurable capacity
  - Keys are compared by reference (standard Map semantics)
  - LRU cache automatically evicts least recently used entries when capacity is reached
  - Both `get` and `set` operations update access order
  - Exposes readonly `map` property for iteration and inspection

  Example:

  ```ts
  const cache = createLruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3); // Evicts "a"
  cache.has("a"); // false
  ```

## 6.0.1-preview.25

### Patch Changes

- 29886ff: Add Standard Schema V1 support

  [Evolu Type](http://localhost:3000/docs/api-reference/common/Type) now supports [Standard Schema](https://standardschema.dev/) V1, enabling interoperability with 40+ validation-compatible tools and frameworks.

  ```ts
  const User = object({
    name: NonEmptyTrimmedString100,
    age: Number,
  });

  const result = User["~standard"].validate({
    name: "Alice",
    age: "not a number",
  });
  // {
  //   issues: [
  //     {
  //       message: 'A value "not a number" is not a number.',
  //       path: ["age"],
  //     },
  //   ],
  // }
  ```

  All error messages have been standardized for consistency.

## 6.0.1-preview.24

### Patch Changes

- 1d8c439: Add `orNull` method to Evolu Type

  Returns the validated value or `null` on failure. Useful when the error is not important and you just want the value or nothing.

  ```ts
  const age = PositiveInt.orNull(userInput) ?? 0;
  ```

## 6.0.1-preview.23

### Patch Changes

- dd3c865: - Added expo-secure-store backend for LocalAuth
  - Added LocalAuth to Expo example app
  - Added native EvoluAvatar to react-native package
  - Added experimental jsdoc note to LocalAuth
  - Moved LocalAuth out of expo deps to it's own export

## 6.0.1-preview.22

### Patch Changes

- 446eac5: Remove dead code comments and improve tests
  - Simplify JSDoc for `loadQuery` to focus on current behavior (caching for Suspense)
  - Add note about SSR behavior to `appOwner`
  - Improve `createEvolu` JSDoc with clearer description and instance caching behavior
  - Improve tests to use proper async/await patterns and avoid mock libraries
  - Add comprehensive test coverage for query loading, subscriptions, and cache behavior

## 6.0.1-preview.21

### Patch Changes

- d913cf9: Add relay authentication support with `authenticateOwner` callback
  - Add `createWebSocketTransportConfig` helper to create WebSocket transports with OwnerId for relay authentication
  - Add `parseOwnerIdFromUrl` to extract OwnerId from URL query strings on relay side
  - Add `authenticateOwner` callback to `RelayConfig` for controlling relay access by OwnerId
  - Add comprehensive relay logging with `createRelayLogger`
  - Refactor `createNodeJsRelay` to return `Result<Relay, SqliteError>` for proper error handling
  - Add HTTP upgrade authentication flow with appropriate status codes (400, 401, 500)
  - Rename `createRelayStorage` to `createRelaySqliteStorage` for clarity
  - Add `ProtocolQuotaExceededError` for storage/billing quota management (placeholder for future implementation)
  - Improve transport configuration documentation with redundancy best practices

## 6.0.1-preview.20

### Patch Changes

- eec5d8e: Add Task, async helpers, and concurrency primitives
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

- eec5d8e: Replace Mnemonic with OwnerSecret

  OwnerSecret is the fundamental cryptographic primitive from which all owner keys are derived via SLIP-21. Mnemonic is just a representation of this underlying entropy. This change makes the type system more accurate and the cryptographic relationships clearer.

- eec5d8e: Replace NanoID with Evolu Id

  Evolu now uses its own ID format instead of NanoID:
  - **Evolu Id**: 16 random bytes from a cryptographically secure random generator, encoded as 22-character Base64Url string (128 bits of entropy)
  - **Breaking change**: ID format changes from 21 to 22 characters
  - **Why**: Provides standard binary serialization (16 bytes), more entropy than NanoID (128 bits vs ~126 bits), and native Base64Url encoding support across platforms

  See the `Id` type documentation for detailed design rationale comparing to NanoID, UUID v4, and UUID v7.

- eec5d8e: Replace `subscribeAppOwner` and `getAppOwner` with `appOwner` promise

  The app owner is now accessed via a promise (`evolu.appOwner`) instead of subscription-based methods. This simplifies the API and aligns with modern async patterns.

  **Breaking changes:**
  - Removed `evolu.subscribeAppOwner()` and `evolu.getAppOwner()`
  - Removed `useAppOwner()` hook from `@evolu/react`
  - Added `evolu.appOwner` promise that resolves to `AppOwner`
  - Updated `appOwnerState()` in `@evolu/svelte` to return promise-based state

  **Migration:**

  ```ts
  // Before
  const unsubscribe = evolu.subscribeAppOwner(() => {
    const owner = evolu.getAppOwner();
  });

  // After
  const owner = await evolu.appOwner;
  ```

  For React, use the `use` hook:

  ```ts
  // Before
  import { useAppOwner } from "@evolu/react";
  const appOwner = useAppOwner();

  // After
  import { use } from "react";
  const evolu = useEvolu();
  const appOwner = use(evolu.appOwner);
  ```

- eec5d8e: # Transport-Based Configuration System

  # Transport-Based Configuration System

  **BREAKING CHANGE**: Replaced `syncUrl` with flexible `transport` property supporting single transport or array of transports for multiple sync endpoints.

  ## What Changed
  - **Removed** `syncUrl` property from Evolu config
  - **Added** `transport` property accepting a single `Transport` object or array of `Transport` objects
  - **Added** `Transport` type union with initial WebSocket support
  - **Updated** sync system to support Nostr-style relay pools with simultaneous connections
  - **Updated** all examples and documentation to use new transport configuration

  ## Migration Guide

  **Before:**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    syncUrl: "wss://relay.example.com",
  });
  ```

  **After (single transport):**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    transport: { type: "WebSocket", url: "wss://relay.example.com" },
  });
  ```

  **After (multiple transports):**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    transport: [
      { type: "WebSocket", url: "wss://relay1.example.com" },
      { type: "WebSocket", url: "wss://relay2.example.com" },
    ],
  });
  ```

  ## Benefits
  - **Single or multiple relay support**: Use one transport for simplicity or multiple for redundancy
  - **Intuitive API**: Singular property name that accepts both single item and array
  - **Future extensibility**: Ready for upcoming transport types (FetchRelay, Bluetooth, LocalNetwork)
  - **Nostr-style resilience**: Messages broadcast to all connected relays simultaneously when using arrays
  - **Type safety**: Full TypeScript support for transport configurations

  ## Future Transport Types

  The new system is designed to support upcoming transport types:
  - `FetchRelay`: HTTP-based polling for environments without WebSocket support
  - `Bluetooth`: P2P sync for offline collaboration
  - `LocalNetwork`: LAN/mesh sync for local networks

  ## Technical Details
  - Single transports are automatically normalized to arrays internally
  - CRDT messages are sent to all connected transports simultaneously
  - Duplicate message handling relies on CRDT idempotency (no deduplication needed)
  - WebSocket connections auto-reconnect independently
  - Backwards compatibility removed (preview version breaking change)

  This change provides an intuitive API that scales from simple single-transport setups to complex multi-transport configurations, positioning Evolu for a more resilient, multi-transport future.

## 6.0.1-preview.19

### Patch Changes

- a2551db: Add deriveSlip21Node

## 6.0.1-preview.18

### Patch Changes

- 2f30dcd: Update deps
- 4a82c06: Improve getOrThrow: throw a standard Error with `cause` instead of stringifying the error.
  - Before: `new Error(`Result error: ${JSON.stringify(err)}`)`
  - After: `new Error("getOrThrow failed", { cause: err })`

  Why:
  - Preserve structured business errors for machine parsing via `error.cause`.
  - Avoid brittle stringified error messages and preserve a proper stack trace.

  Migration:
  - If you matched error messages, switch to inspecting `error.cause`.

## 6.0.1-preview.17

### Patch Changes

- 6eca947: Replace initialData with onInit callback
  - Remove `initialData` function from Config interface
  - Add `onInit` callback with `isFirst` parameter for one-time initialization
  - Simplify database initialization by removing pre-init data handling
  - Provide better control over initialization lifecycle

## 6.0.1-preview.16

### Patch Changes

- af1e668: # Owners refactor and external AppOwner support

  ## 🚀 Features
  - **External AppOwner Support**: `AppOwner` can now be created from external keys without sharing the mnemonic with the Evolu app. The `mnemonic` property is now optional, allowing for better security when integrating with external authentication systems.
  - **New Config Option**: Added `initialAppOwner` configuration option to specify a pre-existing AppOwner when creating an Evolu instance, replacing the previous `mnemonic` option for better encapsulation.

  ## 🔄 Breaking Changes
  - **Owner API Redesign**: Complete refactor of the Owner system with cleaner, more focused interfaces:
    - Simplified `Owner` interface with only essential properties (`id`, `encryptionKey`, `writeKey`)
    - Removed temporal properties (`createdAt`, `timestamp`) from core Owner interface
    - Eliminated complex `OwnerRow` and `OwnerWithWriteAccess` types
  - **Database Schema Changes**:
    - Replaced `evolu_owner` table with streamlined `evolu_config` table
    - New `evolu_version` table for protocol versioning
    - Simplified storage of AppOwner data in single config row
  - **Configuration Changes**:
    - `Config.mnemonic` replaced with `Config.initialAppOwner`
    - More explicit control over owner initialization

  ## ✨ Improvements
  - **Enhanced Documentation**: Comprehensive JSDoc with clear explanations of owner types, use cases, and examples
  - **Clock Management**: New internal clock system for better timestamp handling
  - **Test Coverage**: Extensive test suite covering all owner types and edge cases

  ## 🔧 Internal Changes
  - **Database Initialization**: Refactored database setup to use new schema with better separation of concerns
  - **Protocol Updates**: Updated to protocol version 0 with new storage format

## 6.0.1-preview.15

### Patch Changes

- 6452d57: Non-initiator always responds in sync protocol for completion feedback

  The non-initiator (relay/server) now always responds to sync requests, even when there's no data to send, by returning an empty message (19 bytes). This enables reliable sync completion detection for initiators (clients).

## 6.0.1-preview.14

### Patch Changes

- 0911302: Enhance message integrity by embedding timestamps in encrypted data
  - Add timestamp tamper-proofing to encrypted CRDT messages by embedding the timestamp within the encrypted payload
  - Update `encodeAndEncryptDbChange` to accept `CrdtMessage` instead of `DbChange` and include timestamp in encrypted data
  - Update `decryptAndDecodeDbChange` to verify embedded timestamp matches expected timestamp
  - Add `ProtocolTimestampMismatchError` for timestamp verification failures
  - Export `eqTimestamp` equality function for timestamp comparison
  - Add `timestampBytesLength` constant for consistent binary timestamp size
  - Fix `Db.ts` to pass complete `CrdtMessage` to encryption functions
  - Add test for timestamp tamper-proofing scenarios

  This security enhancement prevents tampering with message timestamps by cryptographically binding them to the encrypted change data, ensuring message integrity and preventing replay attacks with modified timestamps.

- 3daa221: Add protocol versioning to EncryptedDbChange

  Protocol version is now encoded as the first field in EncryptedDbChange binary format. This enables safe evolution of the format while maintaining backward compatibility.

## 6.0.1-preview.13

### Patch Changes

- c4fb4b0: Docs for insert, update, and upsert methods
- e213d63: Improve createdAt handling in mutations

  This release enhances the handling of the `createdAt` column in Evolu mutations, providing more flexibility for data migrations and external system integrations while maintaining distributed system semantics.

  ### Changes

  **createdAt Behavior:**
  - `insert`: Always sets `createdAt` to current timestamp
  - `upsert`: Sets `createdAt` to current timestamp if not provided, or uses custom value if specified
  - `update`: Never sets `createdAt` (unchanged behavior)

  **Documentation Improvements:**
  - Updated JSDoc for `DefaultColumns` with clear explanations of each column's behavior
  - Clarified that `updatedAt` is always set by Evolu and derived from CrdtMessage timestamp
  - Added guidance for using custom timestamp columns when deferring sync for privacy
  - Enhanced mutation method documentation with practical examples

  ### Example

  ```ts
  evolu.upsert("todo", {
    id: externalId,
    title: "Migrated todo",
    createdAt: new Date("2023-01-01"), // Preserve original timestamp
  });
  ```

## 6.0.1-preview.12

### Patch Changes

- 3e824af: Refactor createIdFromString, add tests

## 6.0.1-preview.11

### Patch Changes

- 6279aea: Add external ID support with `createIdFromString` function
  - Add `createIdFromString` function that converts external string identifiers to valid Evolu IDs using SHA-256
  - Add optional branding support to both `createId` and `createIdFromString` functions
  - Update FAQ documentation with external ID integration examples
  - Add tests for new functionality

  This enables deterministic ID generation from external systems while maintaining Evolu's 21-character NanoID format requirement and ensuring consistent conflict resolution across distributed clients.

## 6.0.1-preview.10

### Patch Changes

- 45c8ca9: Add in-memory database support for testing and temporary data

  This change introduces a new `inMemory` configuration option that allows creating SQLite databases in memory instead of persistent storage. In-memory databases exist only in RAM and are completely destroyed when the process ends, making them ideal for:
  - Testing scenarios where data persistence isn't needed
  - Temporary data processing
  - Forensically safe handling of sensitive data

  **Usage:**

  ```ts
  const evolu = createEvolu(deps)(Schema, {
    inMemory: true, // Creates database in memory instead of file
  });
  ```

## 6.0.1-preview.9

### Patch Changes

- 7283ca1: Don't rethrow the decode error

## 6.0.1-preview.8

### Patch Changes

- 04ca08f: Update default syncUrl

## 6.0.1-preview.7

### Patch Changes

- f5e4232: Added deleteOwner(ownerId) method to the Storage interface and implementations, enabling complete removal of all data for a given owner, including timestamps, messages, and write keys.

## 6.0.1-preview.6

### Patch Changes

- 7cd78bf: Added WriteKey rotation protocol support
  - Added WriteKeyMode enum for protocol header (None/Single/Rotation)
  - Updated protocol message structure with separate initiator/non-initiator headers
  - Added createProtocolMessageForWriteKeyRotation function
  - Added storage interface setWriteKey method

## 6.0.1-preview.5

### Patch Changes

- c86cb14: Add timing-safe comparison for WriteKey validation

  ### Security Improvements
  - Add `TimingSafeEqual` type and `TimingSafeEqualDep` interface for platform-independent timing-safe comparison
  - Implement Node.js timing-safe comparison using `crypto.timingSafeEqual()`
  - Replace vulnerable `eqArrayNumber` WriteKey comparison with constant-time algorithm to prevent timing attacks

## 6.0.1-preview.4

### Patch Changes

- 4cc79bb: Added compile-time schema validation with clear error messages
  - Added ValidateSchema type that validates Evolu schemas at compile-time and returns readable error messages instead of cryptic TypeScript errors
  - Schema validation now enforces:
    - All tables must have an 'id' column
    - The 'id' column must be a branded ID type (created with id() function)
    - Tables cannot use default column names (createdAt, updatedAt, isDeleted)
    - All column types must be compatible with SQLite (extend SqliteValue)
  - Enhanced developer experience with actionable error messages like "❌ Schema Error: Table 'todo' is missing required id column"
  - Added test coverage for all validation scenarios

## 6.0.1-preview.3

### Patch Changes

- 2a37317: Update dependencies
- 39cbd9b: Add ownerId into evolu_history table

## 6.0.1-preview.2

### Patch Changes

- 8ff21e5: GitHub release

## 6.0.1-preview.1

### Patch Changes

- de37bd1: Add ownerId to all protocol errors (except ProtocolInvalidDataError) and update version negotiation to always include ownerId.
  - Improved protocol documentation for versioning and error handling.
  - Improved E2E tests for protocol version negotiation.
  - Ensured all protocol errors (except for malformed data) are associated with the correct owner.

## 6.0.1-preview.0

### Patch Changes

- 632768f: Preview release

## 6.0.0

### Major Changes

- Major architectural overhaul:
  - Removed Effect dependency, introduced Evolu Library
  - New binary protocol with RBSR sync for efficient peer-to-peer synchronization
  - Message chunking and improved mutation API
  - Binary database change padding for enhanced privacy
  - Foundation for upcoming ephemeral messages, redacted deletion, and collaboration features
  - TODO: write more descriptive changelog.

## 5.4.0

### Minor Changes

- 19f7d85: Update peer dependencies @effect/platform, @effect/schema

## 5.3.0

### Minor Changes

- ab24e09: Experimental Websocket integration and realtime updates.

  It's only for Evolu Server for now.

### Patch Changes

- c63a2b8: @effect/platform 0.59

## 5.2.3

### Patch Changes

- 91298f3: @effect/platform 0.58

## 5.2.2

### Patch Changes

- 08758d8: @effect/schema 0.68

## 5.2.1

### Patch Changes

- 2183e61: Updated @effect/platform dependency

## 5.2.0

### Minor Changes

- e420fec: New API for working with Evolu instances

  The functions `resetOwner` and `restoreOwner` automatically reload the app to ensure no user data remains in memory. The new option `reload` allows us to opt out of this default behavior. For that reason, both functions return a promise that can be used to provide custom UX. There is also a new `reloadApp` function to reload the app in a platform-specific way (e.g., browsers will reload all tabs with Evolu instances).

  The `createEvolu` function has a new option, `mnemonic`. This option is useful for Evolu multitenancy when creating an Evolu instance with a predefined mnemonic. To create a mnemonic, use the new `createMnemonic` function.

## 5.1.4

### Patch Changes

- f1a8bcd: Update @effect/platform

## 5.1.3

### Patch Changes

- 8e519ca: Update peerDependencies

## 5.1.2

### Patch Changes

- 657262c: Update deps

## 5.1.1

### Patch Changes

- 5b6419a: Schema 0.67

## 5.1.0

### Minor Changes

- 79a6d0c: Time Travel

  Evolu does not delete data; it only marks them as deleted. This is because local-first is a distributed system. There is no central authority (if there is, it's not local-first). Imagine you delete data on some disconnected device and update it on another. Should we throw away changes? Such a deletion would require additional logic to enforce data deletion on all devices forever, even in the future, when some outdated device syncs. It's possible (and planned for Evolu), but it's not trivial because every device has to track data to be rejected without knowing the data itself (for security reasons).

  Not deleting data allows Evolu to provide a time-traveling feature. All data, even "deleted" or overridden, are stored in the evolu_message table. Here is how we can read such data.

  ```ts
  const todoTitleHistory = (id: TodoId) =>
    evolu.createQuery((db) =>
      db
        .selectFrom("evolu_message")
        .select("value")
        .where("table", "==", "todo")
        .where("row", "==", id)
        .where("column", "==", "title")
        .$narrowType<{ value: TodoTable["title"] }>()
        .orderBy("timestamp", "desc"),
    );
  ```

  Note that this API is not 100% typed, but it's not an issue because Evolu Schema shall be append-only. Once an app is released, we shall not change Schema names and types. We can only add new tables and columns because there is a chance current Schema is already used.

## 5.0.3

### Patch Changes

- e8f293f: Add exportDatabase

## 5.0.2

### Patch Changes

- 2b0b8bf: Fix bug

  It was a silly typo; sorry about that. Ironically, tests didn't catch it because that was the one test I didn't port after refactoring. My bad. We will add more tests in the future.

## 5.0.1

### Patch Changes

- af02cf8: Effect is stable, but the platform and schema aren't yet

## 5.0.0

### Major Changes

- d156e67: Multitenancy, stable Effect, refactoring, logging

  Greetings. I spent the last few weeks refactoring Evolu. There are no breaking changes except for one function name. It's a major change because with such a significant refactoring, I can't be 100 % sure I didn't break anything. The core logic remains unchanged, but Evolu uses the Effect library better. When Evolu started with Effect, the website didn't exist yet.

  The initial reason for refactoring Evolu was that I wasn't satisfied with the Web Workers wrapper. I tried Comlink. It's a great library, but it has flaws, as documented in a new ProxyWorker, a lightweight Comlink tailored for Effect. While Effect provides an excellent wrapper for workers, I wanted to try a Comlink-like API. Such a change was a chance to review how Evolu uses Effect, and I realized I used too many Layers for no reason.

  During refactoring, I realized it would be nice if Evolu could run more instances concurrently. So, Evolu now supports multitenancy 🙂.

  I wasn't satisfied with the initial data definition, so I added an API for that, too. And logging. If you are curious about what's happening within Evolu, try the new `minimumLogLevel` Config option. There are also a few minor improvements inside the core logic. Again, there are no breaking changes; it is just better and more readable source code.

  The great news is that Effect is stable now, so there will be no more releases with deps updates. Let's dance 🪩

  New features:
  - Multitenancy (we can run more Evolu instances side by side)
  - Initial data (to define fixtures)
  - Logging (you can see what's happening inside Evolu step by step)
  - Faster and safer DB access (we use shared transactions for reads and special "last" transaction mode for resetting)
  - Stable Effect 🎉

- 30d2a40: `createIndex` replaced with `createIndexes`

  That's why it's a breaking change—a slight change in API. Everything else is backward compatible. Evolu is stable for many major versions.

### Minor Changes

- 69bcf80: Update the minimal TypeScript version to 5.4

## 4.1.1

### Patch Changes

- a0d1e3c: Add config logSql option
- 0afb614: Update Effect and Schema

## 4.1.0

### Minor Changes

- 8af071c: Indexes (or indices, we don't judge)

  This release brings SQLite indexes support to Evolu with two helpful options for `evolu.createQuery` functions.

  ```ts
  const indexes = [
    createIndex("indexTodoCreatedAt").on("todo").column("createdAt"),
  ];

  const evolu = createEvolu(Database, {
    // Try to remove/re-add indexes with `logExplainQueryPlan`.
    indexes,
  });

  const allTodos = evolu.createQuery(
    (db) => db.selectFrom("todo").orderBy("createdAt").selectAll(),
    {
      logExecutionTime: true,
      // logExplainQueryPlan: false,
    },
  );
  ```

  Indexes are not necessary for development but are recommended for production.

  Before adding an index, use `logExecutionTime` and `logExplainQueryPlan`
  createQuery options.

  SQLite has [a tool](https://sqlite.org/cli.html#index_recommendations_sqlite_expert_) for index recommendations.

## 4.0.5

### Patch Changes

- 6e61bb9: Update Effect and Schema

  Rename `Schema.To` to `Schema.Type`.

  All Effect Schema changes are [here](https://github.com/Effect-TS/effect/blob/main/packages/schema/WHATSNEW-0.64.md).

## 4.0.4

### Patch Changes

- 9f92715: Effect 2.4.3, Schema 0.63.4

## 4.0.3

### Patch Changes

- d5038ba: Update Kysely for TypeScript 5.4

## 4.0.2

### Patch Changes

- 1f9168f: Fix SSR

  Evolu server-side rendering was surprisingly problematic because of the React Suspense error: "This Suspense boundary received an update before it finished hydrating."

  If you are curious why a local-first library needs to render something on the server where there is no data, the answer is that if we can render empty rows, we should.

  But because of the React Suspense error, Evolu apps had to be wrapped by the ClientOnly component, which wasn't ideal. Check article:

  https://tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store

  Internally, PlatformName has been replaced with useWasSSR React Hook.

## 4.0.1

### Patch Changes

- aa06cbe: Allow using Kysely `with` and `withRecursive`

  And throw on forbidden SQL mutations.

## 4.0.0

### Major Changes

- 2fe4e16: Add Config name property and remove LocalStorage support.

  It's a breaking change only because PlatformName was restricted. There is no change in sync protocol so that all data can be safely restored.

### Patch Changes

- 01d2554: Update peer dependencies

## 3.1.8

### Patch Changes

- 01d2554: Update peer deps

## 3.1.7

### Patch Changes

- 888b83e: Add platformName property to Evolu.

## 3.1.6

### Patch Changes

- ccd699a: Fix #333

## 3.1.5

### Patch Changes

- f6e198a: Effect 2.40.0, Schema 0.63.0

## 3.1.4

### Patch Changes

- 1cf6502: Update Effect and Schema

## 3.1.3

### Patch Changes

- 106462c: Update Effect and Schema

  Note API change: https://github.com/Effect-TS/effect/releases/tag/effect%402.3.0

## 3.1.2

### Patch Changes

- a59be92: Update Effect and Schema

## 3.1.1

### Patch Changes

- b337e70: Update Effect and Schema

## 3.1.0

### Minor Changes

- ef32952: Add createOrUpdate

  This function is useful when we already have an `id` and want to create a
  new row or update an existing one.

  ```ts
  import * as S from "effect/Schema";
  import { Id } from "@evolu/react";

  // Id can be stable.
  // 2024-02-0800000000000
  const id = S.decodeSync(Id)(date.toString().padEnd(21, "0")) as TodoId;

  evolu.createOrUpdate("todo", { id, title });
  ```

## 3.0.15

### Patch Changes

- 621f3a3: Update deps: Effect, Schema, sqlite-wasm, nanoid, better-sqlite3

## 3.0.14

### Patch Changes

- f1d76d3: Effect 2.2.2 and Schema 0.61.2

  Schema parse renamed to decodeUnknown.

## 3.0.13

### Patch Changes

- 369ff8b: Update peer deps

## 3.0.12

### Patch Changes

- b9e549a: Effect 2.1.2 and Schema 0.60.6

## 3.0.11

### Patch Changes

- ffb503b: Effect 2.1.0 and Schema 0.60.3

## 3.0.10

### Patch Changes

- 3cd5c71: Update deps

## 3.0.9

### Patch Changes

- ff6254b: Update Effect and Schema peer dependencies

  Effect 2 isn't still considered stable; breaking changes can happen in minor versions. Effect 3 will be stable. No worries, they are only tuning APIs.

## 3.0.8

### Patch Changes

- 047b92e: Update Kysely to 0.27.0

  Check [Kysely release](https://github.com/kysely-org/kysely/releases/tag/0.27.0)

  Note simplified `$narrowType` usage. Previous:

  ```ts
  .$narrowType<{ title: NonEmptyString1000 }>()
  ```

  Simplified:

  ```ts
  .$narrowType<{ title: NotNull }>()
  ```

## 3.0.7

### Patch Changes

- a2068f2: Use namespace imports

  Namespace imports make dev faster and build smaller for bundlers without three shaking.

  https://www.effect.website/docs/essentials/importing

## 3.0.6

### Patch Changes

- 1b4e331: Update Effect and Schema peer dependencies

  If you are curious why Effect and Schema peer dependencies must be updated on every release, the reason is that Effect isn't version 2 yet. Hence, it must be pinned to the same version.

## 3.0.5

### Patch Changes

- ac609e1: Update Schema peer dependency

## 3.0.4

### Patch Changes

- e6abac0: Update Effect and Schema deps

## 3.0.3

### Patch Changes

- ebbe716: Export QueryResult type

## 3.0.2

### Patch Changes

- 16d7d5b: Update deps

## 3.0.1

### Patch Changes

- a969843: Add ExtractRow type helper

  Extract `Row` from `Query` instance.

  ```ts
  const allTodos = evolu.createQuery((db) => db.selectFrom("todo").selectAll());
  type AllTodosRow = ExtractRow<typeof allTodos>;
  ```

## 3.0.0

### Major Changes

- d289ac7: Improve table and database schema DX.

  In the previous Evolu version, table and database schemas were created with `S.struct` and validated with createEvolu. Because of how the TypeScript compiler works, type errors were incomprehensible.

  We added two new helper functions to improve a DX: `table` and `database`.

  Previous schema definition:

  ```ts
  const TodoTable = S.struct({
    id: TodoId,
    title: NonEmptyString1000,
  });
  const Database = S.struct({
    todo: TodoTable,
  });
  ```

  New schema definition:

  ```ts
  const TodoTable = table({
    id: TodoId,
    title: NonEmptyString1000,
  });
  const Database = database({
    todo: TodoTable,
  });
  ```

  Those two helpers also detect missing ID columns and the usage of reserved columns.

  This update is a breaking change because reserved columns (createdAt, updatedAt, isDeleted) are created with `table` function now.

## 2.2.4

### Patch Changes

- eb819cb: Rename Schema to DatabaseSchema
- 92448d6: Update peer deps

## 2.2.3

### Patch Changes

- 215662c: Update deps

## 2.2.2

### Patch Changes

- 33974aa: Fix number protobuf serialization

## 2.2.1

### Patch Changes

- 98e19f0: Update deps

## 2.2.0

### Minor Changes

- bc18e74: Add the sync function

  Evolu syncs on every mutation, tab focus, and network reconnect, so it's generally not required to sync manually, but if you need it, you can do it.

  ```ts
  evolu.sync();
  ```

## 2.1.0

### Minor Changes

- 1eef638: Add makeCreateEvolu factory

## 2.0.6

### Patch Changes

- b00dec2: Update deps

## 2.0.5

### Patch Changes

- b06757c: Update readme

## 2.0.4

### Patch Changes

- 4563ec0: Bump peer dependants

## 2.0.3

### Patch Changes

- 59ec99c: Update @evolu/common peer dependencies

## 2.0.2

### Patch Changes

- ddd4014: Update readme

## 2.0.1

### Patch Changes

- fea7623: Fix SSR

## 2.0.0

### Major Changes

- 7e80483: New API

  With the upcoming React 19 `use` Hook, I took a chance to review and improve the Evolu API. I moved as many logic and types as possible to the Evolu interface to make platform variants more lightweight and to allow the use of Evolu directly out of any UI library.

  The most significant change is the split of SQL query declaration and usage. The rest of the API is almost identical except for minor improvements and one removal: filterMap helper is gone.

  It was a good idea with a nice DX, but such ad-hoc migrations belong in the database, not the JavaScript code. Filtering already loaded data pulls excessive data that should stay in the database. The good news is we can do that and even better with Kysely.

  To refresh what we are talking about for Evolu newcomers. Because database schema is evolving, and we can't do classical migrations in local-first apps (because we don't delete and other CRDT stuff), Evolu adopted GraphQL schema-less everything-is-nullable pattern.

  Having nullable everywhere in code is not ideal DX, so it would be nice to filter, ensure non-nullability, and even map rows directly in the database. Surprisingly, SQL is capable of that. Expect Evolu DSL for that soon. Meanwhile, we can do that manually:

  ```ts
  const todosWithout = evolu.createQuery((db) =>
    db
      .selectFrom("todo")
      .select(["id", "title", "isCompleted", "categoryId"])
      .where("isDeleted", "is not", Evolu.cast(true))
      // Filter null value and ensure non-null type. Evolu will provide a helper.
      .where("title", "is not", null)
      .$narrowType<{ title: Evolu.NonEmptyString1000 }>()
      .orderBy("createdAt"),
  );
  ```

  And now to the new API. Behold:

  ```ts
  // Create queries.
  const allTodos = evolu.createQuery((db) => db.selectFrom("todo").selectAll());
  const todoById = (id: TodoId) =>
    evolu.createQuery((db) =>
      db.selectFrom("todo").selectAll().where("id", "=", id),
    );

  // We can load a query or many queries.
  const allTodosPromise = evolu.loadQuery(allTodos).then(({ rows }) => {
    console.log(rows);
  });
  evolu.loadQueries([allTodos, todoById(1)]);

  // useQuery can load once or use a promise.
  const { rows } = useQuery(allTodos);
  const { rows } = useQuery(allTodos, { once: true });
  const { rows } = useQuery(allTodos, { promise: allTodosPromise });
  const { row } = useQuery(todoById(1));
  ```

  I also refactored (read: simplified) the usage of Effect Layers across all libraries. And the last thing: There is no breaking change in data storage or protocol.

## 1.0.17

### Patch Changes

- 22f6085: Update deps

## 1.0.16

### Patch Changes

- 08839c9: Update deps

## 1.0.15

### Patch Changes

- db84a4e: Update deps
- 51ead17: Make useQuery filterMap optional and reusable

## 1.0.14

### Patch Changes

- 242d7e5: Experimental new feature: Local only tables

  A local-only table is a table prefixed with "\_" that will never be synced—a small but handy addition. Imagine editing huge JSON. Should we store it on any change or allow the user to "commit" data later? In an ideal world, we would have CRDT abstraction for any data, and we will have, but for now, we can postpone or even cancel sync with local-only tables. Another use-case is device-only data, for example, some settings that should not be shared with other devices. Local-only tables also allow real deletion. Use the isDeleted common column and the row will be deleted instead of marked as deleted.

## 1.0.13

### Patch Changes

- 9d319e5: Rename canUseDOM to canUseDom

## 1.0.12

### Patch Changes

- 094e25a: Expose and leverage canUseDOM

## 1.0.11

### Patch Changes

- 8f7c8c8: Dedupe messages created within the microtask queue

  That's only for a case where someone accidentally calls mutate with the same values repeatedly. There is no reason to create identical messages.

## 1.0.10

### Patch Changes

- 44caee5: Update deps
- 44caee5: Ensure valid device clock and Timestamp time.

  Millis represents a time that is valid for usage with the Merkle tree. It must be between Apr 13, 1997, and Nov 05, 2051, to ensure MinutesBase3 length equals 16. We can find diff for two Merkle trees only within this range. If the device clock is out of range, Evolu will not store data until it's fixed.

## 1.0.9

### Patch Changes

- ad267b4: Update deps

## 1.0.8

### Patch Changes

- 3f89e12: Update deps

## 1.0.7

### Patch Changes

- a938b3d: Update deps

## 1.0.6

### Patch Changes

- 43ae617: Update peer dependencies

## 1.0.5

### Patch Changes

- 0b53b45: Update deps

## 1.0.4

### Patch Changes

- ac05ef2: Update deps

## 1.0.3

### Patch Changes

- c406a60: Update deps

## 1.0.2

### Patch Changes

- 0a6f7e7: Update deps, remove Match depedency

## 1.0.1

### Patch Changes

- 21f41b0: Update deps

## 1.0.0

### Major Changes

- 17e43c8: Split evolu library to platform libraries
