import type { NativeMessagePort } from "@evolu/common";
import { describe, expect, test, vi } from "vitest";
import { createEvoluDeps } from "../src/local-first/Evolu.ts";

describe("createEvoluDeps", () => {
  test("createEvoluDeps calls callback when one-tab SharedWorker polyfill is already open", () => {
    const nativeSharedWorkerPort = createClosableNativePort<unknown>();
    const nativeDbWorker = createClosableNativePort<never>();
    const onSharedWorkerUnsupported = vi.fn();

    vi.stubGlobal(
      "SharedWorker",
      class {
        readonly port = nativeSharedWorkerPort as unknown as NativeMessagePort<
          never,
          unknown
        >;
      },
    );
    const Worker = vi.fn(function () {
      return nativeDbWorker;
    });
    vi.stubGlobal("Worker", Worker);

    try {
      using deps = createEvoluDeps({
        onSharedWorkerUnsupported,
      });

      nativeSharedWorkerPort.onmessage?.(
        new MessageEvent("message", {
          data: { type: "SharedWorkerUnsupported" },
        }),
      );

      expect(onSharedWorkerUnsupported).toHaveBeenCalledOnce();
      expect(Worker).not.toHaveBeenCalled();
      expect(deps).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

const createClosableNativePort = <Output = never>() => ({
  close: vi.fn(),
  onmessage: null as ((event: MessageEvent<Output>) => void) | null,
  postMessage: vi.fn(),
});
