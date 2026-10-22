# Evolu for React Web

This package provides Evolu for [React](https://react.dev) on the web platform (browsers). It re-exports everything from `@evolu/web` and adds React-specific functionality.

## Documentation

For detailed information and usage examples, please visit [evolu.dev](https://www.evolu.dev).

### Source, examples, and tests

The npm package includes source and tests matching the installed version in
`node_modules/@evolu/react-web/`. The links below open GitHub's `main`
branch; use the installed files when checking version-specific behavior.

- [`src/`](https://github.com/evoluhq/evolu/tree/main/packages/react-web/src/) contains the implementation and JSDoc API documentation.
  Follow the re-exports in [`src/index.ts`](https://github.com/evoluhq/evolu/blob/main/packages/react-web/src/index.ts) to the relevant module.
- [`src/local-first/Evolu.test.ts`](https://github.com/evoluhq/evolu/blob/main/packages/react-web/src/local-first/Evolu.test.ts) checks the
  type contract of `createEvoluDeps` against the web implementation.

For application imports, use the `exports` in the installed package's
`package.json`. Relative imports in tests may access internal helpers.

## Community

The Evolu community is on [GitHub Discussions](https://github.com/evoluhq/evolu/discussions), where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![X](https://img.shields.io/twitter/url/https/x.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://x.com/evoluhq)
