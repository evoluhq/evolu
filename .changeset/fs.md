---
"@evolu/common": minor
"@evolu/nodejs": minor
---

Added file system operations for Tasks

`Fs` provides `readFile`, `writeFile`, `readDirectory`, `createDirectory`, `copy`,
`copyFile`, `rename`, `remove`, `getMetadata`, `exists`, and `createTempDirectory`.
Each operation returns a Task.

Tasks can sequence file operations without synchronous I/O. Node.js's synchronous
methods are intentionally omitted to avoid accidentally blocking the event loop.

Inject `createNodeFs()` through `runMain` or `createRun`. Tasks declare `FsDep`
and access the file system through `run.deps.fs`.

On Node.js, `readFile` and `writeFile` pass the Run's abort signal to the native
operation. If it rejects after cancellation, the Task propagates the Run's abort
reason. Cancellation can leave a write partially completed. Successful operations
return their values even if an abort was requested. Other operations run to
completion and return their results once started.

File system errors include a reason such as `NotFound` or `IsDirectory`, a
diagnostic message, and the operation's path. URL paths are represented by `href`.
Copy and rename errors also include the destination. `exists` returns `false`
for `NotFound` and preserves other errors, including permission failures.

`getMetadata` returns data with a `type` field such as `"File"` or `"Directory"`.
`readDirectory` lists relative entry names and supports recursive listing.
On Node.js, `copy` delegates to recursive `node:fs/promises.cp`. By default it
merges directories and replaces files. Its options are Node's `force`,
`errorOnExist`, and `preserveTimestamps`: `force: false` skips existing files,
and adding `errorOnExist: true` rejects existing files and directories.
Symbolic links retain Node's behavior and may still be replaced with both of
those options set. Tree copying provides no exclusive-creation or atomicity
guarantee, and a failure can leave a partial copy.

`copyFile` copies a single file and fails with `AlreadyExists` if the destination
exists, unless `overwrite: true` is set. Its default exclusive creation also
protects against competing copies. File contents are not published atomically.
`rename` uses the platform's rename semantics and can replace an existing file.

`createTempDirectory()` uses the system temporary directory by default. Its
`directory` option selects an existing parent directory, and `prefix` sets a
prefix for the generated directory name. The returned directory supports cleanup
with `await using`. Once creation starts, it returns its result even if the Run
aborts, so the caller can dispose the directory.
On Node.js, the parent is resolved through the file system before creation, so
symbolic links followed by `..` retain their file system meaning. The returned
path is absolute, so cleanup still removes the created directory if the process
changes its working directory before disposal. Resolution errors identify the
supplied parent; creation errors identify the resolved parent and name prefix.

```ts
import {
  assertEqual,
  assertErr,
  ok,
  type FsDep,
  type FsError,
  type Task,
} from "@evolu/common";
import { createNodeFs, runMain } from "@evolu/nodejs";
import { join } from "node:path";

const main: Task<void, FsError, FsDep> = async (run) => {
  const { fs } = run.deps;
  const temp = await run(fs.createTempDirectory({ prefix: "evolu-fs-" }));
  if (!temp.ok) return temp;

  await using directory = temp.value;
  const path = join(directory.path, "message.txt");

  const result = await run(fs.writeFile(path, "hello"));
  if (!result.ok) return result;

  const text = await run(fs.readFile(path, "utf8"));
  if (!text.ok) return text;
  assertEqual(text.value, "hello");

  const metadata = await run(fs.getMetadata(path));
  if (!metadata.ok) return metadata;
  assertEqual(metadata.value.type, "File");

  const copyPath = join(directory.path, "copy.txt");
  const copied = await run(fs.copy(path, copyPath));
  if (!copied.ok) return copied;
  const copyConflict = await run(
    fs.copy(path, copyPath, { force: false, errorOnExist: true }),
  );
  assertErr(copyConflict);
  assertEqual(copyConflict.error.reason, "AlreadyExists");

  const conflict = await run(fs.copyFile(path, copyPath));
  assertErr(conflict);
  assertEqual(conflict.error.reason, "AlreadyExists");

  return ok();
};

await runMain({ fs: createNodeFs() }, { mode: "command" })(main);
```

Use `testCreateFs(overrides)` to supply file system behavior in application tests.
Unconfigured operations throw a defect naming the method when their Task runs.

```ts
import {
  assertErr,
  testCreateFs,
  testCreateRun,
  err,
  type FsError,
} from "@evolu/common";

const error: FsError = {
  type: "FsError",
  reason: "PermissionDenied",
  path: "protected.txt",
  syscall: "open",
  message: "Permission denied",
};

await using run = testCreateRun({
  fs: testCreateFs({ readFile: () => () => err(error) }),
});

assertErr(await run(run.deps.fs.readFile("protected.txt", "utf8")), error);
```
