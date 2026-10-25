# Evolu for Node.js

This package provides Evolu for [Node.js](https://nodejs.org) 24.20+.

Its SQLite is Evolu's own, compiled into a Node-API addon that the package ships
for macOS 13.5+ and for Linux with glibc 2.28+ or musl, each on arm64 and x64.
Windows isn't supported yet. A bundler must keep `@evolu/nodejs` external, so
the addon loads from the package.

## Documentation

For detailed information and usage examples, please visit [evolu.dev](https://www.evolu.dev).

### Source, examples, and tests

The npm package includes source and tests matching the installed version in
`node_modules/@evolu/nodejs/`. The links below open GitHub's `main`
branch; use the installed files when checking version-specific behavior.

- [`src/`](https://github.com/evoluhq/evolu/tree/main/packages/nodejs/src/) contains the implementation and JSDoc API documentation,
  including usage examples such as those in [`Fs.ts`](https://github.com/evoluhq/evolu/blob/main/packages/nodejs/src/Fs.ts).
- `*.test.ts` files alongside the source show tested behavior and edge cases.
  See [`Fs.test.ts`](https://github.com/evoluhq/evolu/blob/main/packages/nodejs/src/Fs.test.ts), for example.

For application imports, use the `exports` in the installed package's
`package.json`. Relative imports in tests may access internal helpers.

## Test overview reporter

`@evolu/nodejs/TestOverviewReporter` lists Node.js test files slowest-first while
preserving native failure diagnostics, run totals, and coverage output:

```sh
node --test --test-reporter=@evolu/nodejs/TestOverviewReporter
```

## Community

The Evolu community is on [GitHub Discussions](https://github.com/evoluhq/evolu/discussions), where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![X](https://img.shields.io/twitter/url/https/x.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://x.com/evoluhq)
