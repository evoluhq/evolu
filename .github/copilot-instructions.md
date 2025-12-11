---
applyTo: "**/*.{ts,tsx}"
---

# Evolu project guidelines

You are helping with the Evolu project. Follow these specific conventions and patterns:

## Code organization & imports

- **Use named imports only** - avoid default exports and namespace imports
- **Avoid `import type`** - use regular imports for consistency
- **Use unique exported members** - avoid namespaces, use descriptive names to prevent conflicts
- **Organize code top-down** - public interfaces first, then implementation, then implementation details
- **Reference globals explicitly with `globalThis`** - when a name clashes with global APIs (e.g., `SharedWorker`, `Worker`), use `globalThis.SharedWorker` instead of aliasing imports

```ts
// ✅ Good
import { bar, baz } from "Foo.ts";
export const ok = ...;
export const trySync = ...;

// ✅ Good - Avoid naming conflicts with globals
const nativeSharedWorker = new globalThis.SharedWorker(...);

// ❌ Avoid
import Foo from "Foo.ts";
export const Utils = { ok, trySync };

// ❌ Avoid - Aliasing to work around global name clash
import { SharedWorker as SharedWorkerType } from "./Worker.js";
```

## Functions

- **Use arrow functions** - avoid the `function` keyword for consistency
- **Exception: function overloads** - TypeScript requires the `function` keyword for overloaded signatures

```ts
// ✅ Good - Arrow function
export const createUser = (data: UserData): User => {
  // implementation
};

// ✅ Good - Function overloads (requires function keyword)
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

// ❌ Avoid - function keyword without overloads
export function createUser(data: UserData): User {
  // implementation
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

## Documentation & JSDoc

- **Avoid `@param` and `@return` tags** - TypeScript provides type information, focus on describing the function's purpose
- **Use `### Example` instead of `@example`** - for better markdown rendering and consistency
- **Write clear descriptions** - explain what the function does, not how to use it
- **Use `{@link}` for references** - link to types, interfaces, functions, and exported symbols on first mention for discoverability

````ts
// ✅ Good
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

// ❌ Avoid
/**
 * Dependency wrapper for CreateMessageChannel.
 *
 * Used with EvoluPlatformDeps to provide platform-specific MessageChannel
 * creation.
 */
export interface CreateMessageChannelDep {
  readonly createMessageChannel: CreateMessageChannel;
}

// ❌ Avoid
/**
 * Creates a new user with the provided data.
 *
 * @example
 *   ```ts
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

## API stability & experimental APIs

- **Use `@experimental` tag** for new APIs that may change or be removed
- **Experimental APIs can change** in minor/patch versions without breaking semver
- **Promote to stable** once confident in the design after real-world usage

```ts
// ✅ Good - Mark new/uncertain APIs as experimental
/**
 * Casts a value to its readonly counterpart.
 *
 * @experimental
 */
export const readonly = <T>(value: T): Readonly<T> => value;
```

This pattern allows iterating on API design without committing to stability too early.

## Error handling with Result

- Use `Result<T, E>` for business/domain errors in public APIs
- Keep implementation-specific errors internal to dependencies
- **Favor imperative patterns** over monadic helpers for readability
- Use **plain objects** for domain errors, Error instances only for debugging

```ts
// ✅ Good - Domain error
interface ParseJsonError {
  readonly type: "ParseJsonError";
  readonly message: string;
}

const parseJson = (value: string): Result<unknown, ParseJsonError> =>
  trySync(
    () => JSON.parse(value) as unknown,
    (error) => ({ type: "ParseJsonError", message: String(error) }),
  );

// ✅ Good - Sequential operations with short-circuiting
const processData = (deps: DataDeps) => {
  const foo = doFoo(deps);
  if (!foo.ok) return foo;

  return doStep2(deps)(foo.value);
};

// ❌ Avoid - Implementation error in public API
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

## Evolu Type

- **Use Type for validation/parsing** - leverage Evolu's Type system for runtime validation
- **Define typed errors** - use interfaces extending `TypeError<Name>`
- **Create Type factories** - use `brand`, `transform`, `array`, `object` etc.
- **Use Brand types** - for semantic distinctions and constraints

```ts
// ✅ Good - Define typed error
interface CurrencyCodeError extends TypeError<"CurrencyCode"> {}

// ✅ Good - Brand for semantic meaning and validation
const CurrencyCode = brand("CurrencyCode", String, (value) =>
  /^[A-Z]{3}$/.test(value)
    ? ok(value)
    : err<CurrencyCodeError>({ type: "CurrencyCode", value }),
);

// ✅ Good - Type factory pattern
const minLength: <Min extends number>(
  min: Min,
) => BrandFactory<`MinLength${Min}`, { length: number }, MinLengthError<Min>> =
  (min) => (parent) =>
    brand(`MinLength${min}`, parent, (value) =>
      value.length >= min ? ok(value) : err({ type: "MinLength", value, min }),
    );

// ✅ Good - Error formatter
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
- **Over-providing is OK** - passing extra deps is fine, over-depending is not
- **Use Partial<>** for optional dependencies
- **No global static instances** - avoid service locator pattern
- **No generics in dependency interfaces** - keep them implementation-agnostic

## Testing

- **Run tests using pnpm** - use `pnpm test` from the project root to run all tests
- **Run specific test files** - use `pnpm test --filter @evolu/package-name -- test-file-pattern` from project root (e.g., `pnpm test --filter @evolu/common -- Protocol`)
- **Check compilation** - use `pnpm build` to check TypeScript compilation across all packages
- **Run linting** - use `pnpm lint` to check code style and linting rules
- **Leverage `_deps.ts`** - use existing test utilities and mocks from `packages/common/test/_deps.ts` (e.g., `testCreateId`, `testTime`, `testOwner`)
- Mock dependencies using the same interfaces
- Create test factories (e.g., `createTestTime`)
- Never rely on global state
- Use assertions in tests for conditions that should never fail

```ts
import { testCreateId, testTime, testOwner } from "../_deps.js";

const createTestTime = (): Time => ({
  now: () => 1234567890, // Fixed time for testing
});

test("timeUntilEvent calculates correctly", () => {
  const deps = { time: testTime }; // Use from _deps.ts
  const result = timeUntilEvent(deps)(1234567990);
  assert(result === 100, "Expected result to be 100");
});
```

## Monorepo TypeScript issues

**ESLint "Unsafe..." errors after changes** - In a monorepo, ESLint may show "Unsafe call", "Unsafe member access", or "Unsafe assignment" errors after modifying packages that other packages depend on. These errors should be ignored. Solution: use VS Code's "Developer: Reload Window" command (Cmd+Shift+P)

## Git commit messages

- **Write as sentences** - use proper sentence case without trailing period
- **No prefixes** - avoid `feat:`, `fix:`, `feature:` etc.
- **Be descriptive** - explain what the change does

```bash
# ✅ Good
Add support for custom error formatters
Fix memory leak in WebSocket reconnection
Update schema validation to handle edge cases

# ❌ Avoid
feat: add support for custom error formatters
fix: memory leak in websocket reconnection
Update schema validation to handle edge cases.
```

## Changesets

- **Write in past tense** - describe what was done, not what will be done

```markdown
# ✅ Good

Added support for custom error formatters

# ❌ Avoid

Add support for custom error formatters
```

When suggesting code changes, ensure they follow these patterns and conventions.
