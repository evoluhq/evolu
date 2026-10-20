# Evolu repository guidance

This file selectively summarizes [Conventions](<apps/web/src/app/(docs)/docs/conventions/page.mdx>)
and adds repository workflow. It suffices for routine work; read only the
relevant Conventions section when a rule here is unclear or when reviewing or
changing a convention. Keep shared rules consistent; not every convention needs
a summary here.

## Working on a task

- Keep reviews read-only unless edits are requested. Preserve unrelated
  working-tree changes. Do not create a commit unless asked.
- Commit messages use sentence case, with no `feat:`/`fix:` prefix or trailing period.
- Write new modules and helper scripts in TypeScript. Keep existing JavaScript,
  MJS, and CJS files in their current language unless migrating them is the task.

## Repository and commands

This is a pnpm TypeScript monorepo. Use the Node.js version in `.nvmrc`.
`apps/web/` runs Next 16, whose APIs differ from older versions; when changing
Next-specific configuration or routing, consult the bundled docs in
`node_modules/next/dist/docs/`.

Run standalone TypeScript scripts with `node script.mts`. Run GitHub CLI
commands with network access. To render a documented code example as an image
for a post, run `node scripts/code-image.mts --help`.

## Verification

- Run checks directly relevant to the change. Scope tests, linting, formatting,
  and builds to affected files or packages. Do not run full test suites merely
  because a change touches exports, multiple packages, or infrastructure.
- Do not run `pnpm verify`, or all of its component commands one by one, unless
  the user explicitly requests it; CI runs it on pull requests and pushes to main.
- For implementation changes, use `pnpm test:node "<test-file-or-glob>"`; quote
  globs. For Vitest suites, select the owning project and relevant test files
  from its configuration and follow `test/README.md`.
- Format changed TypeScript, JavaScript, Markdown, and MDX files with
  `pnpm exec prettier --write <changed-files>`, and lint changed source files
  with `pnpm exec oxlint <changed-files>`. Node tests do not check types; run
  `pnpm typecheck`, which checks all TypeScript except `examples/` and
  `apps/web/deploy/` and is fast.
- After changing documentation examples or exported APIs, run
  `pnpm test:jsdoc`, which checks the JSDoc of every package, every
  changeset, and every handwritten docs page and blog post. Pass files, such
  as `pnpm test:jsdoc <changed-file>`, to check only those. `packages/svelte`
  is excluded because Node.js cannot run its examples.
- After changing MDX pages, the MDX plugins in `apps/web/src/mdx/`,
  `apps/web/src/lib/navigation.ts`, exported declarations in `packages/*/src`,
  the types they reference, their JSDoc, or API reference organization, or
  renaming, moving, or removing pages, run `pnpm build:docs` and resolve its
  warnings, which fail CI. Then run
  `pnpm test:node --no-experimental-test-coverage test/integration/nodejs/web/Docs.test.ts`,
  which compiles every handwritten MDX page and checks internal links in those
  pages and in navigation. TSX pages, JSDoc, and READMEs are not checked, so
  verify links you add there and search for a renamed page's or heading's old
  URL.
- After changing `packages/common/src` outside tests, run `pnpm bench:type` and
  `pnpm test:bundle`, which builds `@evolu/common` and measures its `dist`.
  After changing sync protocol or storage code, such as
  `packages/common/src/local-first/Protocol.ts`, `Storage.ts`, or `Relay.ts`,
  also run `pnpm bench:protocol`; `--base=<ref>` compares with another commit.
  Each benchmark takes under a minute. Report metric and bundle-size changes;
  update baselines and snapshots only when the user explicitly requests it.
- After changing storage algorithms, SQL, indexes, or query plans, select the
  relevant storage tests. Run `pnpm bench:storage` only when the user
  explicitly requests it.
- After changing a published package's `dependencies`,
  `optionalDependencies`, `exports`, `publishConfig`, `types`, or `files`, or
  its build configuration, run `pnpm build`, then
  `pnpm check:packages`, which packs all packages and needs their built `dist`
  and the pinned SQLite wasm.
