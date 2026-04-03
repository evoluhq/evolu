---
"@evolu/common": patch
---

Added Listeners module for publish-subscribe notifications

### Example

```ts
// Without payload (default)
const listeners = createListeners();
listeners.subscribe(() => console.log("notified"));
listeners.notify();

// With typed payload
const listeners = createListeners<{ id: string }>();
listeners.subscribe((event) => console.log(event.id));
listeners.notify({ id: "123" });
```
