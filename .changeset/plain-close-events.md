---
"@evolu/common": minor
---

Reported WebSocket close events as `WebSocketCloseEvent`

Close events are now reported as `WebSocketCloseEvent`, Evolu's own `code`,
`reason` and `wasClean`, rather than the DOM `CloseEvent`. React Native
delivers its own close event and exposes no `CloseEvent` global, so the DOM
type promised an inheritance chain and an `instanceof` that do not hold there,
and constructing one was not portable.

A platform's close event is structurally assignable to the new type and is
passed through unchanged, so reading it is unaffected; a handler annotated
`(event: CloseEvent) => ...` must drop that annotation or narrow the value
itself. This applies to `onClose`, `shouldRetryOnClose`, and
`WebSocketConnectionCloseError`.
