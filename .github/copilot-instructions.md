---
applyTo: "**/*.{ts,tsx}"
---

# Evolu project guidelines

This is a TypeScript project. All code, including helper scripts, must be written in TypeScript.

## Build and test

```bash
bun install          # Install dependencies (Node >=24.0.0)
bun run build        # Build all packages (required once for IDE types)
bun run dev          # Start relay and web servers
bun run test         # Run all tests
bun run test:coverage # With coverage
bun run lint         # ESLint
bun run format       # Prettier
bun run biome        # Biome (catches import cycles)
bun run verify       # Full verification (lint + format + biome + test)
```

Run standalone TypeScript scripts with `bun script.ts`.

## Monorepo TypeScript issues

**ESLint "Unsafe..." errors after changes** - In a monorepo, ESLint may show "Unsafe call", "Unsafe member access", or "Unsafe assignment" errors after modifying packages that other packages depend on. These errors are caused by stale TypeScript type cache. Run the `eslint.restart` VS Code command using `run_vscode_command` tool to clear the cache before checking errors.

## Architecture

Monorepo with workspaces and Turborepo. All packages depend on `@evolu/common`:

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

## Code organization & imports

- **Use named imports only** - avoid default exports and namespace imports
- **Use unique exported members** - avoid namespaces, use descriptive names to prevent conflicts
- **Name indexed collections as `vByK`** - use value + `By` + key for maps and records (for example `rowsByQuery`, `messagesByOwnerId`, `usersById`)
- **Organize code top-down** - public interfaces first, then implementation, then implementation details. TypeScript types can reference types defined later in the file (no forward declaration needed), so always place the higher-level type first. For runtime code (functions, constants), if a helper must be defined before the public export that uses it (due to JavaScript hoisting), place it immediately before that export.
- **Reference globals explicitly with `globalThis`** - when a name clashes with global APIs (e.g., `SharedWorker`, `Worker`), use `globalThis.SharedWorker` instead of aliasing imports

### Order (top-down readability)

Write code top-down: public API first (interfaces and types), then implementation, then implementation details.

Evolu optimizes for reading, not writing. Source code is read far more often than it is written, so developer-facing contracts should appear before low-level helpers.

Think from whole to detail:

1. Public contract (`interface`, exported types)
2. Supporting types
3. Implementation
4. Implementation details

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
- **Exception: function overloads** - the `function` keyword provides cleaner inline overload syntax than the equivalent arrow function approach (which requires a separate call-signature type)

### Factories

Use factory functions instead of classes for creating objects, typically named `createX`. Order function contents as follows:

1. Const setup & invariants (args + derived consts + assertions)
2. Mutable state
3. Owned resources
4. Side-effectful wiring
5. Shared helpers
6. Return object (public operations + disposal/closing)

### Function options

For functions with optional configuration, use inline types without `readonly` for single-use options (immediate destructuring means no reference exists to mutate) and named interfaces with `readonly` for reusable options. Destructure in the parameter list to avoid `options.foo` access patterns.

## Variable shadowing

- **Shadowing is OK** - since we use `const` everywhere, shadowing avoids artificial names like `innerValue`, `newValue`, `result2`

## Immutability

- **Favor immutability** - use `readonly` properties and `ReadonlyArray`/`NonEmptyReadonlyArray`

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
- **Never make alignment-only JSDoc edits** - avoid whitespace-only JSDoc changes and avoid retry loops that only chase alignment diagnostics; keep focus on content edits.

## Error handling with Result

- Use `Result<T, E>` for business/domain errors in public APIs
- Keep implementation-specific errors internal to dependencies
- Use **plain objects** for domain errors, Error instances only for debugging

### Result patterns

- Use `Result<void, E>` for operations that don't return values
- Use `trySync` for wrapping synchronous unsafe code
- Use `tryAsync` for wrapping asynchronous unsafe code
- Use `getOrThrow` only for critical startup code where failure should crash

### Avoid meaningless ok values

Don't use `ok("done")` or `ok("success")` - the `ok()` itself already communicates success. Use `ok()` for `Result<void, E>` or return a meaningful value.

## Evolu Type

- **Use Type for validation/parsing** - leverage Evolu's Type system for runtime validation
- **Create Type factories** - use `brand`, `transform`, `array`, `object` etc.
- **Use Brand types** - for semantic distinctions and constraints

## Assertions

