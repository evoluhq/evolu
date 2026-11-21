# Evolu repository guidance

This file selectively summarizes
[Conventions](<apps/web/src/app/(docs)/docs/conventions/page.mdx>) and adds
repository workflow. Read only the relevant Conventions section when unclear or
when reviewing/changing a convention; keep shared rules consistent. Nested
native/SQLite `AGENTS.md` files are listed under Verification.

## Working on a task

- Keep reviews read-only unless edits are requested. Preserve unrelated
  working-tree changes. Do not create a commit unless asked.
- When rejecting a review finding for an intentional trade-off, state
  user-visible behavior in the symbol's JSDoc, record rationale in a brief `//`
  comment, show it in triage, and apply it to the working tree before the next
  round so it does not recur (folding into unpushed commits only per the commit
  rule below).
- For unsettled non-trivial designs, align on a plan in chat before coding (no
  untracked working-tree scratchpads).
- Commit messages use sentence case, with no `feat:`/`fix:` prefix or trailing
  period. One feature or ADR per commit; separate unrelated fixes; name the
  package or framework in single-package commits; fold review fixes into the
  unpushed commits they fix only after the maintainer has seen them uncommitted
  or asks.
- Git pushes sign with the maintainer's Trezor SSH key
  ([Supply chain](<apps/web/src/app/(docs)/docs/supply-chain/page.mdx>)). On
  `device not found`, wait for the maintainer to unlock it; never push another
  way (e.g. HTTPS with a token).
- Write new modules and helper scripts in TypeScript. Keep existing JS, MJS, and
  CJS files in their current language unless migrating them is the task.
- Support only the current major version of each tool, as the examples use it
  (such as Vite, Next.js, React, Expo, React Native, TypeScript, and Node.js):
  no workarounds, tests, or review findings that affect only older versions.
  Current Chromium, Firefox, and WebKit are supported (work around their bugs).

## Repository and commands

This is a pnpm TypeScript monorepo (`.nvmrc` Node.js). `apps/web/` runs Next 16
(consult `node_modules/next/dist/docs/` for Next config/routing). `typescript`
is TS 6 (`@typescript/typescript6`) and `@typescript/native` is TS 7 (`>=7` peer
warnings are intentional); `pnpm typecheck` checks all TypeScript except
`examples/` and `apps/web/deploy/` using TS 7 and is fast (keep it a sequential
`tsc` chain); `pnpm build:docs` (TypeDoc) checks exported packages with TS 6
(never set `skipErrorChecking: true`; `next build` also runs TS 6); run
`pnpm exec tsc --build tsconfig.typecheck.json --force` after bumping `@types/*`.

Run standalone TS scripts with `node script.mts`, `gh` with network access, and
`node scripts/code-image.mts --help` for code images. Never run `pnpm` or
`@changesets/cli` in a scratch copy with symlinked `node_modules` (pnpm rewires
workspace links in the original checkout).

## Verification

- Scope checks to affected files or packages; never run full suites merely for
  touching exports, multiple packages, or infra. Run verification commands
  directly, not via wrapper scripts.
- Do not run `pnpm verify` (or its commands one by one) unless requested; CI
  runs it on PRs and pushes to main.
- Run Node tests with `pnpm test:node "<file-or-glob>"` (quote globs; never
  bare `pnpm test:node`, which picks up `dist/` and `tmp/`). For Vitest, pick
  the owning project and files per `test/README.md`.
- Format changed TS/JS/MD/MDX with `pnpm exec prettier --write <files>`, lint
  changed source with `pnpm exec oxlint <files>`, and run `pnpm typecheck` (Node
  tests do not check types).
- Check for `apps/web/.next/dev/lock` before running `next build`,
  `pnpm build:web`, `pnpm build:docs` (incl. `pnpm test:integration:nodejs`),
  `pnpm test:e2e`, or `pnpm test:e2e:dev` in the same checkout: while `pnpm dev`
  runs there, run none of them, ask the maintainer first, and never restart
  their servers. Start a dev server only when asked to read a page.
- Once required checks pass, stop repeating or expanding verification without
  new changes or unresolved concerns. Node's test runner (`pnpm test:node`,
  `pnpm test:bundle`) counts timeouts as cancelled, not failed, so check exit
  code and cancelled count, not just `fail 0`.
