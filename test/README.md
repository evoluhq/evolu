# Tests

This directory contains integration tests, bundle tests, documentation-example
testing, and their shared infrastructure. Unit tests are otherwise collocated
with the source they exercise.

## Structure

```text
test/
  bundle/
    Bundle/
    TestBundle/
  e2e/
  integration/
    browsers/
      react/
      sqlite-wasm/
      web/
    nodejs/
    shared/
  jsdoc/
```

Integration tests for `@evolu/common` follow the `packages/common/src` module
hierarchy because they exercise platform-independent behavior through real
implementations supplied by platform packages. Tests in `shared` run in Node.js
and browsers, while runtime-specific tests live in `nodejs` or `browsers`.
Other integrations are grouped by package or entry point. Production bundle,
tree-shaking, execution, and size tests live under `test/bundle`, and the Evolu
documentation-example runner lives under `test/jsdoc`.

## Unit tests

Unit tests exercise a unit in isolation and replace external systems and
platform implementations with test doubles. They are collocated with package
source and run in Node.js with `node:test`.

Run all unit tests with coverage using:

```sh
pnpm test:unit
```

Unit tests always collect coverage. Run selected test files by passing a quoted
path or glob to `test:node`:

```sh
pnpm test:node "packages/common/src/Array.test.ts"
```

Use an exact path when running one test file. Node expands quoted globs
consistently across shells when intentionally selecting multiple files.

The unit report lists test files slowest-first, followed by run totals,
duration, per-source-file coverage percentages, and uncovered lines.
Node.js 24 reports only source files loaded by the unit suite; integration and
browser coverage is reported separately.

Runnable TypeScript examples from JSDoc comments and Markdown files are tested
by `pnpm test:jsdoc`, which is included in both `pnpm test` and `pnpm verify`.
The runner in `test/jsdoc` uses the reusable `@evolu/nodejs/TestJSDoc` entry
point to extract the documented TypeScript, lint it with
`@evolu/oxlint-config`, compile it, and execute each example as an isolated
Node.js ESM module in one process with explicitly imported assertions.
Compilation uses
`@evolu/typescript-config/base.json` with an explicit module environment so
examples use Evolu's strict compiler settings without a project layout. Unused
declarations are checked by Oxlint instead of TypeScript so an `_` prefix can
explicitly mark them as intentional. Its end-to-end behavior is covered by
Node.js integration tests.

## Randomized test order

Native Node.js and Vitest suites randomize queued test order on every run.
Node.js also randomizes discovered test files. Vitest keeps file order stable
and shuffles tests within files across its Node.js and browser projects.

Randomized order acts as a test-order fuzzer. It exposes hidden coupling where
a test only passes because another test happened to initialize or clean up
shared state, advance a random generator, populate a cache, or reset a mock.
Tests should create fresh dependencies and resources so their result does not
depend on which test ran first.

Every randomized run prints its seed. Replay a native Node.js test order with:

```sh
pnpm test:node --test-random-seed=123 "packages/common/src/Array.test.ts"
```

Replay a Vitest order by passing the seed with the intended project and mode:

```sh
pnpm exec vitest run --sequence.seed=123 --project=node-integration
```

Replaying a fixed seed turns an occasional order-dependent failure into a
deterministic local reproduction.

## Integration tests

Integration tests exercise real platform implementations, external systems, or
multiple Evolu packages together. Examples include SQLite drivers, filesystems,
Web Locks, OPFS, workers, WebSocket servers, JavaScript engines, and build
tooling.

Run all integration tests with `pnpm test:integration`. Node.js integrations
run without source coverage with `pnpm test:integration:nodejs`; their contract
is the behavior across real components and platform implementations rather than
which source lines they execute.
The Node.js integration command builds documentation first so the web search
integration tests use the generated API reference and current documentation.
`pnpm test:integration:browsers` runs only the explicitly configured browser
integration projects: first in Chromium with coverage, then in Firefox and
WebKit without coverage because those engines do not support V8 coverage. Its
test files are selected by `integration/browsers/vitest.config.ts`,
`integration/browsers/web/vitest.config.ts`,
`integration/browsers/sqlite-wasm/vitest.config.ts` and
`integration/browsers/sqlite-wasm/quota/vitest.config.ts`; it does not discover
collocated unit tests. Vitest projects use explicit include lists so they
cannot discover native `node:test` integrations; register new Vitest suites in
the appropriate project config.

The `browser-sqlite-wasm` project loads
`packages/sqlite-wasm/wasm/sqlite3.wasm`, which CI builds in its SQLite Wasm
job for the jobs that test it. Get it locally with `pnpm sqlite-wasm:download`,
or build it as `packages/sqlite-wasm/README.md` describes. Its tests run SQLite
in module workers, because sync access handles exist only in dedicated workers,
except in WebKit, and each uses an OPFS directory of its own and removes it,
because the persistent browser profile, and on macOS Playwright WebKit's OPFS,
outlive a run. Its interoperability tests run SQLite's own JavaScript from
`@evolu/sqlite-wasm` 2.2.4, a test-only dependency installed under the alias
`@evolu/sqlite-wasm-2.2.4` because the workspace package has the same name.
The `browser-sqlite-wasm-quota` project runs the storage-quota tests in a
browser of its own: Chromium's quota is overridden through CDP, Firefox's is
fixed by a preference its profile's `user.js` sets, and WebKit, which cannot be
quota-limited, gets a quota the worker injects. These two projects and
`browser-web` fail at startup when the wasm is missing or is not the pinned one,
and so do the Node.js tests that load it.

