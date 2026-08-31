# Evolu

Evolu is a TypeScript library and local-first platform.

## Documentation

For detailed information and usage examples, please visit [evolu.dev](https://www.evolu.dev).

## Community

The Evolu community is on [GitHub Discussions](https://github.com/evoluhq/evolu/discussions), where you can ask questions and voice ideas.

To chat with other community members, you can join the [Evolu Discord](https://discord.gg/2J8yyyyxtZ).

[![X](https://img.shields.io/twitter/url/https/x.com/evoluhq.svg?style=social&label=Follow%20%40evoluhq)](https://x.com/evoluhq)

## Developing

Evolu monorepo uses the latest [Node.js](https://nodejs.org) LTS release and
[pnpm](https://pnpm.io). With nvm, install the Node.js version selected by
`.nvmrc`:

```sh
nvm install
```

Install Corepack independently of Node.js and enable the pnpm version pinned in
`package.json`:

```sh
npm install --global corepack@latest
corepack enable pnpm
```

Install dependencies:

```sh
pnpm install
```

Install Playwright browsers for local test and verify runs:

```sh
pnpm playwright:install
```

Run the browser install step again after Playwright updates or if the browser cache was removed.

Build scripts

- `pnpm build` - Build packages (required once after clone/pull for IDE types)
- `pnpm build:docs` - Build doc (required once after clone/pull)
- `pnpm build:web` - Build docs and web

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

- `pnpm lint` - Run all linters
- `pnpm lint:oxlint` - Lint code with Oxlint
- `pnpm lint:sherif` - Lint monorepo structure with Sherif

Formatting

- `pnpm format` - Write Prettier formatting changes
- `pnpm format:check` - Check Prettier formatting without writing changes

Testing

- `pnpm playwright:install` - Install browsers required by Playwright-based Vitest projects
- `pnpm test` - Run all unit, integration, bundle, and documentation-example tests
- `pnpm test:node "<test-file-or-glob>"` - Run selected native Node tests with coverage
- `pnpm test:unit` - Run all unit tests with coverage
- `pnpm test:unit-overview` - Run all unit tests with test-file durations and the per-source-file coverage table
- `pnpm test:integration` - Run Node.js and browser integration tests
- `pnpm test:integration:nodejs` - Run Node.js integration tests without source coverage
- `pnpm test:integration:browsers` - Run browser integrations in Chromium with coverage and in Firefox and WebKit for compatibility
- `pnpm test:bundle` - Run production bundle and tree-shaking tests
- `pnpm test:jsdoc` - Compile and run documentation examples

See the [testing convention](https://www.evolu.dev/docs/testing) for test
placement, runner, and assertion guidance.

Release

- `pnpm changeset` - Describe changes for release log

Verify

- `pnpm verify` - Run all checks (build, lint, test) before commit
