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
  integration/
    browsers/
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

Use `pnpm test:unit-overview` to rerun the complete unit suite with test-file
durations sorted slowest-first, per-source-file coverage percentages, and
uncovered lines. This is an audit view and is not part of `pnpm test`, which
already runs the unit suite.
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

## Integration tests

Integration tests exercise real platform implementations, external systems, or
multiple Evolu packages together. Examples include SQLite drivers, filesystems,
Web Locks, OPFS, workers, WebSocket servers, JavaScript engines, and build
tooling.

Run all integration tests with `pnpm test:integration`. Node.js integrations
run without source coverage with `pnpm test:integration:nodejs`; their contract
is the behavior across real components and platform implementations rather than
which source lines they execute.
`pnpm test:integration:browsers` runs only the explicitly configured browser
integration projects: first in Chromium with coverage, then in Firefox and
WebKit without coverage because those engines do not support V8 coverage. Its
test files are selected by `integration/browsers/vitest.config.ts` and
`integration/browsers/web/vitest.config.ts`; it does not discover collocated
unit tests. Vitest projects use explicit include lists so they cannot discover
native `node:test` integrations; register new Vitest suites in the appropriate
project config.

Integration tests use `node:test` unless they need Vitest or its browser
runner. Native tests under `integration/nodejs` are discovered structurally.
Tests shared with browsers use the Node Vitest project as well as the browser
projects; register new Vitest suites in the appropriate project config.

## Bundle tests

Bundle tests invoke production bundlers and verify generated artifacts,
tree-shaking, execution, and byte sizes. Run them with `pnpm test:bundle`.
They use `node:test` without source coverage because their contract is the
generated bundle rather than which source lines executed while producing it.
They run in one test process because `testBundle` already isolates generated
artifacts in Workers, while Node.js process isolation forwards test-harness
arguments that nested Workers cannot use.

React Native JavaScript compatibility was previously tested on Hermes by
running selected shared unit tests through the experimental `vitest-mobile`
runner. In practice, those runs were too slow to be usable, and its limited
Vitest support would require weakening or duplicating the shared test suite.
Until Vitest officially supports React Native, test React Native compatibility
manually through the Evolu example applications.
