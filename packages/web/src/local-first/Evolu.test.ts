import {
  acquireLeaderLock,
  assertEqual,
  assertFalse,
  assertNonNullable,
  assertSame,
  assertThrowsInstanceOf,
  assertTrue,
  createConsole,
  createIdFromString,
  id,
  PositiveInt,
  testCreateRun,
  testName,
  testStubGlobal,
  type NativeMessagePort,
  type ReloadApp,
  type UnsupportedDbVersionError,
} from "@evolu/common";
import {
  AppName,
  buildsBroadcastChannelName,
  consoleEntryOrErrorBroadcastChannelName,
  createEvolu,
  testAppOwner,
  type BuildWaiting,
  type BuildWaitingRequest,
  type DbWorkerInit,
  type DbWorkerInput,
  type DbWorkerOutput,
  type SharedWorkerId,
  type SharedWorkerOutput,
} from "@evolu/common/local-first";
import { describe, it, mock } from "node:test";
import { createEvoluDeps } from "./Evolu.ts";

describe("createEvoluDeps", () => {
  it("calls the callback when the one-tab SharedWorker polyfill is already open", async () => {
    const onSharedWorkerUnsupported = mock.fn<() => void>();
    using setup = setupWebEvoluDeps({ onSharedWorkerUnsupported });
    await setup.ready;
    setup.sharedWorkerPort.onmessage?.(
      new MessageEvent("message", {
        data: { type: "SharedWorkerUnsupported" },
      }),
    );
    assertSame(onSharedWorkerUnsupported.mock.callCount(), 1);
    assertSame(setup.getDbWorkerCount(), 0);
  });

  it("starts the stored worker once storage is available, without an instance", async () => {
    const probe = Promise.withResolvers<unknown>();
    using setup = setupWebEvoluDeps({ storageProbe: probe.promise });
    assertSame(setup.getSharedWorkerCount(), 0);
    probe.resolve(undefined);
    assertSame(await setup.ready, "Unknown");
    assertSame(setup.getSharedWorkerCount(), 1);
    assertSame(
      (await setup.deps.storedWorker).port.native,
      setup.sharedWorkerPort,
    );
  });

  it("keeps refused storage outside stored-worker build coordination", async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    const probe = Promise.withResolvers<unknown>();
    using setup = setupWebEvoluDeps({
      storageProbe: probe.promise,
      hasFocus: true,
    });
    const waiting = {
      type: "BuildWaiting",
      workerId: createIdFromString<"SharedWorker">("refused-waiting"),
    };
    setup.receive(waiting);
    probe.reject(new Error("Storage is unavailable."));
    assertSame(await setup.ready, "NotPersisted");
    setup.receive(waiting);
    setup.receive({ type: "BuildWaitingRequest" });
    setup.setFocus(false);
    t.mock.timers.tick(1000);
    assertSame(setup.getSharedWorkerCount(), 0);
    assertSame(setup.reloadApp.mock.callCount(), 0);
    assertEqual(setup.builds.posted, []);
  });

  it("keeps an explicit memory instance private while its stored connection can reload the tab", async () => {
    const probe = Promise.withResolvers<unknown>();
    using setup = setupWebEvoluDeps({ storageProbe: probe.promise });
    await using run = testCreateRun(setup.deps);
    await using _evolu = await run.ok(
      createEvolu(
        { todo: { id: id("Todo") } },
        {
          appName: AppName.orThrow("test-memory-only"),
          memoryOnly: true,
          appOwner: testAppOwner,
          transports: [],
        },
      ),
    );
    assertSame(setup.getSharedWorkerCount(), 0);
    assertEqual(setup.getWorkerOptions(), [
      { type: "module", name: "evolu-memory-instance" },
    ]);
    probe.resolve(undefined);
    await setup.ready;
    setup.connect(createIdFromString<"SharedWorker">("memory-tab-stored"));
    setup.receive({
      type: "BuildWaiting",
      workerId: createIdFromString<"SharedWorker">("memory-tab-other"),
    });
    assertSame(setup.getSharedWorkerCount(), 1);
    assertSame(setup.reloadApp.mock.callCount(), 1);
  });

  it("reports a stored worker's script-load failure once", async () => {
    for (const useSharedWorkerPolyfill of [false, true]) {
      using setup = setupWebEvoluDeps({ useSharedWorkerPolyfill });
      await setup.ready;
      const errorTarget = useSharedWorkerPolyfill
        ? setup.dbWorkers[0]
        : setup.nativeSharedWorker;
      assertNonNullable(errorTarget);
      errorTarget.dispatchEvent(new Event("error"));
      await waitForMacrotask();

      const error = setup.deps.evoluError.get();
      assertEqual(error, {
        type: "UnknownError",
        error: { message: "The SharedWorker failed to load." },
      });
      errorTarget.dispatchEvent(new Event("error"));
      await waitForMacrotask();
      assertSame(setup.deps.evoluError.get(), error);
    }
  });

  it("reports an evaluation ErrorEvent before a memory worker's first message", async () => {
    using setup = setupWebEvoluDeps();
    await setup.ready;
    const createMemoryInstanceWorker = setup.deps.createMemoryInstanceWorker;
    assertNonNullable(createMemoryInstanceWorker);
    using _worker = createMemoryInstanceWorker();
    const [worker] = setup.dbWorkers;
    assertNonNullable(worker);
    const details = {
      message: "The memory worker module threw.",
      filename: "Shared.worker.js",
      lineno: 7,
      colno: 13,
    };

    worker.dispatchEvent(new ErrorEvent("error", details));
    await waitForMacrotask();

    assertEqual(setup.deps.evoluError.get(), {
      type: "UnknownError",
      error: details,
    });
  });

  it("terminates a memory worker disposed before its first message and reports nothing", async () => {
    using setup = setupWebEvoluDeps();
    await setup.ready;
    const createMemoryInstanceWorker = setup.deps.createMemoryInstanceWorker;
    assertNonNullable(createMemoryInstanceWorker);
    const memoryWorker = createMemoryInstanceWorker();
    const [nativeWorker] = setup.dbWorkers;
    assertNonNullable(nativeWorker);

    memoryWorker[Symbol.dispose]();
    assertSame(nativeWorker.terminate.mock.callCount(), 1);
    nativeWorker.dispatchEvent(new Event("error"));
    await waitForMacrotask();

    assertSame(setup.deps.evoluError.get(), null);
  });

  it("keeps the port's real error when an ErrorEvent follows a memory worker message", async () => {
    using setup = setupWebEvoluDeps({});
    await setup.ready;
    const createMemoryInstanceWorker = setup.deps.createMemoryInstanceWorker;
    assertNonNullable(createMemoryInstanceWorker);
    using _worker = createMemoryInstanceWorker();
    const [nativeWorker] = setup.dbWorkers;
    assertNonNullable(nativeWorker);
    const error = {
      type: "UnknownError",
      error: "The original error",
    } as const;
    nativeWorker.dispatchEvent(
      new MessageEvent("message", { data: { type: "Error", error } }),
    );
    nativeWorker.onmessage?.(
      new MessageEvent("message", { data: { type: "Error", error } }),
    );
    assertSame(setup.deps.evoluError.get(), error);

    nativeWorker.dispatchEvent(
      new ErrorEvent("error", { message: "The browser's reduced error" }),
    );

    assertSame(setup.deps.evoluError.get(), error);
  });

  it("installs the polyfills it needs, such as DisposableStack, which Safari lacks", () => {
    using _sharedWorker = testStubGlobal(
      "SharedWorker",
      class {
        readonly port =
          createClosableNativePort<unknown>() as unknown as NativeMessagePort<
            never,
            unknown
          >;
      },
    );
    using _addEventListener = testStubGlobal("addEventListener", () => {});
    using _removeEventListener = testStubGlobal(
      "removeEventListener",
      () => {},
    );
    // testStubGlobal itself creates a DisposableStack, so this restores the
    // native one by hand.
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "DisposableStack",
    );
    assertNonNullable(descriptor);
    Reflect.deleteProperty(globalThis, "DisposableStack");
    try {
      using deps = createEvoluDeps();

      assertNonNullable(deps);
      assertSame(typeof globalThis.DisposableStack, "function");
    } finally {
      Object.defineProperty(globalThis, "DisposableStack", descriptor);
    }
  });

  describe("database refusals", () => {
    const createRefusal = (
      storedVersion: number,
    ): UnsupportedDbVersionError => ({
      type: "UnsupportedDbVersionError",
      storedVersion: PositiveInt.orThrow(storedVersion),
      supportedVersion: PositiveInt.orThrow(2),
    });

    it("reloads once for a refusal, even with focus, instead of reporting it", async () => {
      using setup = setupWebEvoluDeps({ hasFocus: true });
      await setup.ready;

      setup.post({ type: "Error", error: createRefusal(3) });

      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertSame(setup.deps.evoluError.get(), null);
      assertSame(setup.getRefusalReloads(), "3");
      assertFalse(setup.isAutomaticReloadMarked());
    });

    it("reloads for each refusal before the page unloads", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;

      setup.post({ type: "Error", error: createRefusal(3) });
      setup.post({ type: "Error", error: createRefusal(3) });

      assertSame(setup.reloadApp.mock.callCount(), 2);
      assertSame(setup.deps.evoluError.get(), null);
    });

    it("reports a refusal that recurs after its reload without creating a DbWorker", async () => {
      using setup = setupWebEvoluDeps({ refusalReloads: "3" });
      await setup.ready;
      const error = createRefusal(3);

      setup.post({ type: "Error", error });

      assertSame(setup.reloadApp.mock.callCount(), 0);
      assertEqual(setup.deps.evoluError.get(), error);
      assertSame(setup.getDbWorkerCount(), 0);
    });

    it("reloads again for a newer stored version", async () => {
      using setup = setupWebEvoluDeps({ refusalReloads: "3" });
      await setup.ready;

      setup.post({ type: "Error", error: createRefusal(4) });

      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertSame(setup.deps.evoluError.get(), null);
      assertSame(setup.getRefusalReloads(), "3,4");
    });

    it("reloads once for refusals of several databases, then reports them", async () => {
      let refusalReloads: string | null;
      {
        using firstPage = setupWebEvoluDeps();
        await firstPage.ready;
        firstPage.post({ type: "Error", error: createRefusal(3) });
        firstPage.post({ type: "Error", error: createRefusal(4) });
        assertSame(firstPage.reloadApp.mock.callCount(), 2);
        refusalReloads = firstPage.getRefusalReloads();
      }
      assertNonNullable(refusalReloads);
      using secondPage = setupWebEvoluDeps({ refusalReloads });
      await secondPage.ready;
      const error = createRefusal(4);

      secondPage.post({ type: "Error", error });
      secondPage.post({ type: "Error", error: createRefusal(3) });

      assertSame(secondPage.reloadApp.mock.callCount(), 0);
      assertEqual(secondPage.deps.evoluError.get(), error);
    });

    it("reports a refusal without session storage", async () => {
      using setup = setupWebEvoluDeps({ isSessionStorageAvailable: false });
      await setup.ready;
      const error = createRefusal(3);

      setup.post({ type: "Error", error });

      assertSame(setup.reloadApp.mock.callCount(), 0);
      assertEqual(setup.deps.evoluError.get(), error);
    });
  });

  describe("persistent storage request", () => {
    const setupStorage = (isPersisted: boolean) => ({
      persisted: mock.fn(() => Promise.resolve(isPersisted)),
      persist: mock.fn(() => Promise.resolve(true)),
    });

    it("asks the browser once to keep the site's data", async () => {
      const storage = setupStorage(false);
      using setup = setupWebEvoluDeps({ storage });
      await setup.ready;

      setup.deps.requestPersistentStorage?.();
      setup.deps.requestPersistentStorage?.();
      await waitForMacrotask();

      assertSame(storage.persisted.mock.callCount(), 1);
      assertSame(storage.persist.mock.callCount(), 1);
    });

    it("does not ask when the site's data is already persistent", async () => {
      const storage = setupStorage(true);
      using setup = setupWebEvoluDeps({ storage });
      await setup.ready;

      setup.deps.requestPersistentStorage?.();
      await waitForMacrotask();

      assertSame(storage.persist.mock.callCount(), 0);
    });

    it("ignores a browser that refuses to answer", async () => {
      const storage = {
        persisted: mock.fn(() =>
          Promise.reject(new TypeError("Storage is disabled.")),
        ),
        persist: mock.fn(() => Promise.resolve(true)),
      };
      using setup = setupWebEvoluDeps({ storage });
      await setup.ready;

      setup.deps.requestPersistentStorage?.();
      await waitForMacrotask();

      assertSame(storage.persist.mock.callCount(), 0);
    });

    it("uses the app's request instead", async () => {
      const storage = setupStorage(false);
      const requestPersistentStorage = mock.fn<() => void>();
      using setup = setupWebEvoluDeps({ storage, requestPersistentStorage });
      await setup.ready;

      setup.deps.requestPersistentStorage?.();
      await waitForMacrotask();

      assertSame(requestPersistentStorage.mock.callCount(), 1);
      assertSame(storage.persisted.mock.callCount(), 0);
    });
  });

  describe("DbWorker loading", () => {
    it("posts the init once its DbWorker's script loads", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      const { init, port } = setup.startDbWorker();
      const [dbWorker] = setup.dbWorkers;
      assertNonNullable(dbWorker);
      await waitForMacrotask();
      assertSame(dbWorker.postMessage.mock.callCount(), 0);

      dbWorker.dispatchEvent(new MessageEvent("message", { data: null }));
      // A later error is the page's, as the worker posts its own failures.
      dbWorker.dispatchEvent(new Event("error"));
      await waitForMacrotask();

      assertEqual(
        dbWorker.postMessage.mock.calls.map((call) => call.arguments),
        [[init, [init.port]]],
      );
      assertSame(port.postMessage.mock.callCount(), 0);
      assertSame(dbWorker.terminate.mock.callCount(), 0);
    });

    it("posts nothing to a DbWorker disposed before its script loads", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      const { init } = setup.startDbWorker();
      const dbWorker = setup.deps.createDbWorker();
      const nativeDbWorker = setup.dbWorkers.at(-1);
      assertNonNullable(nativeDbWorker);
      dbWorker.postMessage(init, [init.port]);

      dbWorker[Symbol.dispose]();
      nativeDbWorker.dispatchEvent(new MessageEvent("message", { data: null }));
      await waitForMacrotask();

      assertSame(nativeDbWorker.postMessage.mock.callCount(), 0);
    });

    it("refuses the database of a DbWorker whose script fails to load", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      const { port } = setup.startDbWorker();
      const [dbWorker] = setup.dbWorkers;
      assertNonNullable(dbWorker);

      // A plain Event stands for a script that failed to load.
      dbWorker.dispatchEvent(new Event("error"));
      await waitForMacrotask();

      assertEqual(
        port.postMessage.mock.calls.map((call) => call.arguments),
        [
          [
            {
              type: "LeaderRefused",
              error: {
                type: "UnknownError",
                error: { message: "The DbWorker failed to load." },
              },
            },
          ],
        ],
      );
      assertSame(dbWorker.postMessage.mock.callCount(), 0);
      assertSame(dbWorker.terminate.mock.callCount(), 1);
      setup.disposeDeps();
      assertSame(dbWorker.terminate.mock.callCount(), 1);
    });

    it("refuses the database of a DbWorker whose script throws while it runs", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      const { port } = setup.startDbWorker();
      const [dbWorker] = setup.dbWorkers;
      assertNonNullable(dbWorker);
      const uncaughtError = {
        message: "Uncaught TypeError: x is not a function",
        filename: "https://example.com/Db.worker.js",
        lineno: 12,
        colno: 34,
      };

      // An event no listener canceled is still logged by the browser and
      // passed to the page's own error handlers.
      assertTrue(
        dbWorker.dispatchEvent(
          new ErrorEvent("error", { ...uncaughtError, cancelable: true }),
        ),
      );
      await waitForMacrotask();

      assertEqual(
        port.postMessage.mock.calls.map((call) => call.arguments),
        [
          [
            {
              type: "LeaderRefused",
              error: { type: "UnknownError", error: uncaughtError },
            },
          ],
        ],
      );
      assertSame(dbWorker.postMessage.mock.callCount(), 0);
    });

    it("posts nothing for a DbWorker that loads after the deps are disposed", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      const { port } = setup.startDbWorker();
      const [dbWorker] = setup.dbWorkers;
      assertNonNullable(dbWorker);

      setup.disposeDeps();
      dbWorker.dispatchEvent(new Event("error"));
      dbWorker.dispatchEvent(new MessageEvent("message", { data: null }));
      await waitForMacrotask();

      assertSame(port.postMessage.mock.callCount(), 0);
      assertSame(dbWorker.postMessage.mock.callCount(), 0);
    });
  });

  describe("back-forward cache", () => {
    const workerId = createIdFromString<"SharedWorker">("cached");

    it("ends its part as if it closed when the page enters the cache", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      setup.connect(workerId);
      await setup.waitForTabLeadership();
      setup.startDbWorker();

      setup.dispatchPageTransition("pagehide", true);
      await waitForMacrotask();

      assertSame(setup.dbWorkers[0]?.terminate.mock.callCount(), 1);
      assertSame(setup.sharedWorkerPort.close.mock.callCount(), 1);
      assertTrue(await isLockAvailable(`evolu-leaderlock-tab-${workerId}`));
      assertSame(setup.reloadApp.mock.callCount(), 0);
    });

    it("releases the locks of its Evolu instances when the page enters the cache", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      await using run = testCreateRun({
        lockManager: setup.deps.lockManager,
      });
      await using _instanceLock = await run.ok(
        acquireLeaderLock("cached-instance"),
      );
      assertFalse(await isLockAvailable("evolu-leaderlock-cached-instance"));

      setup.dispatchPageTransition("pagehide", true);
      await waitForMacrotask();

      assertTrue(await isLockAvailable("evolu-leaderlock-cached-instance"));
    });

    it("releases at once a lock granted after the page entered the cache", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      const name = "evolu-granted-after-cache";
      const held = Promise.withResolvers<void>();
      const holding = navigator.locks.request(name, () => held.promise);
      const callback = mock.fn<LockGrantedCallback<void>>();
      const request = setup.deps.lockManager.request(name, callback);

      setup.dispatchPageTransition("pagehide", true);
      held.resolve();
      await holding;
      await request;

      assertSame(callback.mock.callCount(), 0);
      assertTrue(await isLockAvailable(name));
    });

    it("reloads once when the page is restored from the cache", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      setup.dispatchPageTransition("pageshow", false);

      setup.dispatchPageTransition("pagehide", true);
      setup.dispatchPageTransition("pageshow", true);
      setup.dispatchPageTransition("pageshow", true);

      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertFalse(setup.isAutomaticReloadMarked());
    });

    it("ignores a pagehide that does not enter the cache", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      setup.startDbWorker();

      setup.dispatchPageTransition("pagehide", false);
      setup.dispatchPageTransition("pageshow", true);

      assertSame(setup.dbWorkers[0]?.terminate.mock.callCount(), 0);
      assertSame(setup.sharedWorkerPort.close.mock.callCount(), 0);
      assertSame(setup.reloadApp.mock.callCount(), 0);
    });

    it("ends its DbWorkers when disposed, and then ignores the cache", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      setup.startDbWorker();

      setup.disposeDeps();
      setup.dispatchPageTransition("pagehide", true);
      setup.dispatchPageTransition("pageshow", true);

      assertSame(setup.dbWorkers[0]?.terminate.mock.callCount(), 1);
      assertSame(setup.reloadApp.mock.callCount(), 0);
    });
  });

  describe("worker relaunch", () => {
    const firstWorkerId = createIdFromString<"SharedWorker">("first");
    const relaunchedWorkerId = createIdFromString<"SharedWorker">("relaunched");

    it("reloads at once when its worker connects again", async () => {
      using setup = setupWebEvoluDeps({ hasFocus: true });
      await setup.ready;
      setup.connect(firstWorkerId);

      setup.connect(relaunchedWorkerId);

      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertFalse(setup.isAutomaticReloadMarked());
    });

    it("reloads at once when its worker reports waiting again", async () => {
      using setup = setupWebEvoluDeps({ hasFocus: true });
      await setup.ready;
      setup.connect(firstWorkerId);

      setup.post({ type: "Waiting", workerId: relaunchedWorkerId });

      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertEqual(setup.builds.posted, [{ type: "BuildWaitingRequest" }]);
    });

    it("reloads at once when a waiting tab's worker connects as another worker", async () => {
      using setup = setupWebEvoluDeps({ hasFocus: true });
      await setup.ready;
      setup.post({ type: "Waiting", workerId: firstWorkerId });
      setup.post({ type: "Error", error: { type: "OtherBuildRunningError" } });

      setup.connect(relaunchedWorkerId);

      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertFalse(setup.isAutomaticReloadMarked());
      // The relaunched worker's Connected is not forwarded, so the tab neither
      // clears the wait nor elects a leader for a worker without its databases.
      assertEqual(setup.deps.evoluError.get(), {
        type: "OtherBuildRunningError",
      });
      assertEqual(setup.builds.posted, [
        { type: "BuildWaiting", workerId: firstWorkerId },
      ]);
    });

    it("reloads at once when a waiting tab's worker waits as another worker", async () => {
      using setup = setupWebEvoluDeps({ hasFocus: true });
      await setup.ready;
      setup.post({ type: "Waiting", workerId: firstWorkerId });

      setup.post({ type: "Waiting", workerId: relaunchedWorkerId });

      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertEqual(setup.builds.posted, [
        { type: "BuildWaiting", workerId: firstWorkerId },
      ]);
    });

    it("does not reload when its waiting worker connects", async () => {
      using setup = setupWebEvoluDeps({ hasFocus: true });
      await setup.ready;
      setup.post({ type: "Waiting", workerId: firstWorkerId });

      setup.connect(firstWorkerId);

      assertSame(setup.reloadApp.mock.callCount(), 0);
      assertEqual(setup.builds.posted, [
        { type: "BuildWaiting", workerId: firstWorkerId },
        { type: "BuildWaitingRequest" },
      ]);
    });
  });

  describe("builds", () => {
    const createWorkerId = (name: string): SharedWorkerId =>
      createIdFromString<"SharedWorker">(name);
    const ownWorkerId = createWorkerId("own");
    const otherWorkerId = createWorkerId("other");
    const thirdWorkerId = createWorkerId("third");
    const otherBuildWaiting: BuildWaiting = {
      type: "BuildWaiting",
      workerId: otherWorkerId,
    };
    const buildWaitingRequest: BuildWaitingRequest = {
      type: "BuildWaitingRequest",
    };

    it("announces its build when its worker waits and when asked", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;

      setup.post({ type: "Waiting", workerId: ownWorkerId });
      setup.receive(buildWaitingRequest);

      assertEqual(setup.builds.posted, [
        { type: "BuildWaiting", workerId: ownWorkerId },
        { type: "BuildWaiting", workerId: ownWorkerId },
      ]);
    });

    it("asks waiting tabs to announce once it connects, and stops announcing", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      setup.post({ type: "Waiting", workerId: ownWorkerId });

      setup.connect(ownWorkerId);
      setup.receive(buildWaitingRequest);

      assertEqual(setup.builds.posted, [
        { type: "BuildWaiting", workerId: ownWorkerId },
        buildWaitingRequest,
      ]);
    });

    it("does not announce its build after an automatic reload", async () => {
      using setup = setupWebEvoluDeps({ isAutomaticReload: true });
      await setup.ready;

      setup.post({ type: "Waiting", workerId: ownWorkerId });
      setup.receive(buildWaitingRequest);

      assertEqual(setup.builds.posted, []);
      // Only the page the reload loaded skips announcing.
      assertFalse(setup.isAutomaticReloadMarked());
    });

    it("reloads at once when another build waits and the user is not in the tab", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      setup.connect(ownWorkerId);

      setup.receive(otherBuildWaiting);

      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertTrue(setup.isAutomaticReloadMarked());
      assertSame(setup.getReloadedFor(), otherWorkerId);
    });

    it("reloads the tab the user is in once it loses focus", async (t) => {
      t.mock.timers.enable({ apis: ["setInterval"] });
      using setup = setupWebEvoluDeps({ hasFocus: true });
      await setup.ready;
      setup.connect(ownWorkerId);

      setup.receive(otherBuildWaiting);
      t.mock.timers.tick(1000);
      assertSame(setup.reloadApp.mock.callCount(), 0);

      // However focus left, for example from a frame of the page.
      setup.setFocus(false);
      t.mock.timers.tick(1000);
      assertSame(setup.reloadApp.mock.callCount(), 1);

      t.mock.timers.tick(3000);
      assertSame(setup.reloadApp.mock.callCount(), 1);
    });

    it("reloads once it connects for another build announced while it waited", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      setup.post({ type: "Waiting", workerId: ownWorkerId });

      setup.receive(otherBuildWaiting);
      assertSame(setup.reloadApp.mock.callCount(), 0);

      setup.connect(ownWorkerId);
      assertSame(setup.reloadApp.mock.callCount(), 1);
    });

    it("handles builds once it connects, also when an evoluError listener throws as the wait clears", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;
      setup.post({ type: "Waiting", workerId: ownWorkerId });
      setup.post({ type: "Error", error: { type: "OtherBuildRunningError" } });
      setup.receive(otherBuildWaiting);
      const listenerError = new Error("An app's listener failed.");
      const unsubscribe = setup.deps.evoluError.subscribe(() => {
        throw listenerError;
      });

      // The store throws after it notifies every listener.
      assertSame(
        assertThrowsInstanceOf(() => {
          setup.connect(ownWorkerId);
        }, Error),
        listenerError,
      );
      unsubscribe();

      assertSame(setup.deps.evoluError.get(), null);
      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertEqual(setup.builds.posted, [
        { type: "BuildWaiting", workerId: ownWorkerId },
        buildWaitingRequest,
      ]);
    });

    it("remembers another build announced while its storage probe is pending", async (t) => {
      t.mock.timers.enable({ apis: ["setInterval"] });
      const probe = Promise.withResolvers<unknown>();
      using setup = setupWebEvoluDeps({
        storageProbe: probe.promise,
        hasFocus: true,
      });
      setup.receive(otherBuildWaiting);
      assertSame(setup.getSharedWorkerCount(), 0);
      probe.resolve(undefined);
      await setup.ready;

      setup.post({ type: "Waiting", workerId: ownWorkerId });
      setup.connect(ownWorkerId);
      setup.setFocus(false);
      t.mock.timers.tick(1000);

      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertEqual(setup.builds.posted, [
        { type: "BuildWaiting", workerId: ownWorkerId },
        buildWaitingRequest,
      ]);
    });

    it("ignores its own worker and invalid messages", async () => {
      using setup = setupWebEvoluDeps();
      await setup.ready;

      setup.receive({ type: "BuildWaiting", workerId: ownWorkerId });
      setup.connect(ownWorkerId);
      setup.receive({ type: "BuildWaiting", workerId: ownWorkerId });
      setup.receive({ type: "BuildWaiting", workerId: "not an id" });

      assertSame(setup.reloadApp.mock.callCount(), 0);
    });

    it("reloads at most once for each waiting worker", async () => {
      using setup = setupWebEvoluDeps({ reloadedFor: otherWorkerId });
      await setup.ready;
      setup.connect(ownWorkerId);

      setup.receive(otherBuildWaiting);
      assertSame(setup.reloadApp.mock.callCount(), 0);

      setup.receive({ type: "BuildWaiting", workerId: thirdWorkerId });
      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertSame(setup.getReloadedFor(), `${otherWorkerId},${thirdWorkerId}`);
    });

    it("does not reload without session storage", async () => {
      using setup = setupWebEvoluDeps({ isSessionStorageAvailable: false });
      await setup.ready;
      setup.connect(ownWorkerId);

      setup.receive(otherBuildWaiting);

      assertSame(setup.reloadApp.mock.callCount(), 0);
    });

    it("does not reload once disposed", async (t) => {
      t.mock.timers.enable({ apis: ["setInterval"] });
      using setup = setupWebEvoluDeps({ hasFocus: true });
      await setup.ready;
      setup.connect(ownWorkerId);
      setup.receive(otherBuildWaiting);

      setup.disposeDeps();
      setup.setFocus(false);
      t.mock.timers.tick(1000);

      assertSame(setup.reloadApp.mock.callCount(), 0);
    });
  });
});

