---
"@evolu/common": minor
---

Added emptyPrototype, which isPlainObject accepts as it accepts a null prototype

`emptyPrototype` is a frozen, empty object without a prototype. An object
whose prototype it is inherits nothing, as an object without a prototype does,
but V8 reads and writes its properties as fast as an ordinary object's, which
it doesn't for an object without a prototype. Evolu's SQLite on Node.js and
`@evolu/sqlite-wasm` now create their rows with it, so `isPlainObject` accepts
such an object, and so do every Type that validates objects, records and JSON
values, Data's equality and `assertEqual`. So does any other frozen, empty
prototype without a prototype, such as another copy's `emptyPrototype`, which
a duplicate install or a test runner's module registry can load. Other
prototypes are rejected as before, except another realm's `Object.prototype`,
recognized by its own `hasOwnProperty` and `isPrototypeOf`.

```ts
import {
  assertFalse,
  assertTrue,
  emptyPrototype,
  isPlainObject,
} from "@evolu/common";

assertTrue(isPlainObject(Object.create(emptyPrototype)));
// As another copy of @evolu/common creates its emptyPrototype.
const anotherCopys = Object.freeze(Object.create(null) as object);
assertTrue(isPlainObject(Object.create(anotherCopys)));
const notFrozen = Object.create(null) as object;
assertFalse(isPlainObject(Object.create(notFrozen)));
```
