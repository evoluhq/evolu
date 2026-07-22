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
```

Integration tests use `<common-module>` instead of `<package>` because they
exercise platform-independent behavior from `@evolu/common` through real
implementations supplied by platform packages.

## Unit tests

Package directories contain unit tests for that package. Unit tests exercise a
unit in isolation and replace external systems and platform implementations
with test doubles.

All package unit tests live here instead of beside production source. This
allows test tooling to depend on production packages without reversing the
production dependency graph. In particular, `@evolu/vitest` can depend on
`@evolu/common`, while `test/unit/vitest/common` can use both without creating
a cycle.

The same unit test source can be executed by another compatible runner to check
runtime compatibility. For example, selected tests from
`test/unit/vitest/common` run through `vitest-mobile` to verify that Hermes
provides the JavaScript features used by `@evolu/common`. The test source is
neither moved nor duplicated for that execution.

## Integration tests

Integration tests exercise real platform implementations, external systems, or
multiple Evolu packages together. Examples include SQLite drivers, filesystems,
Web Locks, OPFS, workers, WebSocket servers, JavaScript engines, and build
tooling.

Node.js and browser integrations use Vitest. React Native integrations use
`vitest-mobile` because they require a different runtime and configuration.
