---
"@evolu/nodejs": minor
"@evolu/vitest": major
---

Moved `TestJSDoc` to the Node.js package and required explicit assertions

Import `testJSDocExamples` from `@evolu/nodejs/TestJSDoc` instead of
`@evolu/vitest/TestJSDoc`. The runner no longer provides Vitest and Result
assertion globals. Documentation examples must explicitly import
platform-independent assertions, making each example standalone and portable.
The default compiler is the optional `typescript` peer; pass
`typescriptPackage` when using another compatible compiler package.

```ts
import { assertEqual } from "@evolu/common";
import { testJSDocExamples } from "@evolu/nodejs/TestJSDoc";

if (false) {
  // @ts-expect-error Cannot find module '@evolu/vitest/TestJSDoc' or its corresponding type declarations.
  await import("@evolu/vitest/TestJSDoc");
  // @ts-expect-error Cannot find name 'expect'.
  expect(1 + 1).toBe(2);
}

assertEqual(typeof testJSDocExamples, "function");
assertEqual(1 + 1, 2);
```
