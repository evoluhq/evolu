# Evolu repository guidance

## Repository

Evolu is a TypeScript monorepo using pnpm workspaces and Turborepo. Platform and
framework packages depend on `@evolu/common`.

- `packages/common/src/` — platform-independent source code.
- `packages/common/src/local-first/` — the local-first subsystem.
- `packages/web/`, `packages/nodejs/`, and `packages/react-native/` — platform adapters.
- `packages/react/`, `packages/react-web/`, `packages/svelte/`, and `packages/vue/` — framework integrations.
- `apps/web/` — documentation and playgrounds.
- `apps/relay/` — the sync server.
- `examples/` — framework-specific example applications.
- `bench/` — storage and TypeScript compiler benchmarks.

## Worktree

- Before editing a module, read that module and its tests, if present.
- Do not discard, overwrite, or reformat unrelated working-tree changes.
- Write new source modules and helper scripts in TypeScript. Keep existing
  JavaScript, MJS, and CJS files in their current language unless the task is a
  language migration.
- Do not create a commit unless the user asks for one.

## Commands

The repository uses the latest Node.js LTS release selected by `.nvmrc` and pnpm.

- `pnpm install` — install workspace dependencies.
- `pnpm playwright:install` — install browsers for Playwright-based tests and
  `pnpm verify`. Run it after Playwright updates or browser-cache removal.
- `pnpm typecheck` — type-check packages, scripts, and benchmarks.
- `pnpm test <test-file>` — run one Node test file.
- For focused coverage, run one test file with `--project`, `--coverage`,
  `--coverage.include=<source-file>`, and `--coverage.thresholds.100`.
- `pnpm test` — run Node-based tests.
- `pnpm test:browsers` — run browser tests in Chromium, Firefox, and WebKit.
- `pnpm test:bundle` — run production bundle and tree-shaking tests.
- `pnpm test:coverage` — run Node, Chromium, and bundle tests with coverage.
- `pnpm test:jsdoc <file-or-glob>...` — compile and run documentation examples
  from specific source or Markdown files. Omit arguments to test every
  configured JSDoc source and changeset.
- `pnpm build` — build publishable packages and the relay. Run it once after a
  clone or pull to generate IDE package types.
- `pnpm check:packages` — validate package source and distribution exports.
- `pnpm lint` — run Oxlint, including runtime import-cycle analysis.
- `pnpm verify` — run type-checking, builds, package checks, coverage,
  Firefox/WebKit compatibility tests, monorepo linting, documentation
  generation, and Oxlint serially. Its underlying tools can use all available
  CPU cores, so do not run other CPU-intensive commands concurrently.
- `pnpm format` — write Prettier formatting changes.
- `pnpm bench:type` — compare Type compiler metrics with committed baselines.
  Run it after changing Type declarations or `bench/type` infrastructure. It is
  not part of `pnpm verify`.
- `pnpm bench:storage` — run storage benchmarks. Run it after changing storage
  algorithms, SQL, indexes, or query plans.
- Run GitHub CLI commands with network access.

Run standalone TypeScript scripts directly with Node.js, for example
`node script.mts`.

## Module structure

- Group declarations by feature, not by export visibility. For each feature,
  place ordinary exported interfaces and types before exported code, then
  internal code. Place a function-specific error interface immediately after
  that function, separated by an empty line, so the happy path comes first.
  Finish that feature before starting the next one.
- Within a feature, place orchestration code before the lower-level operations it
  calls so the feature can be read from start to end. Define a `const` helper
  first when a module initializer invokes it during module evaluation.
- Repository source modules use named exports and named imports. Do not define
  namespaces; package indexes re-export names into one namespace, so exported
  names must be unique. Use a default export only for a framework or tool API
  that requires one. Namespace imports are allowed for third-party namespace
  APIs.
- Prefer `interface`. Use `type` for unions, tuples, mapped types, type utilities,
  and intersections that compose dependencies.
- Name conversions `xToY`, predicates `isX`, empty values `emptyX`, dependencies
  `XDep`, and operations as a verb plus the operated-on type, such as `mapArray`.
- Name maps and records as value-by-key, for example `rowsByQuery`,
  `messagesByOwnerId`, and `usersById`.
- Use `globalThis` for globals whose names overlap local APIs, for example
  `globalThis.Worker`.
- Interface properties use `readonly`, and callable properties use arrow-function
  syntax instead of method syntax.
- Immutable collection APIs use `ReadonlyArray`, `NonEmptyReadonlyArray`,
  `ReadonlySet`, `ReadonlyMap`, and `ReadonlyRecord`. Use mutable collection types
  only when the API mutates them. Do not expose a mutable alias as readonly.
- Variable shadowing is allowed.

## Functions and factories

- Use arrow functions. Use `function` for overloads.
- Do not extract a helper used only once; inline it.
- Use `createX` factory functions instead of classes for Evolu object
  construction.
- Inside a factory, declare items in this order: derived constants and
  assertions; mutable variables; `DisposableStack`, `AsyncDisposableStack`, and
  other owned resources; listeners and timers; local functions; returned API.
- Inline the type of an options object used by one function. Use an interface
  with `readonly` properties when the options type is exported or used by more
  than one function. Destructure options in the parameter list.
- Avoid getters and setters. Use readonly properties for stable values and
  explicit methods for values that can change or require computation.
- In a side-effecting switch over a union, call `exhaustiveCheck` in `default`.
  In a value-producing switch, return from every case and omit `default`.

## Result and errors

- Fallible public APIs return `Result<T, E>` for typed domain errors instead of
  throwing them.