- After changing documentation examples or exported APIs, run `pnpm test:jsdoc`,
  which checks the JSDoc of every package, every changeset, and every
  handwritten docs page and blog post. Pass files, such as
  `pnpm test:jsdoc <changed-file>`, to check only those. `packages/svelte` is
  excluded because Node.js cannot run its examples.
- After changing MDX, `apps/web/src/mdx/`, `apps/web/src/lib/navigation.ts`,
  exported declarations/types/JSDoc in `packages/*/src`, API reference
  organization, or page moves/removals, run `pnpm build:docs` (every TypeDoc
  warning fails it; resolve them all), then
  `pnpm test:node --no-experimental-test-coverage test/integration/nodejs/web/Docs.test.ts`
  (compiles handwritten MDX and checks links in handwritten pages, navigation,
  and TypeDoc API reference pages; verify non-TypeDoc JSDoc, TSX, READMEs, and
  old URLs manually).
- After changing `apps/web/` production export or playgrounds, run
  `pnpm build:web` and `pnpm test:e2e`. `pnpm test:e2e:dev` serves `next dev`
  and skips `StaticSite.spec.mts`, so use it only for iterating on playgrounds
  (`test/README.md`).
- After changing `packages/common/src` outside tests, run `pnpm bench:type` and
  `pnpm test:bundle` (builds `@evolu/common`; needs
  `packages/sqlite-wasm/wasm/sqlite3.wasm` via `pnpm sqlite-wasm:download`, or
  see `packages/sqlite-wasm/AGENTS.md`). For sync protocol or storage
  (`Protocol.ts`, `Storage.ts`, `Relay.ts`), also run `pnpm bench:protocol`
  (`--base=<ref>`). Report metric and bundle-size changes; update bench
  baselines and bundle snapshots only on explicit user request, except
  `ci-anchor.txt` and `bench/app-size/baselines.json` below.
- After changing storage algorithms, SQL, indexes, or query plans, run relevant
  storage tests; run `pnpm bench:storage` only when explicitly requested.
- When a change leaves the Bench workflow unable to compare a suite with its
  anchor, rewrite the suite's `ci-anchor.txt` in the same commit to say why,
  which moves its CI anchor. Protocol runtime cannot compare across a change to
  a harness module, listed in `bench/protocol-runtime/benchmark.mts`, to its
  list of cases, or to a case's workload hash, which `workload.mts`,
  `bench/protocol/frames.mts` and Evolu code such as `testAppOwner` feed;
  storage cannot compare across a change to `bench/storage/measure.mts`.
- Optimize speed only against end-to-end regressions relative to what a change
  replaces; microbenchmarks explain differences, not set targets.
- After intentionally moving example app sizes (e.g. `@evolu/react-native`
  native code or example deps), update `bench/app-size/baselines.json` from a
  dispatched CI run (`bench/app-size/README.md`; reports diffs, never fails).
- After changing dependencies in any `package.json`, run `pnpm lint:sherif`.
- After changing a published package's `dependencies`, `optionalDependencies`,
  `exports`, `publishConfig`, `types`, `files`, or build config, run
  `pnpm build` then `pnpm check:packages` (checks exact dep pins across
  published packages incl. `@evolu/relay` and packs/checks `packages/*` exports;
  needs `dist`, `sqlite3.wasm`, and
  `packages/{nodejs,react-native,sqlite-wasm}/AGENTS.md` prereqs).
- After changing browser APIs, platform-sensitive behavior, polyfills, workers,
  or browser test config, run affected projects with
  `pnpm exec vitest run --project=<project> <test-files>` (Chromium, Firefox,
  WebKit) instead of `pnpm test:integration:browsers`.
- For native/SQLite packages, read and follow: `packages/sqlite-core/AGENTS.md`,
  `packages/sqlite-wasm/AGENTS.md` (also
  `test/integration/{nodejs,browsers}/sqlite-wasm/` and
  `test/integration/nodejs/Sqlite/WasmSqliteDriver.test.ts`),
  `packages/react-native/AGENTS.md` (also `packages/common/src/NativeSqlite.ts`,
  `examples/react-{expo,native}` native setup/`package.json`,
  `scripts/select-react-native-app.mts`,
  `.github/workflows/react-native-app.yaml`), and `packages/nodejs/AGENTS.md`
  (native addon, `packages/common/src/NativeSqlite.ts`,
  `packages/nodejs/src/{NativeSqlite,NativeSqliteRows,Sqlite}.ts`).

