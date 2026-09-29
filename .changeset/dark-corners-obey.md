---
"@evolu/common": minor
---

Added shareStructure to keep the unchanged parts of copied data

`shareStructure(previous, next)` returns `next` with every part deep-equal to
the same part of `previous` replaced by that part, or `previous` itself when the
two are deep-equal, except that a part a cycle leads back to is returned as it
is in `next`. Data that arrives as a new copy, such as a structured clone
posted between workers, then keeps the objects of its unchanged parts, so they
can be compared with `===`, and a UI updates only what changed. Plain objects,
arrays, and `Uint8Array`s are compared by their contents, and any other value
by identity.

An array item is compared with the previous item at its index. The optional
`itemToKey` compares it with the previous item of the same key instead, such as
its ID, so an item keeps its object when an item before it is removed.

```ts
import {
  assertNotSame,
  assertSame,
  isPlainObject,
  shareStructure,
} from "@evolu/common";

const previous = {
  user: { name: "Alice" },
  todos: [
    { id: 1, title: "Buy milk" },
    { id: 2, title: "Walk the dog" },
  ],
};

// An equal copy gives the previous value back.
assertSame(shareStructure(previous, structuredClone(previous)), previous);

// Todos compared by ID keep their objects when a todo before them is removed.
const next = shareStructure(
  previous,
  { user: { name: "Alice" }, todos: [{ id: 2, title: "Walk the dog" }] },
  (item) => (isPlainObject(item) ? item.id : undefined),
);
assertNotSame(next, previous);
assertSame(next.user, previous.user);
assertSame(next.todos[0], previous.todos[1]);
```
