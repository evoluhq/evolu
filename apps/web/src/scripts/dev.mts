import { ok, type Task } from "@evolu/common";
import parcelWatcher from "@parcel/watcher";
import { runMain, spawn, type SpawnDep } from "@evolu/nodejs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiReferenceWatcher, type SubscribeDep } from "./dev-docs.mts";
import { generateSearchIndex } from "./generate-search-index.mts";
import { createDocsMarkdownWatcher } from "./write-docs-markdown.mts";

const appDir = path.resolve(import.meta.dirname, "../..");
const nextPath = fileURLToPath(import.meta.resolve("next/dist/bin/next"));

export interface CreateApiReferenceWatcherDep {
  readonly createApiReferenceWatcher: Task<
    AsyncDisposable,
    never,
    SpawnDep & SubscribeDep
  >;
}

export interface CreateDocsMarkdownWatcherDep {
  readonly createDocsMarkdownWatcher: Task<
    AsyncDisposable,
    never,
    SubscribeDep
  >;
}

export interface GenerateSearchIndexDep {
  readonly generateSearchIndex: Task<void>;
}

type DevDeps = CreateApiReferenceWatcherDep &
  CreateDocsMarkdownWatcherDep &
  GenerateSearchIndexDep &
  SpawnDep &
  SubscribeDep;

export const dev: Task<void, never, DevDeps> = async (run) => {
  await using _apiReferenceWatcher = await run.ok(
    run.deps.createApiReferenceWatcher,
  );
  await run.ok(run.deps.generateSearchIndex);
  await using _docsMarkdownWatcher = await run.ok(
    run.deps.createDocsMarkdownWatcher,
  );
  await run.orThrow(
    run.deps.spawn(process.execPath, [nextPath, "dev"], { cwd: appDir }),
  );
  return ok();
};

/* node:coverage ignore next 13 */
if (import.meta.main) {
  await runMain({
    createApiReferenceWatcher: createApiReferenceWatcher(),
    createDocsMarkdownWatcher: createDocsMarkdownWatcher(),
    generateSearchIndex: async () => {
      await generateSearchIndex();
      return ok();
    },
    spawn,
    subscribe: parcelWatcher.subscribe,
  })(dev);
}
