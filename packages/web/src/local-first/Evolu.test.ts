import {
  assertEqual,
  assertNonNullable,
  assertSame,
  createConsole,
  PositiveInt,
  testStubGlobal,
  type NativeMessagePort,
  type UnsupportedDbVersionError,
} from "@evolu/common";
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

  it("reports a startup refusal without invoking the unsupported handler or creating a DbWorker", () => {
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
      console: createConsole({ level: "silent" }),
      onSharedWorkerUnsupported,
    });
    const error: UnsupportedDbVersionError = {
      type: "UnsupportedDbVersionError",
      storedVersion: PositiveInt.orThrow(2),
      supportedVersion: PositiveInt.orThrow(1),
    };
    assertSame(deps.evoluError.get(), null);
    assertNonNullable(nativeSharedWorkerPort.onmessage);

    nativeSharedWorkerPort.onmessage(
      new MessageEvent("message", { data: { type: "Error", error } }),
    );

    assertEqual(deps.evoluError.get(), error);
    assertSame(onSharedWorkerUnsupported.mock.callCount(), 0);
    assertSame(Worker.mock.callCount(), 0);
  });
});

const createClosableNativePort = <Output = never>() => ({
  close: mock.fn(),
  onmessage: null as ((event: MessageEvent<Output>) => void) | null,
  postMessage: mock.fn(),
});
