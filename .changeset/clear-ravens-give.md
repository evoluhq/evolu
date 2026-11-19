---
"@evolu/common": patch
"@evolu/react": patch
"@evolu/svelte": patch
---

Fixed useOwner and ownerSync with transports in a reactive proxy

Transports held in reactive state, such as Vue's `reactive` or `ref` or Svelte's `$state`, are proxies, which a worker can't receive. `useOwner` sent them as they were, so the owner never synced, and posting its registration threw a `DataCloneError`. `useOwner`, `createEvolu` and `createEvoluApp` now keep plain copies of the transports with only their `type` and `url`, which is all Evolu sends, so another field of a transport, such as an undefined one, no longer throws, and transports that differ only in such a field count as the same.

Svelte's `ownerSync` also missed a change made in place to transports in `$state`, such as a pushed transport, because the proxy keeps its identity. It now reads each option and transport field it uses, also of a class with `$state` fields, so such a change replaces the registration.

React's `useOwner` and Svelte's `ownerSync` now compare only the `type` and `url` of transports too, so another field of a transport no longer throws or replaces the registration.
