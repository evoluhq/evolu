# Evolu

Evolu is a TypeScript library and local-first platform.

## Documentation

For detailed information and usage examples, please visit [evolu.dev](https://www.evolu.dev).

## Community

The Evolu community is on [GitHub Discussions](https://github.com/evoluhq/evolu/discussions), where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![X](https://img.shields.io/twitter/url/https/x.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://x.com/evoluhq)

## Developing

Evolu monorepo uses [Bun](https://bun.sh).

Install dependencies:

```
bun install
```

Build scripts

- `bun run build` - Build packages (required once after clone/pull for IDE types)
- `bun run build:docs` - Build doc (required once after clone/pull)
- `bun run build:web` - Build docs and web
- `bun run build:web:fast` - Delete `api-reference` and build web only

Web build notes

- On macOS Tahoe, you may need to raise Launch Services limits too (shell `ulimit -n` is not enough):
  - `sudo launchctl limit maxfiles 262144 262144`

Start dev

- `bun run dev` - Start relay and web servers
- `bun run relay` - Start relay server only (for mobile development)
- `bun run ios` - Run iOS example (start `relay` first)
- `bun run android` - Run Android example (start `relay` first)

Examples

> **Note**: To work on examples with local packages, run `examples:toggle-deps` first.

- `bun run examples:react-nextjs:dev` - Dev server for React Next.js example
- `bun run examples:react-vite-pwa:dev` - Dev server for React Vite PWA example
- `bun run examples:svelte-vite-pwa:dev` - Dev server for Svelte Vite PWA example
- `bun run examples:vue-vite-pwa:dev` - Dev server for Vue Vite PWA example
- `bun run examples:build` - Build all examples

Linting

- `bun run lint` - Lint code
- `bun run lint-monorepo` - Lint monorepo structure

Testing

- `bun run test` - Run tests
- [Vitest VS Code extension](https://github.com/vitest-dev/vscode)

Release

- `bunx changeset` - Describe changes for release log

Verify

- `bun run verify` - Run all checks (build, lint, test) before commit
