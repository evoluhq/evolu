import { ok, type Task } from "@evolu/common";
import parcelWatcher from "@parcel/watcher";
import { runMain, spawn, type SpawnDep } from "@evolu/nodejs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiReferenceWatcher, type SubscribeDep } from "./dev-docs.mts";
import { generateSearchIndex } from "./generate-search-index.mts";

const appDir = path.resolve(import.meta.dirname, "../..");
const nextPath = fileURLToPath(import.meta.resolve("next/dist/bin/next"));

export interface CreateApiReferenceWatcherDep {
  readonly createApiReferenceWatcher: Task<
    AsyncDisposable,
    never,
    SpawnDep & SubscribeDep
  >;
}

export interface GenerateSearchIndexDep {
  readonly generateSearchIndex: Task<void>;
}

type DevDeps = CreateApiReferenceWatcherDep &
  GenerateSearchIndexDep &
  SpawnDep &
  SubscribeDep;

export const dev: Task<void, never, DevDeps> = async (run) => {
  await using _apiReferenceWatcher = await run.ok(
    run.deps.createApiReferenceWatcher,
  );
  await run.ok(run.deps.generateSearchIndex);
  await run.orThrow(
    run.deps.spawn(process.execPath, [nextPath, "dev"], { cwd: appDir }),
  );
  return ok();
};

/* node:coverage ignore next 12 */
if (import.meta.main) {
  await runMain({
    createApiReferenceWatcher: createApiReferenceWatcher(),
    generateSearchIndex: async () => {
      await generateSearchIndex();
      return ok();
    },
    spawn,
    subscribe: parcelWatcher.subscribe,
  })(dev);
}
