import { describe, expect, test, vi } from "vitest";

const createRun = vi.fn((deps: object) => {
  const run = vi.fn((task: unknown) => task);
  Object.assign(run, { deps });
  return run;
});

const createConsoleStoreOutput = vi.fn(() => {
  const entry = Symbol("entry");
  return {
    entry,
    write: vi.fn(),
  };
});

const createConsole = vi.fn((config: object) => ({
  ...config,
  child: vi.fn(),
  getLevel: () => "debug",
  setLevel: vi.fn(),
}));

const createCommonEvoluDeps = vi.fn((deps: object) => deps);
const startDbWorker = vi.fn(() => Symbol("startDbWorkerTask"));
const initSharedWorker = vi.fn(() => Symbol("initSharedWorkerTask"));

vi.mock("@evolu/common", () => ({
  createConsole,
  createConsoleStoreOutput,
  createInMemoryLeaderLock: vi.fn(() => Symbol("leaderLock")),
  createRandomBytes: vi.fn(() => vi.fn()),
  createRun,
  createWebSocket: vi.fn(),
}));

vi.mock("@evolu/common/local-first", () => ({
  createEvoluDeps: createCommonEvoluDeps,
  startDbWorker,
  initSharedWorker,
}));

vi.mock("../src/Worker.js", () => ({
  createMessageChannel: vi.fn(),
  createMessagePort: vi.fn(),
  createSharedWorker: vi.fn((init: (self: object) => void) => {
    const self = {};
    init(self);
    return { port: {}, [Symbol.dispose]: vi.fn() };
  }),
  createWorker: vi.fn((init: (self: object) => void) => {
    const self = {};
    init(self);
    return { postMessage: vi.fn(), [Symbol.dispose]: vi.fn() };
  }),
}));

describe("createEvoluDeps", () => {
  test("uses isolated run/store for shared worker and db workers", async () => {
    const { createEvoluDeps } = await import("../src/shared.js");

    const deps = createEvoluDeps({
      reloadApp: vi.fn(),
      createSqliteDriver: vi.fn(),
      console: { getLevel: () => "debug" },
    } as never);

    expect(createRun).toHaveBeenCalledTimes(1);
    expect(createConsoleStoreOutput).toHaveBeenCalledTimes(1);
    expect(initSharedWorker).toHaveBeenCalledTimes(1);

    (deps as { createDbWorker: () => object }).createDbWorker();

    expect(createRun).toHaveBeenCalledTimes(2);
    expect(createConsoleStoreOutput).toHaveBeenCalledTimes(2);
    expect(startDbWorker).toHaveBeenCalledTimes(1);

    const sharedRunDeps = createRun.mock.calls[0][0] as {
      consoleStoreOutputEntry: symbol;
    };
    const dbRunDeps = createRun.mock.calls[1][0] as {
      consoleStoreOutputEntry: symbol;
    };

    expect(sharedRunDeps.consoleStoreOutputEntry).not.toBe(
      dbRunDeps.consoleStoreOutputEntry,
    );
  });
});
