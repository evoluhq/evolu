# Svelte Vite PWA

Evolu in a Svelte PWA built with Vite, with `@evolu/svelte` and `@evolu/web`.
The app is the instant start variant of the full playground: it starts without
a prompt, and the key of the device database, which keeps the accounts, is
public. An app with sensitive data unlocks it with a passkey instead, as
[react-vite-pwa](../react-vite-pwa) shows; that logic runs before
`createEvoluApp` and is the same in Svelte. See the
[examples' checklist](../README.md).

## Quick start

```bash
# From the repository root...
pnpm install
pnpm --filter "@example/svelte-vite-pwa^..." build

# Start a local relay on ws://localhost:4000, which the example syncs with in
# development
pnpm relay

# In another terminal, start Vite
pnpm --filter @example/svelte-vite-pwa dev
```

A production build syncs with Evolu's free relay, which is for testing.
