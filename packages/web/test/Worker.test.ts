import type { MessagePort, NativeMessagePort } from "@evolu/common";
import { expect, test, vi } from "vitest";
import {
  createBroadcastChannel,
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
  using channel = createMessageChannel<string>();
  const received: Array<string> = [];

  channel.port1.postMessage("queued");
  channel.port2.onMessage = (message) => {
    received.push(message);
  };

  await vi.waitFor(() => {
    expect(received).toEqual(["queued"]);
  });
});

test("createMessageChannel supports bidirectional communication and disposal", async () => {
  using channel = createMessageChannel<string, number>();
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
});

test("createMessagePort wraps a native port received from MessageChannel", async () => {
  using disposer = new DisposableStack();
  const nativeChannel = new MessageChannel();
  disposer.defer(() => {
    nativeChannel.port2.close();
  });
  const wrappedPort = disposer.use(
    createMessagePort<number, string>(
      nativeChannel.port1 as unknown as NativeMessagePort<number, string>,
    ),
  );
  const received: Array<string> = [];

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

test("createBroadcastChannel wraps native BroadcastChannel", async () => {
  const channelName = `test-channel-${crypto.randomUUID()}`;
  const channel1 = createBroadcastChannel<string>(channelName);
  const received1: Array<string> = [];
  const received2: Array<string> = [];

  {
    using _channel1 = channel1;
    using channel2 = createBroadcastChannel<string>(channelName);

    channel1.onMessage = (message) => {
      received1.push(message);
    };
    channel2.onMessage = (message) => {
      received2.push(message);
    };
    expect(channel2.onMessage).not.toBeNull();
    channel2.onMessage = null;
    expect(channel2.onMessage).toBeNull();
    channel2.onMessage = (message) => {
      received2.push(message);
    };

    channel1.postMessage("hello");

    await vi.waitFor(() => {
      expect(received2).toEqual(["hello"]);
    });

    expect(received1).toEqual([]);
  }

  channel1.onMessage = (message) => {
    received1.push(message);
  };
  expect(channel1.onMessage).toBeNull();
  expect(() => channel1.postMessage("closed")).toThrow(
    "Expected value to not be disposed.",
  );
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
  using worker = createWorker<WorkerInput, WorkerOutput>(nativeWorker);

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
  using _worker = worker;

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
