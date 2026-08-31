import {
  assertEqual,
  assertNonNullable,
  assertSame,
  assertThrowsInstanceOf,
  testStubGlobal,
  type MessagePort,
  type NativeMessagePort,
} from "@evolu/common";
import { describe, it, mock, test } from "node:test";
import {
  createBroadcastChannel,
  createOneTabSharedWorkerSelfPolyfill,
  createMessageChannel,
  createMessagePort,
  createSharedWorker,
  createSharedWorkerSelf,
  createWorker,
  createWorkerDeps,
  createWorkerSelf,
  installOneTabSharedWorkerPolyfill,
} from "./Worker.ts";

test("createWorker wraps a native worker and disposes via terminate", () => {
  const nativeWorker = {
    onmessage: null as ((event: MessageEvent<string>) => void) | null,
    postMessage:
      mock.fn<
        (message: unknown, transfer?: ReadonlyArray<Transferable>) => void
      >(),
    terminate: mock.fn(),
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

  assertEqual(received, ["response"]);
  assertSame(worker.native, nativeWorker);
  assertEqual(
    nativeWorker.postMessage.mock.calls.map(({ arguments: args }) => args),
    [["request"]],
  );
  assertEqual(nativeWorker.terminate.mock.callCount(), 1);
  assertEqual(nativeWorker.onmessage, null);
});

test("createMessageChannel queues messages until onMessage is assigned", async () => {
  using channel = createMessageChannel<string>();
  const received: Array<string> = [];
  const delivered = Promise.withResolvers<void>();

  channel.port1.postMessage("queued");
  channel.port2.onMessage = (message) => {
    received.push(message);
    delivered.resolve();
  };

  await delivered.promise;
  assertEqual(received, ["queued"]);
});

test("createMessageChannel supports bidirectional communication and disposal", async () => {
  using channel = createMessageChannel<string, number>();
  const strings: Array<string> = [];
  const numbers: Array<number> = [];
  const stringDelivered = Promise.withResolvers<void>();
  const numberDelivered = Promise.withResolvers<void>();

  channel.port2.onMessage = (message) => {
    strings.push(message);
    stringDelivered.resolve();
  };
  channel.port1.onMessage = (message) => {
    numbers.push(message);
    numberDelivered.resolve();
  };

  channel.port1.postMessage("hello");
  channel.port2.postMessage(42);

  await Promise.all([stringDelivered.promise, numberDelivered.promise]);
  assertEqual(strings, ["hello"]);
  assertEqual(numbers, [42]);
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
  const delivered = Promise.withResolvers<void>();

  wrappedPort.onMessage = (message) => {
    received.push(message);
    delivered.resolve();
  };
  nativeChannel.port2.postMessage("hello");

  await delivered.promise;
  assertEqual(received, ["hello"]);

  const nativeReceived = new Promise<number>((resolve) => {
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- Assigning onmessage also starts this MessagePort automatically.
    nativeChannel.port2.onmessage = (event) => {
      resolve(event.data as number);
    };
  });

  wrappedPort.postMessage(42);

  assertEqual(await nativeReceived, 42);
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

  assertEqual(received, ["response"]);
  assertEqual(nativePort.onmessage, null);
  assertEqual(wrappedPort.onMessage, null);
  assertEqual(
    nativePort.postMessage.mock.calls.map(({ arguments: args }) => args),
    [["without transfer"], ["with transfer", [transferable]]],
  );
});

test("createBroadcastChannel wraps native BroadcastChannel", async () => {
  const channelName = `test-channel-${crypto.randomUUID()}`;
  const channel1 = createBroadcastChannel<string>(channelName);
  const received1: Array<string> = [];
  const received2: Array<string> = [];
  const delivered = Promise.withResolvers<void>();

  {
    using _channel1 = channel1;
    using channel2 = createBroadcastChannel<string>(channelName);

    channel1.onMessage = (message) => {
      received1.push(message);
    };
    channel2.onMessage = (message) => {
      received2.push(message);
    };
    assertNonNullable(channel2.onMessage);
    channel2.onMessage = null;
    assertEqual(channel2.onMessage, null);
    channel2.onMessage = (message) => {
      received2.push(message);
      delivered.resolve();
    };

    channel1.postMessage("hello");

    await delivered.promise;
    assertEqual(received2, ["hello"]);

    assertEqual(received1, []);
  }

  channel1.onMessage = (message) => {
    received1.push(message);
  };
  assertEqual(channel1.onMessage, null);
  const error = assertThrowsInstanceOf(
    () => channel1.postMessage("closed"),
    Error,
  );
  assertEqual(error.message, "Cannot use a disposed object.");
});

test("createMessagePort dispose uses terminate when available", () => {
  const nativePort = {
    onmessage: null as ((event: MessageEvent<string>) => void) | null,
    postMessage:
      mock.fn<
        (message: unknown, transfer?: ReadonlyArray<Transferable>) => void
      >(),
    terminate: mock.fn(),
  };

  const wrappedPort = createMessagePort(
    nativePort as unknown as NativeMessagePort<string>,
  );

  wrappedPort[Symbol.dispose]();

  assertEqual(nativePort.onmessage, null);
  assertEqual(nativePort.terminate.mock.callCount(), 1);
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

  assertEqual(received, ["response"]);
  assertSame(worker.port.native, nativePort);
  assertEqual(
    nativePort.postMessage.mock.calls.map(({ arguments: args }) => args),
    [["request"]],
  );
  assertEqual(nativePort.close.mock.callCount(), 1);
  assertEqual(nativePort.onmessage, null);
});

describe("one-tab SharedWorker polyfill", () => {
  it("installOneTabSharedWorkerPolyfill installs a Worker-backed SharedWorker", () => {
    const nativeWorker = createClosableNativePort<string>();
    const calls: Array<{
      readonly scriptURL: string | URL;
      readonly options: WorkerOptions | undefined;
    }> = [];
    const Worker = function (scriptURL: string | URL, options?: WorkerOptions) {
      calls.push({ scriptURL, options });
      return nativeWorker;
    } as unknown as typeof globalThis.Worker;
    const scriptURL = new URL("https://example.com/Shared.worker.js");
    const options = { type: "module" } as const;

    using _sharedWorker = testStubGlobal("SharedWorker", undefined);
    using _worker = testStubGlobal("Worker", Worker);

    installOneTabSharedWorkerPolyfill();
    const nativeSharedWorker = new SharedWorker(scriptURL, options);

    assertEqual(calls, [{ scriptURL, options }]);
    assertSame(nativeSharedWorker.port, nativeWorker);
  });

  it("installOneTabSharedWorkerPolyfill keeps native SharedWorker", () => {
    const nativePort = createClosableNativePort<string>();
    const NativeSharedWorker = class {
      readonly port = nativePort;
    } as unknown as typeof globalThis.SharedWorker;

    using _sharedWorker = testStubGlobal("SharedWorker", NativeSharedWorker);

    installOneTabSharedWorkerPolyfill();
    assertSame(globalThis.SharedWorker, NativeSharedWorker);
  });

  it("createOneTabSharedWorkerSelfPolyfill creates one queued synthetic connection", () => {
    const nativeSelf = createClosableNativePort<string>();
    const workerSelf = createOneTabSharedWorkerSelfPolyfill<string, string>(
      nativeSelf as unknown as globalThis.DedicatedWorkerGlobalScope,
    );
    const received: Array<string> = [];
    let connectedPort!: MessagePort<string, string>;

    assertEqual(workerSelf.onConnect, null);
    workerSelf.onConnect = null;
    workerSelf.onConnect = (port) => {
      connectedPort = port;
    };
    assertNonNullable(workerSelf.onConnect);

    nativeSelf.onmessage?.({ data: "queued" } as MessageEvent<string>);
    connectedPort.onMessage = (message) => {
      received.push(message);
    };
    assertNonNullable(connectedPort.onMessage);

    nativeSelf.onmessage?.({ data: "immediate" } as MessageEvent<string>);
    connectedPort.onMessage = null;
    assertEqual(connectedPort.onMessage, null);
    connectedPort.onMessage = (message) => {
      received.push(message);
    };
    workerSelf.onConnect = null;

    connectedPort.postMessage("response");
    const transferable = new ArrayBuffer(1);
    connectedPort.postMessage("response with transfer", [transferable]);
    const nativeSelfOnMessage = nativeSelf.onmessage;
    workerSelf[Symbol.dispose]();
    nativeSelfOnMessage?.({ data: "ignored" } as MessageEvent<string>);
    connectedPort.postMessage("ignored");
    connectedPort.onMessage = () => {
      received.push("ignored");
    };
    workerSelf[Symbol.dispose]();

    assertEqual(received, ["queued", "immediate"]);
    assertSame(connectedPort.native, nativeSelf);
    assertEqual(connectedPort.onMessage, null);
    assertEqual(
      nativeSelf.postMessage.mock.calls.map(({ arguments: args }) => args),
      [["response"], ["response with transfer", [transferable]]],
    );
    assertEqual(nativeSelf.close.mock.callCount(), 1);
    assertEqual(nativeSelf.onmessage, null);
  });

  it("createOneTabSharedWorkerSelfPolyfill stops flushing when onMessage is cleared", () => {
    const nativeSelf = createClosableNativePort<string>();
    const workerSelf = createOneTabSharedWorkerSelfPolyfill<string, string>(
      nativeSelf as unknown as globalThis.DedicatedWorkerGlobalScope,
    );
    const received: Array<string> = [];
    let connectedPort!: MessagePort<string, string>;

    workerSelf.onConnect = (port) => {
      connectedPort = port;
    };
    nativeSelf.onmessage?.({ data: "first" } as MessageEvent<string>);
    nativeSelf.onmessage?.({ data: "second" } as MessageEvent<string>);
    connectedPort.onMessage = (message) => {
      received.push(message);
      connectedPort.onMessage = null;
    };
    workerSelf[Symbol.dispose]();

    assertEqual(received, ["first"]);
  });

  it("createOneTabSharedWorkerSelfPolyfill disposes from connected port", () => {
    const nativeSelf = createClosableNativePort<string>();
    const workerSelf = createOneTabSharedWorkerSelfPolyfill<string, string>(
      nativeSelf as unknown as globalThis.DedicatedWorkerGlobalScope,
    );
    let connectedPort!: MessagePort<string, string>;

    workerSelf.onConnect = (port) => {
      connectedPort = port;
    };

    connectedPort[Symbol.dispose]();
    workerSelf.onConnect = () => {
      throw new Error("Disposed worker self must ignore onConnect setter.");
    };

    assertEqual(workerSelf.onConnect, null);
    assertEqual(connectedPort.onMessage, null);
    assertEqual(nativeSelf.close.mock.callCount(), 1);
    assertEqual(nativeSelf.onmessage, null);
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

  assertEqual(received, ["request"]);
  assertEqual(
    nativeSelf.postMessage.mock.calls.map(({ arguments: args }) => args),
    [["response"]],
  );
  assertEqual(nativeSelf.close.mock.callCount(), 1);
});

test("createSharedWorkerSelf wraps connected ports and disposes the worker scope", () => {
  const nativePort = createClosableNativePort<string>();
  const nativeSelf = {
    close: mock.fn(),
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

  assertEqual(received, ["request"]);
  assertSame(connectedPort.native, nativePort);
  assertEqual(
    nativePort.postMessage.mock.calls.map(({ arguments: args }) => args),
    [["response"]],
  );
  assertEqual(nativePort.close.mock.callCount(), 1);
  assertEqual(nativeSelf.onconnect, null);
  assertEqual(nativeSelf.close.mock.callCount(), 1);
});

test("createSharedWorkerSelf asserts when a connection arrives before onConnect is set", () => {
  const nativeSelf = {
    close: mock.fn(),
    onconnect: null as ((event: MessageEvent) => void) | null,
  };

  createSharedWorkerSelf<string, string>(
    nativeSelf as unknown as globalThis.SharedWorkerGlobalScope,
  );

  const error = assertThrowsInstanceOf(() => {
    nativeSelf.onconnect?.({ ports: [] } as unknown as MessageEvent);
  }, Error);
  assertEqual(
    error.message,
    "onConnect must be set before receiving connections",
  );
});

test("createWorkerDeps stores console output entries and exposes createMessagePort", () => {
  const deps = createWorkerDeps();

  deps.console.warn("worker-warning");

  assertSame(deps.createMessagePort, createMessagePort);
  assertEqual(deps.consoleStoreOutputEntry.get(), {
    args: ["worker-warning"],
    method: "warn",
    path: [],
  });
});

const createClosableNativePort = <Output = never>() => ({
  close: mock.fn(),
  onmessage: null as ((event: MessageEvent<Output>) => void) | null,
  postMessage:
    mock.fn<
      (message: unknown, transfer?: ReadonlyArray<Transferable>) => void
    >(),
});
