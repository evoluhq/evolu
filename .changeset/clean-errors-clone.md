---
"@evolu/common": patch
---

Fixed UnknownError holding values that cannot be cloned

`createUnknownError` kept an error's properties other than functions as they
were, so an `Error` whose `cause` held a function produced an `UnknownError`
that could not be posted between workers, and the SharedWorker threw while
reporting such an uncaught error to its tabs. Such a property is now described
as a string, and an `Error` in a property or in an array, such as the `errors`
of an `AggregateError`, is converted like the error itself. An error that is its
own `cause` no longer overflows the stack; reference cycles stay cycles. An
inherited `name` and `message`, as in a `DOMException` such as
`QuotaExceededError`, are now included too.
