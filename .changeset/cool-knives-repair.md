---
"@evolu/common": minor
---

Added promiseToTask

`promiseToTask(start, mapError?)` awaits the promise that `start` returns through a Run, whose abort ends the wait at once and ignores the late result. It takes a function rather than a promise, so `retry`, `repeat`, and `timeout` start the operation again, and passes the Run's signal to it, so an operation such as `fetch` aborts too. Without `mapError`, a rejection is a defect; with it, the rejection becomes an `Err`, as `tryAsync` maps one.

```ts
import {
  assertErr,
  assertOk,
  createRun,
  promiseToTask,
  type Task,
  type Typed,
} from "@evolu/common";

interface ReadError extends Typed<"ReadError"> {
  readonly cause: unknown;
}

const readSetting = (name: string, signal: AbortSignal): Promise<string> =>
  name === "theme"
    ? Promise.resolve(signal.aborted ? "" : "dark")
    : Promise.reject(new Error(`No setting ${name}`));

const readSettingTask = (name: string): Task<string, ReadError> =>
  promiseToTask(
    (signal) => readSetting(name, signal),
    (cause) => ({ type: "ReadError", cause }),
  );

await using run = createRun();
assertOk(await run(readSettingTask("theme")), "dark");
assertErr(await run(readSettingTask("font")));
```
