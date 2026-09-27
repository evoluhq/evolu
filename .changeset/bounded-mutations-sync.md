---
"@evolu/common": minor
---

Added a size limit for mutations

A mutation larger than `maxMutationSize`, 640,000 bytes, now throws before
anything is saved, so the code after it does not run. Previously such a change
was saved but might never sync: every sync round asked for it again, and a
shared worker hosting two databases stopped all work of that database, its
queries, writes, and sync.

The size is the change as encoded for sync, before padding and encryption, so
plain text can use the whole limit at a byte per character. No string takes more
than three bytes per UTF-16 code unit. Mutations of local-only tables are
exempt. Give columns Types with a maximum length, so input that is too large is
rejected where it enters the app, and check unbounded input with
`evolu.getMutationSize`, which is typed by the schema. Binary values are now
copied when a mutation is made, so later changes to a `Uint8Array` do not change
what is saved.

```ts
import {
  assertType,
  type Evolu,
  maxMutationSize,
  type NonEmptyTrimmedString100,
  type TestEvoluSchema,
} from "@evolu/common";

// Checks a mutation before making it.
const fitsTodo = (
  evolu: Evolu<TestEvoluSchema>,
  title: NonEmptyTrimmedString100,
) => evolu.getMutationSize("todo", { title }) <= maxMutationSize;

assertType<ReturnType<typeof fitsTodo>, boolean>();
```
