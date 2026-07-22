---
"@evolu/common": minor
---

Added utilities for awaitable values, numeric ranges, and type intersections

`Awaitable<T>` represents a value that can be returned synchronously or as a `PromiseLike`, while `isPromiseLike` narrows an awaitable value for code that handles the synchronous path without an unnecessary await.

`Digit`, `Digit1To9`, `Digit1To6`, `Digit1To23`, `Digit1To51`, `Digit1To59`, and `Digit1To99` provide bounded numeric string types for validating values such as days, hours, weeks, minutes, seconds, and years.

`UnionToIntersection<U>` converts a union to an intersection. `ParameterIntersection<T>` infers the intersection of parameter types from a union of unary functions without allowing an `unknown` parameter to erase the concrete parameter types.

`CompileTimeError<Context, Message>` was added for consistent, readable compiler-facing error messages, and Schema validation errors were updated to use it.
