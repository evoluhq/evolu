---
"@evolu/common": minor
---

Added createResettableResource

`createResettableResource` holds one resource created by a Task and resets it
on request: `reset` disposes the current resource, then runs `create` again,
and `get` returns the current one, or `undefined` while there is none.
Consumers keep the same resettable object and read each replacement through `get`.
A reset takes the resource that misbehaved and runs only while that resource is
still current or none is, so every observer of one dead resource shares one
reset, however late its request arrives. An observed `undefined`, as `get`
returns during a reset, retries an aborted creation and skips once a
replacement exists.

The `create` Task must not fail, because the previous resource is already
disposed when it runs. It must return a live, independently owned resource with
a fresh object identity, never one returned earlier, because a reset decides by
identity whether its observation is stale. Returning a reused identity is a
programmer error.

Resets run on the Run the factory creates for the resource, so aborting the
caller's Fiber does not cancel a started reset. Disposal aborts pending resets,
and calling reset after disposal starts is a programmer error. If the caller
aborts during initial creation, the factory waits for creation to settle,
disposes any created resource, and returns the abort. Repeated disposal calls
await the same cleanup and preserve any disposal failure. Undisposed resettable
resources are tracked for development-time leak warnings.

Exclusive replacement is the only policy this implements: the current resource
is disposed before the next is created, so at most one exists and there is an
observable gap with none. The resource's own API must model that gap, as a
reconnecting connection models "connecting".

Creation and disposal run under the reset's lock and must not await another
reset of the same resource, because the lock is non-reentrant.

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
