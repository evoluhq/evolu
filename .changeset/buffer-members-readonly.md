---
"@evolu/common": patch
---

Made the members of `Buffer` readonly

Assigning a member of a `Buffer`, such as `shift`, no longer compiles. To change
how a buffer behaves, create a new object that delegates to it.

```ts
import { assertEqual, createBuffer, type Buffer } from "@evolu/common";

const buffer = createBuffer([1, 2]);

const _replaceShift = (): void => {
  // @ts-expect-error Cannot assign to 'shift' because it is a read-only property.
  buffer.shift = () => buffer.getLength();
};

const delegating: Buffer = { ...buffer, shift: () => buffer.shift() };
assertEqual(delegating.shift(), 1);
```