- After changing dependencies in any `package.json`, run `pnpm lint:sherif`.
- After changing `packages/sqlite-wasm/scripts/generate.mts`, `bindings.mts`, or
  `upstream/`, regenerate with `node packages/sqlite-wasm/scripts/generate.mts`.
  After changing `packages/sqlite-wasm/src` or `scripts`, run
  `pnpm test:sqlite-wasm`, which fails below 100% line, branch, or function
  coverage. Tests that run SQLite Wasm need the uncommitted
  `packages/sqlite-wasm/wasm/sqlite3.wasm` and fail when it is missing or stale
  after a pin change. Get the pinned one with `pnpm sqlite-wasm:download`, which
  needs network access.
- After changing `packages/sqlite-core`, run the affected C tests with
  `node packages/sqlite-core/scripts/test.mts <test-name-prefix>` and the
  affected TypeScript test files with `pnpm test:node`, then
  `pnpm test:sqlite-core` once, which fails when the C tests cover less than
  every line, branch, or function of `src` that the host compiles. On a CPU
  that lacks a hardware crypto feature its architecture's paths use, such as
  an arm64 one without SHA-512 or DIT, it allows gaps only in the crypto
  layer's files, and on CI, the CPU must report the features its runner
  declares in `.github/workflows/checks.yaml`.
  `node packages/sqlite-core/scripts/test.mts --coverage` lists the C gaps.
  The tests need clang with `llvm-profdata` and `llvm-cov`, which Xcode
  installs, and on Ubuntu the llvm package (installed with clang unless
  Recommends are skipped), make, unzip and zip, on Linux also OpenSSL's
  development headers and clang's shared AddressSanitizer runtime, and network
  access the first time, to fetch the pinned SQLite source and expo-sqlite
  releases.
- After changing browser APIs, platform-sensitive behavior, polyfills, workers,
  or browser test configuration, run the affected browser projects with
  `pnpm exec vitest run --project=<project> <test-files>`, which runs them in
  Chromium, Firefox, and WebKit, instead of `pnpm test:integration:browsers`,
  which runs every browser project.
- Once required checks pass, stop expanding or repeating verification unless
  new changes, failures, or unresolved concerns justify it. Node's test runner,
  used by `pnpm test:node` and `pnpm test:bundle`, counts a timed-out test as
  cancelled, not failed, so `fail 0` can hide a timeout; check the exit code and
  the cancelled count before reporting a pass.

## Third-party packages

- Ask before adding a runtime dependency to a published package; first check
  whether a few lines of our own code would do. Report its repository,
  maintainers, dependency count, and
  `npm view <pkg>@<version> _npmUser maintainers dist.attestations --json`.
- Published packages pin external runtime dependencies to exact versions, which
  `pnpm check:packages` enforces; peer dependencies keep ranges. Keep
  `@noble/hashes` at the exact version `@scure/bip39` depends on, so apps
  install one copy.
- When a runtime dependency of a published package changes, read
  `npm diff --diff=<pkg>@<old> --diff=<pkg>@<new>`, compare
  `npm view <pkg>@<old> _npmUser maintainers dist.attestations --json` with
  `<new>`, and report new dependencies, install scripts, network, filesystem,
  or `eval` use, minified or encoded code, and a changed publisher or
  maintainer or lost provenance. Add a changeset; an update that changes no
  behavior is a patch.
- Ask before allowing a package's install scripts in `allowBuilds` or
  weakening the release-age or trust checks in `pnpm-workspace.yaml` or
  `apps/web/deploy/.npmrc`, such as with a `minimumReleaseAgeExclude` or
  `trustPolicyExclude` entry. pnpm can write such entries itself, so check
  `git diff pnpm-workspace.yaml` after installs.

## Module structure and naming

- Group by feature: public contract and supporting types,
  then implementation, shared helpers, and private implementation types. Finish
  one feature before starting another. Put orchestration before the operations
  it calls.
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

## Functions and data

- Do not extract a helper used only once; inline it.
- Use interfaces and `createX` factories instead of classes. Model domain objects
  as plain data; use `Typed` for tags and `typed` or `object` for validation.
- Make invalid states unrepresentable. When fields constrain each other, use a
  union of `Typed` variants, each holding only the fields valid for it, not
  independent booleans and nullable or optional fields. Do not store values
  derivable from sibling fields, such as a status beside the data it summarizes.
  Both rules apply to public outputs, such as snapshots; do not flatten an
  internal union into booleans at the API boundary.
