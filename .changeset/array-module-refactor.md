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

**Removed mutable array helpers:**

- `shiftArray`
- `popArray`

Use native `.shift()` and `.pop()` when mutation is necessary.

### New Constants

- **`emptyArray`** — use as a default or initial value to avoid allocating new empty arrays

### New Functions

- **`arrayFrom`** — creates a readonly array from an iterable or by generating elements with a length and mapper
- **`arrayFromAsync`** — creates a readonly array from an async iterable (or iterable of promises) and awaits all values
- **`flatMapArray`** — maps each element to an array and flattens the result, preserving non-empty type when applicable
- **`concatArrays`** — concatenates two arrays, returning non-empty when at least one input is non-empty
- **`sortArray`** — returns a new sorted array (wraps `toSorted`), preserving non-empty type
- **`reverseArray`** — returns a new reversed array (wraps `toReversed`), preserving non-empty type
- **`spliceArray`** — returns a new array with elements removed/replaced (wraps `toSpliced`)
- **`zipArray`** — combines multiple arrays into an array of tuples, preserving non-empty type

### Migration

```ts
// isNonEmptyReadonlyArray → isNonEmptyArray
-import { isNonEmptyReadonlyArray } from "@evolu/common";
+import { isNonEmptyArray } from "@evolu/common";

// Mutable array helpers were removed.
-import { popArray, shiftArray } from "@evolu/common";
+const first = items.shift();
+const last = items.pop();
```
