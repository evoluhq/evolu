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

Local-first apps allow users to own their data by storing them on their devices. Modern browsers provide API designed precisely for that. How is it different from keeping files on disk? Files are not the right abstraction for apps and cannot synchronize among devices. That's why traditional apps use the client-server architecture. But using client-server architecture also means that users' ability to use an app depends on some server that can be offline, temporarily or forever, if a company decides to ban a user or even goes bankrupt. That's unfortunate. Luckily, a way to restore data ownership exists. It's Evolu.

## Running the server

Currently the easiest solution to run an evolu server would be to use the docker image:

1. Pull the docker image

`docker pull evoluhq/evolu:main`

2. Create an empty sqlite file for mounting the database

`touch db.sqlite`

3. startup the evolu server on `port` `4000` and `mount` database file on `./db.sqlite` that we created previously

`docker run --name evolu -p 4000:4000 -v $(pwd)/db.sqlite:/home/node/app/apps/server/db.sqlite -d evoluhq/evolu:main`

## Documentation

For detailed information and usage examples, please visit [evolu.dev](https://www.evolu.dev).

## API Reference

[evoluhq.github.io/evolu](https://evoluhq.github.io/evolu)

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

Start iOS developing (pnpm dev must be running too):

```
pnpm ios
```

Lint and tests:

```
pnpm lint test
```

Describe changes for release log:

```
pnpm changeset
```
