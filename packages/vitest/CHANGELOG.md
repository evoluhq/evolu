# @evolu/vitest

## 2.0.1

### Patch Changes

- 037c390: Required Node.js 24.20 or newer

  Evolu packages now require Node.js 24.20 or newer, matching the repository's tested LTS baseline.

## 2.0.0

### Major Changes

- 54c289e: Removed Vitest from documentation example testing

  `testJSDocExamples` no longer depends on Vitest, now lints examples with
  `@evolu/oxlint-config`, and is much faster. As a result, it moved from
  `@evolu/vitest` to `@evolu/nodejs`; import it from `@evolu/nodejs/TestJSDoc`.

  Documentation examples no longer receive Vitest or Result assertion globals.
  They explicitly import platform-independent assertions from `@evolu/common`,
  making each example standalone and portable. Compilation uses
  `@evolu/typescript-config`.

  Projects calling this helper must install its optional tooling peers as
  development dependencies:

  ```sh
  pnpm add -D @evolu/oxlint-config @evolu/typescript-config oxlint oxlint-tsgolint typescript
  ```

  Prefix intentionally unused example declarations with `_`; used
  underscore-prefixed declarations fail linting.

  Write documentation examples as standalone TypeScript modules with explicitly
  imported assertions:

  ```ts
  import { assertEqual } from "@evolu/common";

  const _intentionallyUnused = "example";

  assertEqual(1 + 1, 2);
  ```

## 1.0.1

### Patch Changes

- 13ee2e8: Updated internal peer dependency ranges to require stable releases.

## 1.0.0

### Minor Changes

- da63781: Added `expectOk` and `expectErr` assertions that validate and narrow Evolu Results in Vitest tests.
- 3207e52: Added compilation and execution of TypeScript examples from JSDoc and Markdown, including package subpath aliases.

### Patch Changes

- 5629b3a: Handled colorized TypeScript diagnostics when selecting runnable JSDoc examples.
- ba92357: Installed Evolu's required polyfills before running documentation examples.
