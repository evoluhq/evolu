# Evolu repository guidance

This file selectively summarizes [Conventions](<apps/web/src/app/(docs)/docs/conventions/page.mdx>)
and adds repository workflow instructions. It is sufficient for routine work.
Read only the relevant documentation section when clarification is needed or
when reviewing or changing a convention. Do not open linked guides routinely.
Keep shared rules consistent; not every documented convention needs a summary here.

## Working on a task

- Proceed with reasonable assumptions for routine, reversible decisions. Ask
  when missing information materially changes scope or correctness.
- Keep reviews read-only unless edits are requested. Before editing, read the
  relevant implementation and its tests; limit exploration to the task.
- Preserve unrelated working-tree changes. Do not create a commit unless asked.
- Write new modules and helper scripts in TypeScript. Keep existing JavaScript,
  MJS, and CJS files in their current language unless migrating them is the task.
- Report the outcome, relevant verification, and remaining limitations concisely.

## Repository and commands

This is a pnpm TypeScript monorepo. Use the Node.js version in `.nvmrc`.

- `packages/common/src/` contains platform-independent code; `local-first/`
  contains the local-first subsystem.
- Other `packages/` contain platform adapters and framework integrations.
- `apps/web/` contains documentation and playgrounds; `apps/relay/` is the server.
- `examples/` contains example apps; `bench/` contains compiler and storage benchmarks.

Look up less common commands in [package.json](package.json), and test-runner
details in [test/README.md](test/README.md) when needed. Run standalone TypeScript
scripts with `node script.mts`. Run GitHub CLI commands with network access.

## Verification

- For implementation changes, run relevant type-checking, linting, and focused
  tests. Use `pnpm typecheck`, `pnpm lint`, and
  `pnpm test:node "<test-file-or-glob>"`; quote globs. For Vitest suites, select
  the owning project from its configuration and follow `test/README.md`.
- After changing documentation examples, run `pnpm test:jsdoc <changed-file>`.
  The default suite covers configured sources, not every documentation page.
