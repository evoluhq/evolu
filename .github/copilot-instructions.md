---
applyTo: "**/*.ts"
---

# Evolu Project Guidelines

You are helping with the Evolu project. Follow these specific conventions and patterns:

## Code Organization & Imports

- **Use named imports only** - avoid default exports and namespace imports
- **Use unique exported members** - avoid namespaces, use descriptive names to prevent conflicts
- **Organize code top-down** - public interfaces first, then implementation, then implementation details
- **Separate public/internal code** - use package.json exports to define clear boundaries

```ts
// ✅ Good
import { bar, baz } from "Foo.ts";
export const ok = ...;
export const trySync = ...;

// ❌ Avoid
import Foo from "Foo.ts";
export const Utils = { ok, trySync };
```

## Type System & Immutability

- **Favor immutability** - use `readonly` properties and `ReadonlyArray`/`NonEmptyReadonlyArray`
- **Use TypeScript's type system** to enforce immutability at compile time
- **Use Type system for runtime validation** - never use assertions for input validation

```ts
interface Example {
  readonly id: number;
  readonly items: ReadonlyArray<string>;
}
```

## Error Handling with Result

- Use `Result<T, E>` for business/domain errors in public APIs
- Keep implementation-specific errors internal to dependencies
- **Favor imperative patterns** over monadic helpers for readability
- Use **plain objects** for business errors, Error instances only for debugging

```ts
// ✅ Good - Business error
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
  const step1Result = doStep1(deps);
  if (!step1Result.ok) return step1Result;

  const step2Result = doStep2(deps)(step1Result.value);
  if (!step2Result.ok) return step2Result;

  return ok(step2Result.value);
};

// ❌ Avoid - Implementation error in public API
export interface Storage {
  writeMessages: (...) => Result<boolean, SqliteError>;
}
```

### Result Patterns

- Use `Result<void, E>` for operations that don't return values
- Use `trySync` for wrapping synchronous unsafe code
- Use `tryAsync` for wrapping asynchronous unsafe code
- Use `getOrThrow` only for critical startup code where failure should crash

```ts
// For lazy operations array
const operations: LazyValue<Result<void, MyError>>[] = [
  () => doSomething(),
  () => doSomethingElse(),
];

for (const op of operations) {
  const result = op();
  if (!result.ok) return result;
}
```

## Type System Patterns

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

### Type System Guidelines

- **Use readonly for Type definitions** - all Type interfaces should use readonly
- **Create error formatters** - use `createTypeErrorFormatter` for consistent error messages
- **Use base, brand, transform factories** - follow established patterns for Type creation
- **Leverage type inference** - use `InferType`, `InferError`, etc. for type extraction

## Assertions

- Use assertions for conditions logically guaranteed but not statically known by TypeScript
- **Never use assertions instead of proper type validation** - use Type system for runtime validation
- Use for catching developer mistakes eagerly (e.g., invalid configuration)

```ts
import { assert, assertNonEmptyArray, assertNoErrorInCatch } from "./Assert.js";

// ✅ Good example
const length = buffer.getLength();
assert(NonNegativeInt.is(length), "buffer length should be non-negative");

// ✅ Good - Non-empty array assertion
assertNonEmptyArray(items, "Expected items to process");

// ❌ Avoid - Use Type validation instead
// Don't use assert for runtime input validation
```

## Dependency Injection Pattern

Follow Evolu's convention-based DI approach without frameworks:

### 1. Define Dependencies as Interfaces

```ts
export interface Time {
  readonly now: () => number;
}

export interface TimeDep {
  readonly time: Time;
}
```

### 2. Use Currying for Functions with Dependencies

```ts
const timeUntilEvent =
  (deps: TimeDep & Partial<LoggerDep>) =>
  (eventTimestamp: number): number => {
    const currentTime = deps.time.now();
    return eventTimestamp - currentTime;
  };
```

### 3. Create Factory Functions

```ts
export const createTime = (): Time => ({
  now: () => Date.now(),
});
```

### 4. Composition Root Pattern

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
- **No generics in dependency interfaces** - keep them simple and implementation-agnostic

## Testing

- **Run tests using pnpm** - use `pnpm test` from the project root to run all tests
- **Run specific test files** - use `pnpm test --filter @evolu/package-name -- test-file-pattern` from project root (e.g., `pnpm test --filter @evolu/common -- Protocol`)
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

## Git Commit Messages

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

When suggesting code changes, ensure they follow these patterns and conventions.
