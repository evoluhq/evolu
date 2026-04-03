import { describe, expect, expectTypeOf, test } from "vitest";
import type { NonEmptyReadonlyArray } from "../../src/Array.js";
import { assert } from "../../src/Assert.js";
import type { Brand } from "../../src/Brand.js";
import type { ConsoleEntry, TestConsole } from "../../src/Console.js";
import {
  createConsoleStoreOutput,
  testCreateConsole,
} from "../../src/Console.js";
import { lazyVoid } from "../../src/Function.js";
import type {
  CreateDbWorker,
  DbWorker,
  DbWorkerInit,
} from "../../src/local-first/Db.js";
import { startDbWorker } from "../../src/local-first/Db.js";
import {
  AppName,
  createEvolu,
  createEvoluDeps,
  testAppName,
  type Evolu,
  type EvoluPlatformDeps,
} from "../../src/local-first/Evolu.js";
import {
  createOwnerWebSocketTransport,
  type Owner,
  type OwnerTransport,
  type ReadonlyOwner,
} from "../../src/local-first/Owner.js";
import { createQueryBuilder } from "../../src/local-first/Schema.js";
import {
  initSharedWorker,
  type EvoluInput,
  type EvoluOutput,
  type EvoluTabOutput,
  type SharedWorker,
  type SharedWorkerInput,
} from "../../src/local-first/Shared.js";
import { err, ok } from "../../src/Result.js";
import {
  createSqlite,
  getSqliteSnapshot,
  SqliteBoolean,
  type CreateSqliteDriver,
  type SqliteDriverOptions,
} from "../../src/Sqlite.js";
import { createInMemoryLeaderLock, type Task } from "../../src/Task.js";
import { testCreateRun } from "../../src/Test.js";
import {
  createIdFromString,
  id,
  NonEmptyString100,
  nullOr,
  testName,
} from "../../src/Type.js";
import type { ExtractType } from "../../src/Types.js";
import { testCreateWebSocket } from "../../src/WebSocket.js";
import {
  createMessageChannel,
  createMessagePort,
  createSharedWorker,
  createWorker,
  testCreateMessageChannel,
  testCreateMessagePort,
  testCreateSharedWorker,
  testCreateWorker,
  testWaitForWorkerMessage,
} from "../../src/Worker.js";
import { testCreateSqliteDep } from "../_deps.js";
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

const testCreateEvolu = createEvolu(Schema, {
  appName: testAppName,
  appOwner: testAppOwner,
  transports: [],
});

const testOwnerTransport = createOwnerWebSocketTransport({
  url: "wss://example.com",
  ownerId: testAppOwner.id,
});

const createQuery = createQueryBuilder(Schema);

const todoTitleQuery = createQuery((db) =>
  db.selectFrom("todo").select(["title"]).orderBy("createdAt"),
);

const todoTitleDescQuery = createQuery((db) =>
  db.selectFrom("todo").select(["title"]).orderBy("createdAt", "desc"),
);

const todoByCreatedAtQuery = createQuery((db) =>
  db.selectFrom("todo").select(["id", "title"]).orderBy("createdAt"),
);

