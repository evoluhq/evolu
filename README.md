# Evolu

Evolu is a TypeScript library and local-first platform.

## Documentation

For detailed information and usage examples, please visit [evolu.dev](https://www.evolu.dev).

## Community

The Evolu community is on [GitHub Discussions](https://github.com/evoluhq/evolu/discussions), where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![X](https://img.shields.io/twitter/url/https/x.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://x.com/evoluhq)

## Developing

Evolu monorepo uses [pnpm](https://pnpm.io).

Install dependencies:

```
pnpm install
```

Build scripts

- `pnpm build` - Build packages
- `pnpm build:web` - Build docs and web

Web build notes

- Uses webpack (`next build --webpack`) because SharedWorker is required.
- Uses `NODE_OPTIONS=--max-old-space-size-percentage=75` to avoid V8 heap OOM on large docs builds.
- On macOS Tahoe, you may need to raise Launch Services limits too (shell `ulimit -n` is not enough):
  - `sudo launchctl limit maxfiles 262144 262144`

Start dev

> **Warning**: Run `pnpm build` before running dev. Packages must be built first.

- `pnpm dev` - Dev server for web
- `pnpm ios` - Run iOS example (requires `pnpm dev` running)
- `pnpm android` - Run Android example (requires `pnpm dev` running)

Examples

> **Note**: To work on examples with local packages, run `pnpm examples:toggle-deps` first.

- `pnpm examples:react-nextjs:dev` - Dev server for React Next.js example
- `pnpm examples:react-vite-pwa:dev` - Dev server for React Vite PWA example
- `pnpm examples:svelte-vite-pwa:dev` - Dev server for Svelte Vite PWA example
- `pnpm examples:vue-vite-pwa:dev` - Dev server for Vue Vite PWA example
- `pnpm examples:build` - Build all examples

Linting

- `pnpm lint` - Lint code
- `pnpm lint-monorepo` - Lint monorepo structure

Testing

- `pnpm test` - Run tests

Release

- `pnpm changeset` - Describe changes for release log

Verify

- `pnpm verify` - Run all checks (build, lint, test) before commit
