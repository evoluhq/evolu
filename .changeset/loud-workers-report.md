---
"@evolu/web": minor
---

Reported uncaught shared worker errors in every tab

Browsers never pass a shared worker's uncaught errors to a page's error
handlers, so an unexpected failure of Evolu's shared worker, which can stop all
its work, left `evoluError` empty. The shared worker now posts each uncaught
error, unhandled rejection, and Task defect to every tab, which logs it and sets
it as an `UnknownError` in `evoluError`. An app that forwards `evoluError` to an
error tracker from each tab reports such an error once per tab. Where a
dedicated worker stands in for a missing SharedWorker, its page also still
receives the uncaught errors from the browser.

The new `addUncaughtErrorListener` passes each uncaught error and unhandled
rejection of a worker global scope to a listener, including the defects of a
Run from `createRun`, so any shared worker can send them to its pages.

```ts
import { assertEqual } from "@evolu/common";
import { addUncaughtErrorListener } from "@evolu/web";

const messages: Array<string> = [];
// A worker passes its global scope, `self`.
const scope = new EventTarget();
using _listener = addUncaughtErrorListener(scope, (error) => {
  messages.push(error.message);
});

scope.dispatchEvent(
  Object.assign(new Event("error"), { error: new Error("unexpected") }),
);
assertEqual(messages, ["unexpected"]);
```
