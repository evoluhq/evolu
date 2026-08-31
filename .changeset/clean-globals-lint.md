---
"@evolu/oxlint-config": minor
---

Enabled globalThis qualification linting

The shared config now rejects `globalThis` qualification unless the global name
conflicts with a local or exported API. Evolu APIs intentionally reuse concise
native names such as `String` and `fetch` instead of inventing prefixed wrapper
names. Use `globalThis.String` or `globalThis.fetch` where such an Evolu API
shadows the native global; elsewhere, use the unqualified name.

Checks for possibly absent globals and intentional global mutations remain
allowed.
