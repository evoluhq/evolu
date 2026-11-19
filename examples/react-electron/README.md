# React Electron

Evolu runs in Electron's renderer process like in any Chromium browser, with
`@evolu/react-web`, as shown in this example. Its React component is the same
full app as the Next.js example, which starts without a prompt, until
[evoluhq/evolu#782](https://github.com/evoluhq/evolu/issues/782) stores the
device database's key with Electron's `safeStorage`. See the
[examples' checklist](../README.md).

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

## Packaging

The `_build` script type-checks, builds with Vite, and packages the app with
[electron-builder](https://www.electron.build), configured in
[`electron-builder.json5`](electron-builder.json5).