describe("unit tests", () => {
  const setupRunWithEvoluDeps = async (
    overrides: Partial<EvoluPlatformDeps> = {},
  ) => {
    await using stack = new AsyncDisposableStack();

    const sharedWorker = stack.use(testCreateSharedWorker<SharedWorkerInput>());

    const evoluInputs: Array<EvoluInput> = [];
    let evoluPort: {
      onMessage: ((input: EvoluInput) => void) | null;
      readonly postMessage: (output: EvoluOutput) => void;
    } | null = null;
    const queuedEvoluOutputs: Array<EvoluOutput> = [];

    sharedWorker.self.onConnect = (port) => {
      port.onMessage = (message) => {
        if (message.type !== "CreateEvolu") return;
        evoluPort = testCreateMessagePort<EvoluOutput, EvoluInput>(
          message.evoluPort,
        );
        evoluPort.onMessage = (input) => {
          evoluInputs.push(input);
        };
        for (const output of queuedEvoluOutputs) {
          evoluPort.postMessage(output);
        }
        queuedEvoluOutputs.length = 0;
      };
    };
    sharedWorker.connect();

    const postEvoluOutput = (output: EvoluOutput) => {
      if (evoluPort) {
        evoluPort.postMessage(output);
        return;
      }
      queuedEvoluOutputs.push(output);
    };

    const evoluDeps: EvoluPlatformDeps = {
      createDbWorker: testCreateWorker,
      createMessageChannel: testCreateMessageChannel,
      reloadApp: lazyVoid,
      sharedWorker,
      ...overrides,
    };
    const run = stack.use(testCreateRun(evoluDeps));
    const moved = stack.move();

    return {
      run,
      evoluInputs,
      postEvoluOutput,
      [Symbol.asyncDispose]: () => moved.disposeAsync(),
    };
  };

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
    expectTypeOf(AppName.Parent).toEqualTypeOf<
      string & Brand<"UrlSafeString">
    >();
  });

  describe("createEvoluDeps", () => {
    const setupCreateEvoluDeps = async (
      console: TestConsole = testCreateConsole(),
    ): Promise<{
      readonly deps: ReturnType<typeof createEvoluDeps>;
      readonly messages: Array<SharedWorkerInput>;
      readonly workerPort: {
        readonly postMessage: (message: EvoluTabOutput) => void;
      };
      readonly [Symbol.dispose]: () => void;
    }> => {
      using stack = new DisposableStack();
      const worker = stack.use(testCreateSharedWorker<SharedWorkerInput>());

      const messages: Array<SharedWorkerInput> = [];
      worker.self.onConnect = (port) => {
        port.onMessage = (message) => messages.push(message);
      };
      worker.connect();

      const deps = stack.use(
        createEvoluDeps({
          createDbWorker: testCreateWorker,
          createMessageChannel: testCreateMessageChannel,
          sharedWorker: worker,
          reloadApp: lazyVoid,
          console,
        }),
      );

      await testWaitForWorkerMessage();

      expect(messages).toHaveLength(1);
      const initTab = messages[0];
      expect(initTab.type).toBe("InitTab");
      assert(initTab.type === "InitTab", "InitTab message is missing");
      const workerPort = testCreateMessagePort<EvoluTabOutput>(initTab.port);
      const moved = stack.move();

      return {
        deps,
        messages,
        workerPort,
        [Symbol.dispose]: () => moved.dispose(),
      };
    };

    test("posts InitTab with port to worker", async () => {
      using setup = await setupCreateEvoluDeps(testCreateConsole());
      const { messages } = setup;

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe("InitTab");
    });

    test("falls back to default console when not provided", async () => {
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

        await testWaitForWorkerMessage();

        expect(messages).toHaveLength(1);
        const initTab = messages[0];
        expect(initTab.type).toBe("InitTab");
        assert(initTab.type === "InitTab", "InitTab message is missing");
        const workerPort = testCreateMessagePort<EvoluTabOutput>(initTab.port);

        workerPort.postMessage({
          type: "OnConsoleEntry",
          entry: { method: "error", path: ["global"], args: ["boom"] },
        });

        await testWaitForWorkerMessage();

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

    test("wires console channel to console.write", async () => {
      const console = testCreateConsole();
      using setup = await setupCreateEvoluDeps(console);
      const { workerPort } = setup;

      const entry: ConsoleEntry = {
        method: "info",
        path: ["test"],
        args: ["hello"],
      };
      workerPort.postMessage({ type: "OnConsoleEntry", entry });

      await testWaitForWorkerMessage();

      expect(console.getEntriesSnapshot()).toEqual([entry]);
    });

    test("maps ConsoleEntry error output to deps.evoluError store", async () => {
      using setup = await setupCreateEvoluDeps();
      const { deps, workerPort } = setup;

      const entry: ConsoleEntry = {
        method: "error",
        path: ["global"],
        args: ["error", { type: "UnknownError", error: "boom" }],
      };

      workerPort.postMessage({ type: "OnConsoleEntry", entry });

      await testWaitForWorkerMessage();

      expect(deps.evoluError.get()).toEqual({
        type: "UnknownError",
        error: ["error", { type: "UnknownError", error: "boom" }],
      });
    });

    test("wraps single-arg ConsoleEntry error output to UnknownError", async () => {
      using setup = await setupCreateEvoluDeps();
      const { deps, workerPort } = setup;

      workerPort.postMessage({
        type: "OnConsoleEntry",
        entry: { method: "error", path: ["global"], args: ["boom"] },
      });

      await testWaitForWorkerMessage();

      expect(deps.evoluError.get()).toEqual({
        type: "UnknownError",
        error: ["boom"],
      });
    });

    test("wraps multi-arg ConsoleEntry error output to UnknownError", async () => {
      using setup = await setupCreateEvoluDeps();
      const { deps, workerPort } = setup;

      workerPort.postMessage({
        type: "OnConsoleEntry",
        entry: { method: "error", path: ["global"], args: ["error", "boom"] },
      });

      await testWaitForWorkerMessage();

      expect(deps.evoluError.get()).toEqual({
        type: "UnknownError",
        error: ["error", "boom"],
      });
    });

    test("wires EvoluError output to deps.evoluError store", async () => {
      using setup = await setupCreateEvoluDeps();
      const { deps, workerPort } = setup;

      const error = { type: "UnknownError", error: "boom" } as const;
      workerPort.postMessage({ type: "OnError", error });

      await testWaitForWorkerMessage();

      expect(deps.evoluError.get()).toEqual(error);
    });

    test("throws for unknown tab output type", () => {
      const channels: Array<{
        readonly port2: {
          onMessage: ((message: EvoluTabOutput) => void) | null;
        };
      }> = [];

      createEvoluDeps({
        createDbWorker: testCreateWorker,
        createMessageChannel: <Input, Output = never>() => {
          const channel = testCreateMessageChannel<Input, Output>();
          channels.push(channel as never);
          return channel;
        },
        sharedWorker: testCreateSharedWorker<SharedWorkerInput>(),
        reloadApp: lazyVoid,
      });

      const tabChannel = channels.find((channel) => channel.port2.onMessage);
      assert(tabChannel?.port2.onMessage, "Expected tab channel handler");

      expect(() => {
        tabChannel.port2.onMessage?.({ type: "Unknown" } as never);
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

      const evolu = await run.orThrow(testCreateEvolu);

      await testWaitForWorkerMessage();

      expect(dbWorkerMessages).toHaveLength(1);
      expect(dbWorkerMessages[0]).toEqual(
        expect.objectContaining({
          type: "Init",
          name: evolu.name,
          memoryOnly: false,
        }),
      );
    });

    test("forwards memoryOnly to db worker init", async () => {
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

      await run.orThrow(
        createEvolu(Schema, {
          appName: testAppName,
          appOwner: testAppOwner,
          transports: [],
          memoryOnly: true,
        }),
      );

      await testWaitForWorkerMessage();

      expect(dbWorkerMessages).toHaveLength(1);
      expect(dbWorkerMessages[0]).toEqual(
        expect.objectContaining({
          type: "Init",
          memoryOnly: true,
        }),
      );
    });

    test("resolves name from appName and appOwner hash", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;

      const evolu = await run.orThrow(testCreateEvolu);
      const expectedSuffix = createIdFromString(testAppOwner.id);
      expect(evolu.name).toBe(`AppName-${expectedSuffix}`);
    });

    test("appOwner from config is exposed as evolu.appOwner", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;

      const evolu = await run.orThrow(testCreateEvolu);

      expect(evolu.appOwner).toBe(testAppOwner);
    });

    test("infers default useOwner transports from config", () => {
      const task = createEvolu(Schema, {
        appName: testAppName,
        appOwner: testAppOwner,
      });

      expectTypeOf(task).toEqualTypeOf<
        Task<Evolu<typeof Schema>, never, EvoluPlatformDeps>
      >();

      expectTypeOf<
        Parameters<Evolu<typeof Schema>["useOwner"]>
      >().toEqualTypeOf<
        [
          owner: ReadonlyOwner | Owner,
          transports?: NonEmptyReadonlyArray<OwnerTransport>,
        ]
      >();
    });

    describe("useOwner", () => {
      test("auto-uses appOwner in a microtask when transports are configured", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        await run.orThrow(
          createEvolu(Schema, {
            appName: testAppName,
            appOwner: testAppOwner,
            transports: [testOwnerTransport],
          }),
        );

        expect(evoluInputs).toEqual([]);

        await testWaitForWorkerMessage();

        expect(evoluInputs).toEqual([
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "add",
              },
            ],
          },
        ]);
      });

      test("posts in a microtask with fallback transports", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.orThrow(
          createEvolu(Schema, {
            appName: testAppName,
            appOwner: testAppOwner,
            transports: [testOwnerTransport],
          }),
        );

        await testWaitForWorkerMessage();
        evoluInputs.length = 0;

        evolu.useOwner(testAppOwner);

        expect(evoluInputs).toEqual([]);

        await testWaitForWorkerMessage();

        expect(evoluInputs).toEqual([
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "add",
              },
            ],
          },
        ]);
      });

      test("preserves same-tick add and remove order", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.orThrow(testCreateEvolu);

        const unuseOwner = evolu.useOwner(testAppOwner, [testOwnerTransport]);
        unuseOwner();

        expect(evoluInputs).toEqual([]);

        await testWaitForWorkerMessage();

        expect(evoluInputs).toEqual([
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "add",
              },
              {
                owner: {
                  owner: testAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "remove",
              },
            ],
          },
        ]);
      });

      test("throws when unuseOwner is called twice", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.orThrow(testCreateEvolu);

        const unuseOwner = evolu.useOwner(testAppOwner, [testOwnerTransport]);
        await testWaitForWorkerMessage();
        evoluInputs.length = 0;

        unuseOwner();

        expect(() => {
          unuseOwner();
        }).toThrow("UnuseOwner can be called only once.");

        await testWaitForWorkerMessage();

        expect(evoluInputs).toEqual([
          {
            type: "UseOwner",
            actions: [
              {
                owner: {
                  owner: testAppOwner,
                  transports: [testOwnerTransport],
                },
                action: "remove",
              },
            ],
          },
        ]);
      });

      test("flush keeps call order before mutate batch", async () => {
        await using setup = await setupRunWithEvoluDeps();
        const { run, evoluInputs } = setup;
        const evolu = await run.orThrow(
          createEvolu(Schema, {
            appName: testAppName,
            appOwner: testAppOwner,
            transports: [],
          }),
        );

        evolu.useOwner(testAppOwner, [testOwnerTransport]);
        evolu.insert("todo", {
          title: NonEmptyString100.orThrow("Queued after useOwner"),
        });

        await testWaitForWorkerMessage();

        expect(evoluInputs[0]).toEqual({
          type: "UseOwner",
          actions: [
            {
              owner: {
                owner: testAppOwner,
                transports: [testOwnerTransport],
              },
              action: "add",
            },
          ],
        });
        expect(evoluInputs[1]?.type).toBe("Mutate");
      });
    });
  });

  describe("dispose evolu", () => {
    test("posts Dispose message", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;

      const evolu = await run.orThrow(testCreateEvolu);
      await evolu[Symbol.asyncDispose]();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([{ type: "Dispose" }]);
    });

    test("rejects pending export", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const exportPromise = evolu.exportDatabase();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([{ type: "Export" }]);

      await evolu[Symbol.asyncDispose]();

      await expect(exportPromise).rejects.toEqual({
        type: "EvoluDisposedError",
      });
      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([{ type: "Export" }]);
    });

    test("throws from sync methods after dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.orThrow(testCreateEvolu);
      evolu.useOwner(testAppOwner, [testOwnerTransport]);

      await evolu[Symbol.asyncDispose]();

      const disposedMessage = "Expected value to not be disposed.";

      expect(() => {
        evolu.insert("todo", {
          title: NonEmptyString100.orThrow("Inserted after dispose"),
        });
      }).toThrow(disposedMessage);

      expect(() => {
        evolu.update("todo", {
          id: TodoId.orThrow(createIdFromString("todo-update-after-dispose")),
          title: NonEmptyString100.orThrow("Updated after dispose"),
        });
      }).toThrow(disposedMessage);

      expect(() => {
        evolu.upsert("todo", {
          id: TodoId.orThrow(createIdFromString("todo-upsert-after-dispose")),
          title: NonEmptyString100.orThrow("Upserted after dispose"),
        });
      }).toThrow(disposedMessage);

      expect(() => {
        void evolu.loadQuery(todoTitleQuery);
      }).toThrow(disposedMessage);

      expect(() => {
        void evolu.loadQueries([todoTitleQuery, todoTitleDescQuery]);
      }).toThrow(disposedMessage);

      expect(() => {
        evolu.subscribeQuery(todoTitleQuery)(lazyVoid);
      }).toThrow(disposedMessage);

      expect(() => {
        evolu.getQueryRows(todoTitleQuery);
      }).toThrow(disposedMessage);

      expect(() => {
        void evolu.exportDatabase();
      }).toThrow(disposedMessage);

      expect(() => {
        evolu.useOwner(testAppOwner, [testOwnerTransport]);
      }).toThrow(disposedMessage);
    });

    test("allows unuseOwner after dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const unuseOwner = evolu.useOwner(testAppOwner, [testOwnerTransport]);

      await evolu[Symbol.asyncDispose]();

      expect(() => {
        unuseOwner();
      }).not.toThrow();

      expect(() => {
        unuseOwner();
      }).toThrow("UnuseOwner can be called only once.");
    });

    test("resolves pending loadQuery with empty rows on dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const loadPromise = evolu.loadQuery(todoTitleQuery);

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);

      await evolu[Symbol.asyncDispose]();

      await expect(loadPromise).resolves.toEqual([]);
    });

    test("dispose keeps fulfilled subscribed loadQuery settled", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      evolu.subscribeQuery(todoTitleQuery)(lazyVoid);
      const loadPromise = evolu.loadQuery(todoTitleQuery);

      await testWaitForWorkerMessage();

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "A" }] }]],
        ]),
        onCompleteIds: [],
      });

      await expect(loadPromise).resolves.toEqual([{ title: "A" }]);

      await evolu[Symbol.asyncDispose]();
    });

    test("posts Dispose with pending mutation microtask batch", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      evolu.insert("todo", {
        title: NonEmptyString100.orThrow("Queued then disposed"),
      });

      await evolu[Symbol.asyncDispose]();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toContainEqual({ type: "Dispose" });
    });

    test("disposes internal message channels", async () => {
      const channels: Array<{ readonly isDisposed: () => boolean }> = [];

      await using setup = await setupRunWithEvoluDeps({
        createMessageChannel: <Input, Output = never>() => {
          const channel = testCreateMessageChannel<Input, Output>();
          channels.push(channel);
          return channel;
        },
      });
      const { run } = setup;

      const evolu = await run.orThrow(testCreateEvolu);

      expect(channels).toHaveLength(2);
      expect(channels[0].isDisposed()).toBe(false);
      expect(channels[1].isDisposed()).toBe(false);

      await evolu[Symbol.asyncDispose]();

      expect(channels[0].isDisposed()).toBe(true);
      expect(channels[1].isDisposed()).toBe(true);
    });

    test("does not execute mutate onComplete callback after dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

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

      await testWaitForWorkerMessage();

      const mutate = evoluInputs[0] as ExtractType<EvoluInput, "Mutate">;
      const [onCompleteId] = mutate.onCompleteIds;

      await evolu[Symbol.asyncDispose]();

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        onCompleteIds: [onCompleteId],
      });

      await testWaitForWorkerMessage();

      expect(called).toBe(0);
    });

    test("executes mutate onComplete callback when query patches are received", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

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

      await testWaitForWorkerMessage();

      const mutate = evoluInputs[0] as ExtractType<EvoluInput, "Mutate">;
      const [onCompleteId] = mutate.onCompleteIds;

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        onCompleteIds: [onCompleteId],
      });

      await testWaitForWorkerMessage();

      expect(called).toBe(1);
    });

    test("uses flushSync for query patches with onComplete callbacks", async () => {
      let flushSyncCalls = 0;

      await using setup = await setupRunWithEvoluDeps({
        flushSync: (callback: () => void) => {
          flushSyncCalls += 1;
          callback();
        },
      });
      const { run, evoluInputs, postEvoluOutput } = setup;

      const evolu = await run.orThrow(testCreateEvolu);

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

      await testWaitForWorkerMessage();

      const mutate = evoluInputs[0] as ExtractType<EvoluInput, "Mutate">;
      const [onCompleteId] = mutate.onCompleteIds;

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        onCompleteIds: [onCompleteId],
      });

      await testWaitForWorkerMessage();

      expect(flushSyncCalls).toBe(1);
      expect(called).toBe(1);
    });

    test("does not use flushSync when query patches have no onComplete callbacks", async () => {
      let flushSyncCalls = 0;

      await using setup = await setupRunWithEvoluDeps({
        flushSync: (callback: () => void) => {
          flushSyncCalls += 1;
          callback();
        },
      });
      const { run, postEvoluOutput } = setup;

      await run.orThrow(testCreateEvolu);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        onCompleteIds: [],
      });

      expect(flushSyncCalls).toBe(0);
    });
  });

  describe("worker outputs", () => {
    test("ignores RefreshQueries when there are no subscribed queries", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      await run.orThrow(testCreateEvolu);

      postEvoluOutput({ type: "RefreshQueries" });

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([]);
    });

    test("throws for unknown evolu output type", async () => {
      const channels: Array<{
        readonly port1: {
          onMessage: ((message: EvoluOutput) => void) | null;
        };
      }> = [];

      await using setup = await setupRunWithEvoluDeps({
        createMessageChannel: <Input, Output = never>() => {
          const channel = testCreateMessageChannel<Input, Output>();
          channels.push(channel as never);
          return channel;
        },
      });
      const { run } = setup;
      await run.orThrow(testCreateEvolu);

      const evoluChannel = channels.find((channel) => channel.port1.onMessage);
      assert(evoluChannel?.port1.onMessage, "Expected evolu channel handler");

      expect(() => {
        evoluChannel.port1.onMessage?.({ type: "Unknown" } as never);
      }).toThrow();
    });
  });

  describe("query behavior", () => {
    test("loadQuery reuses pending promise and sends one Query message", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const firstLoad = evolu.loadQuery(todoTitleQuery);
      const secondLoad = evolu.loadQuery(todoTitleQuery);

      expect(firstLoad).toBe(secondLoad);

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);
    });

    test("loadQueries delegates to loadQuery for each query", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.orThrow(testCreateEvolu);
      const loads = evolu.loadQueries([todoTitleQuery, todoTitleDescQuery]);

      expect(loads).toHaveLength(2);

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([
        {
          type: "Query",
          queries: new Set([todoTitleQuery, todoTitleDescQuery]),
        },
      ]);
    });

    test("getQueryRows returns empty array for unknown query", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      expect(evolu.getQueryRows(todoTitleQuery)).toEqual([]);
    });

    test("subscribeQuery does not trigger Query by itself", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(lazyVoid);

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([]);

      unsubscribe();
    });

    test("allows subscribeQuery unsubscribe after dispose", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(lazyVoid);

      await evolu[Symbol.asyncDispose]();

      expect(() => {
        unsubscribe();
      }).not.toThrow();

      expect(() => {
        unsubscribe();
      }).toThrow("subscribeQuery unsubscribe can be called only once.");
    });

    test("RefreshQueries re-queries pending unsubscribed loadQuery", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      void evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();

      evoluInputs.length = 0;
      postEvoluOutput({ type: "RefreshQueries" });

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);
    });

    test("RefreshQueries re-queries subscribed query without loadQuery", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(lazyVoid);

      postEvoluOutput({ type: "RefreshQueries" });

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);

      unsubscribe();
    });

    test("mutation releases pending unsubscribed loading promise on resolve", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const loadFiber = evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();

      evoluInputs.length = 0;

      evolu.insert("todo", { title: NonEmptyString100.orThrow("M") });
      await testWaitForWorkerMessage();

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "R" }] }]],
        ]),
        onCompleteIds: [],
      });

      await expect(loadFiber).resolves.toEqual([{ title: "R" }]);

      evoluInputs.length = 0;
      postEvoluOutput({ type: "RefreshQueries" });

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([]);
    });

    test("RefreshQueries drops fulfilled unsubscribed loading promises", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      void evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "A" }] }]],
        ]),
        onCompleteIds: [],
      });

      evoluInputs.length = 0;
      postEvoluOutput({ type: "RefreshQueries" });

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([]);
    });

    test("RefreshQueries keeps loading promise for subscribed query", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(lazyVoid);
      void evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();

      evoluInputs.length = 0;
      postEvoluOutput({ type: "RefreshQueries" });

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([
        { type: "Query", queries: new Set([todoTitleQuery]) },
      ]);

      unsubscribe();
    });

    test("OnPatchesByQuery replaces fulfilled loading promise for subscribed query", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(lazyVoid);

      const firstLoad = evolu.loadQuery(todoTitleQuery);
      await testWaitForWorkerMessage();

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "A" }] }]],
        ]),
        onCompleteIds: [],
      });

      await expect(firstLoad).resolves.toEqual([{ title: "A" }]);

      const fulfilledLoad = evolu.loadQuery(todoTitleQuery);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "B" }] }]],
        ]),
        onCompleteIds: [],
      });

      await testWaitForWorkerMessage();

      const replacedLoad = evolu.loadQuery(todoTitleQuery);

      expect(replacedLoad).not.toBe(fulfilledLoad);
      await expect(replacedLoad).resolves.toEqual([{ title: "B" }]);

      unsubscribe();
    });

    test("OnPatchesByQuery ignores queries without loading promises", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      await run.orThrow(testCreateEvolu);

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "X" }] }]],
        ]),
        onCompleteIds: [],
      });

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([]);
    });

    test("subscribeQuery notifies only when query rows reference changes", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      let calls = 0;
      const unsubscribe = evolu.subscribeQuery(todoTitleQuery)(() => {
        calls += 1;
      });

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map([
          [todoTitleQuery, [{ op: "replaceAll", value: [{ title: "A" }] }]],
        ]),
        onCompleteIds: [],
      });

      postEvoluOutput({
        type: "OnPatchesByQuery",
        patchesByQuery: new Map(),
        onCompleteIds: [],
      });

      await testWaitForWorkerMessage();

      expect(calls).toBe(1);

      unsubscribe();
    });
  });

  describe("mutations", () => {
    test("insert posts mutate with generated id and stripped values", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      evolu.insert("todo", {
        title: NonEmptyString100.orThrow("Todo 1"),
      });

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toMatchInlineSnapshot(
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
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

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

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toMatchInlineSnapshot(
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
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

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

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toMatchInlineSnapshot(
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
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      evolu.insert(
        "todo",
        { title: NonEmptyString100.orThrow("With callback") },
        { ownerId: testAppOwner.id, onComplete: lazyVoid },
      );

      await testWaitForWorkerMessage();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toMatchInlineSnapshot(
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
    test("throws when OnExport arrives without pending export", async () => {
      const channels: Array<{
        readonly port1: {
          onMessage: ((message: EvoluOutput) => void) | null;
        };
      }> = [];

      await using setup = await setupRunWithEvoluDeps({
        createMessageChannel: <Input, Output = never>() => {
          const channel = testCreateMessageChannel<Input, Output>();
          channels.push(channel as never);
          return channel;
        },
      });
      const { run } = setup;
      await run.orThrow(testCreateEvolu);

      const evoluChannel = channels.find((channel) => channel.port1.onMessage);
      assert(evoluChannel?.port1.onMessage, "Expected evolu channel handler");

      expect(() => {
        evoluChannel.port1.onMessage?.({
          type: "OnExport",
          file: new Uint8Array(),
        });
      }).toThrow("OnExport received without pending export.");
    });

    test("exports database for one caller", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const exportPromise = evolu.exportDatabase();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([{ type: "Export" }]);

      const file = new Uint8Array([1, 2, 3]);
      postEvoluOutput({ type: "OnExport", file });

      expect(await exportPromise).toEqual(file);
    });

    test("shares pending export and resolves both callers", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const firstExport = evolu.exportDatabase();
      const secondExport = evolu.exportDatabase();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([{ type: "Export" }]);

      const firstFile = new Uint8Array([1, 2, 3]);
      postEvoluOutput({ type: "OnExport", file: firstFile });

      expect(await firstExport).toEqual(firstFile);
      expect(await secondExport).toEqual(firstFile);

      const thirdExport = evolu.exportDatabase();
      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([{ type: "Export" }, { type: "Export" }]);

      const secondFile = new Uint8Array([4, 5, 6]);
      postEvoluOutput({ type: "OnExport", file: secondFile });

      expect(await thirdExport).toEqual(secondFile);
    });

    test("returns a new promise after previous export resolves", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const firstExport = evolu.exportDatabase();
      const secondExport = evolu.exportDatabase();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([{ type: "Export" }]);

      const file = new Uint8Array([7, 8, 9]);
      postEvoluOutput({ type: "OnExport", file });

      await expect(firstExport).resolves.toEqual(file);
      await expect(secondExport).resolves.toEqual(file);

      const thirdExport = evolu.exportDatabase();

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([{ type: "Export" }, { type: "Export" }]);

      const secondFile = new Uint8Array([13, 14, 15]);
      postEvoluOutput({ type: "OnExport", file: secondFile });

      await expect(thirdExport).resolves.toEqual(secondFile);
    });

    test("aborting run-wrapped export does not cancel shared export", async () => {
      await using setup = await setupRunWithEvoluDeps();
      const { run, evoluInputs, postEvoluOutput } = setup;
      const evolu = await run.orThrow(testCreateEvolu);

      const sharedExport = evolu.exportDatabase();
      const wrappedExport = run(async () => ok(await evolu.exportDatabase()));

      await testWaitForWorkerMessage();

      expect(evoluInputs).toEqual([{ type: "Export" }]);

      wrappedExport.abort();

      const file = new Uint8Array([16, 17, 18]);
      postEvoluOutput({ type: "OnExport", file });

      await expect(wrappedExport).resolves.toEqual(
        err({ type: "AbortError", reason: undefined }),
      );
      await expect(sharedExport).resolves.toEqual(file);
    });
  });
});

