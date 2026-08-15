import {
  AbortError,
  createTime,
  err,
  ok,
  repeat,
  spaced,
  testCreateRun,
  timeout,
  waitForAbort,
  yieldNow,
} from "@evolu/common";
import type { Spawn } from "@evolu/nodejs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, type TestContext } from "node:test";
import { createApiReferenceWatcher, type SubscribeDep } from "./dev-docs.mts";

const setupSubscription = (): {
  readonly emit: (...paths: ReadonlyArray<string>) => void;
  readonly emitError: (error: Error) => void;
  readonly getUnsubscribeCount: () => number;
  readonly subscribe: SubscribeDep["subscribe"];
} => {
  let callback: Parameters<SubscribeDep["subscribe"]>[1] | undefined;
  let unsubscribeCount = 0;

  return {
    emit: (...paths) => {
      assert.ok(callback);
      callback(
        null,
        paths.map((path) => ({ path, type: "update" as const })),
      );
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

const setupDirectories = async (
  context: TestContext,
): Promise<{
  readonly docsDir: string;
  readonly referenceDir: string;
  readonly repositoryDir: string;
  readonly sectionsPath: string;
  readonly stagedReferenceDir: string;
  readonly typedocPath: string;
}> => {
  const repositoryDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "evolu-docs-watcher-"),
  );
  context.after(() => fs.rm(repositoryDir, { recursive: true }));
  const docsDir = path.join(repositoryDir, "docs");

  return {
    docsDir,
    referenceDir: path.join(docsDir, "docs/api-reference"),
    repositoryDir,
    sectionsPath: path.join(repositoryDir, "sections.json"),
    stagedReferenceDir: path.join(repositoryDir, "staged"),
    typedocPath: path.join(repositoryDir, "typedoc"),
  };
};

const writeStagedReference = async (
  stagedReferenceDir: string,
  heading: string,
): Promise<void> => {
  await fs.rm(stagedReferenceDir, { force: true, recursive: true });
  await fs.mkdir(stagedReferenceDir, { recursive: true });
  await fs.writeFile(
    path.join(stagedReferenceDir, "page.mdx"),
    `## ${heading}\n`,
  );
};

const waitFor = (predicate: () => boolean | Promise<boolean>) =>
  timeout(
    repeat(async () => ok(await predicate()), spaced("10ms"), {
      shouldRepeat: (conditionMet) => !conditionMet,
    }),
    "5s",
  );

void describe("API reference watcher", () => {
  void it("waits for the initial generation, coalesces changes, and disposes in-flight work", async (context) => {
    const directories = await setupDirectories(context);
    const subscription = setupSubscription();
    const secondGenerationStarted = Promise.withResolvers<void>();
    const continueSecondGeneration = Promise.withResolvers<void>();
    const fifthGenerationStarted = Promise.withResolvers<void>();
    let generationCount = 0;
    const spawn: Spawn = () => async (run) => {
      generationCount += 1;
      if (generationCount === 2) {
        secondGenerationStarted.resolve();
        await continueSecondGeneration.promise;
      }
      if (generationCount === 5) {
        fifthGenerationStarted.resolve();
        return await run(waitForAbort);
      }
      await writeStagedReference(
        directories.stagedReferenceDir,
        `Generation ${generationCount === 4 ? 3 : generationCount}`,
      );
      return ok();
    };
    await using run = testCreateRun({
      spawn,
      subscribe: subscription.subscribe,
      time: createTime(),
    });
    const watcher = await run.ok(createApiReferenceWatcher(directories));

    const sections = JSON.parse(
      await fs.readFile(directories.sectionsPath, "utf8"),
    ) as Record<string, Array<{ title: string }>>;
    assert.equal(sections["/docs/api-reference"].at(0)?.title, "Generation 1");
    assert.equal(generationCount, 1);

    subscription.emit(path.join(directories.repositoryDir, "apps/web/page.ts"));
    await run.ok(yieldNow);
    assert.equal(generationCount, 1);

    subscription.emit(
      path.join(directories.repositoryDir, "typedoc.base.json"),
    );
    subscription.emit(
      path.join(directories.repositoryDir, "packages/common/src/Array.tsx"),
    );
    subscription.emit(
      path.join(directories.repositoryDir, "packages/common/package.json"),
    );
    await secondGenerationStarted.promise;
    assert.equal(generationCount, 2);

    subscription.emit(
      path.join(directories.repositoryDir, "scripts/typedoc-plugin-evolu.mts"),
    );
    continueSecondGeneration.resolve();
    await run.orThrow(
      waitFor(async () => {
        if (generationCount !== 3) return false;
        const sections = JSON.parse(
          await fs.readFile(directories.sectionsPath, "utf8"),
        ) as Record<string, Array<{ title: string }>>;
        return sections["/docs/api-reference"].at(0)?.title === "Generation 3";
      }),
    );

    subscription.emit(path.join(directories.repositoryDir, "typedoc.json"));
    await run.orThrow(waitFor(() => generationCount === 4));
    await run.orThrow(
      waitFor(() =>
        run.deps.console
          .getEntriesSnapshot()
          .some((entry) =>
            String(entry.args[0]).endsWith("0 changed, 0 removed."),
          ),
      ),
    );
    subscription.emit(path.join(directories.repositoryDir, "typedoc.dev.json"));
    await fifthGenerationStarted.promise;
    await watcher[Symbol.asyncDispose]();

    assert.equal(subscription.getUnsubscribeCount(), 1);
    assert.equal(generationCount, 5);
  });

  void it("retains pending section paths until section generation succeeds", async (context) => {
    const directories = await setupDirectories(context);
    const subscription = setupSubscription();
    let generationCount = 0;
    const spawn: Spawn = () => async () => {
      generationCount += 1;
      await writeStagedReference(
        directories.stagedReferenceDir,
        "Retried sections",
      );
      return ok();
    };
    await fs.mkdir(directories.sectionsPath);
    await using run = testCreateRun({
      spawn,
      subscribe: subscription.subscribe,
      time: createTime(),
    });
    const watcher = await run.ok(createApiReferenceWatcher(directories));

    await run.orThrow(
      waitFor(() =>
        run.deps.console
          .getEntriesSnapshot()
          .some(
            (entry) =>
              entry.args[0] === "Generating documentation sections failed.",
          ),
      ),
    );
    await fs.rm(directories.sectionsPath, { recursive: true });
    subscription.emit(path.join(directories.repositoryDir, "typedoc.dev.json"));

    await run.orThrow(
      waitFor(async () => {
        try {
          const sections = JSON.parse(
            await fs.readFile(directories.sectionsPath, "utf8"),
          ) as Record<string, Array<{ title: string }>>;
          return (
            sections["/docs/api-reference"].at(0)?.title === "Retried sections"
          );
        } catch {
          return false;
        }
      }),
    );
    assert.equal(generationCount, 2);
    await watcher[Symbol.asyncDispose]();
  });

  void it("recovers from TypeDoc and publication failures", async (context) => {
    const directories = await setupDirectories(context);
    const subscription = setupSubscription();
    let generationCount = 0;
    const spawn: Spawn = () => async () => {
      generationCount += 1;
      if (generationCount === 1) {
        return err({
          type: "SpawnError",
          command: "typedoc",
          exitCode: 1,
          signal: null,
          message: "TypeDoc failed.",
        });
      }
      if (generationCount === 3) {
        await writeStagedReference(directories.stagedReferenceDir, "Recovered");
      }
      return ok();
    };
    await using run = testCreateRun({
      spawn,
      subscribe: subscription.subscribe,
      time: createTime(),
    });
    const watcher = await run.ok(createApiReferenceWatcher(directories));

    await run.orThrow(
      waitFor(() =>
        run.deps.console
          .getEntriesSnapshot()
          .some((entry) => entry.args[0] === "TypeDoc failed."),
      ),
    );
    subscription.emit(
      path.join(directories.repositoryDir, "packages/common/tsconfig.json"),
    );
    await run.orThrow(
      waitFor(() =>
        run.deps.console
          .getEntriesSnapshot()
          .some(
            (entry) => entry.args[0] === "Publishing the API reference failed.",
          ),
      ),
    );
    subscription.emit(
      path.join(directories.repositoryDir, "packages/common/typedoc.json"),
    );
    await run.orThrow(waitFor(() => generationCount === 3));
    await run.orThrow(
      waitFor(async () => {
        try {
          await fs.access(directories.sectionsPath);
          return true;
        } catch {
          return false;
        }
      }),
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
