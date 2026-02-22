import { describe, expect, expectTypeOf, test } from "vitest";
import { assert } from "../../src/Assert.js";
import type { Brand } from "../../src/Brand.js";
import type { ConsoleEntry, TestConsole } from "../../src/Console.js";
import { testCreateConsole } from "../../src/Console.js";
import { lazyVoid } from "../../src/Function.js";
import type {
  CreateDbWorker,
  DbWorker,
  DbWorkerInit,
} from "../../src/local-first/Db.js";
import {
  AppName,
  createEvolu,
  createEvoluDeps,
  testAppName,
} from "../../src/local-first/Evolu.js";
import type {
  EvoluInput,
  EvoluOutput,
  EvoluTabOutput,
  SharedWorker,
  SharedWorkerInput,
} from "../../src/local-first/Shared.js";
import { err, getOrThrow, ok } from "../../src/Result.js";
import { SqliteBoolean } from "../../src/Sqlite.js";
import { testCreateRun } from "../../src/Test.js";
import {
  createIdFromString,
  id,
  NonEmptyString100,
  nullOr,
} from "../../src/Type.js";
import type { ExtractType } from "../../src/Types.js";
import {
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateSharedWorker,
  testCreateWorker,
} from "../../src/Worker.js";
import { testAppOwner } from "./_fixtures.js";

const TodoId = id("Todo");
type TodoId = typeof TodoId.Type;

const Schema = {
  todo: {
    id: TodoId,
    title: NonEmptyString100,
    isCompleted: nullOr(SqliteBoolean),
  },
};

/**
 * Creates a test `Run` preconfigured with dependencies required by
 * {@link createEvolu}, including test probes exposed on `run.deps`.
 */
const testCreateEvoluRun = () => testCreateRun(testCreateEvoluDeps());

const testCreateEvoluDeps = () => {
  const worker = testCreateSharedWorker<SharedWorkerInput>();
  const evoluInputs: Array<EvoluInput> = [];
  let postEvoluOutput: ((output: EvoluOutput) => void) | null = null;

  worker.self.onConnect = (port) => {
    port.onMessage = (message) => {
      if (message.type !== "CreateEvolu") return;
      const evoluPort = testCreateMessagePort<EvoluOutput, EvoluInput>(
        message.evoluPort,
      );
      evoluPort.onMessage = (input) => {
        evoluInputs.push(input);
      };
      postEvoluOutput = (output) => {
        evoluPort.postMessage(output);
      };
    };
  };
  worker.connect();

  return {
    createDbWorker: testCreateWorker,
    createMessageChannel: testCreateMessageChannel,
    reloadApp: lazyVoid,
    sharedWorker: worker,
    evoluInputs,
    postEvoluOutput: (output: EvoluOutput) => {
      assert(postEvoluOutput, "postEvoluOutput is not available");
      postEvoluOutput(output);
    },
  };
};

/** Preconfigured `createEvolu` task for this test schema and fixed app owner. */
const testCreateEvolu = createEvolu(Schema, {
  appName: testAppName,
  appOwner: testAppOwner,
});

test("AppName", () => {
  expect(AppName.from("my-app")).toEqual(ok("my-app"));
  expect(AppName.from("")).toEqual(
    err({
      type: "Regex",
      name: "UrlSafeString",
      pattern: /^[A-Za-z0-9_-]+$/,
      value: "",
    }),
  );
  expect(AppName.from("a".repeat(41))).toEqual(ok("a".repeat(41)));
  expect(AppName.from("a".repeat(42))).toEqual(
    err({
      type: "AppName",
      value: "a".repeat(42),
    }),
  );

  const appName = AppName.orThrow("my-app");
  expectTypeOf(appName).toExtend<string & Brand<"AppName">>();
  expectTypeOf(AppName.Input).toEqualTypeOf<string>();
  expectTypeOf(AppName.Parent).toEqualTypeOf<string & Brand<"UrlSafeString">>();
});

