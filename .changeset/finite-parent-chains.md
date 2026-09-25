---
"@evolu/common": patch
---

Fixed TS2589 for lazy maps and records of widened Types

A `map` or `record` whose key or value was a widened `AnyType`, such as a
factory parameter, failed to compile with TS2589 "Type instantiation is
excessively deep and possibly infinite". Its parent Type was the same map or
record Type again, so the parent chain never ended. The parent of a map or
record whose key or value has a parent is now a `RootMapType` or
`RootRecordType` without a parent of its own. For concrete key and value Types,
it is identical to the previous `MapType` or `RecordType` parent, including its
errors and localization.

```ts
import {
  assertOk,
  lazy,
  map,
  record,
  String,
  type AnyType,
} from "@evolu/common";

const createLazyMap = (element: AnyType) => lazy(() => map(element, element));
const createLazyRecord = (element: AnyType) =>
  lazy(() => record(String, element));

const names = new Map([["Ada", "Lovelace"]]);
assertOk(createLazyMap(String).fromUnknown(names), names);
assertOk(createLazyRecord(String).fromUnknown({ ada: "Lovelace" }), {
  ada: "Lovelace",
});
```