/**
 * Creates web deps with stubbed workers, session storage, and a focus the test
 * controls, and broadcast channels that record posts and deliver
 * synchronously.
 */
const setupWebEvoluDeps = ({
  storageProbe = Promise.resolve(undefined),
  onSharedWorkerUnsupported,
  hasFocus: initialHasFocus = false,
  isAutomaticReload = false,
  isSessionStorageAvailable = true,
  refusalReloads,
  reloadedFor,
  storage,
  requestPersistentStorage,
  useSharedWorkerPolyfill = false,
}: {
  /** Controls the single storage probe, including a deliberately pending one. */
  storageProbe?: Promise<unknown>;
  onSharedWorkerUnsupported?: () => void;
  hasFocus?: boolean;
  isAutomaticReload?: boolean;
  isSessionStorageAvailable?: boolean;
  /** The stored refusal reload versions, as a previous page load left them. */
  refusalReloads?: string;
  /** The stored waiting workers, as a previous page load left them. */
  reloadedFor?: string;
  /** Stands in for `navigator.storage`. */
  storage?: Pick<StorageManager, "persist" | "persisted">;
  requestPersistentStorage?: () => void;
  useSharedWorkerPolyfill?: boolean;
} = {}) => {
  using disposer = new DisposableStack();
  const sharedWorkerPort = createClosableNativePort<unknown>();
  const nativeSharedWorker = Object.assign(new EventTarget(), {
    port: sharedWorkerPort as unknown as NativeMessagePort<never, unknown>,
  });
  const SharedWorker = mock.fn(function () {
    return nativeSharedWorker;
  });
  disposer.use(
    testStubGlobal(
      "SharedWorker",
      useSharedWorkerPolyfill ? undefined : SharedWorker,
    ),
  );
  const createFakeDbWorker = () =>
    Object.assign(createClosableNativePort<unknown>(), {
      terminate: mock.fn<() => void>(),
    });
  const dbWorkers: Array<ReturnType<typeof createFakeDbWorker>> = [];
  const workerOptions: Array<WorkerOptions | undefined> = [];
  const Worker = mock.fn(function (
    _url: string | URL,
    options?: WorkerOptions,
  ) {
    workerOptions.push(options);
    const dbWorker = createFakeDbWorker();
    dbWorkers.push(dbWorker);
    return dbWorker;
  });
  disposer.use(testStubGlobal("Worker", Worker));
  // Node has no ErrorEvent.
  disposer.use(
    testStubGlobal(
      "ErrorEvent",
      class extends Event {
        readonly message: string;
        readonly filename: string;
        readonly lineno: number;
        readonly colno: number;
        constructor(type: string, init: ErrorEventInit = {}) {
          super(type, init);
          this.message = init.message ?? "";
          this.filename = init.filename ?? "";
          this.lineno = init.lineno ?? 0;
          this.colno = init.colno ?? 0;
        }
      },
    ),
  );
  // Page lifecycle events such as pagehide and pageshow.
  const page = new EventTarget();
  disposer.use(
    testStubGlobal("addEventListener", page.addEventListener.bind(page)),
  );
  disposer.use(
    testStubGlobal("removeEventListener", page.removeEventListener.bind(page)),
  );
  const channels: Array<{
    readonly name: string;
    readonly posted: Array<unknown>;
    onmessage: ((event: MessageEvent) => void) | null;
  }> = [];
  disposer.use(
    testStubGlobal(
      "BroadcastChannel",
      class {
        readonly name: string;
        readonly posted: Array<unknown> = [];
        onmessage: ((event: MessageEvent) => void) | null = null;
        constructor(name: string) {
          this.name = name;
          channels.push(this);
        }
        postMessage(message: unknown): void {
          this.posted.push(message);
        }
        close(): void {}
      },
    ),
  );
  const sessionItems = new Map<string, string>();
  if (isAutomaticReload) sessionItems.set(automaticReloadKey, "1");
  if (refusalReloads !== undefined) {
    sessionItems.set(refusalReloadKey, refusalReloads);
  }
  if (reloadedFor !== undefined) sessionItems.set(reloadedForKey, reloadedFor);
  const throwSecurityError = (): never => {
    throw new Error("The session storage is not available.");
  };
  disposer.use(
    testStubGlobal(
      "sessionStorage",
      isSessionStorageAvailable
        ? {
            getItem: (key: string) => sessionItems.get(key) ?? null,
            setItem: (key: string, value: string) => {
              sessionItems.set(key, value);
            },
            removeItem: (key: string) => {
              sessionItems.delete(key);
            },
          }
        : {
            getItem: throwSecurityError,
            setItem: throwSecurityError,
            removeItem: throwSecurityError,
          },
    ),
  );
  let hasFocus = initialHasFocus;
  disposer.use(testStubGlobal("document", { hasFocus: () => hasFocus }));
  const getDirectory = mock.fn(() => storageProbe);
  disposer.use(
    testStubGlobal("navigator", {
      locks: navigator.locks,
      storage: {
        getDirectory,
        persist: () => Promise.resolve(false),
        persisted: () => Promise.resolve(false),
        ...storage,
      },
    }),
  );
  const reloadApp = mock.fn<ReloadApp>();

  const deps = createEvoluDeps({
    console: createConsole({ level: "silent" }),
    reloadApp,
    ...(requestPersistentStorage && { requestPersistentStorage }),
    ...(onSharedWorkerUnsupported && { onSharedWorkerUnsupported }),
  });
  const persistence = deps.getDevicePersistence();
  const ready = storageProbe
    .then(waitForMacrotask, waitForMacrotask)
    .then(() => persistence);
  const builds = channels.find(
    (channel) => channel.name === buildsBroadcastChannelName,
  );
  assertNonNullable(builds);
  const post = (output: SharedWorkerOutput): void => {
    sharedWorkerPort.onmessage?.(new MessageEvent("message", { data: output }));
  };
  const disposables = disposer.move();

  return {
    deps,
    ready,
    builds,
    reloadApp,
    sharedWorkerPort,
    nativeSharedWorker,
    post,
    dbWorkers,
    getSharedWorkerCount: (): number => SharedWorker.mock.callCount(),
    getDbWorkerCount: (): number => Worker.mock.callCount(),
    getWorkerOptions: () => workerOptions,
    /**
     * Starts a DbWorker in this tab, as the SharedWorker asks its leader, and
     * returns its init with the init's port, as the SharedWorker sees it.
     */
    startDbWorker: () => {
      const port = createClosableNativePort();
      const init: DbWorkerInit = {
        type: "DbWorkerInit",
        name: testName,
        consoleLevel: "silent",
        sqliteSchema: { tables: {}, indexes: [] },
        encryptionKey: testAppOwner.encryptionKey,
        memoryOnly: false,
        consoleEntryOrErrorChannelName: consoleEntryOrErrorBroadcastChannelName,
        sharedWorkerId: createIdFromString<"SharedWorker">("worker"),
        port: port as unknown as NativeMessagePort<
          DbWorkerOutput,
          DbWorkerInput
        >,
      };
      post(init);
      return { init, port };
    },
    /** Waits until this tab wins the election and announces itself. */
    waitForTabLeadership: async (): Promise<void> => {
      const isAnnounced = (): boolean =>
        sharedWorkerPort.postMessage.mock.calls.some(
          ({ arguments: [message] }) =>
            (message as { readonly type?: unknown }).type ===
            "AnnounceTabLeader",
        );
      for (let turn = 0; turn < 100 && !isAnnounced(); turn += 1) {
        await waitForMacrotask();
      }
      assertTrue(isAnnounced());
    },
    dispatchPageTransition: (
      type: "pagehide" | "pageshow",
      persisted: boolean,
    ): void => {
      page.dispatchEvent(Object.assign(new Event(type), { persisted }));
    },
    isAutomaticReloadMarked: (): boolean =>
      sessionItems.has(automaticReloadKey),
    getReloadedFor: (): string | null =>
      sessionItems.get(reloadedForKey) ?? null,
    getRefusalReloads: (): string | null =>
      sessionItems.get(refusalReloadKey) ?? null,
    connect: (workerId: SharedWorkerId): void => {
      post({
        type: "Connected",
        workerId,
        syncStateChannelName: `evolu:sync-state:${workerId}`,
        consoleEntryOrErrorChannelName: consoleEntryOrErrorBroadcastChannelName,
      });
    },
    setFocus: (value: boolean): void => {
      hasFocus = value;
    },
    /** Delivers a message another tab posted on the builds channel. */
    receive: (message: unknown): void => {
      builds.onmessage?.(new MessageEvent("message", { data: message }));
    },
    disposeDeps: (): void => {
      deps[Symbol.dispose]();
    },
    [Symbol.dispose]: () => {
      deps[Symbol.dispose]();
      disposables.dispose();
    },
  };
};

// The session storage keys the web adapter uses for its reload markers.
const automaticReloadKey = "evolu:automatic-reload";
const reloadedForKey = "evolu:reloaded-for";
const refusalReloadKey = "evolu:refusal-reloads";

const waitForMacrotask = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const isLockAvailable = (name: string): Promise<boolean> =>
  navigator.locks.request(name, { ifAvailable: true }, (lock) => lock !== null);

const createClosableNativePort = <Output = never>() =>
  Object.assign(new EventTarget(), {
    close: mock.fn(),
    onmessage: null as ((event: MessageEvent<Output>) => void) | null,
    postMessage:
      mock.fn<(message: unknown, transfer?: ReadonlyArray<unknown>) => void>(),
  });
