# React Electron

Evolu runs in Electron's renderer process like in any Chromium browser, with
`@evolu/react-web`, as shown in this example. Its React component is the same
minimal todo app as the web examples.

## Quick start

```bash
# From the repository root...
pnpm install
pnpm --filter "@example/react-electron^..." build

# Start a local relay on ws://localhost:4000, which the example syncs with in
# development
pnpm relay

# In another terminal, start Vite and Electron
pnpm --filter @example/react-electron dev
```

Run pnpm from the repository root. This directory has its own
`pnpm-workspace.yaml` for using the example outside the monorepo, so pnpm run
inside it treats it as a separate workspace, where the monorepo's catalogs and
`workspace:*` packages do not resolve.

## Using the example outside the monorepo

Run `pnpm examples:toggle-deps` to switch the examples to published packages,
then copy this directory elsewhere and run `pnpm install`. Its
`pnpm-workspace.yaml` sets `nodeLinker: hoisted`, which Electron needs, and
allows the build scripts of `electron` and `esbuild`.

## Packaging

The `_build` script type-checks, builds with Vite, and packages the app with
[electron-builder](https://www.electron.build), configured in
[`electron-builder.json5`](electron-builder.json5).
