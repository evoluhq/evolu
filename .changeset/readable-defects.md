---
"@evolu/common": minor
"@evolu/react-native": patch
"@evolu/web": patch
---

Fixed defect reports that showed only "[object Object]"

The browser and React Native `createRun` passed a panic's `AbortError`, a plain
object, to the platform's error reporter, which shows it only as
"[object Object]" or similar. A worker's error reaches its page, including an
error tracker listening there, as that text alone, so when a database worker
failed, nothing said why. Both now report an `Error` from the new
`defectToError`: a panic reports its defect, and any other value that is not an
`Error` is described in one whose cause is what was reported. A `DOMException`,
which Chromium reports from a worker without its name or message, is described
with both.

A custom `reportDefect`, such as one passing defects to an error tracker, can
use `defectToError` too:

```ts
import { assertSame, createRun, defectToError } from "@evolu/common";

const errors: Array<Error> = [];
await using run = createRun({
  reportDefect: (reported) => {
    errors.push(defectToError(reported));
  },
});
const defect = new Error("boom");

run.panic(defect);

assertSame(errors[0], defect);
```
