---
"@evolu/common": minor
---

Added new types and utilities to Types.ts:

- `Awaitable<T>` - type for values that can be sync or async
- `isPromiseLike` - type guard to check if a value is a PromiseLike
- `Digit`, `Digit1To9`, `Digit1To6`, `Digit1To23`, `Digit1To51`, `Digit1To99`, `Digit1To59` - template literal types for numeric validation
- `UnionToIntersection<U>` - converts a union to an intersection

`Awaitable<T>` represents values that can be either synchronous or asynchronous (`T | PromiseLike<T>`). This type is useful for functions that may complete synchronously or asynchronously depending on runtime conditions.

`isPromiseLike()` is a type guard to check if an Awaitable value is async, allowing conditional await only when necessary.
