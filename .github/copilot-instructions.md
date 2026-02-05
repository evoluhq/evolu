---
applyTo: "**/*.{ts,tsx}"
---

# Evolu project guidelines

## Build and test

```bash
pnpm install          # Install dependencies (Node >=24.0.0)
pnpm build            # Build all packages (required once for IDE types)
pnpm dev              # Start relay and web servers
pnpm test             # Run all tests
pnpm test:coverage    # With coverage
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm biome            # Biome (catches import cycles)
pnpm verify           # Full verification (lint + format + biome + test)
```

## Architecture

Monorepo with pnpm workspaces and Turborepo. All packages depend on `@evolu/common`:

- `@evolu/common` — Platform-independent core (Result, Task, Type, Brand, Crypto, Sqlite)
- `@evolu/web` — Web platform (SQLite WASM, SharedWorker)
- `@evolu/nodejs` — Node.js (better-sqlite3, ws)
- `@evolu/react-native` — React Native/Expo (expo-sqlite)
- `@evolu/react` — Platform-independent React
- `@evolu/react-web` — React + web combined
- `@evolu/svelte` — Svelte 5
- `@evolu/vue` — Vue 3

Key directories:

- `packages/common/src/` — Core utilities and abstractions
- `packages/common/src/local-first/` — Local-first subsystem (Db, Evolu, Query, Schema, Sync, Relay)
- `apps/web/` — Documentation website
- `apps/relay/` — Sync server (Docker-deployable)
- `examples/` — Framework-specific example apps

---

Follow these specific conventions and patterns:

## Code organization & imports

- **Use named imports only** - avoid default exports and namespace imports
- **Use unique exported members** - avoid namespaces, use descriptive names to prevent conflicts
- **Organize code top-down** - public interfaces first, then implementation, then implementation details. If a helper must be defined before the public export that uses it (due to JavaScript hoisting), place it immediately before that export.
- **Reference globals explicitly with `globalThis`** - when a name clashes with global APIs (e.g., `SharedWorker`, `Worker`), use `globalThis.SharedWorker` instead of aliasing imports

```ts
// Good
import { bar, baz } from "Foo.ts";
export const ok = () => {};
export const trySync = () => {};

// Avoid
import Foo from "Foo.ts";
export const Utils = { ok, trySync };

// Good - Avoid naming conflicts with globals
const nativeSharedWorker = new globalThis.SharedWorker(url);

// Avoid - Aliasing to work around global name clash
import { SharedWorker as SharedWorkerType } from "./Worker.js";
```

## Functions

- **Use arrow functions** - avoid the `function` keyword for consistency
- **Exception: function overloads** - TypeScript requires the `function` keyword for overloaded signatures

### Factories

Use factory functions instead of classes for creating objects, typically named `createX`. Order function contents as follows:

1. Const setup & invariants (args + derived consts + assertions)
2. Mutable state
3. Owned resources
4. Side-effectful wiring
5. Shared helpers
6. Return object (public operations + disposal/closing)

```ts
// Good - Function overloads (requires function keyword)
export function mapArray<T, U>(
  array: NonEmptyReadonlyArray<T>,
  mapper: (item: T) => U,
): NonEmptyReadonlyArray<U>;
export function mapArray<T, U>(
  array: ReadonlyArray<T>,
  mapper: (item: T) => U,
): ReadonlyArray<U>;
export function mapArray<T, U>(
  array: ReadonlyArray<T>,
  mapper: (item: T) => U,
): ReadonlyArray<U> {
  return array.map(mapper) as ReadonlyArray<U>;
}

// Avoid - function keyword without overloads
export function createUser(data: UserData): User {
  // implementation
}
```

### Function options

For functions with optional configuration, use inline types without `readonly` for single-use options and named interfaces with `readonly` for reusable options. Always destructure immediately.

```ts
// Good - inline type, single-use
export const race = (
  tasks: Tasks,
  {
    abortReason = raceLostError,
  }: {
    abortReason?: unknown;
  } = {},
): Task<T, E> => {
  // implementation
};

// Good - named interface, reusable
export interface RetryOptions {
  readonly maxAttempts?: number;
  readonly delay?: Duration;
}
```

## Variable shadowing

- **Shadowing is OK** - since we use `const` everywhere, shadowing avoids artificial names like `innerValue`, `newValue`, `result2`

