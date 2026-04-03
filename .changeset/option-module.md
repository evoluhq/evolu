---
"@evolu/common": minor
---

Added Option module for distinguishing absence from nullable values.

Use Option when the value itself can be `null` or `undefined`. For APIs where `null` means "not found", just use `T | null` directly.

**Types:**

- `Option<T>` — `Some<T> | None`
- `Some<T>` — present value
- `None` — absent value
- `InferOption<O>` — extracts value type from Option or Some

**Functions:**

- `some(value)` — creates a Some
- `none` — shared None instance
- `isSome(option)` — type guard for Some
- `isNone(option)` — type guard for None
- `fromNullable(value)` — converts nullable to Option
