# Evolu

[Local-first](https://www.inkandswitch.com/local-first) platform designed for privacy, ease of use, and no vendor lock-in

- [SQLite](https://sqlite.org) in all browsers, Electron, and React Native
- [CRDT](https://crdt.tech) for merging changes without conflicts
- End-to-end encrypted sync and backup
- Free Evolu sync and backup server, or you can run your own
- Typed database schema (with branded types like `NonEmptyString1000`, `PositiveInt`, etc.)
- Typed SQL via [Kysely](https://kysely.dev)
- Reactive queries with full React Suspense support
- Real-time experience via revalidation on focus and network recovery
- No signup/login, only bitcoin-like mnemonic (12 words)
- Ad-hoc migration
- Sqlite JSON support with automatic stringifying and parsing
- Support for [Kysely Relations](https://kysely.dev/docs/recipes/relations) (loading nested objects and arrays in a single SQL query)
- Local-only tables (tables with \_ prefix are not synced)
- Evolu Solid/Vue/Svelte soon

## Local-first apps

Local-first apps allow users to own their data. Evolu stores data in the user's device(s), so Evolu apps can work offline and without a specific server. How is it different from keeping files on disk? Files are not the right abstraction for apps and are complicated to synchronize among devices. That's why client-server architecture rules the world. But as with everything, it has trade-offs.

Client-server architecture provides us with easy backup and synchronization, but all that depends on the ability of a server to fulfill its promises. Internet is offline, companies go bankrupt, users are banned, and errors occur. All those things happen all the time, and then what? Right, that's why the world needs local-first apps.

## Documentation

For detailed information and usage examples, please visit [evolu.dev](https://www.evolu.dev).

## Community

The Evolu community is on [GitHub Discussions](https://github.com/evoluhq/evolu/discussions), where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![Twitter URL](https://img.shields.io/twitter/url/https/twitter.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://twitter.com/evoluhq)

## Contributing

Evolu monorepo uses [pnpm](https://pnpm.io).

Install the dependencies with:

```
pnpm install
```

Build Evolu monorepo:

```
pnpm build
```

Start developing and watch for code changes:

```
pnpm dev
```

Lint and tests:

```
pnpm lint test
```

Describe changes for release log:

```
pnpm changeset
```
