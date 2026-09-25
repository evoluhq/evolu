---
"@evolu/common": patch
---

Fixed declaration emit for exported Types

Projects that emit declarations, such as libraries compiled with
`declaration: true` or bundled with tsdown, failed with TS4023 when they
exported an inferred Type or Type operation. For example,
`export const Product = object({ tags: array(String), type: union("a", "b") })`
referenced error interfaces that `@evolu/common` did not export, so TypeScript
could not name them in the emitted declarations.

Every interface that inferred Types and their `from` and `to` operations
reference is now exported: `TransparentTypeError`, `FromParentOperations`,
`ToParentOperations`, `UnionErrorValue`, `ArrayItemsErrorValue`,
`ArrayFromParentOperations`, `SetItemsErrorValue`, `SetFromParentOperations`,
`MapEntriesErrorValue`, `TupleItemsErrorValue`, `RootTupleType`,
`RecordEntriesErrorValue`, `StrictObjectFromUnknownError`,
`ObjectWithRecordReflection`, and `TemplateLiteralStringBrand`. Such
declarations now emit without changes to the consuming code.
