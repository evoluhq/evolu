---
"@evolu/typescript-config": minor
---

Published strict TypeScript configurations for Evolu projects

Install the package with TypeScript:

```sh
pnpm add -D @evolu/typescript-config typescript
```

For universal ESM libraries, extend the corresponding configuration:

```json
{
  "extends": "@evolu/typescript-config/universal-esm.json"
}
```

Use `@evolu/typescript-config/base.json` for the shared strict compiler defaults
without platform-specific module and library settings. Use
`@evolu/typescript-config/universal-esm.json` for ESM libraries targeting
browsers and Node.js, or `@evolu/typescript-config/nextjs.json` for Next.js
applications.
