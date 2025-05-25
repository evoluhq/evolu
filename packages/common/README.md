# Evolu

Evolu is TypeScript library and local-first framework.

## Documentation

Please visit [evolu.dev](https://www.evolu.dev).

## Community

The Evolu community is on [GitHub Discussions](https://github.com/evoluhq/evolu/discussions), where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![Twitter URL](https://img.shields.io/twitter/url/https/twitter.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://twitter.com/evoluhq)

## Developing

Evolu monorepo uses [pnpm](https://pnpm.io).

Install dependencies:

```
pnpm install
```

Build monorepo:

```
pnpm build
pnpm build:web
```

Start dev:

```
# web
pnpm dev

# expo (pnpm dev must be running too)
pnpm ios
pnpm android
```

Linting:

```
pnpm lint
pnpm lint-monorepo
```

Tests

```
pnpm test
```

Describe changes for release log:

```
pnpm changeset
```
