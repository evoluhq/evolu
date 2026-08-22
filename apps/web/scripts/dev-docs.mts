import { createGate, ok, tryAsync, trySync, type Task } from "@evolu/common";
import parcelWatcher from "@parcel/watcher";
import { runMain, spawn, type SpawnDep } from "@evolu/nodejs";
import path from "node:path";
import {
  fixApiReference,
  generateSections,
  publishApiReference,
} from "./fix-api-reference.mts";

const defaultRepositoryDir = path.resolve(import.meta.dirname, "../../..");
const defaultStagedReferenceDir = path.join(
  defaultRepositoryDir,
  "tmp/api-reference",
);
const defaultReferenceDir = path.join(
  import.meta.dirname,
  "../src/app/(docs)/docs/api-reference",
);
const defaultDocsDir = path.join(import.meta.dirname, "../src/app/(docs)");
const defaultSectionsPath = path.join(
  import.meta.dirname,
  "../src/data/sections.json",
);
const defaultTypedocPath = path.join(
  defaultRepositoryDir,
  "node_modules/typedoc/bin/typedoc",
);

export interface SubscribeDep {
  readonly subscribe: typeof parcelWatcher.subscribe;
}

type ApiReferenceWatcherDeps = SpawnDep & SubscribeDep;

export const createApiReferenceWatcher =
  ({
    docsDir = defaultDocsDir,
    referenceDir = defaultReferenceDir,
    repositoryDir = defaultRepositoryDir,
    sectionsPath = defaultSectionsPath,
    stagedReferenceDir = defaultStagedReferenceDir,
    typedocPath = defaultTypedocPath,
  }: {
    readonly docsDir?: string;
    readonly referenceDir?: string;
    readonly repositoryDir?: string;
    readonly sectionsPath?: string;
    readonly stagedReferenceDir?: string;
    readonly typedocPath?: string;
  } = {}): Task<AsyncDisposable, never, ApiReferenceWatcherDeps> =>
  async (run) => {
    const apiReferenceConsole = run.deps.console.child("api-reference");
    const generationRequested = createGate();
    const pendingMdxPaths = new Set<string>();
    await using disposer = new AsyncDisposableStack();
    const watcherRun = disposer.use(run.create());

    const subscription = await run.deps.subscribe(
      repositoryDir,
      (error, events) => {
        if (error) {
          watcherRun.panic(error);
          return;
        }

        if (
          events.some(({ path: changedPath }) => {
            const relativePath = path
              .relative(repositoryDir, changedPath)
              .replaceAll(path.sep, "/");

            return (
              relativePath === "typedoc.base.json" ||
              relativePath === "typedoc.dev.json" ||
              relativePath === "typedoc.json" ||
              relativePath === "scripts/typedoc-plugin-evolu.mts" ||
              /^packages\/[^/]+\/(?:package|tsconfig|typedoc)\.json$/u.test(
                relativePath,
              ) ||
              /^packages\/[^/]+\/src\/.*\.tsx?$/u.test(relativePath)
            );
          })
        ) {
          generationRequested.open();
        }
      },
      {
        ignore: [
          ".git",
          ".turbo",
          "apps",
          "bench",
          "examples",
          "node_modules",
          "packages/*/dist/**",
          "packages/*/node_modules/**",
          "test",
          "tmp",
        ],
      },
    );
    disposer.defer(() => subscription.unsubscribe());

    const updateApiReference: Task<void, never, SpawnDep> = async (run) => {
      const startedAt = run.deps.time.performance.now();
      let changedMdxCount = 0;
      let deletedMdxCount = 0;
      let failed = false;
      let sectionsChanged = false;

      const typedocResult = await run(
        run.deps.spawn(
          process.execPath,
          [typedocPath, "--options", "typedoc.dev.json"],
          { cwd: repositoryDir },
        ),
      );
      if (!typedocResult.ok) {
        failed = true;
        apiReferenceConsole.error("TypeDoc failed.", typedocResult.error);
      } else {
        const publishResult = trySync(() => {
          fixApiReference(stagedReferenceDir);
          return publishApiReference(stagedReferenceDir, referenceDir);
        });

        if (!publishResult.ok) {
          failed = true;
          apiReferenceConsole.error(
            "Publishing the API reference failed.",
            publishResult.error,
          );
        } else {
          changedMdxCount = publishResult.value.changedMdxPaths.length;
          deletedMdxCount = publishResult.value.deletedMdxPaths.length;
          for (const mdxPath of [
            ...publishResult.value.changedMdxPaths,
            ...publishResult.value.deletedMdxPaths,
          ]) {
            pendingMdxPaths.add(path.posix.join("docs/api-reference", mdxPath));
          }
        }
      }

      if (pendingMdxPaths.size > 0) {
        const sectionsResult = await tryAsync(() =>
          generateSections({
            docsDir,
            mdxPaths: [...pendingMdxPaths],
            outputPath: sectionsPath,
          }),
        );

        if (sectionsResult.ok) {
          sectionsChanged = sectionsResult.value;
          pendingMdxPaths.clear();
        } else {
          failed = true;
          apiReferenceConsole.error(
            "Generating documentation sections failed.",
            sectionsResult.error,
          );
        }
      }

      if (failed) return ok();

      const duration = (
        (run.deps.time.performance.now() - startedAt) /
        1000
      ).toFixed(1);
      apiReferenceConsole.info(
        `Updated in ${duration}s: ${changedMdxCount} changed, ${deletedMdxCount} removed${sectionsChanged ? ", sections changed" : ""}.`,
      );
      return ok();
    };

    await run.ok(updateApiReference);

    void watcherRun(async (run) => {
      for (;;) {
        await run.ok(generationRequested.wait);
        generationRequested.close();
        await run.ok(updateApiReference);
      }
    });

    return ok(disposer.move());
  };

/* node:coverage ignore next 5 */
if (import.meta.main) {
  await runMain({ spawn, subscribe: parcelWatcher.subscribe })(
    createApiReferenceWatcher(),
  );
}