describe("integration tests", () => {
  const setupRunWithEvoluDeps = async () => {
    await using stack = new AsyncDisposableStack();

    const consoleStoreOutput = createConsoleStoreOutput();

    const run = stack.use(
      testCreateRun({
        // console: createConsole({ level: "debug" }),
        consoleStoreOutputEntry: consoleStoreOutput.entry,
        createMessageChannel,
        createMessagePort,
        createWebSocket: testCreateWebSocket({ throwOnCreate: true }),
      }),
    );

    const driver = await run.orThrow(
      testCreateSqliteDep.createSqliteDriver(testName),
    );

    const workerRun = stack.use(
      testCreateRun({
        consoleStoreOutputEntry: consoleStoreOutput.entry,
        createMessagePort,
        leaderLock: createInMemoryLeaderLock(),
        createSqliteDriver: () => () => ok(driver),
      }),
    );

    const sharedWorker = stack.use(
      createSharedWorker<SharedWorkerInput>((self) => {
        run(initSharedWorker(self));
      }),
    );

    const sqlite = stack.use(await workerRun.orThrow(createSqlite(testName)));
    const moved = stack.move();

    return {
      run: run.addDeps({
        createDbWorker: () =>
          createWorker<DbWorkerInit>((self) => {
            workerRun(startDbWorker(self));
          }),
        reloadApp: lazyVoid,
        sharedWorker,
      }),
      sqlite,
      [Symbol.asyncDispose]: () => moved.disposeAsync(),
    };
  };

  test("createEvolu", async () => {
    await using setup = await setupRunWithEvoluDeps();
    const { run, sqlite } = setup;

    const evolu = await run.orThrow(testCreateEvolu);

    expect(await evolu.loadQuery(todoByCreatedAtQuery)).toEqual([]);

    let completed = 0;
    const mutationCompleted = Promise.withResolvers<void>();

    evolu.insert(
      "todo",
      {
        title: NonEmptyString100.orThrow("Integration todo"),
      },
      {
        onComplete: () => {
          completed += 1;
          mutationCompleted.resolve();
        },
      },
    );

    await mutationCompleted.promise;
    expect(completed).toBe(1);

    const rowsAfterInsert = await evolu.loadQuery(todoByCreatedAtQuery);
    expect(rowsAfterInsert).toEqual([
      {
        id: expect.any(String),
        title: "Integration todo",
      },
    ]);

    const snapshot = getSqliteSnapshot({ sqlite });

    expect(snapshot).toMatchInlineSnapshot(`
      {
        "schema": {
          "indexes": [
            {
              "name": "evolu_history_ownerId_timestamp",
              "sql": "create index evolu_history_ownerId_timestamp on evolu_history (
                "ownerId",
                "timestamp"
              )",
            },
            {
              "name": "evolu_history_ownerId_table_id_column_timestampDesc",
              "sql": "create unique index evolu_history_ownerId_table_id_column_timestampDesc on evolu_history (
                "ownerId",
                "table",
                "id",
                "column",
                "timestamp" desc
              )",
            },
            {
              "name": "evolu_timestamp_index",
              "sql": "create index evolu_timestamp_index on evolu_timestamp (
              "ownerId",
              "l",
              "t",
              "h1",
              "h2",
              "c"
            )",
            },
          ],
          "tables": {
            "evolu_config": Set {
              "clock",
            },
            "evolu_history": Set {
              "ownerId",
              "table",
              "id",
              "column",
              "timestamp",
              "value",
            },
            "evolu_message_quarantine": Set {
              "ownerId",
              "timestamp",
              "table",
              "id",
              "column",
              "value",
            },
            "evolu_timestamp": Set {
              "ownerId",
              "t",
              "h1",
              "h2",
              "c",
              "l",
            },
            "evolu_usage": Set {
              "ownerId",
              "storedBytes",
              "firstTimestamp",
              "lastTimestamp",
            },
            "evolu_version": Set {
              "protocolVersion",
            },
            "todo": Set {
              "id",
              "createdAt",
              "updatedAt",
              "isDeleted",
              "ownerId",
              "title",
              "isCompleted",
            },
          },
        },
        "tables": [
          {
            "name": "evolu_version",
            "rows": [
              {
                "protocolVersion": 1,
              },
            ],
          },
          {
            "name": "evolu_config",
            "rows": [
              {
                "clock": uint8:[0,0,0,0,0,0,0,1,2,0,125,85,114,123,39,28],
              },
            ],
          },
          {
            "name": "evolu_history",
            "rows": [
              {
                "column": "title",
                "id": uint8:[192,25,220,129,232,160,52,142,147,60,132,127,87,13,194,106],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "todo",
                "timestamp": uint8:[0,0,0,0,0,0,0,1,2,0,125,85,114,123,39,28],
                "value": "Integration todo",
              },
              {
                "column": "createdAt",
                "id": uint8:[192,25,220,129,232,160,52,142,147,60,132,127,87,13,194,106],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "table": "todo",
                "timestamp": uint8:[0,0,0,0,0,0,0,1,2,0,125,85,114,123,39,28],
                "value": "1970-01-01T00:00:00.000Z",
              },
            ],
          },
          {
            "name": "evolu_message_quarantine",
            "rows": [],
          },
          {
            "name": "evolu_timestamp",
            "rows": [
              {
                "c": 1,
                "h1": 226788241197268,
                "h2": 198651634711178,
                "l": 2,
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "t": uint8:[0,0,0,0,0,0,0,1,2,0,125,85,114,123,39,28],
              },
            ],
          },
          {
            "name": "evolu_usage",
            "rows": [
              {
                "firstTimestamp": uint8:[0,0,0,0,0,0,0,1,2,0,125,85,114,123,39,28],
                "lastTimestamp": uint8:[0,0,0,0,0,0,0,1,2,0,125,85,114,123,39,28],
                "ownerId": uint8:[251,208,27,154,71,19,37,213,195,24,203,60,255,39,7,11],
                "storedBytes": 1,
              },
            ],
          },
          {
            "name": "todo",
            "rows": [
              {
                "createdAt": "1970-01-01T00:00:00.000Z",
                "id": "wBncgeigNI6TPIR_Vw3Cag",
                "isCompleted": null,
                "isDeleted": null,
                "ownerId": "-9AbmkcTJdXDGMs8_ycHCw",
                "title": "Integration todo",
                "updatedAt": null,
              },
            ],
          },
        ],
      }
    `);
  });

  test("memoryOnly opens SQLite in memory mode", async () => {
    const consoleStoreOutput = createConsoleStoreOutput();
    const sqliteDriverOptions = new Array<SqliteDriverOptions | undefined>();
    const sqliteDriverOptionsCalled = Promise.withResolvers<void>();
    const createSqliteDriver: CreateSqliteDriver = (name, options) => {
      sqliteDriverOptions.push(options);
      sqliteDriverOptionsCalled.resolve();
      return testCreateSqliteDep.createSqliteDriver(name, options);
    };

    const run = testCreateRun({
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createMessageChannel,
      createMessagePort,
      createWebSocket: testCreateWebSocket({ throwOnCreate: true }),
    });

    const workerRun = testCreateRun({
      consoleStoreOutputEntry: consoleStoreOutput.entry,
      createMessagePort,
      leaderLock: createInMemoryLeaderLock(),
      createSqliteDriver,
    });

    const createDbWorker = () =>
      createWorker<DbWorkerInit>((self) => {
        workerRun(startDbWorker(self));
      });

    const sharedWorker = createSharedWorker<SharedWorkerInput>((self) => {
      run(initSharedWorker(self));
    });

    await using runWithDeps = run.addDeps({
      createDbWorker,
      reloadApp: lazyVoid,
      sharedWorker,
    });

    await runWithDeps.orThrow(
      createEvolu(Schema, {
        appName: testAppName,
        appOwner: testAppOwner,
        transports: [],
        memoryOnly: true,
      }),
    );

    await sqliteDriverOptionsCalled.promise;

    expect(sqliteDriverOptions).toContainEqual({ mode: "memory" });
  });
});
