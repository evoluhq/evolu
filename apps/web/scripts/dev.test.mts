import { ok, testCreateRun, type Task } from "@evolu/common";
import type { Spawn, SpawnDep } from "@evolu/nodejs";
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import type { SubscribeDep } from "./dev-docs.mts";
import {
  dev,
  type CreateApiReferenceWatcherDep,
  type GenerateSearchIndexDep,
} from "./dev.mts";

void describe("web development server", () => {
  void it("generates API docs before search and runs Next.js from the app directory", async () => {
    const calls: Array<string> = [];
    let spawnedFile = "";
    let spawnedArgs: ReadonlyArray<string> = [];
    let spawnedCwd: string | URL | undefined;
    const generateSearchIndex: Task<void> = () => {
      calls.push("search");
      return ok();
    };
    const createApiReferenceWatcher: Task<AsyncDisposable> = () => {
      calls.push("watcher");
      return ok({
        [Symbol.asyncDispose]: () => {
          calls.push("dispose");
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
        GenerateSearchIndexDep &
        SpawnDep &
        SubscribeDep
    >({ createApiReferenceWatcher, generateSearchIndex, spawn, subscribe });

    await run.ok(dev);

    assert.deepEqual(calls, ["watcher", "search", "next", "dispose"]);
    assert.equal(spawnedFile, process.execPath);
    assert.equal(path.basename(spawnedArgs[0]), "next");
    assert.deepEqual(spawnedArgs.slice(1), ["dev"]);
    assert.equal(spawnedCwd, path.resolve(import.meta.dirname, ".."));
  });
});