- Domain errors are exact plain objects, not `Error` instances. Name an error
  interface `XError`. When `X` already clearly describes a failure, extend
  `Typed<"X">` and omit the redundant `Error` suffix from the discriminant,
  for example `UserNotFoundError extends Typed<"UserNotFound">`. Keep the
  suffix when it is needed to make the discriminant unambiguously an error, as
  in `TimeoutError`, `RetryError`, and `AbortError`.
- Operations without a success value return `Result<void, E>` with `ok()`.
- Use `trySync` and `tryAsync` when converting thrown or rejected values into a
  `Result`.
- Use `getOrThrow` and Type `.orThrow` for module initialization, startup and
  configuration loading, test fixtures, or internal invariants. Do not use them
  to process user input.

## Type and brands

- Validate external input with Evolu Type declarations; do not cast or assert it.
- Construct Types with factories such as `base`, `brand`, `array`, and `object`.
- For a named object Type `X`, declare its output as
  `export interface X extends InferType<typeof X> {}`.
- Use `Brand<"Name">` for opaque handles and values that share a runtime type but
  must not be interchangeable.

## Dependency injection and Tasks

- Synchronous functions with injected dependencies accept one `deps` object.
- Wrap each dependency in an `XDep` interface to prevent property-name clashes.
- Dependency interfaces do not use generic parameters and expose domain errors,
  not implementation-specific errors.
- Use interfaces for dependencies and their `XDep` wrappers. Use type aliases for
  intersections that compose dependencies.
- Sort dependencies alphabetically in intersections and put `Partial` dependencies
  last.
- Tasks declare dependencies in `Task<T, E, D>` and read them through `run.deps`.
- Call Tasks with `run(task)`, never `task(run)`.
- Return, handle, or translate an `Err` from `run(task)` before accessing the
  result's value.
- Shared modules do not export dependency instances. Composition roots may create
  them at module scope.
- A caller may pass more dependency properties than a function requires.
- A function does not require dependencies it does not use.
- An object exposing multiple asynchronous operations creates one internal
  `Run`; every asynchronous method uses that instance.

## Disposal

- Create disposable objects with `disposable`. Pass it a `DisposableStack` or
  `AsyncDisposableStack` when the object owns cleanup resources.

## JSDoc and TypeDoc

- Do not repeat TypeScript parameter and return types in JSDoc prose.
- Do not use `@param`, `@return`, or `@example`.
- Put examples under a `### Example` Markdown heading.
- Write every TypeScript code fence as a standalone, deterministic example that
  can be linted, compiled, and run by `testJSDocExamples`. Explicitly import its
  dependencies and assertions.
- Prefix intentionally unused example declarations with `_`. The harness
  rejects both unprefixed unused declarations and used underscore-prefixed
  declarations.
- Prove documented contracts in examples instead of describing expected output
  only in comments: use `assertType` for static contracts, `assertEqual` for
  Data comparisons, `assertSame` for SameValue or reference identity,
  `assertTrue` or `assertFalse` for boolean predicates, `assert` with a
  descriptive message for invariants and narrowing, and `assertOk` or
  `assertErr` for Results.
- After changing documentation examples, run `pnpm test:jsdoc <changed-file>`
  during development. The exhaustive JSDoc test remains part of `pnpm verify`.
- Use `{@link}` on the first mention of an exported symbol.
- Do not put a pipe character in the first sentence; TypeDoc inserts that
  sentence into Markdown tables.
- Use TypeDoc's generated declaration-kind groups for simple modules. If a
  module uses any custom `@group`, assign every exported declaration to a
  semantic group; do not mix custom groups with generated groups such as
  Functions, Interfaces, and Type Aliases.
- Name custom groups by their purpose within the module, using short contextual
  names such as Creation, Guards, Model, or Pull, and define their order
  explicitly. Keep all module prose before the generated API groups, with FAQ
  last when present. Put API-specific guidance and examples on the relevant
  declarations instead of using `@groupDescription` or custom renderer logic to
  reposition module prose.
- Do not make alignment-only JSDoc edits.
- TypeDoc warnings fail CI. Resolve every warning emitted by `pnpm build:docs`.

## Tests

- Every feature addition and bug fix includes a test that fails without the
  change.
- After changing a module that has an existing test file, run that test file with
  `pnpm test <test-file>`.
- Test locations are defined by each Vitest project and are not limited to
  `packages/*/test`.
- Use `expectTypeOf` for compile-time contracts and `@ts-expect-error` for
  rejected programs.
- Every `@ts-expect-error` must describe the specific expected rejection. When
  an Evolu API provides a `CompileTimeError` message, copy that message verbatim.
  Otherwise, state the rejected TypeScript contract precisely. Do not use
  generic descriptions such as "should fail."
- Create fresh dependencies in each test; do not share mutable dependency
  instances between tests.
- Library-exported test helpers use the `testX` prefix. Reusable setup helpers
  local to tests or exported from test-only files use `setupX`. `testCreateDeps`
  and `testCreateRun` are defined in `packages/common/src/Task.ts`.
- Changed source files retain 100% statement, branch, function, and line
  coverage.

## Commits and changesets

- Commit messages use sentence case, no `feat:`/`fix:` prefix, and no trailing
  period.
- Changes to a published package’s exported API or runtime behavior require a
  changeset created with `pnpm changeset`.
- Write changesets as release notes for package users, not implementation logs.
  The first body paragraph is the changelog title: keep it short, standalone,
  sentence case, in past tense, and without a trailing period. Use the following
  paragraphs to explain observable behavior or migration impact. When a change
  affects TypeScript usage, include one or more examples that follow the JSDoc
  example rules above. Documentation-only and tooling-only changesets do not
  need an example. For a breaking migration, prove that the old usage is
  rejected and show the replacement in the same tested example. Put unrelated
  user-facing changes in separate changesets.
- Fixes use patch changesets, additive features use minor changesets, and
  breaking public APIs use major changesets, including during preview releases.
