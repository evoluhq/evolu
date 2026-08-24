# @evolu/typescript-config

Strict TypeScript configurations for Evolu projects.

## Setup

```sh
pnpm add -D @evolu/typescript-config typescript
```

Extend the configuration for universal ESM libraries:

```json
{
  "extends": "@evolu/typescript-config/universal-esm.json"
}
```

The package also provides `base.json` for projects that define their own
environment settings and `nextjs.json` for Next.js applications.
