# React Vite PWA

Evolu in a React PWA built with Vite, with `@evolu/react-web`. The app is the
passkey variant of the full playground: a passkey protects the device database's
key, so the first use creates or restores an account and creates the passkey,
and later starts unlock with it. Where the browser keeps nothing, as in private
browsing, the app starts in memory without a passkey. See the
[examples' checklist](../README.md).

## Quick start

```bash
# From the repository root...
pnpm install
pnpm --filter "@example/react-vite-pwa^..." build

# Start a local relay on ws://localhost:4000, which the example syncs with in
# development
pnpm relay

# In another terminal, start Vite
pnpm --filter @example/react-vite-pwa dev
```

A production build syncs with Evolu's free relay, which is for testing.

## Passkeys need a secure context

WebAuthn works only in a secure context: `https://`, or `http://localhost`.
Open the development server on `localhost`, not on a LAN address, and serve a
build over HTTPS to try it on another device.

## PWA updates

[`PWABadge`](src/PWABadge.tsx) asks before it updates the app, because reloading
asks for the passkey again.
