import type { MessagePort, NativeMessagePort } from "@evolu/common";
import { expect, test, vi } from "vitest";
import {
  createMessageChannel,
  createMessagePort,
  createSharedWorker,
  createSharedWorkerSelf,
  createWorker,
  createWorkerDeps,
  createWorkerSelf,
} from "../src/Worker.js";

interface WorkerInput {
  readonly type: "echo";
  readonly value: string;
}

type WorkerOutput =
  | { readonly type: "ready" }
  | { readonly type: "echo"; readonly value: string };

test("createWorker wraps a native worker and disposes via terminate", () => {
  const nativeWorker = {
    onmessage: null as ((event: MessageEvent<string>) => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  const worker = createWorker<string, string>(
    nativeWorker as unknown as globalThis.Worker,
  );
  const received: Array<string> = [];

  worker.onMessage = (message) => {
    received.push(message);
  };
  nativeWorker.onmessage?.({ data: "response" } as MessageEvent<string>);
  worker.postMessage("request");
  worker[Symbol.dispose]();

  expect(received).toEqual(["response"]);
  expect(worker.native).toBe(nativeWorker);
  expect(nativeWorker.postMessage).toHaveBeenCalledWith("request");
  expect(nativeWorker.terminate).toHaveBeenCalledOnce();
  expect(nativeWorker.onmessage).toBeNull();
});

test("createMessageChannel queues messages until onMessage is assigned", async () => {
  const channel = createMessageChannel<string>();
  const received: Array<string> = [];

  try {
    channel.port1.postMessage("queued");
    channel.port2.onMessage = (message) => {
      received.push(message);
    };

    await vi.waitFor(() => {
      expect(received).toEqual(["queued"]);
    });
  } finally {
    channel[Symbol.dispose]();
  }
});

test("createMessageChannel supports bidirectional communication and disposal", async () => {
  const channel = createMessageChannel<string, number>();
  const strings: Array<string> = [];
  const numbers: Array<number> = [];

  channel.port2.onMessage = (message) => {
    strings.push(message);
  };
  channel.port1.onMessage = (message) => {
    numbers.push(message);
  };

  channel.port1.postMessage("hello");
  channel.port2.postMessage(42);

  await vi.waitFor(() => {
    expect(strings).toEqual(["hello"]);
    expect(numbers).toEqual([42]);
  });

  channel[Symbol.dispose]();
});

test("createMessagePort wraps a native port received from MessageChannel", async () => {
  const nativeChannel = new MessageChannel();
  const wrappedPort = createMessagePort<number, string>(
    nativeChannel.port1 as unknown as NativeMessagePort<number, string>,
  );
  const received: Array<string> = [];

  try {
    wrappedPort.onMessage = (message) => {
      received.push(message);
    };
    nativeChannel.port2.postMessage("hello");

    await vi.waitFor(() => {
      expect(received).toEqual(["hello"]);
    });

    const nativeReceived = new Promise<number>((resolve) => {
      nativeChannel.port2.onmessage = (event) => {
        resolve(event.data as number);
      };
    });

    wrappedPort.postMessage(42);

    expect(await nativeReceived).toBe(42);
  } finally {
    wrappedPort[Symbol.dispose]();
    nativeChannel.port2.close();
  }
});

test("createMessagePort assigns and clears the native onmessage handler", () => {
  const nativePort = createClosableNativePort<string>();
  const wrappedPort = createMessagePort<string, string>(
    nativePort as unknown as NativeMessagePort<string, string>,
  );
  const transferable = new ArrayBuffer(1);
  const received: Array<string> = [];

  wrappedPort.onMessage = (message) => {
    received.push(message);
  };
  nativePort.onmessage?.({ data: "response" } as MessageEvent<string>);
  wrappedPort.postMessage("without transfer");
  wrappedPort.postMessage("with transfer", [transferable]);
  wrappedPort.onMessage = null;

  expect(received).toEqual(["response"]);
  expect(nativePort.onmessage).toBeNull();
  expect(wrappedPort.onMessage).toBeNull();
  expect(nativePort.postMessage).toHaveBeenNthCalledWith(1, "without transfer");
  expect(nativePort.postMessage).toHaveBeenNthCalledWith(2, "with transfer", [
    transferable,
  ]);
});

test("createMessagePort dispose uses terminate when available", () => {
  const nativePort = {
    onmessage: null as ((event: MessageEvent<string>) => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };

  const wrappedPort = createMessagePort(
    nativePort as unknown as NativeMessagePort<string>,
  );

  wrappedPort[Symbol.dispose]();

  expect(nativePort.onmessage).toBeNull();
  expect(nativePort.terminate).toHaveBeenCalledOnce();
});

test("createSharedWorker wraps a shared worker port and disposes via close", () => {
  const nativePort = createClosableNativePort<string>();
  const nativeSharedWorker = { port: nativePort };
  const worker = createSharedWorker<string, string>(
    nativeSharedWorker as unknown as globalThis.SharedWorker,
  );
  const received: Array<string> = [];

  worker.port.onMessage = (message) => {
    received.push(message);
  };
  nativePort.onmessage?.({ data: "response" } as MessageEvent<string>);
  worker.port.postMessage("request");
  worker[Symbol.dispose]();

  expect(received).toEqual(["response"]);
  expect(worker.port.native).toBe(nativePort);
  expect(nativePort.postMessage).toHaveBeenCalledWith("request");
  expect(nativePort.close).toHaveBeenCalledOnce();
  expect(nativePort.onmessage).toBeNull();
});

test("createWorker communicates with createWorkerSelf through a native worker", async () => {
  const nativeWorker = new Worker(
    new URL("./workers/dedicated-worker.ts", import.meta.url),
    { type: "module" },
  );
  const worker = createWorker<WorkerInput, WorkerOutput>(nativeWorker);

  try {
    const ready = new Promise<void>((resolve) => {
      worker.onMessage = (message) => {
        if (message.type === "ready") resolve();
      };
    });

    await ready;

    const received = new Promise<WorkerOutput>((resolve) => {
      worker.onMessage = (message) => {
        if (message.type === "echo") resolve(message);
      };
    });

    worker.postMessage({ type: "echo", value: "hello" });

    await expect(received).resolves.toEqual({
      type: "echo",
      value: "hello",
    });
  } finally {
    worker[Symbol.dispose]();
  }
});

test("createWorkerSelf wraps dedicated worker self and disposes via close", () => {
  const nativeSelf = createClosableNativePort<string>();
  const workerSelf = createWorkerSelf<string, string>(
    nativeSelf as unknown as globalThis.DedicatedWorkerGlobalScope,
  );
  const received: Array<string> = [];

  workerSelf.onMessage = (message) => {
    received.push(message);
  };
  nativeSelf.onmessage?.({ data: "request" } as MessageEvent<string>);
  workerSelf.postMessage("response");
  workerSelf[Symbol.dispose]();

  expect(received).toEqual(["request"]);
  expect(nativeSelf.postMessage).toHaveBeenCalledWith("response");
  expect(nativeSelf.close).toHaveBeenCalledOnce();
});

test("createSharedWorker communicates with createSharedWorkerSelf through a native shared worker", async () => {
  const nativeSharedWorker = new SharedWorker(
    new URL("./workers/shared-worker.ts", import.meta.url),
    {
      name: `worker-${crypto.randomUUID()}`,
      type: "module",
    },
  );
  const worker = createSharedWorker<WorkerInput, WorkerOutput>(
    nativeSharedWorker,
  );

  try {
    const received = new Promise<WorkerOutput>((resolve) => {
      worker.port.onMessage = (message) => {
        if (message.type === "echo") resolve(message);
      };
    });

    worker.port.postMessage({ type: "echo", value: "queued" });

    await expect(received).resolves.toEqual({
      type: "echo",
      value: "queued",
    });
  } finally {
    worker[Symbol.dispose]();
  }
});

test("createSharedWorkerSelf wraps connected ports and disposes the worker scope", () => {
  const nativePort = createClosableNativePort<string>();
  const nativeSelf = {
    close: vi.fn(),
    onconnect: null as ((event: MessageEvent) => void) | null,
  };
  const workerSelf = createSharedWorkerSelf<string, string>(
    nativeSelf as unknown as globalThis.SharedWorkerGlobalScope,
  );
  const received: Array<string> = [];
  let connectedPort!: MessagePort<string, string>;

  workerSelf.onConnect = (port) => {
    connectedPort = port;
  };
  nativeSelf.onconnect?.({ ports: [nativePort] } as unknown as MessageEvent);

  connectedPort.onMessage = (message) => {
    received.push(message);
  };
  nativePort.onmessage?.({ data: "request" } as MessageEvent<string>);
  connectedPort.postMessage("response");
  connectedPort[Symbol.dispose]();
  workerSelf[Symbol.dispose]();

  expect(received).toEqual(["request"]);
  expect(connectedPort.native).toBe(nativePort);
  expect(nativePort.postMessage).toHaveBeenCalledWith("response");
  expect(nativePort.close).toHaveBeenCalledOnce();
  expect(nativeSelf.onconnect).toBeNull();
  expect(nativeSelf.close).toHaveBeenCalledOnce();
});

test("createSharedWorkerSelf asserts when a connection arrives before onConnect is set", () => {
  const nativeSelf = {
    close: vi.fn(),
    onconnect: null as ((event: MessageEvent) => void) | null,
  };

  createSharedWorkerSelf<string, string>(
    nativeSelf as unknown as globalThis.SharedWorkerGlobalScope,
  );

  expect(() => {
    nativeSelf.onconnect?.({ ports: [] } as unknown as MessageEvent);
  }).toThrow("onConnect must be set before receiving connections");
});

test("createWorkerDeps stores console output entries and exposes createMessagePort", () => {
  const deps = createWorkerDeps();

  deps.console.warn("worker-warning");

  expect(deps.createMessagePort).toBe(createMessagePort);
  expect(deps.consoleStoreOutputEntry.get()).toMatchObject({
    args: ["worker-warning"],
    method: "warn",
    path: [],
  });
});

const createClosableNativePort = <Output = never>() => ({
  close: vi.fn(),
  onmessage: null as ((event: MessageEvent<Output>) => void) | null,
  postMessage: vi.fn(),
});