## Third-party packages

- Ask before adding a runtime dep to a published package; first check if a few
  lines of our code suffice. Report repo, maintainers, dep count, and
  `npm view <pkg>@<version> _npmUser maintainers dist.attestations --json`.
- Published packages pin external runtime deps to exact versions
  (`pnpm check:packages`); peer deps keep ranges. Keep `@noble/hashes` pinned to
  the exact version `@scure/bip39` depends on.
- When a published package's runtime dep changes, read
  `npm diff --diff=<pkg>@<old> --diff=<pkg>@<new>` and compare `npm view`
  `_npmUser maintainers dist.attestations --json`; report new deps, install
  scripts, network/fs/`eval`, minified/encoded code, changed publisher/maintainer,
  or lost provenance. Add a changeset (patch if behavior unchanged).
- Ask before allowing install scripts or weakening release-age/trust checks in
  `pnpm-workspace.yaml` (`allowBuilds`, `minimumReleaseAgeExclude`,
  `trustPolicyExclude`) or `apps/web/deploy/.npmrc` (`min-release-age`,
  `ignore-scripts`); pnpm can write such entries itself, so check
  `git diff pnpm-workspace.yaml` after installs. For a lockfile-only transitive
  update: add a temporary entry to `overrides` in `pnpm-workspace.yaml` →
  `pnpm install` → remove the entry → `pnpm install` → verify empty
  `git diff pnpm-workspace.yaml`, the bumped version stayed in `pnpm-lock.yaml`,
  and `pnpm install --lockfile-only --no-prefer-frozen-lockfile` leaves
  `pnpm-lock.yaml` unchanged.

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

- Core API principles: privacy/security > performance (report measured cost);
  public APIs do only what is asked (no implicit follow-ups); published
  `packages/` APIs stay reusable via DI (never delete public API merely because
  this repo does not call it); validate required configuration at runtime, with
  no recovery/migration paths for previously misconfigured deployments.
- Do not extract a helper used only once; inline it.
- Use interfaces and `createX` factories instead of classes. Model domain objects
  as plain data; use `Typed` for tags and `typed` or `object` for validation.
- Make invalid states unrepresentable. When fields constrain each other, use a
  union of `Typed` variants, each holding only the fields valid for it, not
  independent booleans and nullable or optional fields. Do not store values
  derivable from sibling fields, such as a status beside the data it summarizes.
  Both rules apply to public outputs, such as snapshots; do not flatten an
  internal union into booleans at the API boundary.
- Apply the same rules to lifecycles spread across callbacks or collections.
  Keep transition checks and updates with the code that owns the state, and
  change the phase and its data together. Cancel late event delivery or check
  that the event still belongs to the current operation. A boolean or nullable
  value suffices when it represents the whole state. For concurrent lifecycles,
  specify or revise the `states × events` table in the chat plan before changing
  code.
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

- Fallible public APIs return `Result<T, E>` with exact plain-object recoverable
  domain errors, not `Error` instances. Do not wrap unrecoverable defects into
  `Result`, and use `run.abortable(task)` rather than catching `AbortError` from
  `run(task)`. Use `ok()` for success without a value and `trySync` or
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
- For a named `object()` or `typed()` Type `X`, declare
  `interface X extends InferType<typeof X> {}` immediately after it (exported
  when `X` is exported).
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
- Objects with multiple async operations create one internal `Run`, with
  `run.create()` inside a `Task` and the platform's `createRun()` in a
  synchronous factory, shared by those operations.
- Create disposable objects with `disposable`. Pass the owned `DisposableStack`
  or `AsyncDisposableStack` when cleanup resources are involved. Never read
  `Symbol.dispose` or `Symbol.asyncDispose` at module scope in `packages/*/src`
  (imports evaluate before `installPolyfills()`).
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
  context, and a real trade-off. Draft an ADR only when a maintainer asks for
  one or agrees to record a decision (1–2 pages, no implementation/API details
  or single-module rules). Only a maintainer accepts or rejects an ADR; when
  they do, set its status and date. Never rewrite a pushed accepted or rejected
  ADR beyond typos and links (unpushed local ADRs can be edited in place). Point
  to an accepted ADR from the code it governs with a comment naming its path, supersede it only through
  an ADR a maintainer accepted, and run `pnpm test:node scripts/adr.test.mts`.
