import {
  assertEqual,
  assertFalse,
  assertNonNullable,
  assertSame,
  assertTrue,
  createConsole,
  createIdFromString,
  PositiveInt,
  testStubGlobal,
  type NativeMessagePort,
  type ReloadApp,
  type UnsupportedDbVersionError,
} from "@evolu/common";
import {
  buildsBroadcastChannelName,
  type BuildWaiting,
  type BuildWaitingRequest,
  type SharedWorkerId,
  type SharedWorkerOutput,
} from "@evolu/common/local-first";
import { describe, it, mock } from "node:test";
import { createEvoluDeps } from "./Evolu.ts";

describe("createEvoluDeps", () => {
  it("createEvoluDeps calls callback when one-tab SharedWorker polyfill is already open", () => {
    const nativeSharedWorkerPort = createClosableNativePort<unknown>();
    const nativeDbWorker = createClosableNativePort();
    const onSharedWorkerUnsupported = mock.fn<() => void>();

    using _sharedWorker = testStubGlobal(
      "SharedWorker",
      class {
        readonly port = nativeSharedWorkerPort as unknown as NativeMessagePort<
          never,
          unknown
        >;
      },
    );
    const Worker = mock.fn(function () {
      return nativeDbWorker;
    });
    using _worker = testStubGlobal("Worker", Worker);

    using deps = createEvoluDeps({
      onSharedWorkerUnsupported,
    });

    nativeSharedWorkerPort.onmessage?.(
      new MessageEvent("message", {
        data: { type: "SharedWorkerUnsupported" },
      }),
    );

    assertEqual(onSharedWorkerUnsupported.mock.callCount(), 1);
    assertEqual(Worker.mock.callCount(), 0);
    assertNonNullable(deps);
  });

  describe("database refusals", () => {
    const createRefusal = (
      storedVersion: number,
    ): UnsupportedDbVersionError => ({
      type: "UnsupportedDbVersionError",
      storedVersion: PositiveInt.orThrow(storedVersion),
      supportedVersion: PositiveInt.orThrow(2),
    });

    it("reloads once for a refusal, even with focus, instead of reporting it", () => {
      using setup = setupWebEvoluDeps({ hasFocus: true });

      setup.post({ type: "Error", error: createRefusal(3) });

      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertSame(setup.deps.evoluError.get(), null);
      assertSame(setup.getRefusalReloads(), "3");
      assertFalse(setup.isAutomaticReloadMarked());
    });

    it("reloads for each refusal before the page unloads", () => {
      using setup = setupWebEvoluDeps();

      setup.post({ type: "Error", error: createRefusal(3) });
      setup.post({ type: "Error", error: createRefusal(3) });

      assertSame(setup.reloadApp.mock.callCount(), 2);
      assertSame(setup.deps.evoluError.get(), null);
    });

    it("reports a refusal that recurs after its reload without creating a DbWorker", () => {
      using setup = setupWebEvoluDeps({ refusalReloads: "3" });
      const error = createRefusal(3);

      setup.post({ type: "Error", error });

      assertSame(setup.reloadApp.mock.callCount(), 0);
      assertEqual(setup.deps.evoluError.get(), error);
      assertSame(setup.getDbWorkerCount(), 0);
    });

    it("reloads again for a newer stored version", () => {
      using setup = setupWebEvoluDeps({ refusalReloads: "3" });

      setup.post({ type: "Error", error: createRefusal(4) });

      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertSame(setup.deps.evoluError.get(), null);
      assertSame(setup.getRefusalReloads(), "3,4");
    });

    it("reloads once for refusals of several databases, then reports them", () => {
      let refusalReloads: string | null;
      {
        using firstPage = setupWebEvoluDeps();
        firstPage.post({ type: "Error", error: createRefusal(3) });
        firstPage.post({ type: "Error", error: createRefusal(4) });
        assertSame(firstPage.reloadApp.mock.callCount(), 2);
        refusalReloads = firstPage.getRefusalReloads();
      }
      assertNonNullable(refusalReloads);
      using secondPage = setupWebEvoluDeps({ refusalReloads });
      const error = createRefusal(4);

      secondPage.post({ type: "Error", error });
      secondPage.post({ type: "Error", error: createRefusal(3) });

      assertSame(secondPage.reloadApp.mock.callCount(), 0);
      assertEqual(secondPage.deps.evoluError.get(), error);
    });

    it("reports a refusal without session storage", () => {
      using setup = setupWebEvoluDeps({ isSessionStorageAvailable: false });
      const error = createRefusal(3);

      setup.post({ type: "Error", error });

      assertSame(setup.reloadApp.mock.callCount(), 0);
      assertEqual(setup.deps.evoluError.get(), error);
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

    it("announces its build when its worker waits and when asked", () => {
      using setup = setupWebEvoluDeps();

      setup.post({ type: "Waiting", workerId: ownWorkerId });
      setup.receive(buildWaitingRequest);

      assertEqual(setup.builds.posted, [
        { type: "BuildWaiting", workerId: ownWorkerId },
        { type: "BuildWaiting", workerId: ownWorkerId },
      ]);
    });

    it("asks waiting tabs to announce once it connects, and stops announcing", () => {
      using setup = setupWebEvoluDeps();
      setup.post({ type: "Waiting", workerId: ownWorkerId });

      setup.connect(ownWorkerId);
      setup.receive(buildWaitingRequest);

      assertEqual(setup.builds.posted, [
        { type: "BuildWaiting", workerId: ownWorkerId },
        buildWaitingRequest,
      ]);
    });

    it("does not announce its build after an automatic reload", () => {
      using setup = setupWebEvoluDeps({ isAutomaticReload: true });

      setup.post({ type: "Waiting", workerId: ownWorkerId });
      setup.receive(buildWaitingRequest);

      assertEqual(setup.builds.posted, []);
      // Only the page the reload loaded skips announcing.
      assertFalse(setup.isAutomaticReloadMarked());
    });

    it("reloads at once when another build waits and the user is not in the tab", () => {
      using setup = setupWebEvoluDeps();
      setup.connect(ownWorkerId);

      setup.receive(otherBuildWaiting);

      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertTrue(setup.isAutomaticReloadMarked());
      assertSame(setup.getReloadedFor(), otherWorkerId);
    });

    it("reloads the tab the user is in once it loses focus", (t) => {
      t.mock.timers.enable({ apis: ["setInterval"] });
      using setup = setupWebEvoluDeps({ hasFocus: true });
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

    it("reloads once it connects for another build announced while it waited", () => {
      using setup = setupWebEvoluDeps();
      setup.post({ type: "Waiting", workerId: ownWorkerId });

      setup.receive(otherBuildWaiting);
      assertSame(setup.reloadApp.mock.callCount(), 0);

      setup.connect(ownWorkerId);
      assertSame(setup.reloadApp.mock.callCount(), 1);
    });

    it("ignores its own worker and invalid messages", () => {
      using setup = setupWebEvoluDeps();

      setup.receive({ type: "BuildWaiting", workerId: ownWorkerId });
      setup.connect(ownWorkerId);
      setup.receive({ type: "BuildWaiting", workerId: ownWorkerId });
      setup.receive({ type: "BuildWaiting", workerId: "not an id" });

      assertSame(setup.reloadApp.mock.callCount(), 0);
    });

    it("reloads at most once for each waiting worker", () => {
      using setup = setupWebEvoluDeps({ reloadedFor: otherWorkerId });
      setup.connect(ownWorkerId);

      setup.receive(otherBuildWaiting);
      assertSame(setup.reloadApp.mock.callCount(), 0);

      setup.receive({ type: "BuildWaiting", workerId: thirdWorkerId });
      assertSame(setup.reloadApp.mock.callCount(), 1);
      assertSame(setup.getReloadedFor(), `${otherWorkerId},${thirdWorkerId}`);
    });

    it("does not reload without session storage", () => {
      using setup = setupWebEvoluDeps({ isSessionStorageAvailable: false });
      setup.connect(ownWorkerId);

      setup.receive(otherBuildWaiting);

      assertSame(setup.reloadApp.mock.callCount(), 0);
    });

    it("does not reload once disposed", (t) => {
      t.mock.timers.enable({ apis: ["setInterval"] });
      using setup = setupWebEvoluDeps({ hasFocus: true });
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
  hasFocus: initialHasFocus = false,
  isAutomaticReload = false,
  isSessionStorageAvailable = true,
  refusalReloads,
  reloadedFor,
}: {
  hasFocus?: boolean;
  isAutomaticReload?: boolean;
  isSessionStorageAvailable?: boolean;
  /** The stored refusal reload versions, as a previous page load left them. */
  refusalReloads?: string;
  /** The stored waiting workers, as a previous page load left them. */
  reloadedFor?: string;
} = {}) => {
  using disposer = new DisposableStack();
  const sharedWorkerPort = createClosableNativePort<unknown>();
  disposer.use(
    testStubGlobal(
      "SharedWorker",
      class {
        readonly port = sharedWorkerPort as unknown as NativeMessagePort<
          never,
          unknown
        >;
      },
    ),
  );
  const Worker = mock.fn(function () {
    return createClosableNativePort();
  });
  disposer.use(testStubGlobal("Worker", Worker));
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
  const reloadApp = mock.fn<ReloadApp>();

  const deps = createEvoluDeps({
    console: createConsole({ level: "silent" }),
    reloadApp,
  });
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
    builds,
    reloadApp,
    sharedWorkerPort,
    post,
    getDbWorkerCount: (): number => Worker.mock.callCount(),
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

const createClosableNativePort = <Output = never>() => ({
  close: mock.fn(),
  onmessage: null as ((event: MessageEvent<Output>) => void) | null,
  postMessage:
    mock.fn<(message: unknown, transfer?: ReadonlyArray<unknown>) => void>(),
});
