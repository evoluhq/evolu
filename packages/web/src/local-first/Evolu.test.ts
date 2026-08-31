import {
  assertEqual,
  assertNonNullable,
  testStubGlobal,
  type NativeMessagePort,
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
});

const createClosableNativePort = <Output = never>() => ({
  close: mock.fn(),
  onmessage: null as ((event: MessageEvent<Output>) => void) | null,
  postMessage: mock.fn(),
});
