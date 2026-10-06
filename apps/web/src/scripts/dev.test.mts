import { ok, testCreateRun, type Task } from "@evolu/common";
import type { Spawn, SpawnDep } from "@evolu/nodejs";
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import type { SubscribeDep } from "./dev-docs.mts";
import {
  dev,
  type CreateApiReferenceWatcherDep,
  type CreateDocsMarkdownWatcherDep,
  type GenerateSearchIndexDep,
} from "./dev.mts";

void describe("web development server", () => {
  void it("generates API docs, search and Markdown, then runs Next.js from the app directory", async () => {
    const calls: Array<string> = [];
    let spawnedFile = "";
    let spawnedArgs: ReadonlyArray<string> = [];
    let spawnedCwd: string | URL | undefined;
    const generateSearchIndex: Task<void> = () => {
      calls.push("search");
      return ok();
    };
    const createWatcher =
      (name: string): Task<AsyncDisposable> =>
      () => {
        calls.push(name);
        return ok({
          [Symbol.asyncDispose]: () => {
            calls.push(`dispose ${name}`);
            return Promise.resolve();
          },
        });
      };
    const spawn: Spawn = (file, args, options) => () => {
      calls.push("next");
      spawnedFile = file;
      spawnedArgs = args;
      spawnedCwd = options?.cwd;
      return ok();
    };
    const subscribe: SubscribeDep["subscribe"] = () =>
      Promise.reject(new Error("Unexpected subscription."));
    await using run = testCreateRun<
      CreateApiReferenceWatcherDep &
        CreateDocsMarkdownWatcherDep &
        GenerateSearchIndexDep &
        SpawnDep &
        SubscribeDep
    >({
      createApiReferenceWatcher: createWatcher("api-reference"),
      createDocsMarkdownWatcher: createWatcher("markdown"),
      generateSearchIndex,
      spawn,
      subscribe,
    });

    await run.ok(dev);

    assert.deepEqual(calls, [
      "api-reference",
      "search",
      "markdown",
      "next",
      "dispose markdown",
      "dispose api-reference",
    ]);
    assert.equal(spawnedFile, process.execPath);
    assert.equal(path.basename(spawnedArgs[0]), "next");
    assert.deepEqual(spawnedArgs.slice(1), ["dev"]);
    assert.equal(spawnedCwd, path.resolve(import.meta.dirname, "../.."));
  });
});
