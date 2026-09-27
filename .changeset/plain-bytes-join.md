---
"@evolu/common": minor
---

Added concatByteArrays

`concatByteArrays` copies an array of Uint8Arrays into one. Unlike
`concatBytes`, which takes each array as a separate argument and overflows the
call stack when many arrays are spread into it, it works for any number of
arrays.

```ts
import { assertEqual, concatByteArrays } from "@evolu/common";

const chunks = Array.from({ length: 200_000 }, () => new Uint8Array([1]));

assertEqual(concatByteArrays(chunks).length, 200_000);
```
