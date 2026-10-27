---
"@evolu/sqlite-wasm": patch
---

Gave rows @evolu/common's emptyPrototype instead of a null prototype, so V8 reads them faster

A row's prototype is now `emptyPrototype` from `@evolu/common`, a frozen, empty
object without a prototype of its own, instead of `null`. A row still inherits
nothing, and a column named `__proto__` is still an ordinary property, but V8
keeps its properties as fast as an ordinary object's, which it doesn't for an
object without a prototype. In Node.js, reading 10,000 rows of four numbers
took about 20% less time. Code that checks `Object.getPrototypeOf(row) === null`
now gets `false`; `isPlainObject` accepts both.