```ts
// Good - Shadow in nested scopes
const value = getData();
items.map((value) => process(value)); // shadowing is fine

const result = fetchUser();
if (result.ok) {
  const result = fetchProfile(result.value); // shadow in nested block
  if (result.ok) {
    // ...
  }
}
```

## Immutability

- **Favor immutability** - use `readonly` properties and `ReadonlyArray`/`NonEmptyReadonlyArray`

```ts
interface Example {
  readonly id: number;
  readonly items: ReadonlyArray<string>;
}
```

## Interface over type for Evolu Type objects

For Evolu Type objects created with `object()`, use interface with `InferType` instead of type alias. TypeScript displays the interface name instead of expanding all properties.

```ts
// Use interface for objects
const User = object({ name: String, age: Number });
export interface User extends InferType<typeof User> {}

// Avoid - TypeScript expands all properties in tooltips
const User = object({ name: String, age: Number });
export type User = typeof User.Type;
```

## Opaque types

- **Use `Brand<"Name">`** for values callers cannot inspect or construct—only pass back to the creating API
- Useful for platform abstraction, handle types (timeout IDs, file handles), and type safety

```ts
type TimeoutId = Brand<"TimeoutId">;
type NativeMessagePort = Brand<"NativeMessagePort">;
```

## Documentation style

- **Be direct and technical** - state facts, avoid conversational style
- **Lead with the key point** - put the most important information first

## JSDoc & TypeDoc

- **Avoid `@param` and `@return` tags** - TypeScript provides type information, focus on describing the function's purpose
- **Use `### Example` instead of `@example`** - for better markdown rendering and consistency with TypeDoc
- **Write clear descriptions** - explain what the function does, not how to use it
- **Use `{@link}` for references** - link to types, interfaces, functions, and exported symbols on first mention for discoverability
- **Avoid pipe characters in first sentence** - TypeDoc extracts the first sentence for table descriptions, and pipe characters (even in inline code like `T | undefined`) break markdown table rendering. Move such details to subsequent sentences.

````ts
// Good
/**
 * Creates a new user with the provided data.
 *
 * ### Example
 *
 * ```ts
 * const user = createUser({ name: "John", email: "john@example.com" });
 * ```
 */
export const createUser = (data: UserData): User => {
  // implementation
};

/**
 * Dependency wrapper for {@link CreateMessageChannel}.
 *
 * Used with {@link EvoluPlatformDeps} to provide platform-specific
 * MessageChannel creation.
 */
export interface CreateMessageChannelDep {
  readonly createMessageChannel: CreateMessageChannel;
}

// Avoid
/**
 * Dependency wrapper for CreateMessageChannel.
 *
 * Used with EvoluPlatformDeps to provide platform-specific MessageChannel
 * creation.
 */
export interface CreateMessageChannelDep {
  readonly createMessageChannel: CreateMessageChannel;
}

// Avoid
/**
 * Creates a new user with the provided data.
 *
 * @example
 *   ```ts
 *
 *
 *   const user = createUser({ name: "John", email: "john@example.com" });
 *   ```;
 *
 * @param data The user data to create the user with
 * @returns The created user
 */
export const createUser = (data: UserData): User => {
  // implementation
};

/**
 * Dependency wrapper for CreateMessageChannel.
 *
 * Used with EvoluPlatformDeps to provide platform-specific MessageChannel
 * creation.
 */
export interface CreateMessageChannelDep {
  readonly createMessageChannel: CreateMessageChannel;
}
````

## Error handling with Result

- Use `Result<T, E>` for business/domain errors in public APIs
- Keep implementation-specific errors internal to dependencies
- Use **plain objects** for domain errors, Error instances only for debugging

```ts
// Good - Domain error
interface ParseJsonError {
  readonly type: "ParseJsonError";
  readonly message: string;
}

const parseJson = (value: string): Result<unknown, ParseJsonError> =>
  trySync(
    () => JSON.parse(value) as unknown,
    (error) => ({ type: "ParseJsonError", message: String(error) }),
  );

// Good - Sequential operations with short-circuiting
const processData = (deps: DataDeps) => {
  const foo = doFoo(deps);
  if (!foo.ok) return foo;

  return doStep2(deps)(foo.value);
};

// Avoid - Implementation error in public API
export interface Storage {
  writeMessages: (...) => Result<boolean, SqliteError>;
}
```

### Result patterns

- Use `Result<void, E>` for operations that don't return values
- Use `trySync` for wrapping synchronous unsafe code
- Use `tryAsync` for wrapping asynchronous unsafe code
- Use `getOrThrow` only for critical startup code where failure should crash

