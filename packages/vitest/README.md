# Evolu Vitest

Vitest assertions for Evolu.

Evolu uses `node:test` with the platform-agnostic assertions from
`@evolu/common` for Node-only unit and integration tests. This package remains
available for projects that use Vitest and want Result assertions with Vitest
semantics.

## Documentation

See Evolu's [testing convention](https://www.evolu.dev/docs/testing) for runner
and assertion guidance.

### Source, examples, and tests

The npm package includes source and tests matching the installed version in
`node_modules/@evolu/vitest/`. The links below open GitHub's `main`
branch; use the installed files when checking version-specific behavior.

- [`src/`](https://github.com/evoluhq/evolu/tree/main/packages/vitest/src/) contains the implementation and JSDoc API documentation,
  including the assertions in [`index.ts`](https://github.com/evoluhq/evolu/blob/main/packages/vitest/src/index.ts).
- `*.test.ts` files alongside the source provide usage examples and show
  tested behavior and type contracts. See [`index.test.ts`](https://github.com/evoluhq/evolu/blob/main/packages/vitest/src/index.test.ts).

For application imports, use the `exports` in the installed package's
`package.json`. Relative imports in tests may access internal helpers.