- Use assertions for conditions logically guaranteed but not statically known by TypeScript
- **Never use assertions instead of proper type validation** - use Type system for runtime validation
- Use for catching developer mistakes eagerly (e.g., invalid configuration)

## Disposing

### Disposable

- Use `extends Disposable` on interface when it contains something that has to be disposed
- Use `new DisposableStack()` for synchronous disposable helpers, even when they own only one cleanup step
- For synchronous methods on disposable helpers, guard public methods explicitly with `assertNotDisposed` when use-after-dispose is a programmer error

### AsyncDisposable

- Use `AsyncDisposableStack` for async disposable helpers
- For reusable async resources, create one internal `Run` with `run.create()` and use that `Run` for the resource's async operations
- If an `AsyncDisposable` helper also exposes synchronous methods, guard those methods with `assertNotDisposed` on the moved `AsyncDisposableStack`

## Dependency injection

Follow Evolu's convention-based DI approach. There are two mechanisms depending on sync vs async:

- **Sync DI** — currying: `(deps: ADep & BDep) => (args) => Result`
- **Task DI** — the `D` type parameter on `Task<T, E, D>`, accessed via `run.deps`

Sync functions should take values, not dependencies — follow the impure/pure/impure sandwich pattern. When deps are needed in async code, use Task's `D` parameter.

### Sync DI (currying)

```ts
const timeUntilEvent =
  (deps: TimeDep & Partial<LoggerDep>) =>
  (eventTimestamp: number): number => {
    const currentTime = deps.time.now();
    return eventTimestamp - currentTime;
  };
```

### Task DI (run.deps)

```ts
const fetchUser =
  (id: string): Task<User, FetchError, ConfigDep> =>
  async (run) => {
    const { config } = run.deps;
    // ...
  };

// Composition root
await using run = createRun({ config: { apiUrl: "..." } });
const result = await run(fetchUser("123"));
```

## DI Guidelines

- **Single deps argument** - functions accept one `deps` parameter combining dependencies
- **Wrap dependencies** - use `TimeDep`, `LoggerDep` etc. to avoid property clashes
- **Over-providing is OK** - passing extra deps is fine, over-depending is not
- **Use Partial<>** for optional dependencies
- **No global static instances** - avoid service locator pattern
- **No generics in dependency interfaces** - keep them implementation-agnostic

## Tasks

- **Call tasks with `run(task)`** - never call `task(run)`
- **Handle Results** - check `result.ok` before using values, short-circuit on error
- **Compose tasks** - use helpers like `timeout`, `race` to combine tasks

## Test-driven development

- Tests are required for new features and bug fixes
- Prefer writing or updating tests before implementation when behavior or API shape is still being clarified
- When the implementation is straightforward from established patterns, implementation may come first
- Run tests using the `runTests` tool with the test file path
- Test files are in `packages/*/test/*.test.ts`
- Use `testNames` parameter to run specific tests — uses **substring matching**, so unique names avoid running unrelated tests
- Run only changed/affected tests, not entire describe blocks
- **Always check workspace errors** after edits using `get_errors` tool — don't assume code is correct just because tests pass. Never run `tsc` in the terminal; `get_errors` uses the same TypeScript diagnostics without extra compilation
- **100% test coverage required** — use `runTests` with `mode="coverage"` and `coverageFiles` pointing to the source file under test. All statements, branches, and declarations must be covered. If coverage is below 100%, add missing tests before finishing

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

### Test utilities

- **Use Test module** - `packages/common/src/Test.ts` provides `testCreateDeps()` and `testCreateRun()` for test isolation
- **Naming convention** - test factories follow `testCreateX` pattern (e.g., `testCreateTime`, `testCreateRandom`)
- Mock dependencies using the same interfaces
- Never rely on global state or shared mutable deps between tests

Create fresh deps at the start of each test for isolation. Each call creates independent instances, preventing shared state between tests.

```ts
import { testCreateDeps, testCreateRun } from "@evolu/common";

test("creates unique IDs", async () => {
  const deps = testCreateDeps();
  await using run = testCreateRun(deps);
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

## Git commit messages

- **Write as sentences** - use proper sentence case without trailing period
- **No prefixes** - avoid `feat:`, `fix:`, `feature:` etc.
- **Be descriptive** - explain what the change does

## Changesets

- **Write in past tense** - describe what was done, not what will be done

When suggesting code changes, ensure they follow these patterns and conventions.
