---
"@evolu/vue": patch
---

Released the owner used by useOwner when its component unmounts

The `useOwner` composable called `Evolu.useOwner` and discarded the function
that releases the owner, so the owner kept syncing after its component
unmounted. It now releases the owner when the current effect scope, such as the
component, is disposed.
