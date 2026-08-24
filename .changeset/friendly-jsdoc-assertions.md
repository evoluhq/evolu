---
"@evolu/nodejs": minor
"@evolu/vitest": major
---

Removed Vitest from documentation example testing

`testJSDocExamples` no longer depends on Vitest, now lints examples with
`@evolu/oxlint-config`, and is much faster. As a result, it moved from
`@evolu/vitest` to `@evolu/nodejs`; import it from `@evolu/nodejs/TestJSDoc`.

Documentation examples no longer receive Vitest or Result assertion globals.
They explicitly import platform-independent assertions from `@evolu/common`,
making each example standalone and portable. Compilation uses
`@evolu/typescript-config`.

Projects calling this helper must install its optional tooling peers as
development dependencies:

```sh
pnpm add -D @evolu/oxlint-config @evolu/typescript-config oxlint oxlint-tsgolint typescript
```

Prefix intentionally unused example declarations with `_`; used
underscore-prefixed declarations fail linting.

Write documentation examples as standalone TypeScript modules with explicitly
imported assertions:

```ts
import { assertEqual } from "@evolu/common";

const _intentionallyUnused = "example";

assertEqual(1 + 1, 2);
```