- Keep guide pages concise ("what the developer does"), leaving error catalogs
  and internal mechanics in JSDoc.
- TypeScript examples are standalone and deterministic, with explicit imports
  and assertions. Use `ts` fences, or `tsx` for JSX; other spellings fail. On a
  documentation page (never in JSDoc), setup the page already shows or names,
  and assertions that would distract, may sit between `// ---cut-start---` and
  `// ---cut-end---` lines, which the website hides.
- Prove contracts: `assertType` (types), `assertEqual` (Data), `assertSame`
  (SameValue/identity), `assertTrue`/`assertFalse` (predicates), `assert`
  (invariants/narrowing), `assertOk`/`assertErr` (Results).
- When changing API reference organization, read only the relevant section of
  [Conventions](<apps/web/src/app/(docs)/docs/conventions/page.mdx#api-reference-organization>).
- Feature additions and bug fixes need a test that fails without the change.
  Cover the changed behavior, including relevant branches and failure paths.
  Report pre-existing coverage gaps without adding unrelated tests solely to
  reach 100% coverage of an entire source file, except where a suite enforces
  100%.
- Do not write exact-string tests on translated locale messages. A locale
  wording fix needs no new test, because structural intl tests cover it — say in
  the report why it has none, and add a structural test only for a new kind of
  bug.
- Each `@ts-expect-error` comment copies the Evolu `CompileTimeError` message
  verbatim when there is one and otherwise describes the rejected TypeScript
  contract, never a generic one such as "should fail."
- Create fresh dependencies per test. Library-exported helpers use `testX`;
  local and test-only helpers use `setupX`. `testCreateDeps` and `testCreateRun`
  are in `packages/common/src/Task.ts`.
- Cost tests compare thread CPU time with a same-run linear baseline; wait tests
  keep wall-clock time (`test/README.md`).

## Changesets and versioning

- Published API/runtime changes require a changeset (`patch` fix, `minor`
  addition, `major` breaking, also in pre-release mode): run
  `pnpm changeset --minor <packages> -m "<title>"` (or `--patch`/`--major`;
  comma-separate packages; rejects misspelled/private packages), then write the
  body in the printed file.
- Changesets describe final changes relative to the last tagged release. The
  Version Packages pull request consumes them (`changeset version`); merging it
  triggers the Release `publish` job, which stages and tags each released
  package (`@evolu/<pkg>@<version>`), while npm serves a version only after
  maintainer approval (if release checks fail after merge, changesets are
  already gone and no tag exists yet). Check
  `git fetch --tags && git tag --contains <sha> '<package>@*'` for whether a
  package's commit is tagged, and `npm view <package>@<version>` for
  installability.
- Start with a short, standalone, past-tense title without a trailing period;
  write for everyday developers in proportion to likelihood, starting with
  _why_, then observable behavior or migration impact, combining one cohesive
  multi-package change into one changeset and keeping unrelated changes
  separate. Never hand-edit generated `CHANGELOG.md` or add changesets for
  review fixes, debugging, or uncommitted iterations; update an existing one
  only if final user-facing behavior or version impact changes.
- TypeScript usage changes need tested examples per docs rules (for breaking
  changes, prove old usage fails and show its replacement together).
  Docs/tooling-only notes need no example.
- Renaming or removing an exported runtime symbol or type of a stable API is
  never a patch, however simple the migration: add the new name in a minor, keep
  the old one as a `@deprecated` alias that names its replacement, and remove
  deprecated aliases together in an occasional major.
- Local-first APIs (including platform/framework integrations) and
  `@experimental` APIs are unstable: breaking changes (including renames and
  removals) are `patch`, additions are `minor`; document migration impact.
- `@evolu/sqlite-wasm` is versioned `<SQLite version>-build<n>` via
  `scripts/version-sqlite-wasm.mts`, so its bump type only selects the heading
  (`packages/sqlite-wasm/AGENTS.md`). `@evolu/sqlite-core` is private/skipped
  (see `packages/sqlite-core/AGENTS.md`): add changesets for the published
  packages that ship a change, and never name `@evolu/sqlite-core` in a
  changeset (unconsumed files block release).
