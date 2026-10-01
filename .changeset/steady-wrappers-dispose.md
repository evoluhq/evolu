---
"@evolu/common": patch
---

Fixed disposing Redacted values on runtimes that need the Symbol.dispose polyfill

Redacted read `Symbol.dispose` when its module loaded. Apps call
`installPolyfills()` from their entry point, but imported modules are evaluated
before that call runs. On runtimes without a native `Symbol.dispose`, such as
Safari, wrappers therefore had no dispose method: `using` threw
`Object not disposable`, and the secret stayed revealable. Each wrapper now gets
its dispose method when it is created.

A detached dispose method, as in `stack.defer(secret[Symbol.dispose])`, now also
disposes the wrapper. Before, it did nothing.
