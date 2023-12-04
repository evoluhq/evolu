---
"@evolu/common-react": major
---

Static React Hooks

We changed the way how React Hooks are used. Instead of destructuring, we just import them.

```ts
// Not anymore.
const { useEvolu, useEvoluError, useQuery, useOwner } = evolu;
```

Import hooks. Also, `EvoluProvider` is now required.

```ts
import {
  EvoluProvider,
  useEvolu,
  useEvoluError,
  useOwner,
  useQuery,
} from "@evolu/react";

const Database = S.struct({
  todo: TodoTable,
});
type Database = S.Schema.To<typeof Database>;

// Note `Database` must be passed to useEvolu.
const { create, update } = useEvolu<Database>();

// It's also possible to do this:
const useEvolu = Evolu.useEvolu<Database>;
```
