import { describe, it } from "node:test";
import {
  assert,
  assertEqual,
  assertErr,
  assertInstanceOf,
  assertOk,
  assertSame,
} from "./Assert.ts";
import { testCreateFs, type Fs, type FsDep, type FsError } from "./Fs.ts";
import { err, ok } from "./Result.ts";
import { AbortError, testCreateRun, type Task } from "./Task.ts";
import { assertType } from "./Type.ts";

describe("testCreateFs", () => {
  it("accepts native copy options and rejects the former overwrite option", () => {
    const fs = testCreateFs();
    const task = fs.copy("source", "destination", {
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
    });
    assertType<typeof task, Task<void, FsError>>();

    // @ts-expect-error: FsCopyOptions has no overwrite property; use Node's force and errorOnExist options.
    fs.copy("source", "destination", { overwrite: false });
  });

  for (const [method, createTask] of [
    ["readFile", (fs: Fs) => fs.readFile("file.txt")],
    ["writeFile", (fs: Fs) => fs.writeFile("file.txt", "content")],
    ["readDirectory", (fs: Fs) => fs.readDirectory("directory")],
    ["createDirectory", (fs: Fs) => fs.createDirectory("directory")],
    ["copy", (fs: Fs) => fs.copy("source", "destination")],
    ["copyFile", (fs: Fs) => fs.copyFile("source", "destination")],
    ["rename", (fs: Fs) => fs.rename("source", "destination")],
    ["remove", (fs: Fs) => fs.remove("file.txt")],
    ["getMetadata", (fs: Fs) => fs.getMetadata("file.txt")],
    ["exists", (fs: Fs) => fs.exists("file.txt")],
    ["createTempDirectory", (fs: Fs) => fs.createTempDirectory()],
  ] as const) {
    it(`panics when an unconfigured ${method} Task runs`, async () => {
      const fs = testCreateFs();
      const task = createTask(fs);
      await using run = testCreateRun();

      const result = await run.abortable<unknown, FsError>(task);

      assertErr(result);
      assert(AbortError.is(result.error), "Unexpected Fs calls must abort.");
      assertEqual(result.error.reason.type, "PanicAbortReason");
      const { defect } = result.error.reason;
      assertInstanceOf(defect, Error);
      assertEqual(defect.message, `Unexpected Fs.${method} call`);
      assertEqual(run.deps.reportDefect.getDefects(), [result.error]);
    });
  }

  it("uses an injected override with the original arguments", async () => {
    const path = new URL("file:///message.txt");
    const data = new TextEncoder().encode("hello");
    const options = { flag: "a" } as const;
    let calls = 0;
    const writeFile: Fs["writeFile"] =
      (receivedPath, receivedData, receivedOptions) => () => {
        calls += 1;
        assertSame(receivedPath, path);
        assertSame(receivedData, data);
        assertSame(receivedOptions, options);
        return ok();
      };
    const fs = testCreateFs({ writeFile });
    assertSame(fs.writeFile, writeFile);
    await using run = testCreateRun({ fs });
    const saveMessage: Task<void, FsError, FsDep> = (run) =>
      run(run.deps.fs.writeFile(path, data, options));

    assertEqual(calls, 0);
    assertOk(await run(saveMessage));
    assertEqual(calls, 1);
  });

  it("preserves readFile overloads and injected errors", async () => {
    const error: FsError = {
      type: "FsError",
      reason: "PermissionDenied",
      path: "protected.txt",
      syscall: "open",
      message: "Permission denied",
    };
    const fs = testCreateFs({ readFile: () => () => err(error) });
    await using run = testCreateRun();
    const bytes = fs.readFile("protected.txt");
    const text = fs.readFile("protected.txt", "utf8");
    const encoded = fs.readFile("protected.txt", { encoding: "utf8" });
    assertType<typeof bytes, Task<Uint8Array, FsError>>();
    assertType<typeof text, Task<string, FsError>>();
    assertType<typeof encoded, Task<string, FsError>>();

    assertErr(await run(bytes), error);
    assertErr(await run(text), error);
    assertErr(await run(encoded), error);
    assertEqual(run.deps.reportDefect.getDefects(), []);
  });
});
