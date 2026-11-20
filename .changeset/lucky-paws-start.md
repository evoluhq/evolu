---
"@evolu/common": patch
"@evolu/react": patch
"@evolu/svelte": patch
---

Fixed useOwner with an owner whose writeKey is undefined

An owner object whose `writeKey` holds no key, such as an unset field of a class with `$state` fields in Svelte or a `ref` of `undefined` in a Vue `reactive` object, is a `ReadonlyOwner` to TypeScript, because an `Owner`'s `writeKey` is required. `evolu.useOwner` and Vue's `useOwner` synced such an owner as writable, which uploaded nothing while its routes reported complete, and React's `useOwner` and Svelte's `ownerSync` threw. They now sync it as a `ReadonlyOwner`.
