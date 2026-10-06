# Evolu for Web

This package provides browser-specific Evolu implementations, including
OPFS-backed SQLite, Web Workers, Shared Workers, and browser platform
dependencies.

SQLite comes from `@evolu/sqlite-wasm`. Bundlers emit its WebAssembly binary
with the app. Vite does not emit it from a dependency it prebundles, so add
`@evolu/sqlite-wasm` to `optimizeDeps.exclude`.

As runtimes increasingly implement the same Web Platform APIs, Evolu's portable
abstractions for `WebSocket`, `MessagePort`, and Web Locks live in
`@evolu/common`. Their concrete implementations are supplied by the runtime.

## Documentation

For detailed information and usage examples, please visit [evolu.dev](https://www.evolu.dev).

## Community

The Evolu community is on [GitHub Discussions](https://github.com/evoluhq/evolu/discussions), where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![X](https://img.shields.io/twitter/url/https/x.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://x.com/evoluhq)
