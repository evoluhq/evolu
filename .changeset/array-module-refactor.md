---
"@evolu/common": major
---

Refactored the Array module with breaking changes, better naming, and new helpers.

### Breaking Changes

**Removed `isNonEmptyReadonlyArray`** — use `isNonEmptyArray` instead. The function now handles both mutable and readonly arrays via overloads:

```ts
// Before
if (isNonEmptyReadonlyArray(readonlyArr)) { ... }
if (isNonEmptyArray(mutableArr)) { ... }

// After — one function for both
if (isNonEmptyArray(readonlyArr)) { ... }
if (isNonEmptyArray(mutableArr)) { ... }
```

**Renamed mutation functions** for consistency with the `...Array` suffix pattern:

- `shiftArray` → `shiftFromArray`
- `popArray` → `popFromArray`

### New Constants

- **`emptyArray`** — use as a default or initial value to avoid allocating new empty arrays

### New Functions

- **`createArray`** — creates a readonly array of specified length using a function to produce each element
- **`ensureArray`** — converts an Iterable to a readonly array, returning input unchanged if already an array
- **`flatMapArray`** — maps each element to an array and flattens the result, preserving non-empty type when applicable
- **`concatArrays`** — concatenates two arrays, returning non-empty when at least one input is non-empty
- **`sortArray`** — returns a new sorted array (wraps `toSorted`), preserving non-empty type
- **`reverseArray`** — returns a new reversed array (wraps `toReversed`), preserving non-empty type
- **`spliceArray`** — returns a new array with elements removed/replaced (wraps `toSpliced`)

### Migration

```ts
// isNonEmptyReadonlyArray → isNonEmptyArray
-import { isNonEmptyReadonlyArray } from "@evolu/common";
+import { isNonEmptyArray } from "@evolu/common";

// shiftArray → shiftFromArray
-import { shiftArray } from "@evolu/common";
+import { shiftFromArray } from "@evolu/common";

// popArray → popFromArray
-import { popArray } from "@evolu/common";
+import { popFromArray } from "@evolu/common";
```
