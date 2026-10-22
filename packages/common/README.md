# Evolu Common

This package provides platform-independent core functionality for Evolu that works across all platforms.

## Documentation

For detailed information and usage examples, please visit [evolu.dev](https://www.evolu.dev).

### Source, examples, and tests

The npm package includes source and tests matching the installed version in
`node_modules/@evolu/common/`. The links below open GitHub's `main`
branch; use the installed files when checking version-specific behavior.

- [`src/`](https://github.com/evoluhq/evolu/tree/main/packages/common/src/) contains the implementation and JSDoc API documentation,
  including usage examples such as those in [`Result.ts`](https://github.com/evoluhq/evolu/blob/main/packages/common/src/Result.ts).
- `*.test.ts` files alongside the source show tested behavior, edge cases, and
  type contracts. See [`Result.test.ts`](https://github.com/evoluhq/evolu/blob/main/packages/common/src/Result.test.ts), for example.

For application imports, use the `exports` in the installed package's
`package.json`. Relative imports in tests may access internal helpers.

## Community

The Evolu community is on [GitHub Discussions](https://github.com/evoluhq/evolu/discussions), where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![X](https://img.shields.io/twitter/url/https/x.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://x.com/evoluhq)
