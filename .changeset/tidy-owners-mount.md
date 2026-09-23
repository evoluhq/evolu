---
"@evolu/react": patch
---

Fixed useOwner registering the owner again on every render

The React binding's `useOwner` called `Evolu.useOwner` while rendering and
never released the registration, so every render added one and unmounting did
not stop syncing. It now registers in an effect and releases the registration
when the component unmounts or the owner or transports change. Owners and
transports are compared by content, so recreating them on each render keeps the
same registration. A `null` owner uses none, for a component that waits for one.

The hook no longer returns `UnuseOwner`; the component's lifetime ends the
registration. Remove calls to its returned function, and call `Evolu.useOwner`
directly to control a registration outside a component.

```ts
import { assertType, type Owner, type ReadonlyOwner } from "@evolu/common";
import { createEvoluBinding } from "@evolu/react";

const { useOwner } = createEvoluBinding();

assertType<Parameters<typeof useOwner>[0], ReadonlyOwner | Owner | null>();
assertType<ReturnType<typeof useOwner>, void>();
```