describe("createEvoluDeps", () => {
  const setupCreateEvoluDeps = (console: TestConsole = testCreateConsole()) => {
    const worker = testCreateSharedWorker<SharedWorkerInput>();

    const messages: Array<SharedWorkerInput> = [];
    worker.self.onConnect = (port) => {
      port.onMessage = (message) => messages.push(message);
    };
    worker.connect();

    const deps = createEvoluDeps({
      createDbWorker: testCreateWorker,
      createMessageChannel: testCreateMessageChannel,
      sharedWorker: worker,
      reloadApp: lazyVoid,
      console,
    });

    expect(messages).toHaveLength(1);
    const initTab = messages[0];
    expect(initTab.type).toBe("InitTab");
    assert(initTab.type === "InitTab", "InitTab message is missing");
    const workerPort = testCreateMessagePort<EvoluTabOutput>(initTab.port);

    return { deps, messages, workerPort };
  };

  test("posts InitTab with port to worker", () => {
    const { messages } = setupCreateEvoluDeps(testCreateConsole());

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe("InitTab");
  });

  test("falls back to default console when not provided", () => {
    const originalConsoleError = globalThis.console.error;
    const consoleErrors: Array<ReadonlyArray<unknown>> = [];
    globalThis.console.error = ((...args: ReadonlyArray<unknown>) => {
      consoleErrors.push(args);
    }) as typeof globalThis.console.error;

    try {
      const worker = testCreateSharedWorker<SharedWorkerInput>();
      const messages: Array<SharedWorkerInput> = [];

      worker.self.onConnect = (port) => {
        port.onMessage = (message) => messages.push(message);
      };
      worker.connect();

      const deps = createEvoluDeps({
        createDbWorker: testCreateWorker,
        createMessageChannel: testCreateMessageChannel,
        sharedWorker: worker,
        reloadApp: lazyVoid,
      });

      expect(messages).toHaveLength(1);
      const initTab = messages[0];
      expect(initTab.type).toBe("InitTab");
      assert(initTab.type === "InitTab", "InitTab message is missing");
      const workerPort = testCreateMessagePort<EvoluTabOutput>(initTab.port);

      workerPort.postMessage({
        type: "OnConsoleEntry",
        entry: { method: "error", path: ["global"], args: ["boom"] },
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe("InitTab");
      expect(deps.evoluError.get()).toEqual({
        type: "UnknownError",
        error: ["boom"],
      });
      expect(consoleErrors).toEqual([["boom"]]);
    } finally {
      globalThis.console.error = originalConsoleError;
    }
  });

  test("wires console channel to console.write", () => {
    const console = testCreateConsole();
    const { workerPort } = setupCreateEvoluDeps(console);

    const entry: ConsoleEntry = {
      method: "info",
      path: ["test"],
      args: ["hello"],
    };
    workerPort.postMessage({ type: "OnConsoleEntry", entry });

    expect(console.getEntriesSnapshot()).toEqual([entry]);
  });

  test("maps ConsoleEntry error output to deps.evoluError store", () => {
    const { deps, workerPort } = setupCreateEvoluDeps();

    const entry: ConsoleEntry = {
      method: "error",
      path: ["global"],
      args: ["error", { type: "UnknownError", error: "boom" }],
    };

    workerPort.postMessage({ type: "OnConsoleEntry", entry });

    expect(deps.evoluError.get()).toEqual({
      type: "UnknownError",
      error: ["error", { type: "UnknownError", error: "boom" }],
    });
  });

  test("wraps single-arg ConsoleEntry error output to UnknownError", () => {
    const { deps, workerPort } = setupCreateEvoluDeps();

    workerPort.postMessage({
      type: "OnConsoleEntry",
      entry: { method: "error", path: ["global"], args: ["boom"] },
    });

    expect(deps.evoluError.get()).toEqual({
      type: "UnknownError",
      error: ["boom"],
    });
  });

  test("wraps multi-arg ConsoleEntry error output to UnknownError", () => {
    const { deps, workerPort } = setupCreateEvoluDeps();

    workerPort.postMessage({
      type: "OnConsoleEntry",
      entry: { method: "error", path: ["global"], args: ["error", "boom"] },
    });

    expect(deps.evoluError.get()).toEqual({
      type: "UnknownError",
      error: ["error", "boom"],
    });
  });

  test("wires EvoluError output to deps.evoluError store", () => {
    const { deps, workerPort } = setupCreateEvoluDeps();

    const error = { type: "UnknownError", error: "boom" } as const;
    workerPort.postMessage({ type: "OnError", error });

    expect(deps.evoluError.get()).toEqual(error);
  });

  test("throws for unknown tab output type", () => {
    const { workerPort } = setupCreateEvoluDeps();

    expect(() => {
      workerPort.postMessage({ type: "Unknown" } as never);
    }).toThrow();
  });

  test("dispose cleans up resources", () => {
    const worker = testCreateSharedWorker<SharedWorkerInput>();
    worker.self.onConnect = (port) => {
      port.onMessage = lazyVoid;
    };
    worker.connect();

    const channels: Array<{ readonly isDisposed: () => boolean }> = [];
    let workerDisposed = false;
    const sharedWorker: SharedWorker = {
      port: worker.port,
      [Symbol.dispose]: () => {
        workerDisposed = true;
        worker[Symbol.dispose]();
      },
    };

    const deps = createEvoluDeps({
      createDbWorker: testCreateWorker,
      createMessageChannel: <Input, Output = never>() => {
        const channel = testCreateMessageChannel<Input, Output>();
        channels.push(channel);
        return channel;
      },
      sharedWorker,
      reloadApp: lazyVoid,
    });

    expect(channels).toHaveLength(1);
    expect(channels[0].isDisposed()).toBe(false);
    expect(workerDisposed).toBe(false);
    deps[Symbol.dispose]();
    expect(channels[0].isDisposed()).toBe(true);
    expect(workerDisposed).toBe(true);
  });
});

describe("createEvolu", () => {
  test("initializes db worker with resolved name", async () => {
    const dbWorkerMessages: Array<DbWorkerInit> = [];

    const createDbWorker: CreateDbWorker = () => {
      const worker = testCreateWorker<DbWorkerInit>();
      worker.self.onMessage = (message) => {
        dbWorkerMessages.push(message);
      };
      return worker as DbWorker;
    };

    await using run = testCreateRun({
      createDbWorker,
      createMessageChannel: testCreateMessageChannel,
      reloadApp: lazyVoid,
      sharedWorker: testCreateSharedWorker<SharedWorkerInput>(),
    });

    const evolu = getOrThrow(await run(testCreateEvolu));

    expect(dbWorkerMessages).toHaveLength(1);
    expect(dbWorkerMessages[0]).toEqual(
      expect.objectContaining({
        type: "Init",
        name: evolu.name,
      }),
    );
  });

  test("resolves name from appName and appOwner hash", async () => {
    await using run = testCreateEvoluRun();

    const evolu = getOrThrow(await run(testCreateEvolu));
    const expectedSuffix = createIdFromString(testAppOwner.id);
    expect(evolu.name).toBe(`AppName-${expectedSuffix}`);
  });

  test("appOwner from config is exposed as evolu.appOwner", async () => {
    await using run = testCreateEvoluRun();

    const evolu = getOrThrow(await run(testCreateEvolu));

    expect(evolu.appOwner).toBe(testAppOwner);
  });

  test("appOwner is created when omitted from config", async () => {
    await using run = testCreateEvoluRun();

    const evolu = getOrThrow(
      await run(createEvolu(Schema, { appName: testAppName })),
    );

    expect(evolu.appOwner).toMatchInlineSnapshot(`
      {
        "encryptionKey": uint8:[50,42,177,193,76,197,92,240,100,30,92,209,205,42,108,45,195,37,118,158,238,206,161,144,11,241,190,167,14,254,186,53],
        "id": "t_xEbmXuICrgDm3Ob0_afw",
        "mnemonic": "old jungle over boy ankle suggest service source civil insane end silver polar swap flight diagram keep fix gauge social wink subway bronze leader",
        "type": "AppOwner",
        "writeKey": uint8:[129,228,239,103,127,237,0,59,174,241,77,12,26,180,213,14],
      }
    `);
  });
});

describe("dispose evolu", () => {
  test("posts Dispose message", async () => {
    await using run = testCreateEvoluRun();

    const evolu = getOrThrow(await run(testCreateEvolu));
    await evolu[Symbol.asyncDispose]();

    expect(run.deps.evoluInputs).toEqual([{ type: "Dispose" }]);
  });

  test("fails pending export and posts Dispose", async () => {
    await using run = testCreateEvoluRun();
    const evolu = getOrThrow(await run(testCreateEvolu));

    const exportFiber = run(evolu.exportDatabase);

    expect(run.deps.evoluInputs).toEqual([{ type: "Export" }]);

    await evolu[Symbol.asyncDispose]();

    await expect(exportFiber).resolves.toEqual(
      err({ type: "DeferredDisposedError" }),
    );
    expect(run.deps.evoluInputs).toEqual([
      { type: "Export" },
      { type: "Dispose" },
    ]);
  });

  test("cancels pending mutation microtask batch", async () => {
    await using run = testCreateEvoluRun();
    const evolu = getOrThrow(await run(testCreateEvolu));

    evolu.insert("todo", {
      title: NonEmptyString100.orThrow("Queued then disposed"),
    });

    await evolu[Symbol.asyncDispose]();

    expect(run.deps.evoluInputs).toMatchInlineSnapshot(`
      [
        {
          "type": "Dispose",
        },
      ]
    `);
  });

  test("disposes internal message channels", async () => {
    const baseDeps = testCreateEvoluDeps();
    const channels: Array<{ readonly isDisposed: () => boolean }> = [];

    await using run = testCreateRun({
      ...baseDeps,
      createMessageChannel: <Input, Output = never>() => {
        const channel = testCreateMessageChannel<Input, Output>();
        channels.push(channel);
        return channel;
      },
    });

    const evolu = getOrThrow(await run(testCreateEvolu));

    expect(channels).toHaveLength(2);
    expect(channels[0].isDisposed()).toBe(false);
    expect(channels[1].isDisposed()).toBe(false);

    await evolu[Symbol.asyncDispose]();

    expect(channels[0].isDisposed()).toBe(true);
    expect(channels[1].isDisposed()).toBe(true);
  });

  test("does not execute mutate onComplete callback after dispose", async () => {
    await using run = testCreateEvoluRun();
    const evolu = getOrThrow(await run(testCreateEvolu));

    let called = 0;
    evolu.insert(
      "todo",
      { title: NonEmptyString100.orThrow("With completion") },
      {
        onComplete: () => {
          called += 1;
        },
      },
    );

    await Promise.resolve();

    const mutate = run.deps.evoluInputs[0] as ExtractType<EvoluInput, "Mutate">;
    const [onCompleteId] = mutate.onCompleteIds;

    await evolu[Symbol.asyncDispose]();

    run.deps.postEvoluOutput({
      type: "OnQueryPatches",
      queryPatches: [],
      onCompleteIds: [onCompleteId],
    });

    expect(called).toBe(0);
  });

  test("executes mutate onComplete callback when query patches are received", async () => {
    await using run = testCreateEvoluRun();
    const evolu = getOrThrow(await run(testCreateEvolu));

    let called = 0;
    evolu.insert(
      "todo",
      { title: NonEmptyString100.orThrow("With completion") },
      {
        onComplete: () => {
          called += 1;
        },
      },
    );

    await Promise.resolve();

    const mutate = run.deps.evoluInputs[0] as ExtractType<EvoluInput, "Mutate">;
    const [onCompleteId] = mutate.onCompleteIds;

    run.deps.postEvoluOutput({
      type: "OnQueryPatches",
      queryPatches: [],
      onCompleteIds: [onCompleteId],
    });

    expect(called).toBe(1);
  });

  test("uses flushSync for query patches with onComplete callbacks", async () => {
    let flushSyncCalls = 0;

    await using run = testCreateRun({
      ...testCreateEvoluDeps(),
      flushSync: (callback: () => void) => {
        flushSyncCalls += 1;
        callback();
      },
    });

    const evolu = getOrThrow(await run(testCreateEvolu));

    let called = 0;
    evolu.insert(
      "todo",
      { title: NonEmptyString100.orThrow("With completion") },
      {
        onComplete: () => {
          called += 1;
        },
      },
    );

    await Promise.resolve();

    const mutate = run.deps.evoluInputs[0] as ExtractType<EvoluInput, "Mutate">;
    const [onCompleteId] = mutate.onCompleteIds;

    run.deps.postEvoluOutput({
      type: "OnQueryPatches",
      queryPatches: [],
      onCompleteIds: [onCompleteId],
    });

    expect(flushSyncCalls).toBe(1);
    expect(called).toBe(1);
  });

  test("does not use flushSync when query patches have no onComplete callbacks", async () => {
    let flushSyncCalls = 0;

    await using run = testCreateRun({
      ...testCreateEvoluDeps(),
      flushSync: (callback: () => void) => {
        flushSyncCalls += 1;
        callback();
      },
    });

    getOrThrow(await run(testCreateEvolu));

    run.deps.postEvoluOutput({
      type: "OnQueryPatches",
      queryPatches: [],
      onCompleteIds: [],
    });

    expect(flushSyncCalls).toBe(0);
  });
});

describe("worker outputs", () => {
  test("ignores RefreshQueries when there are no subscribed queries", async () => {
    await using run = testCreateEvoluRun();
    getOrThrow(await run(testCreateEvolu));

    run.deps.postEvoluOutput({ type: "RefreshQueries" });

    expect(run.deps.evoluInputs).toEqual([]);
  });

  test("throws for unknown evolu output type", async () => {
    await using run = testCreateEvoluRun();
    getOrThrow(await run(testCreateEvolu));

    expect(() => {
      run.deps.postEvoluOutput({ type: "Unknown" } as never);
    }).toThrow();
  });
});

describe("mutations", () => {
  test("insert posts mutate with generated id and stripped values", async () => {
    await using run = testCreateEvoluRun();
    const evolu = getOrThrow(await run(testCreateEvolu));

    evolu.insert("todo", {
      title: NonEmptyString100.orThrow("Todo 1"),
    });

    await Promise.resolve();

    expect(run.deps.evoluInputs).toMatchInlineSnapshot(
      [
        {
          changes: [
            {
              id: expect.any(String),
            },
          ],
        },
      ],
      `
      [
        {
          "changes": [
            {
              "id": Any<String>,
              "isDelete": null,
              "isInsert": true,
              "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
              "table": "todo",
              "values": {
                "title": "Todo 1",
              },
            },
          ],
          "onCompleteIds": [],
          "subscribedQueries": Set {},
          "type": "Mutate",
        },
      ]
      `,
    );
  });

  test("update and upsert preserve passed id and set isInsert correctly", async () => {
    await using run = testCreateEvoluRun();
    const evolu = getOrThrow(await run(testCreateEvolu));

    const updateId = TodoId.orThrow(createIdFromString("todo-update"));
    const upsertId = TodoId.orThrow(createIdFromString("todo-upsert"));

    evolu.update("todo", {
      id: updateId,
      title: NonEmptyString100.orThrow("Updated"),
      isDeleted: 1,
    });

    evolu.upsert("todo", {
      id: upsertId,
      title: NonEmptyString100.orThrow("Upserted"),
    });

    await Promise.resolve();

    expect(run.deps.evoluInputs).toMatchInlineSnapshot(
      [
        {
          changes: [
            {
              id: updateId,
            },
            {
              id: upsertId,
            },
          ],
        },
      ],
      `
      [
        {
          "changes": [
            {
              "id": "VPIPiOGb2m2OlsM-pg18CA",
              "isDelete": true,
              "isInsert": false,
              "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
              "table": "todo",
              "values": {
                "title": "Updated",
              },
            },
            {
              "id": "j4rh6UkYDIqXKLCOX4ru2A",
              "isDelete": null,
              "isInsert": true,
              "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
              "table": "todo",
              "values": {
                "title": "Upserted",
              },
            },
          ],
          "onCompleteIds": [],
          "subscribedQueries": Set {},
          "type": "Mutate",
        },
      ]
      `,
    );
  });

  test("coalesces insert, update, and upsert in one microtask", async () => {
    await using run = testCreateEvoluRun();
    const evolu = getOrThrow(await run(testCreateEvolu));

    const updateId = TodoId.orThrow(createIdFromString("todo-batch-update"));
    const upsertId = TodoId.orThrow(createIdFromString("todo-batch-upsert"));

    evolu.insert("todo", { title: NonEmptyString100.orThrow("A") });
    evolu.update("todo", {
      id: updateId,
      title: NonEmptyString100.orThrow("B"),
    });
    evolu.upsert("todo", {
      id: upsertId,
      title: NonEmptyString100.orThrow("C"),
    });

    await Promise.resolve();

    expect(run.deps.evoluInputs).toMatchInlineSnapshot(
      [
        {
          changes: [
            {
              id: expect.any(String),
            },
            {
              id: updateId,
            },
            {
              id: upsertId,
            },
          ],
        },
      ],
      `
      [
        {
          "changes": [
            {
              "id": Any<String>,
              "isDelete": null,
              "isInsert": true,
              "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
              "table": "todo",
              "values": {
                "title": "A",
              },
            },
            {
              "id": "fOTG65tQ_ZYHpSBp3GbogA",
              "isDelete": null,
              "isInsert": false,
              "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
              "table": "todo",
              "values": {
                "title": "B",
              },
            },
            {
              "id": "3I1Sfwp5IxdacWcpAna5qg",
              "isDelete": null,
              "isInsert": true,
              "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
              "table": "todo",
              "values": {
                "title": "C",
              },
            },
          ],
          "onCompleteIds": [],
          "subscribedQueries": Set {},
          "type": "Mutate",
        },
      ]
      `,
    );
  });

  test("includes ownerId and onComplete callback ids", async () => {
    await using run = testCreateEvoluRun();
    const evolu = getOrThrow(await run(testCreateEvolu));

    evolu.insert(
      "todo",
      { title: NonEmptyString100.orThrow("With callback") },
      { ownerId: testAppOwner.id, onComplete: lazyVoid },
    );

    await Promise.resolve();

    expect(run.deps.evoluInputs).toMatchInlineSnapshot(
      [
        {
          changes: [
            {
              id: expect.any(String),
            },
          ],
          onCompleteIds: [expect.any(String)],
        },
      ],
      `
      [
        {
          "changes": [
            {
              "id": Any<String>,
              "isDelete": null,
              "isInsert": true,
              "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
              "table": "todo",
              "values": {
                "title": "With callback",
              },
            },
          ],
          "onCompleteIds": [
            Any<String>,
          ],
          "subscribedQueries": Set {},
          "type": "Mutate",
        },
      ]
      `,
    );
  });
});

describe("exportDatabase", () => {
  test("exports database for one caller", async () => {
    await using run = testCreateEvoluRun();
    const evolu = getOrThrow(await run(testCreateEvolu));

    const exportFiber = run(evolu.exportDatabase);

    expect(run.deps.evoluInputs).toEqual([{ type: "Export" }]);

    const file = new Uint8Array([1, 2, 3]);
    run.deps.postEvoluOutput({ type: "OnExport", file });

    expect(await exportFiber).toEqual(ok(file));
  });

  test("aborts export for one caller", async () => {
    await using run = testCreateEvoluRun();
    const evolu = getOrThrow(await run(testCreateEvolu));

    const exportFiber = run(evolu.exportDatabase);

    expect(run.deps.evoluInputs).toEqual([{ type: "Export" }]);

    exportFiber.abort();
    await expect(exportFiber).resolves.toEqual(
      err({ type: "AbortError", reason: undefined }),
    );
  });

  test("shares pending export and resolves both callers", async () => {
    await using run = testCreateEvoluRun();
    const evolu = getOrThrow(await run(testCreateEvolu));

    const firstExport = run(evolu.exportDatabase);
    const secondExport = run(evolu.exportDatabase);

    expect(run.deps.evoluInputs).toEqual([{ type: "Export" }]);

    const firstFile = new Uint8Array([1, 2, 3]);
    run.deps.postEvoluOutput({ type: "OnExport", file: firstFile });

    expect(await firstExport).toEqual(ok(firstFile));
    expect(await secondExport).toEqual(ok(firstFile));

    const thirdExport = run(evolu.exportDatabase);
    expect(run.deps.evoluInputs).toEqual([
      { type: "Export" },
      { type: "Export" },
    ]);

    const secondFile = new Uint8Array([4, 5, 6]);
    run.deps.postEvoluOutput({ type: "OnExport", file: secondFile });

    expect(await thirdExport).toEqual(ok(secondFile));
  });

  test("aborting one of two pending callers does not abort the other", async () => {
    await using run = testCreateEvoluRun();
    const evolu = getOrThrow(await run(testCreateEvolu));

    const firstExport = run(evolu.exportDatabase);
    const secondExport = run(evolu.exportDatabase);

    expect(run.deps.evoluInputs).toEqual([{ type: "Export" }]);

    firstExport.abort();

    const file = new Uint8Array([7, 8, 9]);
    run.deps.postEvoluOutput({ type: "OnExport", file });

    await expect(firstExport).resolves.toEqual(
      err({ type: "AbortError", reason: undefined }),
    );
    expect(await secondExport).toEqual(ok(file));
  });
});
