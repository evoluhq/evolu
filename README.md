# Evolu

Evolu is a TypeScript library and local-first platform.

## Documentation

Please visit [evolu.dev](https://www.evolu.dev).

## Community

The Evolu community is on [GitHub Discussions](https://github.com/evoluhq/evolu/discussions), where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![Twitter URL](https://img.shields.io/twitter/url/https/twitter.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://twitter.com/evoluhq)

## Hosting Evolu Relay

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fevoluhq%2Fevolu)

We provide a free relay `free.evoluhq.com` for testing and personal usage.

The Evolu Relay source and Docker files are in the [/apps/relay](/apps/relay) directory.

Alternatively, a pre-built image `evoluhq/relay:latest` is hosted on [Docker Hub](https://hub.docker.com/r/evoluhq/relay).

For more information, reference the [Evolu Relay](https://www.evolu.dev/docs/relay) documentation.

## Developing

Evolu monorepo uses [pnpm](https://pnpm.io).

Install dependencies:

```
pnpm install
```

Build scripts:

- `pnpm build` - Build packages
- `pnpm build:web` - Build web
- `pnpm examples:build` - Build all examples

Start dev:

> **Warning**: Run `pnpm build` before running dev. Packages must be built first.

- `pnpm dev` - Dev server for web
- `pnpm ios` - Run iOS example (requires `pnpm dev` running)
- `pnpm android` - Run Android example (requires `pnpm dev` running)
- `pnpm examples:react-nextjs:dev` - Dev server for React Next.js example
- `pnpm examples:react-vite-pwa:dev` - Dev server for React Vite PWA example
- `pnpm examples:svelte-vite-pwa:dev` - Dev server for Svelte Vite PWA example
- `pnpm examples:vue-vite-pwa:dev` - Dev server for Vue Vite PWA example

Linting:

- `pnpm lint` - Lint code
- `pnpm lint-monorepo` - Lint monorepo structure

Testing:

- `pnpm test` - Run tests

Release:

- `pnpm changeset` - Describe changes for release log
