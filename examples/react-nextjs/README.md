# React Next.js

Evolu in a Next.js app, with `@evolu/react-web`. The app is the instant start
variant of the full playground: it starts without a prompt, and the key of the
device database, which keeps the accounts, is public. An app with sensitive data
unlocks it with a passkey instead, as [react-vite-pwa](../react-vite-pwa)
shows. See the [examples' checklist](../README.md).

> **Warning:** For SPA (Single Page Application) mode, the Pages Router is
> [required](https://github.com/vercel/next.js/discussions/64660#discussioncomment-14981214).
> The App Router does not support static SPA export.

## Quick start

```bash
# From the repository root...
pnpm install
pnpm --filter "@example/react-nextjs^..." build

# Start a local relay on ws://localhost:4000, which the example syncs with in
# development
pnpm relay

# In another terminal, start Next.js
pnpm --filter @example/react-nextjs dev
```

A production build syncs with Evolu's free relay, which is for testing.
