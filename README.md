# Evolu

Evolu is a TypeScript library and local-first platform.

## Documentation

For detailed information and usage examples, please visit [evolu.dev](https://www.evolu.dev).

## Community

The Evolu community is on [GitHub Discussions](https://github.com/evoluhq/evolu/discussions), where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![X](https://img.shields.io/twitter/url/https/x.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://x.com/evoluhq)

## Developing

Evolu monorepo uses [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io).

Install dependencies:

```
pnpm install
```

Install Playwright browsers for local test and verify runs:

```
pnpm playwright:install
```

Run the browser install step again after Playwright updates or if the browser cache was removed.

Build scripts

- `pnpm build` - Build packages (required once after clone/pull for IDE types)
- `pnpm build:docs` - Build doc (required once after clone/pull)
- `pnpm build:web` - Build docs and web
- `pnpm build:web:fast` - Delete `api-reference` and build web only

Web build notes

- On macOS Tahoe, you may need to raise Launch Services limits too (shell `ulimit -n` is not enough):
  - `sudo launchctl limit maxfiles 262144 262144`

Start dev

- `pnpm dev` - Start relay and web servers
- `pnpm relay` - Start relay server only (for mobile development)
- `pnpm ios` - Run iOS example (start `relay` first)
- `pnpm android` - Run Android example (start `relay` first)

Examples

> **Note**: To work on examples with local packages, run `examples:toggle-deps` first.

- `pnpm examples:react-nextjs:dev` - Dev server for React Next.js example
- `pnpm examples:react-vite-pwa:dev` - Dev server for React Vite PWA example
- `pnpm examples:svelte-vite-pwa:dev` - Dev server for Svelte Vite PWA example
- `pnpm examples:vue-vite-pwa:dev` - Dev server for Vue Vite PWA example
- `pnpm examples:build` - Build all examples

Linting

- `pnpm lint` - Lint code
- `pnpm lint-monorepo` - Lint monorepo structure

Testing

- `pnpm playwright:install` - Install browsers required by Playwright-based Vitest projects
- `pnpm test` - Run tests
- [Vitest VS Code extension](https://github.com/vitest-dev/vscode)

Release

- `pnpm changeset` - Describe changes for release log

Verify

- `pnpm verify` - Run all checks (build, lint, test) before commit
