---
"@evolu/common": minor
---

Added `Data`, `IsData`, `eqData`, `ObjectKind`, and `getObjectKind`

`Data` is Evolu's recursive structured-cloneable data domain. It is
intentionally limited to values supported by structured clone APIs such as
worker `postMessage`: undefined, null, strings, numbers, bigints, booleans,
Arrays, plain Objects, Sets, Maps, Dates, and Uint8Arrays. Cyclic and shared
graphs are supported. Raw ArrayBuffers are excluded; represent bytes with a
Uint8Array.

The `Data` Type validates unknown values at runtime, while `IsData` checks
declared TypeScript types, including ordinary interfaces without index
signatures. `eqData` compares Data structurally with support for cycles,
unordered Sets and Maps, Dates, and Uint8Arrays. The existing
`eqJsonValue` and `eqJsonValueInput` helpers use the same comparison while
retaining their narrower JSON-only types.

`getObjectKind` exposes the shared representation classification used by Data
validation and comparison. Plain Objects use a realm-neutral structural
heuristic: a `null` prototype or an immediate root prototype with own
`hasOwnProperty` and `isPrototypeOf` properties is accepted. A custom root
prototype with the same shape can therefore be classified as plain. This
heuristic assumes trusted JavaScript and is not a security boundary.

```ts
import {
  Data,
  assertTrue,
  eqData,
  getObjectKind,
  type IsData,
} from "@evolu/common";

interface User {
  readonly name: string;
  readonly roles: ReadonlySet<string>;
}

const userIsData: IsData<User> = true;
assertTrue(userIsData);

const value = { name: "Ada", roles: new Set(["admin"]) };
const result = Data.fromUnknown(value);

assertTrue(result.ok);
assertTrue(getObjectKind(value) === "Object");
assertTrue(eqData(result.value, { name: "Ada", roles: new Set(["admin"]) }));
```
