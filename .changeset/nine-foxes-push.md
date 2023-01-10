---
"evolu": patch
---

Run mutate onComplete after React flushSync

Using mutate onComplete is rare because Evolu updates active queries automatically. We need onComplete typically when dealing with DOM, for example, moving focus for keyboard navigation. For such cases, onComplete must be called when DOM is already updated, and this update ensures it via React flushSync.