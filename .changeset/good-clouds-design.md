---
"@evolu/common": minor
---

Declared the Standard Schema types without depending on @standard-schema/spec

`@evolu/common` no longer depends on `@standard-schema/spec`. It declares the
spec's `StandardSchemaV1` types itself, as the spec invites implementers to, and
they are unchanged. It now also exports the spec's `StandardTypedV1`, which
names the inferred input and output types of a schema.

```ts
import {
  assertType,
  NonEmptyTrimmedString100,
  type StandardTypedV1,
} from "@evolu/common";

const types = NonEmptyTrimmedString100["~standard"].types;

assertType<
  typeof types,
  StandardTypedV1.Types<string, NonEmptyTrimmedString100> | undefined
>();
```
