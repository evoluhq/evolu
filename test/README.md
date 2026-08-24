# Tests

This directory contains unit and integration tests for Evolu packages.
Application, script, and benchmark tests remain with their own projects.

## Structure

```text
test/
  unit/
    <test-runner>/
      <package>/
  integration/
    <test-runner>/
      <common-module>/
        <platform>/
```

Integration tests follow the `packages/common/src` module hierarchy because
they exercise platform-independent behavior from `@evolu/common` through real
implementations supplied by platform packages. Tests specific to one platform
are nested under that module, such as `test/integration/vitest/Task/nodejs`.
Cross-cutting bundle-size and tree-shaking tests live under
`test/integration/vitest/Bundle`. Standalone integration features use their
module name, such as `test/integration/vitest/TestBundle`.

## Unit tests

Package directories contain unit tests for that package. Unit tests exercise a
unit in isolation and replace external systems and platform implementations
with test doubles.

All package unit tests live here instead of beside production source. This
allows test tooling to depend on production packages without reversing the
production dependency graph. In particular, `@evolu/vitest` can depend on
`@evolu/common`, while `test/unit/vitest/common` can use both without creating
a cycle.

During development, coverage can be limited to one changed source file while
running its focused test file:

```sh
pnpm test test/unit/vitest/common/Array.test.ts --coverage --coverage.include=packages/common/src/Array.ts --coverage.thresholds.100
```

Runnable TypeScript examples from JSDoc comments and Markdown files are tested
by `pnpm test:jsdoc`. `pnpm verify` runs this command serially before the Vitest
coverage suite so the runner's CPU-limited child processes do not compete with
Vitest workers. The reusable `@evolu/nodejs/TestJSDoc` entry point extracts the
documented TypeScript, compiles it, and executes each example as an isolated
Node.js ESM module with explicitly imported assertions. Its behavior is covered
by the Vitest Node.js unit project.

## Integration tests

Integration tests exercise real platform implementations, external systems, or
multiple Evolu packages together. Examples include SQLite drivers, filesystems,
Web Locks, OPFS, workers, WebSocket servers, JavaScript engines, and build
tooling.

Node-based tests run with `pnpm test`. Browser tests run separately in Chromium,
Firefox, and WebKit with `pnpm test:browsers`, and tests that invoke production
bundlers run with `pnpm test:bundle`. `pnpm test:coverage` combines Node,
Chromium, and bundle coverage. `pnpm verify` then runs the browser projects in
one Firefox and WebKit compatibility process, so each runtime is tested exactly
once.

Node.js and browser integrations use Vitest.

React Native JavaScript compatibility was previously tested on Hermes by
running selected shared unit tests through the experimental `vitest-mobile`
runner. In practice, those runs were too slow to be usable, and its limited
Vitest support would require weakening or duplicating the shared test suite.
Until Vitest officially supports React Native, test React Native compatibility
manually through the Evolu example applications.