`@evolu/sqlite-wasm` must keep full coverage. `pnpm test:sqlite-wasm` runs its
unit tests, its Node.js integration tests and
`integration/nodejs/Sqlite/WasmSqliteDriver.test.ts`, which loads the package
through its entry point, and fails when they cover less than 100% of the lines,
branches or functions of the package's `src` and `scripts`. It needs
`packages/sqlite-wasm/wasm/sqlite3.wasm` like the integration tests, so CI runs
it in its coverage job. Node.js reports only the modules the tests load, and
counts a branch that spans no whole line, such as one arm of a conditional
expression, as covered.

Integration tests use `node:test` unless they need Vitest or its browser
runner. Native tests under `integration/nodejs` are discovered structurally.
Tests shared with browsers use the Node Vitest project as well as the browser
projects; register new Vitest suites in the appropriate project config.

## Browser E2E tests

Playwright tests in `test/e2e` drive the actual Next.js minimal, full, and sync
playgrounds in Chromium, Firefox, and WebKit, including React, workers, and
persistent WASM SQLite. They cover CRUD, the mutation completion callback,
reload persistence, live updates between tabs without Suspense hiding the loaded
UI, and sync through a real relay between isolated browser contexts. The tab
test records DOM removals and hiding throughout updates, including brief
hide/show transitions between assertions.
The full example also covers projects, moving todos, restoring deleted todos and
projects, mnemonic visibility, and the disabled unfinished actions. Its navigation
test opens Trash for the first time after deleting a todo and checks that
`startTransition` keeps the loaded UI visible while Trash's queries load. Both
examples use the same DOM visibility observer to detect even brief Suspense hides.
The sync playground tests restart the relay, add a backup relay, and check the
connection and synchronization state while one relay is down and after it
catches up.
`StaticSite.spec.mts` requests the served export without a browser and checks
what the Cloudflare configuration adds: the docs and root 404 pages, the
redirects, and the content types of the docs Markdown, `llms.txt`, and the RSS
feed. Only the Chromium project runs it, and the dev configuration skips it.
Each test gets fresh browser storage and a separate relay process with a
temporary database directory, removed after the test. Tabs within a context
share storage and workers; contexts within a test share only the relays.
Every test fails on uncaught browser errors and unexpected dialogs, including
the examples' Evolu error alert; tests declare the dialogs they expect.

```sh
pnpm test:e2e
```

The command builds the web dependencies, relay, documentation, and static export,
then serves `apps/web/out` on `127.0.0.1:3100` with the pinned Wrangler local
server from `apps/web/deploy`, which applies the Cloudflare configuration in
`apps/web/deploy/wrangler.jsonc`, and stops it. Build output streams to the
console. Stop the web dev server first: the production build regenerates the API
reference that the dev docs watcher owns, and the dev configuration starts its own
`next dev` on the same `.next/dev` output. The build receives
`NEXT_PUBLIC_EVOLU_RELAY_URL=ws://127.0.0.1:4311`, so the resulting export
connects to the test relay instead of the public relay. Production tests run
the built relay CLI; dev tests run its TypeScript source. Both configurations
check `packages/sqlite-wasm/wasm/sqlite3.wasm`, which the playgrounds load,
before they build or start anything.

Tests run sequentially because the relay address is embedded in the browser
bundle. Each test replaces the relay at that address with fresh storage, so
the example's temporary shared `testAppOwner` cannot connect unrelated tests.
Tests that need a backup relay start a second relay on the next port. Keep
ports 3100, 4311, and 4312 free and run only one E2E invocation at a time.

For faster local iteration, select the dev configuration, which starts a
managed Next.js dev server without building the production app:

```sh
pnpm test:e2e:dev
```

Pass a file or `--grep` to focus the run, for example
`pnpm test:e2e --grep 'between tabs'`. CI runs the production mode, one job per
browser. Failures retain traces and screenshots in `test-results/e2e`, and every
test attaches the relay log to the HTML report; open it with
`pnpm exec playwright show-report`. E2E tests run separately from `pnpm test`
and `pnpm verify`.

## Bundle tests

Bundle tests invoke production bundlers and verify generated artifacts,
tree-shaking, execution, and byte sizes. Run them with `pnpm test:bundle`.
Both bundlers replace `process.env.NODE_ENV` with `"production"` to remove
development-only branches before measuring.
They use `node:test` without source coverage because their contract is the
generated bundle rather than which source lines executed while producing it.
They run in one test process because `testBundle` already isolates generated
artifacts in Workers, while Node.js process isolation forwards test-harness
arguments that nested Workers cannot use. The `SqliteWasm` test checks that
both bundlers emit the SQLite wasm binary at the URL `@evolu/sqlite-wasm`
exports, so it reads `packages/sqlite-wasm/wasm/sqlite3.wasm`, which CI builds
in its SQLite Wasm job; get it locally with `pnpm sqlite-wasm:download` or build
it as `packages/sqlite-wasm/README.md` describes.

Bundle-size expectations use Node.js snapshots in `*.test.ts.snapshot` files
beside the tests. Normal runs compare the measured sizes without updating them.
After an intentional size change or a bundler upgrade, regenerate them with:

```sh
pnpm test:bundle:update
```

This rebuilds `@evolu/common`, whose compiled output the homepage fixtures use,
then runs the bundle suite with `--test-update-snapshots`. Bundle execution and
tree-shaking assertions still run. Run updates without test filters: Node rewrites
each snapshot file from the assertions reached in that run. After a successful
update, review the snapshot diff, then run
`pnpm test:bundle` to check the new expectations before committing the snapshots.

React Native JavaScript compatibility was previously tested on Hermes by
running selected shared unit tests through the experimental `vitest-mobile`
runner. In practice, those runs were too slow to be usable, and its limited
Vitest support would require weakening or duplicating the shared test suite.
Until Vitest officially supports React Native, test React Native compatibility
manually through the Evolu example applications.
