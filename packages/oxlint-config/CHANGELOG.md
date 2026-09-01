# @evolu/oxlint-config

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