- Inside factories, order declarations as: derived constants/assertions, mutable
  variables, owned resources, listeners/timers, local functions, returned API.
- Inline single-use, non-exported options types without `readonly`. Use readonly
  interfaces for exported or reused options. Destructure options in parameters.
- Type React components as `FC<Props>` with props inline, without `readonly`,
  and destructured in the parameter, also for exported components. Declare
  `children` as `ReactNode`, required unless the component works without it;
  `PropsWithChildren` would make it optional. A component that only forwards
  its props takes `props` whole, and a generic component annotates its
  parameter, since a value typed as `FC` cannot be generic.
- Avoid getters/setters. Use readonly properties for stable values and explicit
  functions for values that change or require computation.
- Side-effecting union switches use `exhaustiveCheck` in `default`.
  Value-producing switches return from every case and omit `default`.
- Use `ReadonlyArray`, `NonEmptyReadonlyArray`, `ReadonlySet`, `ReadonlyMap`, and
  `ReadonlyRecord` for immutable APIs. Do not expose a mutable alias as readonly.
- Do not mutate application data passed to public functions. Local construction
  mutation is allowed, but stop before returning immutable data. Explicitly
  mutable APIs may mutate as their contract requires.

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
- Trust brands: do not check at runtime what a value's type already proves, such
  as a `NonNegativeInt` parameter or the numbers in a `JsonValue`; a value that
  breaks its type came from a wrong cast. Check external or unbranded input,
  relations a brand cannot express, and internal invariants. When code proves a
  brand's constraint, such as a difference after an order check, cast instead.
  Evolu Type's typed boundaries still assert their whole domain, brands
  included, because TypeScript cannot prove structural invariants such as
  data-only properties. A public function also keeps a cheap check where a
  wrongly typed value would otherwise hang, spin, or silently break a limit.
- For a named object Type `X`, declare
  `export interface X extends InferType<typeof X> {}` immediately after it.
- Use a standalone `Brand<"Name">` for opaque handles. Reserve bare `Brand`
  intersections for values that only library code produces, cast where they are
  produced; give other domain values a validated `brand(...)` Type.
- Declare shared symbol keys at module scope. Symbol keys in exported types use
  the explicit unique-symbol pattern in `Type.ts`; check emitted declarations
  when changing them. Runtime-only sentinels and identity tokens need no unique
  type.

## Dependencies, Tasks, and disposal

- Synchronous dependency injection uses one `deps` object. Use interfaces for
  dependencies and their `XDep` wrappers, without generic dependency parameters
  or implementation-specific errors.
- Compose dependencies with type intersections, alphabetically, with `Partial`
  dependencies last. Callers may over-provide; functions must not over-depend.
- Shared modules do not export dependency instances; composition roots may
  create them at module scope.
- Tasks declare dependencies in `Task<T, E, D>` and read `run.deps`. Call
  `run(task)`, never `task(run)`.
- Objects with multiple async operations create one internal `Run` shared by
  those operations.
- Create disposable objects with `disposable`. Pass the owned `DisposableStack`
  or `AsyncDisposableStack` when cleanup resources are involved.
- Use `Time.now` for a moment recorded, displayed, or compared across devices
  and `Time.performance.now` for durations that drive behavior. Subtracting two
  `Time.now` readings compiles but breaks under a clock adjustment. A deadline
  that must count time the device spent suspended is the exception and keeps an
  absolute `Time.now` deadline, as `createTime` does for long timeouts. Type a
  moment measured from as `PerformanceTime` and subtract with
  `performanceDurationBetween`, except where an unordered reading must be
  clamped rather than thrown on.

## Documentation and tests

- JSDoc explains behavior without repeating types. No `@param`, `@return`, or
  `@example`; use `### Example`. Link the first exported-symbol mention with
  `{@link}`. Avoid pipes in the first sentence and alignment-only edits.
- A workaround for a browser, runtime, or dependency bug gets a `//` comment
  at the code describing the behavior and linking the upstream issue.
