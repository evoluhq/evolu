import {
  AbortError,
  createTime,
  ok,
  repeat,
  sleep,
  spaced,
  testCreateRun,
  timeout,
} from "@evolu/common";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, type TestContext } from "node:test";
import type { SubscribeDep } from "./dev-docs.mts";
import {
  createDocsMarkdownWatcher,
  writeDocsMarkdown,
} from "./write-docs-markdown.mts";

const setupDirectory = async (context: TestContext): Promise<string> => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "evolu-md-"));
  context.after(() => fs.rm(directory, { recursive: true }));
  return directory;
};

const setupSubscription = (): {
  readonly emit: (path: string) => void;
  readonly emitError: (error: Error) => void;
  readonly getUnsubscribeCount: () => number;
  readonly subscribe: SubscribeDep["subscribe"];
} => {
  let callback: Parameters<SubscribeDep["subscribe"]>[1] | undefined;
  let unsubscribeCount = 0;

  return {
    emit: (path) => {
      assert.ok(callback);
      callback(null, [{ path, type: "update" }]);
    },
    emitError: (error) => {
      assert.ok(callback);
      callback(error, []);
    },
    getUnsubscribeCount: () => unsubscribeCount,
    subscribe: (_directory, next) => {
      callback = next;
      return Promise.resolve({
        unsubscribe: () => {
          unsubscribeCount += 1;
          return Promise.resolve();
        },
      });
    },
  };
};

const exists = (filePath: string): Promise<boolean> =>
  fs.access(filePath).then(
    () => true,
    () => false,
  );

const waitFor = (predicate: () => boolean | Promise<boolean>) =>
  timeout(
    repeat(async () => ok(await predicate()), spaced("10ms"), {
      shouldRepeat: (conditionMet) => !conditionMet,
    }),
    "5s",
  );

void describe("writeDocsMarkdown", () => {
  void it("writes cleaned Markdown beside each exported page", async (context) => {
    const directory = await setupDirectory(context);
    const sourceDir = path.join(directory, "docs");
    const targetDir = path.join(directory, "out/docs");

    await fs.mkdir(path.join(sourceDir, "a/b"), { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, "page.mdx"),
      `export const metadata = { title: "Overview" };

# Overview

See [library](/docs/library).
`,
    );
    await fs.writeFile(path.join(sourceDir, "a/page.mdx"), "# A\n");
    await fs.writeFile(path.join(sourceDir, "a/b/page.mdx"), "# B\n");

    assert.equal(await writeDocsMarkdown({ sourceDir, targetDir }), 3);
    assert.equal(
      await fs.readFile(path.join(targetDir, "index.md"), "utf8"),
      "# Overview\n\nSee [library](https://evolu.dev/docs/library).",
    );
    assert.equal(
      await fs.readFile(path.join(targetDir, "a.md"), "utf8"),
      "# A",
    );
    assert.equal(
      await fs.readFile(path.join(targetDir, "a/b.md"), "utf8"),
      "# B",
    );
  });

  void it("rewrites only changed files and deletes the Markdown of removed pages", async (context) => {
    const directory = await setupDirectory(context);
    const sourceDir = path.join(directory, "docs");
    const targetDir = path.join(directory, "out/docs");
    const unchangedPath = path.join(targetDir, "a/b.md");
    const pastTime = new Date("2020-01-01T00:00:00Z");

    await fs.mkdir(path.join(sourceDir, "a/b"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "a/page.mdx"), "# A\n");
    await fs.writeFile(path.join(sourceDir, "a/b/page.mdx"), "# B\n");
    await fs.mkdir(path.join(targetDir, "a"), { recursive: true });
    await fs.mkdir(path.join(targetDir, "removed"));
    await fs.writeFile(path.join(targetDir, "a.md"), "# Previous A");
    await fs.writeFile(unchangedPath, "# B");
    await fs.utimes(unchangedPath, pastTime, pastTime);
    await fs.writeFile(path.join(targetDir, "a/stale.md"), "# Stale");
    await fs.writeFile(path.join(targetDir, "old.md"), "# Old");
    await fs.writeFile(path.join(targetDir, "removed/page.md"), "# Removed");

    assert.equal(await writeDocsMarkdown({ sourceDir, targetDir }), 2);
    assert.equal(
      await fs.readFile(path.join(targetDir, "a.md"), "utf8"),
      "# A",
    );
    // Not rewritten, so it was never empty while the other files changed.
    assert.equal((await fs.stat(unchangedPath)).mtimeMs, pastTime.getTime());
    assert.deepEqual(
      (await fs.readdir(targetDir, { recursive: true })).toSorted(),
      ["a", "a.md", "a/b.md"],
    );
  });

  void it("replaces the Markdown of a page renamed only by case", async (context) => {
    const directory = await setupDirectory(context);
    const sourceDir = path.join(directory, "docs");
    const targetDir = path.join(directory, "out/docs");
    await fs.mkdir(path.join(sourceDir, "Foo/bar"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "Foo/page.mdx"), "# Foo\n");
    await fs.writeFile(path.join(sourceDir, "Foo/bar/page.mdx"), "# Bar\n");
    await writeDocsMarkdown({ sourceDir, targetDir });

    await fs.rename(path.join(sourceDir, "Foo"), path.join(sourceDir, "foo"));
    const calls: Array<"rm" | "writeFile"> = [];
    const { rm, writeFile } = fs;
    context.mock.method(fs, "rm", (...args: Parameters<typeof rm>) => {
      calls.push("rm");
      return rm(...args);
    });
    context.mock.method(
      fs,
      "writeFile",
      (...args: Parameters<typeof writeFile>) => {
        calls.push("writeFile");
        return writeFile(...args);
      },
    );
    await writeDocsMarkdown({ sourceDir, targetDir });

    // On a case-insensitive file system, Foo.md and foo.md are one file, so
    // the old spelling must be deleted before the new one is written. A
    // case-sensitive file system, such as CI's, gives the same listing in
    // either order, so the order is asserted too.
    assert.deepEqual(
      calls.filter((call, index) => call !== calls[index - 1]),
      ["rm", "writeFile"],
    );
    assert.deepEqual(
      (await fs.readdir(targetDir, { recursive: true })).toSorted(),
      ["foo", "foo.md", "foo/bar.md"],
    );
  });

  void it("skips a page deleted after the listing and rethrows other read errors", async (context) => {
    const directory = await setupDirectory(context);
    const sourceDir = path.join(directory, "docs");
    const targetDir = path.join(directory, "out/docs");
    const deletedPath = path.join(sourceDir, "deleted/page.mdx");
    await fs.mkdir(path.join(sourceDir, "deleted"), { recursive: true });
    await fs.mkdir(path.join(sourceDir, "kept"));
    await fs.writeFile(deletedPath, "# Deleted\n");
    await fs.writeFile(path.join(sourceDir, "kept/page.mdx"), "# Kept\n");
    const readError = Object.assign(new Error("Read failed."), {
      code: "ENOENT",
    });
    const { readFile } = fs;
    context.mock.method(fs, "readFile", (filePath: string, encoding: "utf8") =>
      filePath === deletedPath
        ? Promise.reject(readError)
        : readFile(filePath, encoding),
    );

    assert.equal(await writeDocsMarkdown({ sourceDir, targetDir }), 2);
    assert.deepEqual(await fs.readdir(targetDir), ["kept.md"]);

    readError.code = "EACCES";
    await assert.rejects(
      writeDocsMarkdown({ sourceDir, targetDir }),
      readError,
    );
  });
});

