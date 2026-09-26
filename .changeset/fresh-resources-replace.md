---
"@evolu/common": minor
---

Added createResettableResource

`createResettableResource` holds one resource created by a Task and replaces it
in place: `reset(observed)` disposes the current resource and runs `create`
again, and `get` returns the current resource, or `undefined` while there is
none. Consumers keep the same object across replacements. A reset is skipped
when a resource other than `observed` is current, so every observer of one
failed resource shares a single reset.

At most one resource exists, so there is a gap with none while a reset runs;
the resource's own API must model it, as a reconnecting connection models
"connecting". `create` must not fail and must return a fresh object each time.
The `ResettableResource` and `createResettableResource` API docs describe
cancellation, disposal, and locking.

```ts
import {
  assertEqual,
  assertSame,
  createRun,
  createResettableResource,
  ok,
  type Task,
} from "@evolu/common";

interface Connection extends Disposable {
  readonly id: number;
  readonly isClosed: () => boolean;
}

let nextId = 1;
const createConnection: Task<Connection> = () => {
  const id = nextId++;
  let isClosed = false;
  return ok({
    id,
    isClosed: () => isClosed,
    [Symbol.dispose]: () => {
      isClosed = true;
    },
  });
};

await using run = createRun();
await using connection = await run.ok(
  createResettableResource(createConnection),
);
const first = connection.get();
assertEqual(first?.id, 1);

await run.ok(connection.reset(first));
assertSame(first?.isClosed(), true);
assertEqual(connection.get()?.id, 2);

// A late observer of the first connection does not reset the second.
await run.ok(connection.reset(first));
assertEqual(connection.get()?.id, 2);
```
