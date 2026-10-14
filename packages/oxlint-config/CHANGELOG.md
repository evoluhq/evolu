# @evolu/oxlint-config

## 0.3.1

### Patch Changes

- 5cc173c: Updated eslint-plugin-jsdoc to 65.3.1

  Its `no-undefined-types` rule now knows the ECMAScript library types, such as `ReadonlyArray`, `PromiseLike`, and `Disposable`, so the shared config no longer lists them in `definedTypes`. Linting results stay the same.

## 0.3.0

### Minor Changes

- ca3ce67: Enabled linting of generated empty object types

  The shared config now reports type operations that resolve to `{}`, such as `Omit<Row | null, "id">`, `Pick<Row, never>`, or `Record<never, never>`. `{}` accepts any non-nullish value, including numbers and strings, so such a type silently stops checking. The rule is oxlint's `typescript/no-generated-empty-object-type`, which the suspicious category includes since oxlint 1.86. Write `{}` where an empty object type is intended.

### Patch Changes

- c791716: Required oxlint 1.87 and oxlint-tsgolint 7.0.2004

  oxlint 1.86 and later require oxlint-tsgolint 7.0.2003 or later, so the previous peers, oxlint `^1.79.0` with oxlint-tsgolint pinned to 7.0.2001, conflicted with current oxlint. `@evolu/oxlint-config` and `@evolu/nodejs` now require oxlint `^1.87.0` and oxlint-tsgolint 7.0.2004.

  `@evolu/oxlint-config` also updates eslint-plugin-jsdoc to 65.

## 0.2.0

### Minor Changes

- 4769956: Enabled globalThis qualification linting

  The shared config now rejects `globalThis` qualification unless the global name
  conflicts with a local or exported API. Evolu APIs intentionally reuse concise
  native names such as `String` and `fetch` instead of inventing prefixed wrapper
  names. Use `globalThis.String` or `globalThis.fetch` where such an Evolu API
  shadows the native global; elsewhere, use the unqualified name.

  Checks for possibly absent globals and intentional global mutations remain
  allowed.

### Patch Changes

- 037c390: Required Node.js 24.20 or newer

  Evolu packages now require Node.js 24.20 or newer, matching the repository's tested LTS baseline.

- 638dd22: Allowed Node.js test registration promises to be ignored

  Calls such as `describe` and `it` from `node:test` no longer require a `void` prefix. Other floating promises in test files remain errors.

## 0.1.0

### Minor Changes

- 4548320: Added a reusable strict Oxlint configuration

  Evolu projects can extend the configuration to share lint rules, JSDoc link
  validation, tree-shaking checks, and runtime dependency-cycle detection.