void describe("docs Markdown watcher", () => {
  void it("writes Markdown, rewrites it after changes, and unsubscribes on dispose", async (context) => {
    const directory = await setupDirectory(context);
    const sourceDir = path.join(directory, "docs");
    const targetDir = path.join(directory, "public/docs");
    const subscription = setupSubscription();
    await fs.mkdir(path.join(sourceDir, "old"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "old/page.mdx"), "# Page\n");
    await using run = testCreateRun({
      subscribe: subscription.subscribe,
      time: createTime(),
    });

    const watcher = await run.ok(
      createDocsMarkdownWatcher({ sourceDir, targetDir }),
    );
    assert.equal(await exists(path.join(targetDir, "old.md")), true);

    await fs.rename(path.join(sourceDir, "old"), path.join(sourceDir, "new"));
    subscription.emit(path.join(sourceDir, "new"));
    const newPath = path.join(targetDir, "new.md");
    await run.orThrow(
      waitFor(
        async () =>
          (await fs.readFile(newPath, "utf8").catch(() => null)) === "# Page",
      ),
    );
    // The same run deletes the renamed page's old Markdown.
    assert.equal(await exists(path.join(targetDir, "old.md")), false);

    // The finished run leaves the watcher idle until the next change.
    await fs.writeFile(newPath, "Edited");
    await run.ok(sleep("50ms"));
    assert.equal(await fs.readFile(newPath, "utf8"), "Edited");

    await watcher[Symbol.asyncDispose]();
    assert.equal(subscription.getUnsubscribeCount(), 1);
  });

  void it("logs write failures, retries after the next change, and panics on watcher errors", async (context) => {
    const directory = await setupDirectory(context);
    const sourceDir = path.join(directory, "docs");
    const blockingFile = path.join(directory, "public");
    const subscription = setupSubscription();
    await fs.mkdir(sourceDir);
    await fs.writeFile(path.join(sourceDir, "page.mdx"), "# Docs\n");
    // A file where the target's parent directory belongs.
    await fs.writeFile(blockingFile, "");
    await using run = testCreateRun({
      subscribe: subscription.subscribe,
      time: createTime(),
    });

    const watcher = await run.ok(
      createDocsMarkdownWatcher({
        sourceDir,
        targetDir: path.join(blockingFile, "docs"),
      }),
    );
    assert.ok(
      run.deps.console
        .getEntriesSnapshot()
        .some((entry) => entry.args[0] === "Writing docs Markdown failed."),
    );

    await fs.rm(blockingFile);
    subscription.emit(path.join(sourceDir, "page.mdx"));
    await run.orThrow(
      waitFor(() => exists(path.join(blockingFile, "docs/index.md"))),
    );

    const watcherError = new Error("Watcher failed.");
    const reportedDefect = run.deps.reportDefect.next();
    subscription.emitError(watcherError);
    const defect = await reportedDefect;
    assert.ok(AbortError.is(defect));
    if (defect.reason.type !== "PanicAbortReason") assert.fail();
    assert.equal(defect.reason.defect, watcherError);
    await watcher[Symbol.asyncDispose]();
  });
});