```ts
// For lazy operations array
const operations: Lazy<Result<void, MyError>>[] = [
  () => doSomething(),
  () => doSomethingElse(),
];

for (const op of operations) {
  const result = op();
  if (!result.ok) return result;
}
```

### Avoid meaningless ok values

Don't use `ok("done")` or `ok("success")` - the `ok()` itself already communicates success. Use `ok()` for `Result<void, E>` or return a meaningful value.

```ts
// Good - ok() means success, no redundant string needed
const save = (): Result<void, SaveError> => {
  // ...
  return ok();
};

// Good - return a meaningful value
const parse = (): Result<User, ParseError> => {
  // ...
  return ok(user);
};

// Avoid - "done" and "success" add no information
return ok("done");
return ok("success");
```

## Evolu Type

- **Use Type for validation/parsing** - leverage Evolu's Type system for runtime validation
- **Define typed errors** - use interfaces extending `TypeError<Name>`
- **Create Type factories** - use `brand`, `transform`, `array`, `object` etc.
- **Use Brand types** - for semantic distinctions and constraints

```ts
// Good - Define typed error
interface CurrencyCodeError extends TypeError<"CurrencyCode"> {}

// Good - Brand for semantic meaning and validation
const CurrencyCode = brand("CurrencyCode", String, (value) =>
  /^[A-Z]{3}$/.test(value)
    ? ok(value)
    : err<CurrencyCodeError>({ type: "CurrencyCode", value }),
);

// Good - Type factory pattern
const minLength: <Min extends number>(
  min: Min,
) => BrandFactory<`MinLength${Min}`, { length: number }, MinLengthError<Min>> =
  (min) => (parent) =>
    brand(`MinLength${min}`, parent, (value) =>
      value.length >= min ? ok(value) : err({ type: "MinLength", value, min }),
    );

// Good - Error formatter
const formatCurrencyCodeError = createTypeErrorFormatter<CurrencyCodeError>(
  (error) => `Invalid currency code: ${error.value}`,
);
```

## Assertions

- Use assertions for conditions logically guaranteed but not statically known by TypeScript
- **Never use assertions instead of proper type validation** - use Type system for runtime validation
- Use for catching developer mistakes eagerly (e.g., invalid configuration)

```ts
import { assert, assertNonEmptyArray } from "./Assert.js";

const length = buffer.getLength();
assert(NonNegativeInt.is(length), "buffer length should be non-negative");

assertNonEmptyArray(items, "Expected items to process");
```

## Dependency injection

Follow Evolu's convention-based DI approach without frameworks:

### 1. Define dependencies as interfaces

```ts
export interface Time {
  readonly now: () => number;
}

export interface TimeDep {
  readonly time: Time;
}
```

### 2. Use currying for functions with dependencies

```ts
const timeUntilEvent =
  (deps: TimeDep & Partial<LoggerDep>) =>
  (eventTimestamp: number): number => {
    const currentTime = deps.time.now();
    return eventTimestamp - currentTime;
  };
```

### 3. Create factory functions

```ts
export const createTime = (): Time => ({
  now: () => Date.now(),
});
```

### 4. Composition root pattern

```ts
const deps: TimeDep & Partial<LoggerDep> = {
  time: createTime(),
  ...(enableLogging && { logger: createLogger() }),
};
```

## DI Guidelines

- **Single deps argument** - functions accept one `deps` parameter combining dependencies
- **Wrap dependencies** - use `TimeDep`, `LoggerDep` etc. to avoid property clashes
- **Skip JSDoc for simple dep interfaces** - `interface TimeDep { readonly time: Time }` is self-documenting
- **Over-providing is OK** - passing extra deps is fine, over-depending is not
- **Use Partial<>** for optional dependencies
- **No global static instances** - avoid service locator pattern
- **No generics in dependency interfaces** - keep them implementation-agnostic

## Tasks

- **Call tasks with `run(task)`** - never call `task(run)` directly in user code
- **Handle Results** - check `result.ok` before using values, short-circuit on error
- **Compose tasks** - use helpers like `timeout`, `race` to combine tasks

```ts
// Good - Call tasks with run()
const result = await run(sleep("1s"));
if (!result.ok) return result;

const data = result.value; // only available if ok

// Good - Compose and short-circuit
const processTask: Task<void, ParseError | TimeoutError> = async (run) => {
  const data = await run(fetchData);
  if (!data.ok) return data;

  const parsed = await run(timeout(parseData(data.value), "5s"));
  if (!parsed.ok) return parsed;

  return ok();
};

// Avoid - Calling task directly
const result = await sleep("1s")(run);
```