- After changing Type declarations, run
  `pnpm bench:type --filter=<affected-workload>` for relevant local workloads.
  CI runs the full suite. Run it locally when updating baselines or investigating
  broad regressions. See [benchmark usage](bench/type/README.md#running).
- After changing storage algorithms, SQL, indexes, or query plans, run
  `pnpm bench:storage`. Neither benchmark is included in `pnpm verify`.
- After changing browser APIs, platform-sensitive behavior, polyfills, workers,
  or browser test configuration, run `pnpm test:integration:browsers`. It tests
  configured integration projects, not all collocated unit tests. Run
  `pnpm playwright:install` after Playwright updates or browser-cache removal.
- After packaging or export changes, run `pnpm build`, `pnpm check:packages`,
  and relevant bundle tests. `pnpm build` also generates IDE package types.
- For cross-package behavior or shared build/test-infrastructure changes, or
  when requested, run `pnpm verify`. It runs formatting, type-checking, lint,
  builds, package checks, documentation generation, and all configured tests.
  Do not run other CPU-intensive commands concurrently with it.
- For prose-only changes, check formatting and relevant links; compile changed
  MDX pages. Restrict focused formatting checks to touched files in a dirty tree.
- Once required checks pass, stop expanding or repeating verification unless
  new changes, failures, or unresolved concerns justify it. Report failed or
  blocked checks accurately; do not treat an attempted check as a pass.

## Module structure and naming

- Group by feature: public contract and supporting types,
  then implementation, shared helpers, and private implementation types. Finish
  one feature before starting another. Put orchestration before the operations
  it calls.
- Keep inferred output interfaces immediately after their Evolu Type values.
- Initialize `const` helpers before module initialization or factory setup calls
  them synchronously, including through another function.
- Use named exports and imports, with unique exported names and no namespaces.
  Default exports are allowed when required by framework/tool APIs; namespace
  imports are allowed for third-party namespace APIs.
- Prefer `interface`; use `type` for unions, tuples, mapped types, type utilities,
  and dependency intersections. Interface properties are `readonly`; callable
  properties use arrow syntax, not methods.
- Name factories `createX`, operations `mapArray`, conversions `xToY`, predicates
  `isX`, empty values `emptyX`, and dependencies `XDep`. Name instances `eqString`
  or `orderNumber`, positional accessors `firstInArray`, and indexed collections
  as value-by-key, such as `messagesByOwnerId`.
- Use `globalThis` for globals whose names overlap local APIs. Shadowing is allowed.

## Functions and data

- Use arrow functions; use `function` for overloads.
- Do not extract a helper used only once; inline it.
- Use meaningful local constants for complex nested expressions.
- Use interfaces and `createX` factories instead of classes. Model domain objects
  as plain data; use `Typed` for tags and `typed` or `object` for validation.
- Inside factories, order declarations as: derived constants/assertions, mutable
  variables, owned resources, listeners/timers, local functions, returned API.
  Respect the synchronous initialization constraint above.
- Inline single-use, non-exported options types without `readonly`. Use readonly
  interfaces for exported or reused options. Destructure options in parameters.
- Avoid getters/setters. Use readonly properties for stable values and explicit
  functions for values that change or require computation.
- Side-effecting union switches use `exhaustiveCheck` in `default`.
  Value-producing switches return from every case and omit `default`.
- Use `ReadonlyArray`, `NonEmptyReadonlyArray`, `ReadonlySet`, `ReadonlyMap`, and
  `ReadonlyRecord` for immutable APIs. Do not expose a mutable alias as readonly.
- Do not mutate application data passed to public functions. Local construction
  mutation is allowed, but stop before returning immutable data. Explicitly
  mutable APIs may mutate as their contract requires. Readonly does not freeze
  values or prove ownership.

## Results, Types, and brands

- Fallible public APIs return `Result<T, E>` with exact plain-object domain errors,
  not `Error` instances. Use `ok()` for success without a value and `trySync` or
  `tryAsync` to convert thrown/rejected values.
- Name error interfaces `XError`. Drop `Error` from the discriminant only when
  the remainder clearly names a failure: `UserNotFoundError` extends
  `Typed<"UserNotFound">`; `TimeoutError`, `RetryError`, and `AbortError` keep it.
- Use `getOrThrow` and Type `.orThrow` for initialization, startup/configuration,
  test fixtures, or internal invariants, not for processing user input.
- Validate external input with Evolu Types, not casts/assertions. Construct Types
  with factories such as `createType`, `brand`, `array`, and `object`.
- For a named object Type `X`, use
  `export interface X extends InferType<typeof X> {}` for its output.
- Use `Brand<"Name">` for opaque handles and otherwise interchangeable values.
- Exported symbol keys must retain unique identity in emitted declarations.
  `globalThis.Symbol()` can infer `symbol`, erasing computed properties and type
  distinctions. Follow the explicit unique-symbol pattern in `Type.ts` and check
  emitted declarations when changing such keys.
- Shared symbol keys belong at module scope. A factory creates a different key
  per call, but TypeScript associates the unique type with the declaration;
  it can accept cross-call objects whose required property is actually missing.
  Runtime-only sentinels and identity tokens do not need unique types.

## Dependencies, Tasks, and disposal

- Synchronous dependency injection uses one `deps` object. Use interfaces for
  dependencies and their `XDep` wrappers, without generic dependency parameters
  or implementation-specific errors.
- Compose dependencies with type intersections, alphabetically, with `Partial`
  dependencies last. Callers may over-provide; functions must not over-depend.
- Shared modules do not export dependency instances; composition roots may
  create them at module scope.
- Tasks declare dependencies in `Task<T, E, D>` and read `run.deps`. Call
  `run(task)`, never `task(run)`. Handle or propagate `Err` before reading value.
- Objects with multiple async operations create one internal `Run` shared by
  those operations.
- Create disposable objects with `disposable`. Pass the owned `DisposableStack`
  or `AsyncDisposableStack` when cleanup resources are involved.

## Documentation and tests

- JSDoc explains behavior without repeating types. No `@param`, `@return`, or
  `@example`; use `### Example`. Link the first exported-symbol mention with
  `{@link}`. Avoid pipes in the first sentence and alignment-only edits.
- TypeScript examples are standalone and deterministic, with explicit imports
  and assertions. Prefix intentionally unused declarations with `_`, but never
  declarations that are used.
- Prove contracts: `assertType` for types, `assertEqual` for Data, `assertSame`
  for SameValue/reference identity, `assertTrue`/`assertFalse` for predicates,
  `assert` for invariants/narrowing, and `assertOk`/`assertErr` for Results.
- When changing API reference organization, read only the relevant section of
  [Conventions](<apps/web/src/app/(docs)/docs/conventions/page.mdx#api-reference-organization>).
  Resolve TypeDoc warnings; they fail CI.
- Feature additions and bug fixes need a test that fails without the change.
  Changed source files retain 100% statement, branch, function, and line coverage.
- Use `assertType` and precise `@ts-expect-error` comments for type contracts.
  Copy Evolu `CompileTimeError` messages verbatim; otherwise describe the rejected
  TypeScript contract. Do not use generic comments such as "should fail."
- Create fresh dependencies per test. Library-exported helpers use `testX`;
  local/test-only setup helpers use `setupX`. `testCreateDeps` and `testCreateRun`
  are in `packages/common/src/Task.ts`.

## Commits and changesets

- Commit messages use sentence case, no `feat:`/`fix:` prefix or trailing period.
- Published API/runtime changes require a changeset created with `pnpm changeset`:
  patch for fixes, minor for additions, major for breaking changes, even in previews.
- Changesets are release notes. Start with a short, standalone, past-tense title
  without a trailing period. Explain observable behavior or migration impact;
  keep unrelated changes separate.
- TypeScript usage changes need tested examples following the documentation
  rules. For breaking changes, prove old usage is rejected and show its replacement
  in the same example. Documentation-only/tooling-only notes need no example.
