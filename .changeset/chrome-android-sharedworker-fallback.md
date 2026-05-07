---
"@evolu/web": patch
---

Fixed the SharedWorker fallback on older Chrome Android versions without native SharedWorker support.

Apps can pass `onSharedWorkerUnsupported` to show a custom message when another fallback tab is already running:

```ts
createEvoluDeps({
  onSharedWorkerUnsupported: () => {
    alert(
      "This browser supports Evolu in one tab only. Close this tab and use the already open tab.",
    );
  },
});
```