## Test-driven development

- Write a test before implementing a new feature or fixing a bug
- Run tests using the `runTests` tool with the test file path
- Test files are in `packages/*/test/*.test.ts`
- Use `testNames` parameter to run specific tests — uses **substring matching**, so unique names avoid running unrelated tests
- Run only changed/affected tests, not entire describe blocks
- **Always check workspace errors** after edits using `get_errors` tool — don't assume code is correct just because tests pass

### Test structure

- Use `describe` blocks to group related tests by feature or function
- Use `test` or `it` for individual test cases (both are equivalent)
- Test names should be descriptive and unique phrases: `"zipArray combines arrays into tuples"`
- Use nested `describe` for sub-categories

```ts
import { describe, expect, expectTypeOf, test } from "vitest";

describe("arrayFrom", () => {
  test("arrayFrom creates array from iterable", () => {
    const result = arrayFrom(new Set([1, 2, 3]));
    expect(result).toEqual([1, 2, 3]);
  });

  test("arrayFrom returns input unchanged if already an array", () => {
    const input = [1, 2, 3];
    const result = arrayFrom(input);
    expect(result).toBe(input);
  });
});
```

### Type testing

Use `expectTypeOf` from Vitest for compile-time type assertions:

```ts
import { expectTypeOf } from "vitest";

test("arrayFrom returns readonly array", () => {
  const result = arrayFrom(2, () => "x");
  expectTypeOf(result).toEqualTypeOf<ReadonlyArray<string>>();
});

test("NonEmptyArray requires at least one element", () => {
  const _valid: NonEmptyArray<number> = [1, 2, 3];
  // @ts-expect-error - empty array is not a valid NonEmptyArray
  const _invalid: NonEmptyArray<number> = [];
});
```

### Inline snapshots

Use `toMatchInlineSnapshot` for readable test output directly in the test file:

```ts
test("Buffer unwrap", () => {
  const buffer = createBuffer([1, 2, 3]);
  expect(buffer.unwrap()).toMatchInlineSnapshot(`uint8:[1,2,3]`);
});
```

## Testing

- **Use Test module** - `packages/common/src/Test.ts` provides `testCreateDeps()` and `testCreateRun()` for test isolation
- **Naming convention** - test factories follow `testCreateX` pattern (e.g., `testCreateTime`, `testCreateRandom`)
- Mock dependencies using the same interfaces
- Never rely on global state or shared mutable deps between tests

### Test deps pattern

Create fresh deps at the start of each test for isolation. Each call creates independent instances, preventing shared state between tests.

```ts
import { testCreateDeps, testCreateRun } from "@evolu/common";

test("creates unique IDs", () => {
  const deps = testCreateDeps();
  const id1 = createId(deps);
  const id2 = createId(deps);
  expect(id1).not.toBe(id2);
});

test("with custom seed for reproducibility", () => {
  const deps = testCreateDeps({ seed: "my-test" });
  const id = createId(deps);
  expect(id).toMatchInlineSnapshot(`"..."`);
});
```

### Test factories naming

Test-specific factories use `testCreateX` prefix to distinguish from production `createX`:

```ts
// Production factory
export const createTime = (): Time => ({ now: () => Date.now() });

// Test factory with controllable time
export const testCreateTime = (options?: {
  readonly startAt?: Millis;
  readonly autoIncrement?: boolean;
}): TestTime => { ... };
```

## Monorepo TypeScript issues

**ESLint "Unsafe..." errors after changes** - In a monorepo, ESLint may show "Unsafe call", "Unsafe member access", or "Unsafe assignment" errors after modifying packages that other packages depend on. These errors are caused by stale TypeScript type cache. Solution: run "ESLint: Restart ESLint Server" command (Cmd+Shift+P)

## Git commit messages

- **Write as sentences** - use proper sentence case without trailing period
- **No prefixes** - avoid `feat:`, `fix:`, `feature:` etc.
- **Be descriptive** - explain what the change does

## Changesets

- **Write in past tense** - describe what was done, not what will be done

```markdown
# Good

Added support for custom error formatters

# Avoid

Add support for custom error formatters
```

When suggesting code changes, ensure they follow these patterns and conventions.