- Read the ADRs in `docs/adr` that the code you change points to. Accepted ADRs
  bind: when a task conflicts with one, stop and ask. Proposed ADRs are context;
  do not implement one before a maintainer accepts it. Before proposing a
  design, check `docs/adr` for an ADR that proposes or rejects it. Record a
  decision that no single code site owns, such as WebSocket over WebTransport
  or how the relay's Docker image is built, as a Proposed ADR from
  `docs/adr/template.md` only when it is hard to reverse, surprising without
  context, and a real trade-off. Only a maintainer accepts or rejects an ADR;
  when they do, set its status and date. Point to an accepted ADR from the code
  it governs with a comment naming its path, supersede it only through an ADR
  a maintainer accepted, and run `pnpm test:node scripts/adr.test.mts`.
- TypeScript examples are standalone and deterministic, with explicit imports
  and assertions. Use `ts` fences, or `tsx` for JSX; other spellings fail. On a
  documentation page, setup the page already shows or names, and assertions
  that would distract, may sit between `// ---cut-start---` and
  `// ---cut-end---` lines, which the website hides.
- Prove contracts: `assertType` for types, `assertEqual` for Data, `assertSame`
  for SameValue/reference identity, `assertTrue`/`assertFalse` for predicates,
  `assert` for invariants/narrowing, and `assertOk`/`assertErr` for Results.
- When changing API reference organization, read only the relevant section of
  [Conventions](<apps/web/src/app/(docs)/docs/conventions/page.mdx#api-reference-organization>).
- Feature additions and bug fixes need a test that fails without the change.
  Cover the changed behavior, including relevant branches and failure paths.
  Report pre-existing coverage gaps without adding unrelated tests solely to
  reach 100% coverage of an entire source file.
- Each `@ts-expect-error` comment copies the Evolu `CompileTimeError` message
  verbatim when there is one and otherwise describes the rejected TypeScript
  contract, never a generic one such as "should fail."
- Create fresh dependencies per test. Library-exported helpers use `testX`;
  local/test-only setup helpers use `setupX`. `testCreateDeps` and `testCreateRun`
  are in `packages/common/src/Task.ts`.
- Cost tests compare thread CPU time with a linear baseline from the same run,
  not a fixed time; wait tests keep wall-clock time. See `test/README.md`.

## Changesets and versioning

- Published API/runtime changes require a changeset: patch for fixes, minor for
  additions, major for breaking changes, also in Changesets pre-release mode.
  Create it with `pnpm changeset --minor <packages> -m "<title>"` (likewise
  `--patch` or `--major`; comma-separate packages), which rejects misspelled or
  private packages, then write the body in the file it prints.
- Changesets are release notes describing the final change relative to committed
  code. Start with a short, standalone, past-tense title without a trailing
  period, explain observable behavior or migration impact, and keep unrelated
  changes separate. Do not create changesets for review fixes, debugging, or
  iterations on uncommitted work, or release notes for bugs that existed only in
  uncommitted code. Update an existing changeset only if the final user-facing
  behavior or version impact changes.
- TypeScript usage changes need tested examples following the documentation
  rules. For breaking changes, prove old usage is rejected and show its replacement
  in the same example. Documentation-only/tooling-only notes need no example.
- Renaming or removing an exported runtime symbol or type of a stable API is
  never a patch, however simple the migration: add the new name in a minor, keep
  the old one as a `@deprecated` alias that names its replacement, and remove
  deprecated aliases together in an occasional major.
- Local-first APIs, including their platform and framework integrations, and
  APIs marked `@experimental` are not stable yet. Incompatible changes to them,
  including renames and removals, are patch, not major; use minor for additions,
  and document migration impact.
- `@evolu/sqlite-wasm` does not follow semver. It is versioned
  `<SQLite version>-build<n>`, any build may change its API, and
  `scripts/version-sqlite-wasm.mts` replaces the version its changeset bump
  computes, so the bump type only selects its release-notes heading.
- `@evolu/sqlite-core` is private, and its code will ship inside
  `@evolu/sqlite-wasm`, `@evolu/nodejs` and `@evolu/react-native` as each
  binding lands. Changesets skips private packages, so a change to it needs a
  changeset for each published package that already ships the change, and none
  while none does. Never name it in a changeset: Changesets never consumes such
  a file, which keeps the release workflow from publishing.
