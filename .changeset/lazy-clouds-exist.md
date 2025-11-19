---
"@evolu/common": major
"@evolu/react": major
---

Replace `subscribeAppOwner` and `getAppOwner` with `appOwner` promise

The app owner is now accessed via a promise (`evolu.appOwner`) instead of subscription-based methods. This simplifies the API and aligns with modern async patterns.

**Breaking changes:**

- Removed `evolu.subscribeAppOwner()` and `evolu.getAppOwner()`
- Removed `useAppOwner()` hook from `@evolu/react`
- Added `evolu.appOwner` promise that resolves to `AppOwner`
- Updated `appOwnerState()` in `@evolu/svelte` to return promise-based state

**Migration:**

```ts
// Before
const unsubscribe = evolu.subscribeAppOwner(() => {
  const owner = evolu.getAppOwner();
});

// After
const owner = await evolu.appOwner;
```

For React, use the `use` hook:

```ts
// Before
import { useAppOwner } from "@evolu/react";
const appOwner = useAppOwner();

// After
import { use } from "react";
const evolu = useEvolu();
const appOwner = use(evolu.appOwner);
```
