# Evolu for React

This package provides universal [React](https://react.dev) functionality for Evolu that works across all React environments (excluding React Native and React Web, which have their own packages).

## Documentation

For detailed information and usage examples, please visit [evolu.dev](https://www.evolu.dev).

### Source, examples, and tests

The npm package includes source and tests matching the installed version in
`node_modules/@evolu/react/`. The links below open GitHub's `main`
branch; use the installed files when checking version-specific behavior.

- [`src/`](https://github.com/evoluhq/evolu/tree/main/packages/react/src/) contains the implementation and JSDoc API documentation,
  including usage examples such as those in [`Task.ts`](https://github.com/evoluhq/evolu/blob/main/packages/react/src/Task.ts).
- `*.test.ts` files alongside the source show tested behavior and type
  contracts. See [`Task.test.ts`](https://github.com/evoluhq/evolu/blob/main/packages/react/src/Task.test.ts), for example.

For application imports, use the `exports` in the installed package's
`package.json`. Relative imports in tests may access internal helpers.

## Community

The Evolu community is on [GitHub Discussions](https://github.com/evoluhq/evolu/discussions), where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![X](https://img.shields.io/twitter/url/https/x.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://x.com/evoluhq)
